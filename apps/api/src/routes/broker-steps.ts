/**
 * File: apps/api/src/routes/broker-steps.ts
 * Purpose: The routes a broker uses for their own onboarding (screens 1b and 1c): the checklist, one step's detail
 * (with its short guidance, video slots and knowledge-check questions, never their answers), the template download, a
 * fresh play link for an uploaded step video, checking one knowledge-check answer, getting an upload target, and
 * submitting a step (refused until every knowledge-check answer is correct, SPEC D28). A broker can only ever reach
 * their own steps.
 *
 * Functions:
 * - registerBrokerStepRoutes(app): mounts GET /v1/me/steps, GET /v1/me/steps/:key, GET /v1/me/steps/:key/template-url, GET /v1/me/steps/:key/videos/:videoId/url, POST /v1/me/steps/:key/check, POST /v1/me/steps/:key/upload-url and POST /v1/me/steps/:key/submit.
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
  isStepCheckPassed,
  myStepsResponseSchema,
  stepCheckRequestSchema,
  stepCheckResponseSchema,
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
import { loadStepQuestions, loadStepVideos, STEP_VIDEO_URL_TTL_SECONDS, toBrokerCheckQuestion, toBrokerStepVideo, toGuidanceView } from "../services/step-content";
import { adminEmails, todayFor, webLink } from "../services/support";
import { assertUploadAllowed, createUploadTarget, verifySubmittedFiles } from "../services/uploads";

const keyParams = z.object({ key: z.string().min(1).max(60) });
const videoParams = keyParams.extend({ videoId: z.uuid() });
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
      const videos = await loadStepVideos(app.deps.db, row.stepId);
      const questions = await loadStepQuestions(app.deps.db, row.stepId);
      return {
        ...toStepSummary(row, next?.key ?? null),
        intro: row.intro,
        instructionsMd: row.instructionsMd,
        guidance: toGuidanceView(row),
        videos: await Promise.all(videos.map((video) => toBrokerStepVideo(app.deps, video))),
        checkQuestions: questions.map(toBrokerCheckQuestion),
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

  r.get(
    "/v1/me/steps/:key/videos/:videoId/url",
    {
      preHandler: requireBroker,
      schema: {
        tags: ["broker", "files"],
        summary: "A fresh 5-minute play link for one of the step's uploaded videos",
        params: videoParams,
        response: { 200: downloadUrlResponseSchema, 404: errorResponseSchema, ...brokerErrors },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      const row = await requireOwnStep(app, actor.brokerId!, request.params.key);
      const video = (await loadStepVideos(app.deps.db, row.stepId)).find((candidate) => candidate.id === request.params.videoId);
      if (!video || video.source !== "upload") throw notFound("That video doesn't exist.");
      const { playUrl } = await toBrokerStepVideo(app.deps, video);
      return { url: playUrl!, expiresAt: new Date(app.deps.now().getTime() + STEP_VIDEO_URL_TTL_SECONDS * 1000).toISOString() };
    },
  );

  r.post(
    "/v1/me/steps/:key/check",
    {
      preHandler: requireBroker,
      schema: {
        tags: ["broker"],
        summary: "Check one knowledge-check answer; returns whether it is right and the explanation",
        params: keyParams,
        body: stepCheckRequestSchema,
        response: { 200: stepCheckResponseSchema, 404: errorResponseSchema, ...brokerErrors },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      const row = await requireOwnStep(app, actor.brokerId!, request.params.key);
      const question = (await loadStepQuestions(app.deps.db, row.stepId)).find((candidate) => candidate.id === request.body.questionId);
      const option = question?.options.find((candidate) => candidate.id === request.body.optionId);
      if (!question || !option) throw notFound("That question isn't part of this step.");
      return { correct: option.isCorrect, explanation: question.explanation };
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
      const questions = await loadStepQuestions(app.deps.db, row.stepId);
      if (questions.length > 0 && !isStepCheckPassed(questions, request.body.checkAnswers)) {
        throw conflict("Answer the quick check correctly before you send this step.", "check_not_passed");
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
