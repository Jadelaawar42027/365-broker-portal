/**
 * File: apps/api/src/routes/admin/contracts.ts
 * Purpose: Admin routes for contract signing (SPEC D31). The company signer (COMPANY_SIGNER_EMAIL) sets up her
 * signature once (drawn or uploaded PNG, stored privately with the authorization text, time, IP and user agent),
 * replaces it, or switches auto-signing off; every admin can see whether it's set up. For a broker: their documents
 * with every version, one-click countersigning (company signer only), "Void and re-issue", recording a copy signed
 * outside the portal, and short-lived, audited download links. Every change writes audit_log.
 *
 * Functions:
 * - registerAdminContractRoutes(app): mounts the /v1/admin/company-signature and contract routes.
 * - signatureStatus(app, actorUserId): the company signature status as the API returns it.
 * - isWaitingForCountersignature(documents): true when both open documents are signed by the broker only.
 */
import { randomUUID } from "node:crypto";
import { brokers, companySignatures, contractDocuments, sha256, users } from "@bp/db";
import {
  adminContractsResponseSchema,
  companyAutoSignRequestSchema,
  companySignatureRequestSchema,
  companySignatureStatusSchema,
  COMPANY_AUTHORIZATION_TEXT,
  CONTRACT_STEP_KEY,
  CONTRACT_TEMPLATE_KEYS,
  CONTRACT_TITLES,
  contractDownloadQuerySchema,
  countersignRequestSchema,
  downloadUrlResponseSchema,
  errorResponseSchema,
  okResponseSchema,
  signedOutsideRequestSchema,
  voidContractsRequestSchema,
  type ContractTemplateKey,
} from "@bp/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { conflict, forbidden, notFound } from "../../errors";
import { currentActor } from "../../plugins/auth-guard";
import { writeAudit } from "../../services/audit";
import { loadBrokerWithUser } from "../../services/brokers";
import {
  companySigner,
  countersignAgreements,
  decodePng,
  documentsFor,
  markSignedOutside,
  openDocuments,
  templateVersions,
  toDocumentView,
  voidAndReissue,
  type DocumentRow,
} from "../../services/contracts/service";
import { resignNeededEmail } from "../../services/emails";
import { sendSafely } from "../../services/mailer";
import { webLink } from "../../services/support";
import { notifyOnboardingComplete } from "../broker-steps";
import { sendSigningEmails, versionKey } from "../contracts";

const idParams = z.object({ id: z.uuid() });
const outsideParams = z.object({ id: z.uuid(), key: z.enum(CONTRACT_TEMPLATE_KEYS) });
const errors = { 400: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema };
const DOWNLOAD_TTL_SECONDS = 5 * 60;

async function signatureStatus(app: FastifyInstance, actorUserId: string) {
  const signer = await companySigner(app.deps.db, app.deps.env);
  return {
    signerEmail: app.deps.env.COMPANY_SIGNER_EMAIL ?? null,
    signerName: signer?.name ?? null,
    isSigner: signer?.userId === actorUserId,
    configured: Boolean(signer?.signature),
    autoSign: Boolean(signer?.signature?.autoSign),
    authorizedAt: signer?.signature?.authorizedAt.toISOString() ?? null,
    authorizationText: COMPANY_AUTHORIZATION_TEXT,
  };
}

function isWaitingForCountersignature(open: Map<ContractTemplateKey, DocumentRow>): boolean {
  return CONTRACT_TEMPLATE_KEYS.every((key) => open.get(key)?.status === "broker_signed");
}

export function registerAdminContractRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/v1/admin/company-signature",
    { schema: { tags: ["admin"], summary: "Whether the company signature is set up and auto-signing is on", response: { 200: companySignatureStatusSchema } } },
    async (request) => signatureStatus(app, currentActor(request).userId),
  );

  r.put(
    "/v1/admin/company-signature",
    {
      bodyLimit: 1024 * 1024,
      schema: { tags: ["admin"], summary: "Set or replace the company signature, with the signer's authorization (company signer only)", body: companySignatureRequestSchema, response: { 200: companySignatureStatusSchema, ...errors } },
    },
    async (request) => {
      const actor = currentActor(request);
      const signer = await companySigner(app.deps.db, app.deps.env);
      if (!signer) throw conflict("Set COMPANY_SIGNER_EMAIL to the owner or admin who signs for 365 Yachts.", "no_company_signer");
      if (signer.userId !== actor.userId) throw forbidden(`Only ${signer.name} can set the company signature.`);
      const png = decodePng(request.body.pngDataUrl);
      const now = app.deps.now();
      const id = randomUUID();
      const imageStorageKey = `company/signatures/${actor.userId}/${id}.png`;
      await app.deps.storage.putObject({ key: imageStorageKey, body: png, contentType: "image/png" });
      await app.deps.db.transaction(async (tx) => {
        await tx.update(companySignatures).set({ revokedAt: now }).where(and(eq(companySignatures.userId, actor.userId), isNull(companySignatures.revokedAt)));
        await tx.insert(companySignatures).values({
          id,
          userId: actor.userId,
          imageStorageKey,
          imageSha256: sha256(png),
          authorizationText: COMPANY_AUTHORIZATION_TEXT,
          authorizedAt: now,
          authorizedIp: request.ip ?? null,
          authorizedUserAgent: request.headers["user-agent"] ?? null,
          autoSign: signer.signature?.autoSign ?? true,
        });
        await writeAudit(tx, {
          actorUserId: actor.userId,
          action: signer.signature ? "company_signature.replaced" : "company_signature.set",
          entityType: "company_signature",
          entityId: id,
          after: { authorizationText: COMPANY_AUTHORIZATION_TEXT, ip: request.ip ?? null, imageSha256: sha256(png) },
        });
      });
      return signatureStatus(app, actor.userId);
    },
  );

  r.patch(
    "/v1/admin/company-signature",
    { schema: { tags: ["admin"], summary: "Switch automatic company signing on or off (company signer only)", body: companyAutoSignRequestSchema, response: { 200: companySignatureStatusSchema, ...errors } } },
    async (request) => {
      const actor = currentActor(request);
      const signer = await companySigner(app.deps.db, app.deps.env);
      if (!signer || signer.userId !== actor.userId) throw forbidden("Only the company signer can change auto-signing.");
      if (!signer.signature) throw conflict("Set up your signature first.", "signature_required");
      await app.deps.db.update(companySignatures).set({ autoSign: request.body.autoSign }).where(eq(companySignatures.id, signer.signature.id));
      await writeAudit(app.deps.db, {
        actorUserId: actor.userId,
        action: request.body.autoSign ? "company_signature.auto_sign_on" : "company_signature.auto_sign_off",
        entityType: "company_signature",
        entityId: signer.signature.id,
      });
      return signatureStatus(app, actor.userId);
    },
  );

  r.get(
    "/v1/admin/company-signature/image-url",
    { schema: { tags: ["admin", "files"], summary: "A 5-minute link to the current company signature image (company signer only)", response: { 200: downloadUrlResponseSchema, ...errors } } },
    async (request) => {
      const actor = currentActor(request);
      const signer = await companySigner(app.deps.db, app.deps.env);
      if (!signer || signer.userId !== actor.userId) throw forbidden("Only the company signer can see the signature image.");
      if (!signer.signature) throw notFound("No company signature yet.");
      const url = await app.deps.storage.presignGet({ key: signer.signature.imageStorageKey, fileName: "company-signature.png", expiresInSeconds: DOWNLOAD_TTL_SECONDS, inline: true });
      return { url, expiresAt: new Date(app.deps.now().getTime() + DOWNLOAD_TTL_SECONDS * 1000).toISOString() };
    },
  );

  r.get(
    "/v1/admin/brokers/:id/contracts",
    { schema: { tags: ["admin"], summary: "A broker's agreements with every version", params: idParams, response: { 200: adminContractsResponseSchema, ...errors } } },
    async (request) => {
      const actor = currentActor(request);
      const { broker } = await loadBrokerWithUser(app.deps.db, request.params.id);
      const rows = await documentsFor(app.deps.db, broker.id);
      const open = openDocuments(rows);
      const signer = await companySigner(app.deps.db, app.deps.env);
      const waiting = isWaitingForCountersignature(open);
      const versions = await templateVersions(app.deps.db);
      return {
        documents: rows.map((row) => toDocumentView(row, versions)),
        canCountersign: waiting && signer?.userId === actor.userId,
        waitingForCountersignature: waiting,
        fullySigned: CONTRACT_TEMPLATE_KEYS.every((key) => ["fully_signed", "signed_outside"].includes(open.get(key)?.status ?? "")),
      };
    },
  );

  r.post(
    "/v1/admin/brokers/:id/contracts/countersign",
    {
      bodyLimit: 1024 * 1024,
      schema: { tags: ["admin"], summary: "Countersign both agreements for 365 Yachts (company signer only)", params: idParams, body: countersignRequestSchema, response: { 200: okResponseSchema, ...errors } },
    },
    async (request) => {
      const actor = currentActor(request);
      const { broker, user } = await loadBrokerWithUser(app.deps.db, request.params.id);
      const result = await countersignAgreements(app.deps, {
        brokerId: broker.id,
        actorUserId: actor.userId,
        pngDataUrl: request.body.pngDataUrl,
        ip: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null,
      });
      await sendSigningEmails(app, request.log, { brokerId: broker.id, brokerName: user.name, brokerEmail: user.email, fullySigned: true, finals: result.finals, signerEmail: null });
      if (result.onboardingComplete) await notifyOnboardingComplete(app, request.log, broker.id);
      return { ok: true as const };
    },
  );

  r.post(
    "/v1/admin/brokers/:id/contracts/void",
    { schema: { tags: ["admin"], summary: "Void the broker's current agreements and ask them to sign again", params: idParams, body: voidContractsRequestSchema, response: { 200: okResponseSchema, ...errors } } },
    async (request) => {
      const actor = currentActor(request);
      const { broker, user } = await loadBrokerWithUser(app.deps.db, request.params.id);
      const { voided } = await voidAndReissue(app.deps, { brokerId: broker.id, actorUserId: actor.userId, reason: request.body.reason });
      if (voided === 0) throw conflict("There are no current agreements to void.", "nothing_to_void");
      await sendSafely(app.deps.mailer, request.log, [
        { to: user.email, ...resignNeededEmail({ brokerName: user.name, reason: request.body.reason, link: webLink(app.deps.env, `/app/steps/${CONTRACT_STEP_KEY}`) }) },
      ]);
      return { ok: true as const };
    },
  );

  r.post(
    "/v1/admin/brokers/:id/contracts/:key/outside",
    {
      schema: {
        tags: ["admin", "files"],
        summary: "Record a copy of an agreement signed outside the portal (upload it first with the step 3 upload URL)",
        params: outsideParams,
        body: signedOutsideRequestSchema,
        response: { 200: okResponseSchema, ...errors },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      const { broker } = await loadBrokerWithUser(app.deps.db, request.params.id);
      const result = await markSignedOutside(app.deps, {
        brokerId: broker.id,
        actorUserId: actor.userId,
        key: request.params.key,
        storageKey: request.body.storageKey,
        fileName: request.body.fileName,
        signedOn: request.body.signedOn,
      });
      if (result.onboardingComplete) await notifyOnboardingComplete(app, request.log, broker.id);
      return { ok: true as const };
    },
  );

  r.get(
    "/v1/admin/contracts/:id/download-url",
    { schema: { tags: ["admin", "files"], summary: "A 5-minute download link for one version of an agreement (audited)", params: idParams, querystring: contractDownloadQuerySchema, response: { 200: downloadUrlResponseSchema, ...errors } } },
    async (request) => {
      const actor = currentActor(request);
      const [row] = await app.deps.db
        .select({ document: contractDocuments, brokerName: users.name })
        .from(contractDocuments)
        .innerJoin(brokers, eq(brokers.id, contractDocuments.brokerId))
        .innerJoin(users, eq(users.id, brokers.userId))
        .where(eq(contractDocuments.id, request.params.id));
      const key = row ? versionKey(row.document, request.query.version) : null;
      if (!row || !key) throw notFound("That document isn't available.");
      const title = CONTRACT_TITLES[row.document.templateKey as ContractTemplateKey].short;
      const url = await app.deps.storage.presignGet({ key, fileName: `${title} - ${row.brokerName} - ${request.query.version}.pdf`, expiresInSeconds: DOWNLOAD_TTL_SECONDS });
      await writeAudit(app.deps.db, { actorUserId: actor.userId, action: "contract.downloaded", entityType: "contract_document", entityId: row.document.id, after: { version: request.query.version } });
      return { url, expiresAt: new Date(app.deps.now().getTime() + DOWNLOAD_TTL_SECONDS * 1000).toISOString() };
    },
  );
}
