/**
 * File: apps/api/src/services/contracts/service.ts
 * Purpose: Contract signing on onboarding step 2 (SPEC D31). Builds each document's values from the broker's record,
 * keeps one open document per template, renders live previews, and runs signing: the broker's signature goes on both
 * documents, every version (unsigned, broker-signed, final with certificate) is stored privately with its SHA-256,
 * and the company signature is applied automatically when Shelly has authorized it (otherwise the step waits for her
 * one-click countersignature). Also voiding and re-issuing, and recording copies signed outside the portal. Every
 * action writes audit_log.
 *
 * Functions:
 * - activeTemplates(db): the active template for each contract key.
 * - signingContext(db, brokerId): the broker's name, phone, email, address, license number and current splits.
 * - documentValues(key, context, dates): the text values for one document.
 * - templateFile(row): a template row as the bytes, field map and font the PDF filler needs.
 * - documentsFor(db, brokerId): every contract document of a broker, newest first.
 * - openDocuments(rows): the newest document per key that isn't voided.
 * - ensureOpenDocuments(db, brokerId, templates, now): creates a pending document for any key without one (and replaces pending ones made from an older template).
 * - companySigner(db, env): the company signer (COMPANY_SIGNER_EMAIL) with their current signature, or null.
 * - documentStorageKey(brokerId, documentId, kind): where one version of a document is stored.
 * - toDocumentView(row, versions): shapes a document for the API.
 * - templateVersions(db): template version by template id.
 * - renderPreview(deps, input): the filled, unsigned PDF for the broker to read; records the first view.
 * - finalizeDocument(tx, deps, input): applies the company signature and certificate, stores the final PDF and marks the document fully signed.
 * - certificateSections(input): the rows of the signature certificate page.
 * - linkFinalFiles(tx, brokerStepId, documents): points each document at the step file holding its final PDF.
 * - signAgreements(deps, input): the broker signs both documents; returns whether they're fully signed, the final PDFs and whether onboarding completed.
 * - countersignAgreements(deps, input): the company signer countersigns both broker-signed documents.
 * - voidAndReissue(deps, input): voids every current document (even fully signed ones) and resets step 2 so the broker signs again.
 * - markSignedOutside(deps, input): records an already-signed copy uploaded by an admin and approves step 2 when both documents are covered.
 * - decodePng(dataUrl): the PNG bytes of a data URL, checked to be a real PNG.
 */
import { randomUUID } from "node:crypto";
import {
  brokers,
  brokerSteps,
  companySignatures,
  contractDocuments,
  contractTemplates,
  currentCommission,
  files,
  sha256,
  users,
  type DbOrTx,
  type Transaction,
} from "@bp/db";
import {
  CONTRACT_STEP_KEY,
  CONTRACT_TEMPLATE_KEYS,
  CONTRACT_TITLES,
  contractDate,
  contractStatusLabel,
  easternTimestamp,
  ESIGN_CONSENT_TEXT,
  formatPhoneForDocument,
  houseShare,
  MAX_SIGNATURE_PNG_BYTES,
  storageKeyPrefix,
  visibleEmail,
  type ContractDocumentView,
  type ContractTemplateKey,
  type SignContractsRequest,
} from "@bp/shared";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { AppDeps } from "../../deps";
import type { ApiEnv } from "../../env";
import { badRequest, conflict, forbidden, notFound } from "../../errors";
import { writeAudit } from "../audit";
import { activateIfComplete, applyStepAction, loadBrokerStepByKey, type VerifiedFile } from "../steps";
import { todayFor } from "../support";
import { appendCertificate, fillContract, type ContractTemplateFile } from "./pdf";

export type TemplateRow = typeof contractTemplates.$inferSelect;
export type DocumentRow = typeof contractDocuments.$inferSelect;
export type SigningContext = Awaited<ReturnType<typeof signingContext>>;
type VersionKind = "unsigned" | "broker_signed" | "final" | "outside";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function decodePng(dataUrl: string): Uint8Array {
  const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  if (bytes.byteLength > MAX_SIGNATURE_PNG_BYTES || !PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    throw badRequest("The signature must be a PNG image under 400 KB.", "invalid_signature");
  }
  return new Uint8Array(bytes);
}

export async function activeTemplates(db: DbOrTx): Promise<Map<ContractTemplateKey, TemplateRow>> {
  const rows = await db.select().from(contractTemplates).where(eq(contractTemplates.active, true));
  return new Map(rows.filter((row) => (CONTRACT_TEMPLATE_KEYS as readonly string[]).includes(row.key)).map((row) => [row.key as ContractTemplateKey, row]));
}

export async function templateVersions(db: DbOrTx): Promise<Map<string, number>> {
  const rows = await db.select({ id: contractTemplates.id, version: contractTemplates.version }).from(contractTemplates);
  return new Map(rows.map((row) => [row.id, row.version]));
}

export async function signingContext(db: DbOrTx, brokerId: string) {
  const [row] = await db
    .select({
      brokerId: brokers.id,
      userId: users.id,
      name: users.name,
      phone: users.phone,
      email: users.email,
      status: brokers.status,
      mailingAddress: brokers.mailingAddress,
      floridaLicenseNo: brokers.floridaLicenseNo,
    })
    .from(brokers)
    .innerJoin(users, eq(users.id, brokers.userId))
    .where(eq(brokers.id, brokerId));
  if (!row) throw notFound("Broker not found.");
  const commission = await currentCommission(db, brokerId);
  return { ...row, email: visibleEmail(row.email) ?? row.email, inHouseSplit: commission.inHousePct, selfGeneratedSplit: commission.selfGeneratedPct };
}

export function documentValues(
  key: ContractTemplateKey,
  context: Pick<SigningContext, "name" | "phone" | "email" | "inHouseSplit" | "selfGeneratedSplit"> & { mailingAddress: string | null; floridaLicenseNo: string | null },
  dates: { brokerSignDate: string | null; companySignDate: string | null },
): Record<string, string> {
  if (key === "mutual_nda") {
    return {
      broker_name: context.name,
      broker_by_name: context.name,
      broker_sign_date: dates.brokerSignDate ?? "",
      company_sign_date: dates.companySignDate ?? "",
    };
  }
  const pct = (value: number | null) => (value === null ? "" : String(value));
  return {
    effective_date: dates.brokerSignDate ?? "",
    broker_full_name: context.name,
    florida_license_no: context.floridaLicenseNo ?? "",
    in_house_broker_pct: pct(context.inHouseSplit),
    in_house_house_pct: context.inHouseSplit === null ? "" : String(houseShare(context.inHouseSplit)),
    personal_broker_pct: pct(context.selfGeneratedSplit),
    personal_house_pct: context.selfGeneratedSplit === null ? "" : String(houseShare(context.selfGeneratedSplit)),
    broker_printed_name: context.name,
    broker_sign_date: dates.brokerSignDate ?? "",
    broker_phone: formatPhoneForDocument(context.phone),
    broker_email: context.email,
    mailing_address: context.mailingAddress ?? "",
    company_sign_date: dates.companySignDate ?? "",
  };
}

function templateFile(row: TemplateRow): ContractTemplateFile {
  return { pdf: new Uint8Array(row.pdf), fields: row.fields, font: row.font, fontFile: row.fontFile ? new Uint8Array(row.fontFile) : null };
}

export async function documentsFor(db: DbOrTx, brokerId: string): Promise<DocumentRow[]> {
  return db.select().from(contractDocuments).where(eq(contractDocuments.brokerId, brokerId)).orderBy(desc(contractDocuments.createdAt));
}

export function openDocuments(rows: DocumentRow[]): Map<ContractTemplateKey, DocumentRow> {
  const open = new Map<ContractTemplateKey, DocumentRow>();
  for (const row of rows) {
    const key = row.templateKey as ContractTemplateKey;
    if (row.status !== "voided" && !open.has(key)) open.set(key, row);
  }
  return open;
}

export async function ensureOpenDocuments(db: DbOrTx, brokerId: string, templates: Map<ContractTemplateKey, TemplateRow>, now: Date) {
  const open = openDocuments(await documentsFor(db, brokerId));
  for (const key of CONTRACT_TEMPLATE_KEYS) {
    const template = templates.get(key);
    if (!template) continue;
    const current = open.get(key);
    if (current && current.status === "pending" && current.templateId !== template.id) {
      await db
        .update(contractDocuments)
        .set({ status: "voided", voidedAt: now, voidReason: "A newer version of the document was published" })
        .where(eq(contractDocuments.id, current.id));
      open.delete(key);
    }
    if (!open.has(key)) {
      const [created] = await db.insert(contractDocuments).values({ brokerId, templateId: template.id, templateKey: key, status: "pending" }).returning();
      open.set(key, created!);
    }
  }
  return open;
}

export async function companySigner(db: DbOrTx, env: ApiEnv) {
  if (!env.COMPANY_SIGNER_EMAIL) return null;
  const [user] = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).where(eq(users.email, env.COMPANY_SIGNER_EMAIL));
  if (!user || (user.role !== "owner" && user.role !== "admin")) return null;
  const [signature] = await db
    .select()
    .from(companySignatures)
    .where(and(eq(companySignatures.userId, user.id), isNull(companySignatures.revokedAt)))
    .orderBy(desc(companySignatures.createdAt))
    .limit(1);
  return { userId: user.id, name: user.name, email: user.email, signature: signature ?? null };
}

export function documentStorageKey(brokerId: string, documentId: string, kind: VersionKind | "signature"): string {
  return `${storageKeyPrefix(brokerId, CONTRACT_STEP_KEY)}contracts/${documentId}/${kind}.${kind === "signature" ? "png" : "pdf"}`;
}

export function toDocumentView(row: DocumentRow, versions: Map<string, number>): ContractDocumentView {
  const key = row.templateKey as ContractTemplateKey;
  const list: ContractDocumentView["versions"] = [];
  if (row.unsignedStorageKey) list.push({ kind: "unsigned", label: "Unsigned, filled in", sha256: row.unsignedSha256 });
  if (row.brokerSignedStorageKey) list.push({ kind: "broker_signed", label: "Signed by the broker", sha256: row.brokerSignedSha256 });
  if (row.finalStorageKey && row.status !== "signed_outside") list.push({ kind: "final", label: "Fully signed, with certificate", sha256: row.finalSha256 });
  if (row.finalStorageKey && row.status === "signed_outside") list.push({ kind: "outside", label: "Signed outside the portal", sha256: row.finalSha256 });
  return {
    id: row.id,
    key,
    title: CONTRACT_TITLES[key].title,
    templateVersion: versions.get(row.templateId) ?? 1,
    status: row.status,
    statusLabel: contractStatusLabel(row.status),
    viewed: row.viewedAt !== null,
    brokerSignedAt: row.brokerSignedAt?.toISOString() ?? null,
    companySignedAt: row.companySignedAt?.toISOString() ?? null,
    companySignMethod: row.companySignMethod,
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidReason: row.voidReason,
    createdAt: row.createdAt.toISOString(),
    versions: list,
  };
}

export async function renderPreview(
  deps: AppDeps,
  input: { brokerId: string; actorUserId: string; key: ContractTemplateKey; mailingAddress?: string; floridaLicenseNo?: string },
): Promise<Uint8Array> {
  const now = deps.now();
  const templates = await activeTemplates(deps.db);
  const template = templates.get(input.key);
  if (!template) throw conflict("The agreements aren't ready yet. Please try again later.", "templates_missing");
  const open = await ensureOpenDocuments(deps.db, input.brokerId, templates, now);
  const document = open.get(input.key)!;
  const context = await signingContext(deps.db, input.brokerId);
  const values = documentValues(
    input.key,
    {
      ...context,
      mailingAddress: input.mailingAddress?.trim() || context.mailingAddress,
      floridaLicenseNo: input.floridaLicenseNo?.trim() || context.floridaLicenseNo,
    },
    { brokerSignDate: document.brokerSignedAt ? contractDate(document.brokerSignedAt) : contractDate(now), companySignDate: null },
  );
  const bytes = await fillContract({ template: templateFile(template), values });
  if (!document.viewedAt) {
    await deps.db.update(contractDocuments).set({ viewedAt: now }).where(eq(contractDocuments.id, document.id));
    await writeAudit(deps.db, { actorUserId: input.actorUserId, action: "contract.viewed", entityType: "contract_document", entityId: document.id, after: { templateKey: input.key } });
  }
  return bytes;
}

function certificateSections(input: {
  document: DocumentRow;
  templateVersion: number;
  brokerName: string;
  brokerEmail: string;
  signedPagesSha256: string;
  company: string[][];
}): { heading: string; rows: [string, string][] }[] {
  const { document } = input;
  const signedAt = document.brokerSignedAt!;
  return [
    {
      heading: "Document",
      rows: [
        ["Document", CONTRACT_TITLES[document.templateKey as ContractTemplateKey].title],
        ["Template version", String(input.templateVersion)],
        ["Document ID", document.id],
      ],
    },
    {
      heading: "Broker signature",
      rows: [
        ["Name", input.brokerName],
        ["Email", input.brokerEmail],
        ["Signed at (UTC)", signedAt.toISOString()],
        ["Signed at (Eastern)", easternTimestamp(signedAt)],
        ["IP address", document.brokerIp ?? ""],
        ["User agent", document.brokerUserAgent ?? ""],
        ["Signature", document.brokerSignatureMethod === "typed" ? "Typed name rendered as a signature" : "Drawn by hand on screen"],
        ["E-sign consent", document.consentText ?? ESIGN_CONSENT_TEXT],
      ],
    },
    { heading: "Company signature", rows: input.company.map(([label, value]) => [label!, value!]) },
    {
      heading: "Integrity",
      rows: [
        ["Unsigned PDF SHA-256", document.unsignedSha256 ?? ""],
        ["Signed PDF SHA-256", `${input.signedPagesSha256} (the signed pages, before this certificate page)`],
      ],
    },
  ];
}

async function finalizeDocument(
  tx: Transaction,
  deps: AppDeps,
  input: {
    document: DocumentRow;
    template: TemplateRow;
    context: SigningContext;
    brokerSignature: Uint8Array;
    companySignature: Uint8Array;
    method: "auto" | "manual";
    signer: { userId: string; name: string; signatureId: string | null; authorizedAt: Date | null };
    request: { ip: string | null; userAgent: string | null };
    now: Date;
  },
): Promise<{ file: VerifiedFile; bytes: Uint8Array; documentId: string }> {
  const { document, now } = input;
  const key = document.templateKey as ContractTemplateKey;
  const values = { ...(document.values ?? {}), company_sign_date: contractDate(now) };
  const signedPages = await fillContract({ template: templateFile(input.template), values, brokerSignature: input.brokerSignature, companySignature: input.companySignature });
  const company =
    input.method === "auto"
      ? [
          ["Signed for", `365 Yachts Inc. by ${input.signer.name}, applied automatically under authorization dated ${input.signer.authorizedAt ? contractDate(input.signer.authorizedAt) : ""}`],
          ["Applied at (UTC)", now.toISOString()],
          ["Applied at (Eastern)", easternTimestamp(now)],
        ]
      : [
          ["Signed for", `365 Yachts Inc. by ${input.signer.name}, countersigned manually`],
          ["Countersigned at (UTC)", now.toISOString()],
          ["Countersigned at (Eastern)", easternTimestamp(now)],
          ["IP address", input.request.ip ?? ""],
          ["User agent", input.request.userAgent ?? ""],
        ];
  const finalBytes = await appendCertificate(
    signedPages,
    certificateSections({
      document,
      templateVersion: input.template.version,
      brokerName: input.context.name,
      brokerEmail: input.context.email,
      signedPagesSha256: sha256(signedPages),
      company,
    }),
  );
  const finalKey = documentStorageKey(document.brokerId, document.id, "final");
  await deps.storage.putObject({ key: finalKey, body: finalBytes, contentType: "application/pdf" });
  await tx
    .update(contractDocuments)
    .set({
      status: "fully_signed",
      values,
      finalStorageKey: finalKey,
      finalSha256: sha256(finalBytes),
      companySignatureId: input.signer.signatureId,
      companySignedBy: input.signer.userId,
      companySignedAt: now,
      companySignMethod: input.method,
    })
    .where(eq(contractDocuments.id, document.id));
  await writeAudit(tx, {
    actorUserId: input.signer.userId,
    action: "contract.company_signed",
    entityType: "contract_document",
    entityId: document.id,
    after: { templateKey: key, method: input.method, finalSha256: sha256(finalBytes) },
  });
  return {
    file: { storageKey: finalKey, fileName: `${CONTRACT_TITLES[key].short} - ${input.context.name}.pdf`, mimeType: "application/pdf", sizeBytes: finalBytes.byteLength },
    bytes: finalBytes,
    documentId: document.id,
  };
}

async function linkFinalFiles(tx: Transaction, brokerStepId: string, finals: { file: VerifiedFile; documentId: string }[]): Promise<void> {
  const rows = await tx
    .select({ id: files.id, storageKey: files.storageKey })
    .from(files)
    .where(and(eq(files.brokerStepId, brokerStepId), inArray(files.storageKey, finals.map((item) => item.file.storageKey))));
  for (const item of finals) {
    const file = rows.find((row) => row.storageKey === item.file.storageKey);
    if (file) await tx.update(contractDocuments).set({ finalFileId: file.id }).where(eq(contractDocuments.id, item.documentId));
  }
}

export async function signAgreements(
  deps: AppDeps,
  input: { brokerId: string; userId: string; request: SignContractsRequest; ip: string | null; userAgent: string | null },
) {
  const { db } = deps;
  const now = deps.now();
  const row = await loadBrokerStepByKey(db, input.brokerId, CONTRACT_STEP_KEY);
  if (!row) throw notFound("That onboarding step doesn't exist.");
  if (row.status !== "todo" && row.status !== "changes_requested") throw conflict("Your agreements are already signed.", "already_signed");
  const templates = await activeTemplates(db);
  if (CONTRACT_TEMPLATE_KEYS.some((key) => !templates.has(key))) throw conflict("The agreements aren't ready yet. Please try again later.", "templates_missing");
  const base = await signingContext(db, input.brokerId);
  if (base.inHouseSplit === null || base.selfGeneratedSplit === null) {
    throw conflict("Your commission split isn't set yet. Ask Shelly to add it, then sign.", "commission_missing");
  }
  if (!base.phone) throw conflict("Add your phone number before signing. Ask Shelly if it's missing.", "phone_missing");
  const open = await ensureOpenDocuments(db, input.brokerId, templates, now);
  if (CONTRACT_TEMPLATE_KEYS.some((key) => !open.get(key)?.viewedAt)) {
    throw conflict("Open and read both documents before you sign.", "open_both_documents");
  }
  const brokerSignature = decodePng(input.request.signature.pngDataUrl);
  const context: SigningContext = { ...base, mailingAddress: input.request.mailingAddress, floridaLicenseNo: input.request.floridaLicenseNo?.trim() || null };
  const signDate = contractDate(now);
  const signer = await companySigner(db, deps.env);
  const companySignature = signer?.signature?.autoSign ? await deps.storage.getObject(signer.signature.imageStorageKey) : null;

  const result = await db.transaction(async (tx) => {
    await tx.update(brokers).set({ mailingAddress: context.mailingAddress, floridaLicenseNo: context.floridaLicenseNo }).where(eq(brokers.id, input.brokerId));
    const signed: DocumentRow[] = [];
    for (const key of CONTRACT_TEMPLATE_KEYS) {
      const document = open.get(key)!;
      const template = templates.get(key)!;
      const values = documentValues(key, context, { brokerSignDate: signDate, companySignDate: null });
      const unsigned = await fillContract({ template: templateFile(template), values });
      const brokerSigned = await fillContract({ template: templateFile(template), values, brokerSignature });
      const keys = {
        unsigned: documentStorageKey(input.brokerId, document.id, "unsigned"),
        brokerSigned: documentStorageKey(input.brokerId, document.id, "broker_signed"),
        signature: documentStorageKey(input.brokerId, document.id, "signature"),
      };
      await deps.storage.putObject({ key: keys.unsigned, body: unsigned, contentType: "application/pdf" });
      await deps.storage.putObject({ key: keys.brokerSigned, body: brokerSigned, contentType: "application/pdf" });
      await deps.storage.putObject({ key: keys.signature, body: brokerSignature, contentType: "image/png" });
      const [updated] = await tx
        .update(contractDocuments)
        .set({
          status: "broker_signed",
          values,
          unsignedStorageKey: keys.unsigned,
          unsignedSha256: sha256(unsigned),
          brokerSignedStorageKey: keys.brokerSigned,
          brokerSignedSha256: sha256(brokerSigned),
          brokerSignatureStorageKey: keys.signature,
          brokerSignatureMethod: input.request.signature.method,
          brokerSignedAt: now,
          brokerIp: input.ip,
          brokerUserAgent: input.userAgent,
          consentText: ESIGN_CONSENT_TEXT,
        })
        .where(and(eq(contractDocuments.id, document.id), eq(contractDocuments.status, "pending")))
        .returning();
      if (!updated) throw conflict("These documents changed while you were signing. Reload and try again.", "documents_changed");
      await writeAudit(tx, {
        actorUserId: input.userId,
        action: "contract.signed",
        entityType: "contract_document",
        entityId: document.id,
        after: { templateKey: key, unsignedSha256: updated.unsignedSha256, brokerSignedSha256: updated.brokerSignedSha256, ip: input.ip, signatureMethod: input.request.signature.method },
      });
      signed.push(updated);
    }
    await applyStepAction(tx, { row, action: "submit", actorUserId: input.userId, now });

    if (!signer || !signer.signature || !companySignature) return { fullySigned: false, finals: [], onboardingComplete: false, signer };
    const finals = [];
    for (const document of signed) {
      finals.push(
        await finalizeDocument(tx, deps, {
          document,
          template: templates.get(document.templateKey as ContractTemplateKey)!,
          context,
          brokerSignature,
          companySignature,
          method: "auto",
          signer: { userId: signer.userId, name: signer.name, signatureId: signer.signature.id, authorizedAt: signer.signature.authorizedAt },
          request: { ip: null, userAgent: null },
          now,
        }),
      );
    }
    await applyStepAction(tx, {
      row: { ...row, status: "submitted" },
      action: "approve",
      actorUserId: signer.userId,
      now,
      files: finals.map((item) => item.file),
    });
    await linkFinalFiles(tx, row.brokerStepId, finals);
    const onboardingComplete = await activateIfComplete(tx, { brokerId: input.brokerId, actorUserId: signer.userId, today: todayFor(now) });
    return { fullySigned: true, finals, onboardingComplete, signer };
  });
  return { ...result, context };
}

export async function countersignAgreements(
  deps: AppDeps,
  input: { brokerId: string; actorUserId: string; pngDataUrl?: string; ip: string | null; userAgent: string | null },
) {
  const { db } = deps;
  const now = deps.now();
  const signer = await companySigner(db, deps.env);
  if (!signer) throw conflict("Set COMPANY_SIGNER_EMAIL to the person who signs for 365 Yachts.", "no_company_signer");
  if (signer.userId !== input.actorUserId) throw forbidden(`Only ${signer.name} can countersign the agreements.`);
  const row = await loadBrokerStepByKey(db, input.brokerId, CONTRACT_STEP_KEY);
  if (!row || row.status !== "submitted") throw conflict("There's nothing waiting for a countersignature.", "nothing_to_countersign");
  const open = openDocuments(await documentsFor(db, input.brokerId));
  const waiting = CONTRACT_TEMPLATE_KEYS.map((key) => open.get(key));
  if (waiting.some((document) => !document || document.status !== "broker_signed")) {
    throw conflict("Both documents must be signed by the broker first.", "nothing_to_countersign");
  }
  const companySignature = input.pngDataUrl
    ? decodePng(input.pngDataUrl)
    : signer.signature
      ? await deps.storage.getObject(signer.signature.imageStorageKey)
      : null;
  if (!companySignature) throw conflict("Draw your signature to countersign, or set up your company signature first.", "signature_required");
  const allTemplates = await db.select().from(contractTemplates);
  const context = await signingContext(db, input.brokerId);

  return db.transaction(async (tx) => {
    const finals = [];
    for (const document of waiting as DocumentRow[]) {
      const brokerSignature = await deps.storage.getObject(document.brokerSignatureStorageKey!);
      if (!brokerSignature) throw conflict("The broker's signature image is missing. Void and re-issue the documents.", "signature_missing");
      finals.push(
        await finalizeDocument(tx, deps, {
          document,
          template: allTemplates.find((template) => template.id === document.templateId)!,
          context,
          brokerSignature,
          companySignature,
          method: "manual",
          signer: { userId: signer.userId, name: signer.name, signatureId: input.pngDataUrl ? null : (signer.signature?.id ?? null), authorizedAt: signer.signature?.authorizedAt ?? null },
          request: { ip: input.ip, userAgent: input.userAgent },
          now,
        }),
      );
    }
    await applyStepAction(tx, { row, action: "approve", actorUserId: signer.userId, now, files: finals.map((item) => item.file) });
    await linkFinalFiles(tx, row.brokerStepId, finals);
    const onboardingComplete = await activateIfComplete(tx, { brokerId: input.brokerId, actorUserId: signer.userId, today: todayFor(now) });
    return { finals, onboardingComplete, context };
  });
}

export async function voidAndReissue(deps: AppDeps, input: { brokerId: string; actorUserId: string; reason: string }) {
  const now = deps.now();
  return deps.db.transaction(async (tx) => {
    const current = await tx
      .update(contractDocuments)
      .set({ status: "voided", voidedAt: now, voidedBy: input.actorUserId, voidReason: input.reason })
      .where(and(eq(contractDocuments.brokerId, input.brokerId), ne(contractDocuments.status, "voided")))
      .returning({ id: contractDocuments.id, templateKey: contractDocuments.templateKey, status: contractDocuments.status });
    for (const document of current) {
      await writeAudit(tx, { actorUserId: input.actorUserId, action: "contract.voided", entityType: "contract_document", entityId: document.id, after: { templateKey: document.templateKey, reason: input.reason } });
    }
    const row = await loadBrokerStepByKey(tx, input.brokerId, CONTRACT_STEP_KEY);
    if (row && row.status !== "todo") {
      await tx.update(brokerSteps).set({ status: "todo", reviewNote: `Please sign again: ${input.reason}` }).where(eq(brokerSteps.id, row.brokerStepId));
      await writeAudit(tx, { actorUserId: input.actorUserId, action: "step.reset", entityType: "broker_step", entityId: row.brokerStepId, before: { status: row.status }, after: { status: "todo", reason: input.reason } });
    }
    return { voided: current.length };
  });
}

export async function markSignedOutside(
  deps: AppDeps,
  input: { brokerId: string; actorUserId: string; key: ContractTemplateKey; storageKey: string; fileName: string; signedOn: string },
) {
  const { db } = deps;
  const now = deps.now();
  if (!input.storageKey.startsWith(storageKeyPrefix(input.brokerId, CONTRACT_STEP_KEY))) throw badRequest("That upload doesn't belong to this broker's step 2.", "upload_not_for_step");
  const stored = await deps.storage.headObject(input.storageKey);
  if (!stored || stored.sizeBytes <= 0) throw badRequest("The file didn't finish uploading. Try again.", "upload_missing");
  const templates = await activeTemplates(db);
  const template = templates.get(input.key);
  if (!template) throw conflict("The agreements aren't loaded yet.", "templates_missing");
  const row = await loadBrokerStepByKey(db, input.brokerId, CONTRACT_STEP_KEY);
  if (!row) throw notFound("That onboarding step doesn't exist.");

  return db.transaction(async (tx) => {
    const open = openDocuments(await documentsFor(tx, input.brokerId)).get(input.key);
    if (open) {
      await tx.update(contractDocuments).set({ status: "voided", voidedAt: now, voidedBy: input.actorUserId, voidReason: "Replaced by a copy signed outside the portal" }).where(eq(contractDocuments.id, open.id));
      await writeAudit(tx, { actorUserId: input.actorUserId, action: "contract.voided", entityType: "contract_document", entityId: open.id, after: { templateKey: input.key, reason: "Replaced by a copy signed outside the portal" } });
    }
    const [document] = await tx
      .insert(contractDocuments)
      .values({
        id: randomUUID(),
        brokerId: input.brokerId,
        templateId: template.id,
        templateKey: input.key,
        status: "signed_outside",
        finalStorageKey: input.storageKey,
        companySignMethod: "outside",
        companySignedBy: input.actorUserId,
        companySignedAt: now,
        outsideSignedOn: input.signedOn,
      })
      .returning();
    const [version] = await tx.select({ version: files.version }).from(files).where(eq(files.brokerStepId, row.brokerStepId)).orderBy(desc(files.version)).limit(1);
    const [file] = await tx
      .insert(files)
      .values({
        brokerStepId: row.brokerStepId,
        storageKey: input.storageKey,
        fileName: input.fileName,
        mimeType: stored.contentType ?? "application/pdf",
        sizeBytes: stored.sizeBytes,
        version: (version?.version ?? 0) + 1,
        uploadedBy: input.actorUserId,
      })
      .returning({ id: files.id });
    await tx.update(contractDocuments).set({ finalFileId: file!.id }).where(eq(contractDocuments.id, document!.id));
    await writeAudit(tx, { actorUserId: input.actorUserId, action: "contract.signed_outside", entityType: "contract_document", entityId: document!.id, after: { templateKey: input.key, signedOn: input.signedOn, fileName: input.fileName } });

    const covered = openDocuments(await documentsFor(tx, input.brokerId));
    const complete = CONTRACT_TEMPLATE_KEYS.every((key) => ["fully_signed", "signed_outside"].includes(covered.get(key)?.status ?? ""));
    let onboardingComplete = false;
    const fresh = await loadBrokerStepByKey(tx, input.brokerId, CONTRACT_STEP_KEY);
    if (complete && fresh && fresh.status !== "approved") {
      await applyStepAction(tx, { row: fresh, action: "admin_override", actorUserId: input.actorUserId, now, note: "Both agreements signed outside the portal" });
      onboardingComplete = await activateIfComplete(tx, { brokerId: input.brokerId, actorUserId: input.actorUserId, today: todayFor(now) });
    }
    return { complete, onboardingComplete };
  });
}

