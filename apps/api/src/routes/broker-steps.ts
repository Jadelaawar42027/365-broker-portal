/**
 * File: apps/api/src/routes/broker-steps.ts
 * Purpose: The routes a broker uses for their own onboarding (screens 1b and 1c): the checklist, one step's detail,
 * the template download, getting an upload target, and submitting a step. A broker can only ever reach their own steps.
 *
 * Functions:
 * - registerBrokerStepRoutes(app): mounts GET /v1/me/steps, GET /v1/me/steps/:key, GET /v1/me/steps/:key/template-url, POST /v1/me/steps/:key/upload-url and POST /v1/me/steps/:key/submit.
 * - requireOwnStep(app, brokerId, key): loads the broker's own step by key or throws 404.
 * - notifyOnboardingComplete(app, log, brokerId): emails the broker and every admin that onboarding is complete.
 */
import { brokers, users } from "@bp/db";
import {
  countProgress,
  downloadUrlResponseSchema,
  errorResponseSchema,
  findNextStep,
  findSentBackSteps,
  formDataSchemaForStep,
  isOnboardingComplete,
  myStepsResponseSchema,
  stepDetailResponseSchema,
  submitStepRequestSchema,
  submitStepResponseSchema,
  uploadTargetResponseSchema,
  uploadUrlRequestSchema,
} from "@bp/shared";
import { eq } from "drizzle-orm";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { badRequest, conflict, notFound } from "../errors";
import { currentActor, requireBroker } from "../plugins/auth-guard";
import { onboardingCompleteAdminEmail, onboardingCompleteBrokerEmail } from "../services/emails";
import { sendSafely } from "../services/mailer";
import {
  activateIfComplete,
  applyStepAction,
  latestVersionFiles,
  loadBrokerStepByKey,
  loadBrokerSteps,
  loadFiles,
  nextFileVersion,
  toFileView,
  toIso,
  toStepSummary,
  type VerifiedFile,
} from "../services/steps";
import { adminEmails, todayFor, webLink } from "../services/support";
import { assertUploadAllowed, createUploadTarget, verifySubmittedFiles } from "../services/uploads";

const keyParams = z.object({ key: z.string().min(1).max(60) });
const DOWNLOAD_TTL_SECONDS = 5 * 60;

async function requireOwnStep(app: FastifyInstance, brokerId: string, key: string) {
  const row = await loadBrokerStepByKey(app.deps.db, brokerId, key);
  if (!row) throw notFound("That onboarding step doesn't exist.");
  return row;
}

export async function notifyOnboardingComplete(app: FastifyInstance, log: FastifyBaseLogger, brokerId: string) {
  const { db, env, mailer } = app.deps;
  const [broker] = await db
    .select({ name: users.name, email: users.email })
    .from(brokers)
    .innerJoin(users, eq(users.id, brokers.userId))
    .where(eq(brokers.id, brokerId));
  if (!broker) return;
  const admins = await adminEmails(db);
  await sendSafely(mailer, log, [
    { to: broker.email, ...onboardingCompleteBrokerEmail({ brokerName: broker.name, link: webLink(env, "/app/welcome-aboard") }) },
    ...admins.map((to) => ({
      to,
      ...onboardingCompleteAdminEmail({ brokerName: broker.name, link: webLink(env, `/admin/brokers/${brokerId}`) }),
    })),
  ]);
}

export function registerBrokerStepRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const brokerErrors = { 401: errorResponseSchema, 403: errorResponseSchema };

  r.get(
    "/v1/me/steps",
    {
      preHandler: requireBroker,
      schema: {
        tags: ["broker"],
        summary: "The signed-in broker's onboarding checklist",
        response: { 200: myStepsResponseSchema, ...brokerErrors },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      const rows = await loadBrokerSteps(app.deps.db, actor.brokerId!);
      const next = findNextStep(rows);
      return {
        progress: countProgress(rows),
        nextStepKey: next?.key ?? null,
        complete: isOnboardingComplete(rows),
        sentBack: findSentBackSteps(rows).map((row) => ({
          key: row.key,
          position: row.position,
          shortTitle: row.shortTitle,
          note: row.reviewNote,
          reviewerName: row.reviewerName,
          reviewedAt: toIso(row.reviewedAt),
        })),
        steps: rows.map((row) => toStepSummary(row, next?.key ?? null)),
      };
    },
  );

  r.get(
    "/v1/me/steps/:key",
    {
      preHandler: requireBroker,
      schema: {
        tags: ["broker"],
        summary: "One onboarding step with instructions and the latest submitted files",
        params: keyParams,
        response: { 200: stepDetailResponseSchema, 404: errorResponseSchema, ...brokerErrors },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      const rows = await loadBrokerSteps(app.deps.db, actor.brokerId!);
      const row = rows.find((candidate) => candidate.key === request.params.key);
      if (!row) throw notFound("That onboarding step doesn't exist.");
      const next = findNextStep(rows);
      const files = latestVersionFiles(await loadFiles(app.deps.db, [row.brokerStepId]));
      const { reviewChecklist: _internal, ...config } = row.config;
      return {
        ...toStepSummary(row, next?.key ?? null),
        intro: row.intro,
        instructionsMd: row.instructionsMd,
        videoUrl: row.videoUrl,
        acceptedTypes: row.acceptedTypes,
        maxSizeBytes: row.maxSizeBytes,
        config,
        hasTemplateFile: Boolean(row.templateFileKey),
        formData: row.formData,
        files: files.map(toFileView),
        attempts: row.attempts,
        submittedAt: toIso(row.submittedAt),
        canSubmit: row.kind !== "admin" && (row.status === "todo" || row.status === "changes_requested"),
        totalSteps: rows.length,
      };
    },
  );

  r.get(
    "/v1/me/steps/:key/template-url",
    {
      preHandler: requireBroker,
      schema: {
        tags: ["broker"],
        summary: "A 5-minute download link for the step's blank template",
        params: keyParams,
        response: { 200: downloadUrlResponseSchema, 404: errorResponseSchema, ...brokerErrors },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      const row = await requireOwnStep(app, actor.brokerId!, request.params.key);
      if (!row.templateFileKey) throw notFound("This step has no template to download.");
      const fileName = row.templateFileKey.split("/").pop() ?? "template.pdf";
      const url = await app.deps.storage.presignGet({ key: row.templateFileKey, fileName, expiresInSeconds: DOWNLOAD_TTL_SECONDS });
      return { url, expiresAt: new Date(app.deps.now().getTime() + DOWNLOAD_TTL_SECONDS * 1000).toISOString() };
    },
  );

  r.post(
    "/v1/me/steps/:key/upload-url",
    {
      preHandler: requireBroker,
      schema: {
        tags: ["files"],
        summary: "Where to upload one file for this step (direct to storage or via the API)",
        params: keyParams,
        body: uploadUrlRequestSchema,
        response: { 200: uploadTargetResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema, ...brokerErrors },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      const row = await requireOwnStep(app, actor.brokerId!, request.params.key);
      if (row.status !== "todo" && row.status !== "changes_requested") {
        throw conflict("This step has already been sent.", "step_not_open");
      }
      assertUploadAllowed(row, request.body);
      return createUploadTarget(app.deps, {
        brokerId: actor.brokerId!,
        stepKey: row.key,
        version: await nextFileVersion(app.deps.db, row.brokerStepId),
        userId: actor.userId,
        request: request.body,
      });
    },
  );

  r.post(
    "/v1/me/steps/:key/submit",
    {
      preHandler: requireBroker,
      schema: {
        tags: ["broker"],
        summary: "Send a step for approval (or complete it, if it needs no approval)",
        params: keyParams,
        body: submitStepRequestSchema,
        response: { 200: submitStepResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema, ...brokerErrors },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      const row = await requireOwnStep(app, actor.brokerId!, request.params.key);
      if (row.kind === "admin") {
        throw conflict("Your Sales Executive marks this step done after your one-on-one.", "admin_only_step");
      }
      let formData: Record<string, unknown> | undefined;
      let verifiedFiles: VerifiedFile[] | undefined;
      if (row.kind === "upload") {
        const submitted = request.body.files ?? [];
        if (submitted.length === 0) throw badRequest("Add at least one file before sending.", "files_required");
        verifiedFiles = await verifySubmittedFiles(app.deps, { brokerId: actor.brokerId!, step: row, files: submitted });
      } else {
        const parsed = formDataSchemaForStep(row).safeParse(request.body.formData ?? {});
        if (!parsed.success) {
          throw badRequest(parsed.error.issues[0]?.message ?? "Please check your answer.", "invalid_answer");
        }
        formData = parsed.data;
      }
      const now = app.deps.now();
      const result = await app.deps.db.transaction(async (tx) => {
        const change = await applyStepAction(tx, {
          row,
          action: "submit",
          actorUserId: actor.userId,
          now,
          formData,
          files: verifiedFiles,
        });
        const completed =
          change.to === "approved"
            ? await activateIfComplete(tx, { brokerId: actor.brokerId!, actorUserId: actor.userId, today: todayFor(now) })
            : false;
        return { status: change.to, onboardingComplete: completed };
      });
      if (result.onboardingComplete) await notifyOnboardingComplete(app, request.log, actor.brokerId!);
      return result;
    },
  );
}
