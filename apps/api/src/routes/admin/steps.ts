/**
 * File: apps/api/src/routes/admin/steps.ts
 * Purpose: Admin routes for the onboarding-step editor (SPEC D28): list the active steps, read one step with its
 * guidance, video slots and knowledge check, edit the guidance (What to do, callouts, full text), manage video slots
 * (add, rename, remove, set an embed link, upload an MP4 straight to the bucket in parts, clear the video), and add,
 * edit or delete up to 3 knowledge-check questions. Every change writes audit_log.
 *
 * Functions:
 * - registerAdminStepRoutes(app): mounts the /v1/admin/steps, /v1/admin/step-videos and /v1/admin/step-questions routes.
 * - requireStep(app, key): loads an active onboarding step by key or throws 404.
 * - requireStepVideo(app, id): loads a step video slot by id or throws 404.
 * - requireStepQuestion(app, id): loads a knowledge-check question by id or throws 404.
 * - stepRow(step, videos, questionCount): the list/detail summary of a step.
 * - replaceStepOptions(tx, questionId, options): saves a question's options, keeping the ids of options that stay.
 */
import { onboardingSteps, stepQuestionOptions, stepQuestions, stepVideos, type DbOrTx } from "@bp/db";
import {
  abortVideoUploadRequestSchema,
  adminStepDetailResponseSchema,
  adminStepListResponseSchema,
  completeVideoUploadRequestSchema,
  embedVideoRequestSchema,
  errorResponseSchema,
  idResponseSchema,
  MAX_STEP_CHECK_QUESTIONS,
  MAX_VIDEO_BYTES,
  okResponseSchema,
  parseEmbedVideoUrl,
  startVideoUploadRequestSchema,
  startVideoUploadResponseSchema,
  stepQuestionFieldsSchema,
  stepVideoSlotRequestSchema,
  updateStepGuidanceRequestSchema,
  VIDEO_MIME_TYPE,
  VIDEO_PART_BYTES,
  type AdminStepListRow,
} from "@bp/shared";
import { and, asc, eq, inArray, max } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { badRequest, conflict, notFound } from "../../errors";
import { currentActor } from "../../plugins/auth-guard";
import { writeAudit } from "../../services/audit";
import { loadStepQuestions, loadStepVideos, stepVideoKey, type StepVideoRow } from "../../services/step-content";

const keyParams = z.object({ key: z.string().min(1).max(60) });
const idParams = z.object({ id: z.uuid() });
const errors = { 400: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema };
const UPLOAD_PART_URL_TTL_SECONDS = 6 * 60 * 60;

type StepRecord = typeof onboardingSteps.$inferSelect;

async function requireStep(app: FastifyInstance, key: string): Promise<StepRecord> {
  const [step] = await app.deps.db
    .select()
    .from(onboardingSteps)
    .where(and(eq(onboardingSteps.key, key), eq(onboardingSteps.active, true)));
  if (!step) throw notFound("That onboarding step doesn't exist.");
  return step;
}

async function requireStepVideo(app: FastifyInstance, id: string): Promise<StepVideoRow> {
  const [video] = await app.deps.db.select().from(stepVideos).where(eq(stepVideos.id, id));
  if (!video) throw notFound("That video slot doesn't exist.");
  return video;
}

async function requireStepQuestion(app: FastifyInstance, id: string) {
  const [question] = await app.deps.db.select().from(stepQuestions).where(eq(stepQuestions.id, id));
  if (!question) throw notFound("That question doesn't exist.");
  return question;
}

function stepRow(step: StepRecord, videos: StepVideoRow[], questionCount: number): AdminStepListRow {
  return {
    key: step.key,
    position: step.position,
    stage: step.stage,
    title: step.title,
    shortTitle: step.shortTitle,
    kind: step.kind,
    todoCount: step.todoItems?.length ?? 0,
    videoCount: videos.filter((video) => video.source !== null).length,
    emptyVideoSlots: videos.filter((video) => video.source === null).length,
    checkQuestionCount: questionCount,
  };
}

async function replaceStepOptions(tx: DbOrTx, questionId: string, options: { id?: string; label: string; isCorrect: boolean }[]) {
  const existing = await tx.select({ id: stepQuestionOptions.id }).from(stepQuestionOptions).where(eq(stepQuestionOptions.questionId, questionId));
  const keep = new Set(options.map((option) => option.id).filter(Boolean));
  const removed = existing.filter((option) => !keep.has(option.id)).map((option) => option.id);
  if (removed.length) await tx.delete(stepQuestionOptions).where(inArray(stepQuestionOptions.id, removed));
  for (const [index, option] of options.entries()) {
    if (option.id && existing.some((row) => row.id === option.id)) {
      await tx.update(stepQuestionOptions).set({ label: option.label, isCorrect: option.isCorrect, position: index }).where(eq(stepQuestionOptions.id, option.id));
    } else {
      await tx.insert(stepQuestionOptions).values({ questionId, label: option.label, isCorrect: option.isCorrect, position: index });
    }
  }
}

export function registerAdminStepRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/v1/admin/steps",
    { schema: { tags: ["admin"], summary: "The active onboarding steps with how much guidance each has", response: { 200: adminStepListResponseSchema } } },
    async () => {
      const steps = await app.deps.db.select().from(onboardingSteps).where(eq(onboardingSteps.active, true)).orderBy(asc(onboardingSteps.position));
      const stepIds = steps.map((step) => step.id);
      const videos = stepIds.length ? await app.deps.db.select().from(stepVideos).where(inArray(stepVideos.stepId, stepIds)) : [];
      const questions = stepIds.length ? await app.deps.db.select({ stepId: stepQuestions.stepId }).from(stepQuestions).where(inArray(stepQuestions.stepId, stepIds)) : [];
      return {
        steps: steps.map((step) =>
          stepRow(
            step,
            videos.filter((video) => video.stepId === step.id),
            questions.filter((question) => question.stepId === step.id).length,
          ),
        ),
      };
    },
  );

  r.get(
    "/v1/admin/steps/:key",
    { schema: { tags: ["admin"], summary: "One onboarding step with its guidance, video slots and knowledge check", params: keyParams, response: { 200: adminStepDetailResponseSchema, 404: errorResponseSchema } } },
    async (request) => {
      const step = await requireStep(app, request.params.key);
      const videos = await loadStepVideos(app.deps.db, step.id);
      const questions = await loadStepQuestions(app.deps.db, step.id);
      return {
        step: {
          ...stepRow(step, videos, questions.length),
          intro: step.intro,
          todoItems: step.todoItems ?? [],
          callouts: step.callouts ?? [],
          fullTextMd: step.fullTextMd ?? "",
        },
        videos: videos.map((video) => ({
          id: video.id,
          position: video.position,
          title: video.title,
          source: video.source,
          provider: video.provider,
          embedUrl: video.embedUrl,
          fileName: video.fileName,
          sizeBytes: video.sizeBytes,
        })),
        questions: questions.map((question) => ({ id: question.id, position: question.position, prompt: question.prompt, explanation: question.explanation, options: question.options })),
      };
    },
  );

  r.patch(
    "/v1/admin/steps/:key",
    { schema: { tags: ["admin"], summary: "Edit a step's What to do bullets, callouts or full manual text", params: keyParams, body: updateStepGuidanceRequestSchema, response: { 200: okResponseSchema, ...errors } } },
    async (request) => {
      const actor = currentActor(request);
      const step = await requireStep(app, request.params.key);
      const body = request.body;
      const changes = {
        ...(body.todoItems ? { todoItems: body.todoItems } : {}),
        ...(body.callouts ? { callouts: body.callouts } : {}),
        ...(body.fullTextMd !== undefined ? { fullTextMd: body.fullTextMd } : {}),
      };
      await app.deps.db.transaction(async (tx) => {
        await tx.update(onboardingSteps).set(changes).where(eq(onboardingSteps.id, step.id));
        await writeAudit(tx, {
          actorUserId: actor.userId,
          action: "step.guidance_updated",
          entityType: "onboarding_step",
          entityId: step.id,
          before: Object.fromEntries(Object.keys(changes).map((key) => [key, step[key as keyof StepRecord]])),
          after: changes,
        });
      });
      return { ok: true as const };
    },
  );

  r.post(
    "/v1/admin/steps/:key/videos",
    { schema: { tags: ["admin"], summary: "Add an empty video slot to a step", params: keyParams, body: stepVideoSlotRequestSchema, response: { 201: idResponseSchema, ...errors } } },
    async (request, reply) => {
      const actor = currentActor(request);
      const step = await requireStep(app, request.params.key);
      const [highest] = await app.deps.db.select({ value: max(stepVideos.position) }).from(stepVideos).where(eq(stepVideos.stepId, step.id));
      const [created] = await app.deps.db
        .insert(stepVideos)
        .values({ stepId: step.id, position: (highest?.value ?? 0) + 1, title: request.body.title })
        .returning({ id: stepVideos.id });
      await writeAudit(app.deps.db, { actorUserId: actor.userId, action: "step.video_slot_added", entityType: "onboarding_step", entityId: step.id, after: { videoId: created!.id, title: request.body.title } });
      return reply.status(201).send({ id: created!.id });
    },
  );

  r.patch(
    "/v1/admin/step-videos/:id",
    { schema: { tags: ["admin"], summary: "Rename a step video slot", params: idParams, body: stepVideoSlotRequestSchema, response: { 200: okResponseSchema, ...errors } } },
    async (request) => {
      const actor = currentActor(request);
      const video = await requireStepVideo(app, request.params.id);
      await app.deps.db.update(stepVideos).set({ title: request.body.title }).where(eq(stepVideos.id, video.id));
      await writeAudit(app.deps.db, { actorUserId: actor.userId, action: "step.video_renamed", entityType: "onboarding_step", entityId: video.stepId, before: { title: video.title }, after: { videoId: video.id, title: request.body.title } });
      return { ok: true as const };
    },
  );

  r.delete(
    "/v1/admin/step-videos/:id",
    { schema: { tags: ["admin"], summary: "Remove a video slot from a step", params: idParams, response: { 200: okResponseSchema, ...errors } } },
    async (request) => {
      const actor = currentActor(request);
      const video = await requireStepVideo(app, request.params.id);
      await app.deps.db.delete(stepVideos).where(eq(stepVideos.id, video.id));
      await writeAudit(app.deps.db, { actorUserId: actor.userId, action: "step.video_slot_removed", entityType: "onboarding_step", entityId: video.stepId, before: { videoId: video.id, title: video.title, source: video.source } });
      return { ok: true as const };
    },
  );

  r.put(
    "/v1/admin/step-videos/:id/embed",
    { schema: { tags: ["admin", "files"], summary: "Use a YouTube, Loom or Vimeo link in a step video slot", params: idParams, body: embedVideoRequestSchema, response: { 200: okResponseSchema, ...errors } } },
    async (request) => {
      const actor = currentActor(request);
      const video = await requireStepVideo(app, request.params.id);
      const parsed = parseEmbedVideoUrl(request.body.url);
      if (!parsed) throw badRequest("Use a YouTube, Loom or Vimeo link (https).", "invalid_video_url");
      const values = { source: "embed" as const, provider: parsed.provider, embedUrl: parsed.embedUrl, storageKey: null, fileName: null, sizeBytes: null, durationSeconds: null, uploadedBy: actor.userId };
      await app.deps.db.update(stepVideos).set(values).where(eq(stepVideos.id, video.id));
      await writeAudit(app.deps.db, { actorUserId: actor.userId, action: "step.video_set", entityType: "onboarding_step", entityId: video.stepId, after: { videoId: video.id, source: "embed", provider: parsed.provider, embedUrl: parsed.embedUrl } });
      return { ok: true as const };
    },
  );

  r.delete(
    "/v1/admin/step-videos/:id/video",
    { schema: { tags: ["admin", "files"], summary: "Clear a slot's video, leaving the empty slot", params: idParams, response: { 200: okResponseSchema, ...errors } } },
    async (request) => {
      const actor = currentActor(request);
      const video = await requireStepVideo(app, request.params.id);
      await app.deps.db
        .update(stepVideos)
        .set({ source: null, provider: null, embedUrl: null, storageKey: null, fileName: null, sizeBytes: null, durationSeconds: null })
        .where(eq(stepVideos.id, video.id));
      await writeAudit(app.deps.db, { actorUserId: actor.userId, action: "step.video_cleared", entityType: "onboarding_step", entityId: video.stepId, before: { videoId: video.id, source: video.source } });
      return { ok: true as const };
    },
  );

  r.post(
    "/v1/admin/step-videos/:id/uploads",
    {
      schema: {
        tags: ["admin", "files"],
        summary: "Start uploading an MP4 (up to 1 GB) for a step video slot, straight to the bucket in parts",
        params: idParams,
        body: startVideoUploadRequestSchema,
        response: { 200: startVideoUploadResponseSchema, ...errors },
      },
    },
    async (request) => {
      const video = await requireStepVideo(app, request.params.id);
      if (app.deps.env.STORAGE_UPLOAD_MODE !== "direct") {
        throw conflict("Video uploads need direct uploads to the bucket (STORAGE_UPLOAD_MODE=direct). Use a YouTube, Loom or Vimeo link instead.", "video_upload_unavailable");
      }
      const storageKey = stepVideoKey(video.stepId, request.body.fileName);
      const uploadId = await app.deps.storage.createMultipartUpload({ key: storageKey, contentType: VIDEO_MIME_TYPE });
      const partCount = Math.max(1, Math.ceil(request.body.sizeBytes / VIDEO_PART_BYTES));
      const parts = [];
      for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
        parts.push({ partNumber, url: await app.deps.storage.presignUploadPart({ key: storageKey, uploadId, partNumber, expiresInSeconds: UPLOAD_PART_URL_TTL_SECONDS }) });
      }
      return { uploadId, storageKey, partSize: VIDEO_PART_BYTES, parts };
    },
  );

  r.post(
    "/v1/admin/step-videos/:id/uploads/complete",
    { schema: { tags: ["admin", "files"], summary: "Finish a step video upload and put it in the slot", params: idParams, body: completeVideoUploadRequestSchema, response: { 200: okResponseSchema, ...errors } } },
    async (request) => {
      const actor = currentActor(request);
      const video = await requireStepVideo(app, request.params.id);
      const { storageKey, uploadId, parts, fileName, durationSeconds } = request.body;
      if (!storageKey.startsWith(`onboarding/steps/${video.stepId}/videos/`)) throw badRequest("That upload doesn't belong to this step.", "upload_not_for_step");
      await app.deps.storage.completeMultipartUpload({ key: storageKey, uploadId, parts });
      const stored = await app.deps.storage.headObject(storageKey);
      if (!stored || stored.sizeBytes <= 0 || stored.sizeBytes > MAX_VIDEO_BYTES) throw badRequest("The video didn't finish uploading, or is over 1 GB.", "video_invalid");
      const values = { source: "upload" as const, provider: "upload" as const, storageKey, embedUrl: null, fileName, sizeBytes: stored.sizeBytes, durationSeconds: durationSeconds ?? null, uploadedBy: actor.userId };
      await app.deps.db.update(stepVideos).set(values).where(eq(stepVideos.id, video.id));
      await writeAudit(app.deps.db, { actorUserId: actor.userId, action: "step.video_set", entityType: "onboarding_step", entityId: video.stepId, after: { videoId: video.id, source: "upload", fileName, sizeBytes: stored.sizeBytes } });
      return { ok: true as const };
    },
  );

  r.post(
    "/v1/admin/step-videos/:id/uploads/abort",
    { schema: { tags: ["admin", "files"], summary: "Cancel a step video upload", params: idParams, body: abortVideoUploadRequestSchema, response: { 200: okResponseSchema, ...errors } } },
    async (request) => {
      const video = await requireStepVideo(app, request.params.id);
      if (!request.body.storageKey.startsWith(`onboarding/steps/${video.stepId}/videos/`)) throw badRequest("That upload doesn't belong to this step.", "upload_not_for_step");
      await app.deps.storage.abortMultipartUpload({ key: request.body.storageKey, uploadId: request.body.uploadId });
      return { ok: true as const };
    },
  );

  r.post(
    "/v1/admin/steps/:key/questions",
    { schema: { tags: ["admin"], summary: "Add a knowledge-check question to a step (up to 3)", params: keyParams, body: stepQuestionFieldsSchema, response: { 201: idResponseSchema, ...errors } } },
    async (request, reply) => {
      const actor = currentActor(request);
      const step = await requireStep(app, request.params.key);
      const existing = await app.deps.db.select({ position: stepQuestions.position }).from(stepQuestions).where(eq(stepQuestions.stepId, step.id));
      if (existing.length >= MAX_STEP_CHECK_QUESTIONS) throw conflict(`A step can have at most ${MAX_STEP_CHECK_QUESTIONS} knowledge-check questions.`, "too_many_questions");
      const position = existing.reduce((highest, row) => Math.max(highest, row.position), 0) + 1;
      const id = await app.deps.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(stepQuestions)
          .values({ stepId: step.id, position, prompt: request.body.prompt, explanation: request.body.explanation })
          .returning({ id: stepQuestions.id });
        await replaceStepOptions(tx, created!.id, request.body.options);
        await writeAudit(tx, { actorUserId: actor.userId, action: "step.question_added", entityType: "onboarding_step", entityId: step.id, after: { questionId: created!.id, ...request.body } });
        return created!.id;
      });
      return reply.status(201).send({ id });
    },
  );

  r.patch(
    "/v1/admin/step-questions/:id",
    { schema: { tags: ["admin"], summary: "Edit a knowledge-check question", params: idParams, body: stepQuestionFieldsSchema, response: { 200: okResponseSchema, ...errors } } },
    async (request) => {
      const actor = currentActor(request);
      const question = await requireStepQuestion(app, request.params.id);
      await app.deps.db.transaction(async (tx) => {
        await tx.update(stepQuestions).set({ prompt: request.body.prompt, explanation: request.body.explanation }).where(eq(stepQuestions.id, question.id));
        await replaceStepOptions(tx, question.id, request.body.options);
        await writeAudit(tx, { actorUserId: actor.userId, action: "step.question_updated", entityType: "onboarding_step", entityId: question.stepId, before: { questionId: question.id, prompt: question.prompt }, after: request.body });
      });
      return { ok: true as const };
    },
  );

  r.delete(
    "/v1/admin/step-questions/:id",
    { schema: { tags: ["admin"], summary: "Delete a knowledge-check question", params: idParams, response: { 200: okResponseSchema, ...errors } } },
    async (request) => {
      const actor = currentActor(request);
      const question = await requireStepQuestion(app, request.params.id);
      await app.deps.db.delete(stepQuestions).where(eq(stepQuestions.id, question.id));
      await writeAudit(app.deps.db, { actorUserId: actor.userId, action: "step.question_deleted", entityType: "onboarding_step", entityId: question.stepId, before: { questionId: question.id, prompt: question.prompt } });
      return { ok: true as const };
    },
  );
}
