/**
 * File: apps/api/src/routes/contracts.ts
 * Purpose: The routes a broker uses to sign their agreements on onboarding step 3 (SPEC D31): their documents and the
 * details that go into them, a live PDF preview of each document (which records that they opened it), signing both
 * with one signature, and short-lived download links for their own signed copies. A broker only ever reaches their
 * own documents. After signing, the broker gets the final PDFs by email, or the company signer is told to countersign.
 *
 * Functions:
 * - registerContractRoutes(app): mounts GET /v1/me/contracts, GET /v1/me/contracts/:key/preview, POST /v1/me/contracts/sign and GET /v1/me/contracts/:id/download-url.
 * - versionKey(row, version): the storage key of one version of a document, or null.
 * - sendSigningEmails(app, log, input): emails the broker their signed copies (attached) or the countersign request to the company signer (or every admin when no signer is set).
 */
import { contractDocuments } from "@bp/db";
import {
  CONTRACT_STEP_KEY,
  CONTRACT_TEMPLATE_KEYS,
  CONTRACT_TITLES,
  contractDownloadQuerySchema,
  contractPreviewQuerySchema,
  downloadUrlResponseSchema,
  errorResponseSchema,
  ESIGN_CONSENT_TEXT,
  myContractsResponseSchema,
  signContractsRequestSchema,
  signContractsResponseSchema,
  type ContractTemplateKey,
} from "@bp/shared";
import { and, eq } from "drizzle-orm";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { notFound } from "../errors";
import { currentActor, requireBroker } from "../plugins/auth-guard";
import {
  activeTemplates,
  documentsFor,
  ensureOpenDocuments,
  openDocuments,
  renderPreview,
  signAgreements,
  signingContext,
  templateVersions,
  toDocumentView,
  type DocumentRow,
} from "../services/contracts/service";
import { contractsSignedEmail, countersignNeededEmail } from "../services/emails";
import { sendSafely, type EmailAttachment } from "../services/mailer";
import { loadBrokerStepByKey } from "../services/steps";
import { adminEmails, webLink } from "../services/support";
import { notifyOnboardingComplete } from "./broker-steps";

const DOWNLOAD_TTL_SECONDS = 5 * 60;
const keyParams = z.object({ key: z.enum(CONTRACT_TEMPLATE_KEYS) });
const idParams = z.object({ id: z.uuid() });

export function versionKey(row: DocumentRow, version: "unsigned" | "broker_signed" | "final" | "outside"): string | null {
  if (version === "unsigned") return row.unsignedStorageKey;
  if (version === "broker_signed") return row.brokerSignedStorageKey;
  if (version === "outside") return row.status === "signed_outside" ? row.finalStorageKey : null;
  return row.status === "signed_outside" ? null : row.finalStorageKey;
}

export async function sendSigningEmails(
  app: FastifyInstance,
  log: FastifyBaseLogger,
  input: {
    brokerId: string;
    brokerName: string;
    brokerEmail: string;
    fullySigned: boolean;
    finals: { bytes: Uint8Array; file: { fileName: string } }[];
    signerEmail: string | null;
  },
): Promise<void> {
  const { env, db, mailer } = app.deps;
  const attachments: EmailAttachment[] = input.finals.map((item) => ({ filename: item.file.fileName, content: item.bytes }));
  const messages = [
    { to: input.brokerEmail, ...contractsSignedEmail({ brokerName: input.brokerName, fullySigned: input.fullySigned, link: webLink(env, `/app/steps/${CONTRACT_STEP_KEY}`) }), attachments },
  ];
  if (!input.fullySigned) {
    const recipients = input.signerEmail ? [input.signerEmail] : await adminEmails(db);
    for (const to of recipients) messages.push({ to, ...countersignNeededEmail({ brokerName: input.brokerName, link: webLink(env, `/admin/brokers/${input.brokerId}`) }), attachments: [] });
  }
  await sendSafely(mailer, log, messages);
}

export function registerContractRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const brokerErrors = { 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema };

  r.get(
    "/v1/me/contracts",
    {
      preHandler: requireBroker,
      schema: { tags: ["broker"], summary: "The broker's agreements on step 3, the details that go into them, and every earlier version", response: { 200: myContractsResponseSchema, ...brokerErrors } },
    },
    async (request) => {
      const actor = currentActor(request);
      const { db } = app.deps;
      const templates = await activeTemplates(db);
      const ready = CONTRACT_TEMPLATE_KEYS.every((key) => templates.has(key));
      const step = await loadBrokerStepByKey(db, actor.brokerId!, CONTRACT_STEP_KEY);
      if (ready && step && step.status !== "approved") await ensureOpenDocuments(db, actor.brokerId!, templates, app.deps.now());
      const rows = await documentsFor(db, actor.brokerId!);
      const versions = await templateVersions(db);
      const open = openDocuments(rows);
      const openIds = new Set([...open.values()].map((row) => row.id));
      const context = await signingContext(db, actor.brokerId!);
      return {
        ready,
        current: CONTRACT_TEMPLATE_KEYS.flatMap((key) => (open.get(key) ? [toDocumentView(open.get(key)!, versions)] : [])),
        history: rows.filter((row) => !openIds.has(row.id)).map((row) => toDocumentView(row, versions)),
        needsResign: step?.status === "todo" && rows.some((row) => row.status === "voided" && row.brokerSignedAt !== null),
        details: {
          fullName: context.name,
          phone: context.phone,
          email: context.email,
          mailingAddress: context.mailingAddress,
          floridaLicenseNo: context.floridaLicenseNo,
          inHouseSplit: context.inHouseSplit,
          selfGeneratedSplit: context.selfGeneratedSplit,
        },
        consentText: ESIGN_CONSENT_TEXT,
      };
    },
  );

  r.get(
    "/v1/me/contracts/:key/preview",
    {
      preHandler: requireBroker,
      schema: { tags: ["broker", "files"], summary: "A live PDF preview of one agreement filled with the broker's details (records that it was opened)", params: keyParams, querystring: contractPreviewQuerySchema },
    },
    async (request, reply) => {
      const actor = currentActor(request);
      const bytes = await renderPreview(app.deps, {
        brokerId: actor.brokerId!,
        actorUserId: actor.userId,
        key: request.params.key,
        mailingAddress: request.query.mailingAddress,
        floridaLicenseNo: request.query.floridaLicenseNo,
      });
      return reply
        .header("content-type", "application/pdf")
        .header("cache-control", "no-store")
        .header("content-disposition", `inline; filename="${CONTRACT_TITLES[request.params.key as ContractTemplateKey].short} preview.pdf"`)
        .send(Buffer.from(bytes));
    },
  );

  r.post(
    "/v1/me/contracts/sign",
    {
      preHandler: requireBroker,
      bodyLimit: 1024 * 1024,
      schema: {
        tags: ["broker"],
        summary: "Sign both agreements with one signature (needs both opened, the e-sign consent and a mailing address)",
        body: signContractsRequestSchema,
        response: { 200: signContractsResponseSchema, 400: errorResponseSchema, ...brokerErrors },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      const result = await signAgreements(app.deps, {
        brokerId: actor.brokerId!,
        userId: actor.userId,
        request: request.body,
        ip: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null,
      });
      await sendSigningEmails(app, request.log, {
        brokerId: actor.brokerId!,
        brokerName: result.context.name,
        brokerEmail: actor.email,
        fullySigned: result.fullySigned,
        finals: result.finals,
        signerEmail: result.signer?.email ?? null,
      });
      if (result.onboardingComplete) await notifyOnboardingComplete(app, request.log, actor.brokerId!);
      return { status: result.fullySigned ? ("fully_signed" as const) : ("waiting_for_countersignature" as const), onboardingComplete: result.onboardingComplete };
    },
  );

  r.get(
    "/v1/me/contracts/:id/download-url",
    {
      preHandler: requireBroker,
      schema: { tags: ["broker", "files"], summary: "A 5-minute download link for one version of the broker's own agreement", params: idParams, querystring: contractDownloadQuerySchema, response: { 200: downloadUrlResponseSchema, ...brokerErrors } },
    },
    async (request) => {
      const actor = currentActor(request);
      const [row] = await app.deps.db
        .select()
        .from(contractDocuments)
        .where(and(eq(contractDocuments.id, request.params.id), eq(contractDocuments.brokerId, actor.brokerId!)));
      const key = row ? versionKey(row, request.query.version) : null;
      if (!row || !key) throw notFound("That document isn't available.");
      const title = CONTRACT_TITLES[row.templateKey as ContractTemplateKey].short;
      const url = await app.deps.storage.presignGet({ key, fileName: `${title} - ${request.query.version}.pdf`, expiresInSeconds: DOWNLOAD_TTL_SECONDS });
      return { url, expiresAt: new Date(app.deps.now().getTime() + DOWNLOAD_TTL_SECONDS * 1000).toISOString() };
    },
  );
}
