/**
 * File: apps/api/src/routes/admin/training.ts
 * Purpose: Admin training routes (phase G, screen 3e and the training panels on 3a-3c): chapter, lesson and question
 * editing with ordering, lesson videos (an embed link, or a multipart upload of an MP4 up to 1 GB straight to the
 * bucket), publish / unpublish, per-question correct rates, each broker's training progress, allowing a retake, and the
 * "who needs a hand" overview. Every change is written to audit_log.
 *
 * Functions:
 * - registerAdminTrainingRoutes(app): mounts every /v1/admin/training route (the admin scope already requires an admin).
 * - requireChapterRow(app, id): loads a chapter or throws 404.
 * - requireLessonRow(app, id): loads a lesson with its chapter or throws 404.
 * - requireQuestionRow(app, id): loads a question with its chapter or throws 404.
 * - chapterRows(app): every chapter with lesson and question counts, average score and whether anything is flagged.
 * - questionStats(app, questionIds): answered count, correct % and first-attempt correct % per question.
 * - nextPosition(rows): one more than the highest position.
 * - videoKey(lessonId, fileName): the bucket key for an uploaded lesson video.
 * - brokerTraining(app, brokerId): one broker's training progress for the profile panel (3c).
 * - replaceOptions(tx, questionId, options): updates, adds and removes a question's options to match the request.
 */
import {
  attemptAnswers,
  brokers,
  brokerTrainingMetrics,
  chapters,
  lessons,
  lessonVideos,
  questionOptions,
  questions,
  quizAttempts,
  users,
  type DbOrTx,
} from "@bp/db";
import {
  abortVideoUploadRequestSchema,
  adminChapterDetailResponseSchema,
  adminChapterListResponseSchema,
  brokerTrainingResponseSchema,
  chapterFieldsSchema,
  completeVideoUploadRequestSchema,
  embedVideoRequestSchema,
  errorResponseSchema,
  estimateReadMinutes,
  idResponseSchema,
  isTrainingOpen,
  lessonFieldsSchema,
  lessonOrderRequestSchema,
  MAX_VIDEO_BYTES,
  okResponseSchema,
  parseEmbedVideoUrl,
  questionFieldsSchema,
  safeFileName,
  startVideoUploadRequestSchema,
  startVideoUploadResponseSchema,
  trainingOverviewResponseSchema,
  updateChapterRequestSchema,
  updateLessonRequestSchema,
  updateQuestionRequestSchema,
  VIDEO_MIME_TYPE,
  VIDEO_PART_BYTES,
  type AdminChapterRow,
} from "@bp/shared";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { badRequest, conflict, notFound } from "../../errors";
import { currentActor } from "../../plugins/auth-guard";
import { writeAudit } from "../../services/audit";
import { chapterLabel, chapterRetake, loadTrainingSnapshot } from "../../services/training";

const idParams = z.object({ id: z.uuid() });
const UPLOAD_PART_URL_TTL_SECONDS = 6 * 60 * 60;
const INACTIVE_TRAINING_DAYS = 7;

async function requireChapterRow(app: FastifyInstance, id: string) {
  const [row] = await app.deps.db.select().from(chapters).where(eq(chapters.id, id));
  if (!row) throw notFound("Chapter not found.");
  return row;
}

async function requireLessonRow(app: FastifyInstance, id: string) {
  const [row] = await app.deps.db.select({ lesson: lessons, chapter: chapters }).from(lessons).innerJoin(chapters, eq(chapters.id, lessons.chapterId)).where(eq(lessons.id, id));
  if (!row) throw notFound("Lesson not found.");
  return row;
}

async function requireQuestionRow(app: FastifyInstance, id: string) {
  const [row] = await app.deps.db.select({ question: questions, chapter: chapters }).from(questions).innerJoin(chapters, eq(chapters.id, questions.chapterId)).where(eq(questions.id, id));
  if (!row) throw notFound("Question not found.");
  return row;
}

async function chapterRows(app: FastifyInstance): Promise<AdminChapterRow[]> {
  const { db } = app.deps;
  const rows = await db.select().from(chapters).orderBy(asc(chapters.volume), asc(chapters.position));
  const lessonCounts = await db.select({ chapterId: lessons.chapterId, count: sql<number>`count(*)::int`, flagged: sql<number>`count(${lessons.adminNote})::int` }).from(lessons).groupBy(lessons.chapterId);
  const questionCounts = await db
    .select({ chapterId: questions.chapterId, count: sql<number>`count(*)::int`, flagged: sql<number>`count(${questions.adminNote})::int` })
    .from(questions)
    .where(eq(questions.active, true))
    .groupBy(questions.chapterId);
  const scores = await db
    .select({ chapterId: quizAttempts.chapterId, average: sql<number | null>`round(avg(${quizAttempts.scorePct}))::int` })
    .from(quizAttempts)
    .where(eq(quizAttempts.status, "submitted"))
    .groupBy(quizAttempts.chapterId);
  return rows.map((chapter) => {
    const lessonCount = lessonCounts.find((row) => row.chapterId === chapter.id);
    const questionCount = questionCounts.find((row) => row.chapterId === chapter.id);
    return {
      id: chapter.id,
      volume: chapter.volume,
      code: chapter.code,
      label: chapterLabel(chapter),
      title: chapter.title,
      status: chapter.status,
      position: chapter.position,
      lessonsCount: lessonCount?.count ?? 0,
      questionsCount: questionCount?.count ?? 0,
      averageScore: scores.find((row) => row.chapterId === chapter.id)?.average ?? null,
      flagged: (lessonCount?.flagged ?? 0) + (questionCount?.flagged ?? 0) > 0,
    };
  });
}

async function questionStats(app: FastifyInstance, questionIds: string[]) {
  if (questionIds.length === 0) return [];
  return app.deps.db
    .select({
      questionId: attemptAnswers.questionId,
      answered: sql<number>`count(*)::int`,
      correctPct: sql<number | null>`round(100.0 * avg(CASE WHEN ${attemptAnswers.isCorrect} THEN 1 ELSE 0 END))::int`,
      firstTimeCorrectPct: sql<number | null>`round(100.0 * avg(CASE WHEN ${attemptAnswers.isCorrect} THEN 1 ELSE 0 END) FILTER (WHERE ${quizAttempts.attemptNumber} = 1))::int`,
    })
    .from(attemptAnswers)
    .innerJoin(quizAttempts, eq(quizAttempts.id, attemptAnswers.attemptId))
    .where(and(inArray(attemptAnswers.questionId, questionIds), isNotNull(attemptAnswers.isCorrect)))
    .groupBy(attemptAnswers.questionId);
}

function nextPosition(rows: { position: number }[]): number {
  return rows.reduce((highest, row) => Math.max(highest, row.position), 0) + 1;
}

function videoKey(lessonId: string, fileName: string): string {
  return `training/lessons/${lessonId}/${randomBytes(6).toString("hex")}-${safeFileName(fileName)}`;
}

async function brokerTraining(app: FastifyInstance, brokerId: string) {
  const { db } = app.deps;
  const [broker] = await db.select({ status: brokers.status }).from(brokers).where(eq(brokers.id, brokerId));
  if (!broker) throw notFound("Broker not found.");
  const snapshot = await loadTrainingSnapshot(db, brokerId);
  const [metrics] = await db.select().from(brokerTrainingMetrics).where(eq(brokerTrainingMetrics.brokerId, brokerId));
  const chaptersView = [];
  for (const chapter of snapshot) {
    const submitted = chapter.attempts.filter((attempt) => attempt.status === "submitted");
    const retake = await chapterRetake(db, chapter);
    const failures = submitted.filter((attempt) => attempt.passed === false).length;
    chaptersView.push({
      id: chapter.id,
      code: chapter.code,
      label: chapter.label,
      title: chapter.title,
      summary: chapter.summary,
      state: chapter.state,
      unlocksAfterCode: chapter.unlocksAfterCode,
      lessonsTotal: chapter.lessons.length,
      lessonsCompleted: chapter.lessons.filter((lesson) => lesson.completed).length,
      bestScore: submitted.length ? Math.max(...submitted.map((attempt) => attempt.scorePct ?? 0)) : null,
      passMark: chapter.passMark,
      tries: submitted.length,
      firstScore: submitted[0]?.scorePct ?? null,
      needsHelp: !chapter.passed && failures >= 2,
      canRetake: retake.canRetake,
      lessonsToReread: retake.lessonsToReread,
    });
  }
  return {
    open: isTrainingOpen(broker.status),
    summary: {
      chaptersPassed: metrics?.chaptersPassed ?? 0,
      chaptersTotal: metrics?.chaptersTotal ?? snapshot.length,
      avgBestScore: metrics?.avgBestScore ?? null,
      avgFirstAttemptScore: metrics?.avgFirstAttemptScore ?? null,
    },
    chapters: chaptersView,
  };
}

async function replaceOptions(tx: DbOrTx, questionId: string, options: { id?: string; label: string; isCorrect: boolean }[]) {
  const existing = await tx.select({ id: questionOptions.id }).from(questionOptions).where(eq(questionOptions.questionId, questionId));
  const keep = new Set(options.map((option) => option.id).filter(Boolean));
  const removed = existing.filter((option) => !keep.has(option.id)).map((option) => option.id);
  if (removed.length) await tx.delete(questionOptions).where(inArray(questionOptions.id, removed));
  for (const [index, option] of options.entries()) {
    if (option.id && existing.some((row) => row.id === option.id)) {
      await tx.update(questionOptions).set({ label: option.label, isCorrect: option.isCorrect, position: index + 1 }).where(eq(questionOptions.id, option.id));
    } else {
      await tx.insert(questionOptions).values({ questionId, label: option.label, isCorrect: option.isCorrect, position: index + 1 });
    }
  }
}

export function registerAdminTrainingRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const errors = { 400: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema };

  r.get(
    "/v1/admin/training/chapters",
    { schema: { tags: ["admin"], summary: "Every chapter with counts and average quiz score (3e)", response: { 200: adminChapterListResponseSchema } } },
    async () => ({ chapters: await chapterRows(app) }),
  );

  r.post(
    "/v1/admin/training/chapters",
    { schema: { tags: ["admin"], summary: "Create a chapter (starts as a draft, or coming soon)", body: chapterFieldsSchema, response: { 201: idResponseSchema, ...errors } } },
    async (request, reply) => {
      const actor = currentActor(request);
      const { db } = app.deps;
      const { comingSoon, ...fields } = request.body;
      const [taken] = await db.select({ id: chapters.id }).from(chapters).where(eq(chapters.code, fields.code));
      if (taken) throw conflict(`A chapter with code ${fields.code} already exists.`, "code_taken");
      const volume = fields.volume ?? 1;
      const siblings = await db.select({ position: chapters.position }).from(chapters).where(eq(chapters.volume, volume));
      const [created] = await db
        .insert(chapters)
        .values({ ...fields, volume, position: fields.position ?? nextPosition(siblings), status: comingSoon ? "coming_soon" : "draft" })
        .returning({ id: chapters.id });
      await writeAudit(db, { actorUserId: actor.userId, action: "training.chapter_created", entityType: "chapter", entityId: created!.id, after: request.body });
      return reply.status(201).send({ id: created!.id });
    },
  );

  r.get(
    "/v1/admin/training/chapters/:id",
    { schema: { tags: ["admin"], summary: "A chapter with its lessons, videos, questions and per-question stats", params: idParams, response: { 200: adminChapterDetailResponseSchema, 404: errorResponseSchema } } },
    async (request) => {
      const { db } = app.deps;
      const chapter = await requireChapterRow(app, request.params.id);
      const row = (await chapterRows(app)).find((candidate) => candidate.id === chapter.id)!;
      const lessonRows = await db.select({ lesson: lessons, video: lessonVideos }).from(lessons).leftJoin(lessonVideos, eq(lessonVideos.lessonId, lessons.id)).where(eq(lessons.chapterId, chapter.id)).orderBy(asc(lessons.position));
      const questionRows = await db.select().from(questions).where(eq(questions.chapterId, chapter.id)).orderBy(desc(questions.active), asc(questions.position));
      const optionRows = questionRows.length
        ? await db.select().from(questionOptions).where(inArray(questionOptions.questionId, questionRows.map((question) => question.id))).orderBy(asc(questionOptions.position))
        : [];
      const stats = await questionStats(app, questionRows.map((question) => question.id));
      return {
        chapter: {
          ...row,
          summary: chapter.summary,
          passMark: chapter.passMark,
          questionsPerAttempt: chapter.questionsPerAttempt,
          retakePolicy: chapter.retakePolicy,
          scheduleLabel: chapter.scheduleLabel,
          publishedAt: chapter.publishedAt?.toISOString() ?? null,
        },
        lessons: lessonRows.map(({ lesson, video }) => ({
          id: lesson.id,
          position: lesson.position,
          title: lesson.title,
          bodyMd: lesson.bodyMd,
          todoItems: lesson.todoItems ?? [],
          callouts: lesson.callouts ?? [],
          readMinutes: lesson.readMinutes,
          adminNote: lesson.adminNote,
          videoPlaceholder: lesson.videoPlaceholder,
          video: video
            ? { source: video.source, provider: video.provider, embedUrl: video.embedUrl, fileName: video.fileName, sizeBytes: video.sizeBytes, durationSeconds: video.durationSeconds }
            : null,
        })),
        questions: questionRows.map((question) => {
          const stat = stats.find((item) => item.questionId === question.id);
          return {
            id: question.id,
            position: question.position,
            prompt: question.prompt,
            explanation: question.explanation,
            lessonId: question.lessonId,
            adminNote: question.adminNote,
            active: question.active,
            options: optionRows.filter((option) => option.questionId === question.id).map((option) => ({ id: option.id, label: option.label, isCorrect: option.isCorrect })),
            stats: { answered: stat?.answered ?? 0, correctPct: stat?.correctPct ?? null, firstTimeCorrectPct: stat?.firstTimeCorrectPct ?? null },
          };
        }),
      };
    },
  );

  r.patch(
    "/v1/admin/training/chapters/:id",
    { schema: { tags: ["admin"], summary: "Edit a chapter's details, pass mark, questions per attempt or retake rule", params: idParams, body: updateChapterRequestSchema, response: { 200: okResponseSchema, ...errors } } },
    async (request) => {
      const actor = currentActor(request);
      const chapter = await requireChapterRow(app, request.params.id);
      const { comingSoon, ...fields } = request.body;
      if (fields.code && fields.code !== chapter.code) {
        const [taken] = await app.deps.db.select({ id: chapters.id }).from(chapters).where(eq(chapters.code, fields.code));
        if (taken) throw conflict(`A chapter with code ${fields.code} already exists.`, "code_taken");
      }
      const status = comingSoon === undefined || chapter.status === "live" ? undefined : comingSoon ? ("coming_soon" as const) : ("draft" as const);
      await app.deps.db.update(chapters).set({ ...fields, ...(status ? { status } : {}) }).where(eq(chapters.id, chapter.id));
      await writeAudit(app.deps.db, { actorUserId: actor.userId, action: "training.chapter_updated", entityType: "chapter", entityId: chapter.id, before: chapter, after: request.body });
      return { ok: true as const };
    },
  );

  r.post(
    "/v1/admin/training/chapters/:id/publish",
    { schema: { tags: ["admin"], summary: "Publish a chapter so brokers can see it", params: idParams, response: { 200: okResponseSchema, ...errors } } },
    async (request) => {
      const actor = currentActor(request);
      const chapter = await requireChapterRow(app, request.params.id);
      const row = (await chapterRows(app)).find((candidate) => candidate.id === chapter.id)!;
      if (row.lessonsCount === 0) throw conflict("Add at least one lesson before publishing.", "no_lessons");
      if (row.questionsCount === 0) throw conflict("Add at least one quiz question before publishing.", "no_questions");
      await app.deps.db.update(chapters).set({ status: "live", publishedAt: app.deps.now() }).where(eq(chapters.id, chapter.id));
      await writeAudit(app.deps.db, { actorUserId: actor.userId, action: "training.chapter_published", entityType: "chapter", entityId: chapter.id, before: { status: chapter.status }, after: { status: "live" } });
      return { ok: true as const };
    },
  );

  r.post(
    "/v1/admin/training/chapters/:id/unpublish",
    { schema: { tags: ["admin"], summary: "Take a chapter back to draft (brokers stop seeing it)", params: idParams, response: { 200: okResponseSchema, ...errors } } },
    async (request) => {
      const actor = currentActor(request);
      const chapter = await requireChapterRow(app, request.params.id);
      await app.deps.db.update(chapters).set({ status: "draft" }).where(eq(chapters.id, chapter.id));
      await writeAudit(app.deps.db, { actorUserId: actor.userId, action: "training.chapter_unpublished", entityType: "chapter", entityId: chapter.id, before: { status: chapter.status }, after: { status: "draft" } });
      return { ok: true as const };
    },
  );

  r.delete(
    "/v1/admin/training/chapters/:id",
    { schema: { tags: ["admin"], summary: "Delete a draft chapter nobody has attempted", params: idParams, response: { 200: okResponseSchema, ...errors } } },
    async (request) => {
      const actor = currentActor(request);
      const chapter = await requireChapterRow(app, request.params.id);
      if (chapter.status === "live") throw conflict("Unpublish the chapter before deleting it.", "chapter_live");
      const attempts = await app.deps.db.select({ id: quizAttempts.id }).from(quizAttempts).where(eq(quizAttempts.chapterId, chapter.id)).limit(1);
      if (attempts.length) throw conflict("Brokers have taken this chapter's quiz, so it can't be deleted.", "chapter_has_attempts");
      await app.deps.db.delete(chapters).where(eq(chapters.id, chapter.id));
      await writeAudit(app.deps.db, { actorUserId: actor.userId, action: "training.chapter_deleted", entityType: "chapter", entityId: chapter.id, before: chapter });
      return { ok: true as const };
    },
  );

  r.post(
    "/v1/admin/training/chapters/:id/lessons",
    { schema: { tags: ["admin"], summary: "Add a lesson at the end of a chapter", params: idParams, body: lessonFieldsSchema, response: { 201: idResponseSchema, ...errors } } },
    async (request, reply) => {
      const actor = currentActor(request);
      const chapter = await requireChapterRow(app, request.params.id);
      const siblings = await app.deps.db.select({ position: lessons.position }).from(lessons).where(eq(lessons.chapterId, chapter.id));
      const bodyMd = request.body.bodyMd ?? "";
      const [created] = await app.deps.db
        .insert(lessons)
        .values({ ...request.body, bodyMd, chapterId: chapter.id, position: nextPosition(siblings), readMinutes: request.body.readMinutes ?? estimateReadMinutes(bodyMd) })
        .returning({ id: lessons.id });
      await writeAudit(app.deps.db, { actorUserId: actor.userId, action: "training.lesson_created", entityType: "lesson", entityId: created!.id, after: { chapterId: chapter.id, title: request.body.title } });
      return reply.status(201).send({ id: created!.id });
    },
  );

  r.patch(
    "/v1/admin/training/lessons/:id",
    { schema: { tags: ["admin"], summary: "Edit a lesson", params: idParams, body: updateLessonRequestSchema, response: { 200: okResponseSchema, ...errors } } },
    async (request) => {
      const actor = currentActor(request);
      const { lesson } = await requireLessonRow(app, request.params.id);
      await app.deps.db.update(lessons).set(request.body).where(eq(lessons.id, lesson.id));
      await writeAudit(app.deps.db, { actorUserId: actor.userId, action: "training.lesson_updated", entityType: "lesson", entityId: lesson.id, before: { title: lesson.title }, after: request.body });
      return { ok: true as const };
    },
  );

  r.delete(
    "/v1/admin/training/lessons/:id",
    { schema: { tags: ["admin"], summary: "Delete a lesson from a chapter that isn't published", params: idParams, response: { 200: okResponseSchema, ...errors } } },
    async (request) => {
      const actor = currentActor(request);
      const { lesson, chapter } = await requireLessonRow(app, request.params.id);
      if (chapter.status === "live") throw conflict("Unpublish the chapter before deleting lessons, so brokers' progress isn't lost.", "chapter_live");
      await app.deps.db.delete(lessons).where(eq(lessons.id, lesson.id));
      await writeAudit(app.deps.db, { actorUserId: actor.userId, action: "training.lesson_deleted", entityType: "lesson", entityId: lesson.id, before: { title: lesson.title, chapterId: chapter.id } });
      return { ok: true as const };
    },
  );

  r.put(
    "/v1/admin/training/chapters/:id/lesson-order",
    { schema: { tags: ["admin"], summary: "Reorder a chapter's lessons", params: idParams, body: lessonOrderRequestSchema, response: { 200: okResponseSchema, ...errors } } },
    async (request) => {
      const actor = currentActor(request);
      const chapter = await requireChapterRow(app, request.params.id);
      const existing = await app.deps.db.select({ id: lessons.id }).from(lessons).where(eq(lessons.chapterId, chapter.id));
      const ids = request.body.lessonIds;
      if (ids.length !== existing.length || new Set(ids).size !== ids.length || !existing.every((row) => ids.includes(row.id))) {
        throw badRequest("Send every lesson of the chapter exactly once.", "invalid_order");
      }
      await app.deps.db.transaction(async (tx) => {
        for (const [index, id] of ids.entries()) await tx.update(lessons).set({ position: index + 1 }).where(eq(lessons.id, id));
        await writeAudit(tx, { actorUserId: actor.userId, action: "training.lessons_reordered", entityType: "chapter", entityId: chapter.id, after: { lessonIds: ids } });
      });
      return { ok: true as const };
    },
  );

  r.put(
    "/v1/admin/training/lessons/:id/video/embed",
    { schema: { tags: ["admin", "files"], summary: "Use a YouTube, Loom or Vimeo link as the lesson video", params: idParams, body: embedVideoRequestSchema, response: { 200: okResponseSchema, ...errors } } },
    async (request) => {
      const actor = currentActor(request);
      const { lesson } = await requireLessonRow(app, request.params.id);
      const parsed = parseEmbedVideoUrl(request.body.url);
      if (!parsed) throw badRequest("Use a YouTube, Loom or Vimeo link (https).", "invalid_video_url");
      const values = { source: "embed" as const, provider: parsed.provider, embedUrl: parsed.embedUrl, storageKey: null, fileName: null, sizeBytes: null, mimeType: null, durationSeconds: null, uploadedBy: actor.userId };
      await app.deps.db.insert(lessonVideos).values({ lessonId: lesson.id, ...values }).onConflictDoUpdate({ target: lessonVideos.lessonId, set: values });
      await writeAudit(app.deps.db, { actorUserId: actor.userId, action: "training.video_set", entityType: "lesson", entityId: lesson.id, after: { source: "embed", provider: parsed.provider, embedUrl: parsed.embedUrl } });
      return { ok: true as const };
    },
  );

  r.delete(
    "/v1/admin/training/lessons/:id/video",
    { schema: { tags: ["admin", "files"], summary: "Remove a lesson's video", params: idParams, response: { 200: okResponseSchema, ...errors } } },
    async (request) => {
      const actor = currentActor(request);
      const { lesson } = await requireLessonRow(app, request.params.id);
      await app.deps.db.delete(lessonVideos).where(eq(lessonVideos.lessonId, lesson.id));
      await writeAudit(app.deps.db, { actorUserId: actor.userId, action: "training.video_removed", entityType: "lesson", entityId: lesson.id });
      return { ok: true as const };
    },
  );

  r.post(
    "/v1/admin/training/lessons/:id/video/uploads",
    {
      schema: {
        tags: ["admin", "files"],
        summary: "Start uploading an MP4 (up to 1 GB) straight to the bucket in parts",
        params: idParams,
        body: startVideoUploadRequestSchema,
        response: { 200: startVideoUploadResponseSchema, ...errors },
      },
    },
    async (request) => {
      const { lesson } = await requireLessonRow(app, request.params.id);
      if (app.deps.env.STORAGE_UPLOAD_MODE !== "direct") {
        throw conflict("Video uploads need direct uploads to the bucket (STORAGE_UPLOAD_MODE=direct). Use a YouTube, Loom or Vimeo link instead.", "video_upload_unavailable");
      }
      const storageKey = videoKey(lesson.id, request.body.fileName);
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
    "/v1/admin/training/lessons/:id/video/uploads/complete",
    { schema: { tags: ["admin", "files"], summary: "Finish a video upload and attach it to the lesson", params: idParams, body: completeVideoUploadRequestSchema, response: { 200: okResponseSchema, ...errors } } },
    async (request) => {
      const actor = currentActor(request);
      const { lesson } = await requireLessonRow(app, request.params.id);
      const { storageKey, uploadId, parts, fileName, durationSeconds } = request.body;
      if (!storageKey.startsWith(`training/lessons/${lesson.id}/`)) throw badRequest("That upload doesn't belong to this lesson.", "upload_not_for_lesson");
      await app.deps.storage.completeMultipartUpload({ key: storageKey, uploadId, parts });
      const stored = await app.deps.storage.headObject(storageKey);
      if (!stored || stored.sizeBytes <= 0 || stored.sizeBytes > MAX_VIDEO_BYTES) throw badRequest("The video didn't finish uploading, or is over 1 GB.", "video_invalid");
      const values = {
        source: "upload" as const,
        provider: "upload" as const,
        storageKey,
        embedUrl: null,
        fileName,
        sizeBytes: stored.sizeBytes,
        mimeType: VIDEO_MIME_TYPE,
        durationSeconds: durationSeconds ?? null,
        uploadedBy: actor.userId,
      };
      await app.deps.db.insert(lessonVideos).values({ lessonId: lesson.id, ...values }).onConflictDoUpdate({ target: lessonVideos.lessonId, set: values });
      await writeAudit(app.deps.db, { actorUserId: actor.userId, action: "training.video_set", entityType: "lesson", entityId: lesson.id, after: { source: "upload", fileName, sizeBytes: stored.sizeBytes, durationSeconds } });
      return { ok: true as const };
    },
  );

  r.post(
    "/v1/admin/training/lessons/:id/video/uploads/abort",
    { schema: { tags: ["admin", "files"], summary: "Cancel a video upload", params: idParams, body: abortVideoUploadRequestSchema, response: { 200: okResponseSchema, ...errors } } },
    async (request) => {
      const { lesson } = await requireLessonRow(app, request.params.id);
      if (!request.body.storageKey.startsWith(`training/lessons/${lesson.id}/`)) throw badRequest("That upload doesn't belong to this lesson.", "upload_not_for_lesson");
      await app.deps.storage.abortMultipartUpload({ key: request.body.storageKey, uploadId: request.body.uploadId });
      return { ok: true as const };
    },
  );

  r.post(
    "/v1/admin/training/chapters/:id/questions",
    { schema: { tags: ["admin"], summary: "Add a multiple-choice question to a chapter", params: idParams, body: questionFieldsSchema, response: { 201: idResponseSchema, ...errors } } },
    async (request, reply) => {
      const actor = currentActor(request);
      const chapter = await requireChapterRow(app, request.params.id);
      if (request.body.lessonId) {
        const [lesson] = await app.deps.db.select({ id: lessons.id }).from(lessons).where(and(eq(lessons.id, request.body.lessonId), eq(lessons.chapterId, chapter.id)));
        if (!lesson) throw badRequest("Pick a lesson from this chapter.", "lesson_not_in_chapter");
      }
      const id = await app.deps.db.transaction(async (tx) => {
        const siblings = await tx.select({ position: questions.position }).from(questions).where(eq(questions.chapterId, chapter.id));
        const { options, ...fields } = request.body;
        const [created] = await tx.insert(questions).values({ ...fields, explanation: fields.explanation ?? "", chapterId: chapter.id, position: nextPosition(siblings) }).returning({ id: questions.id });
        await replaceOptions(tx, created!.id, options);
        await writeAudit(tx, { actorUserId: actor.userId, action: "training.question_created", entityType: "question", entityId: created!.id, after: request.body });
        return created!.id;
      });
      return reply.status(201).send({ id });
    },
  );

  r.patch(
    "/v1/admin/training/questions/:id",
    { schema: { tags: ["admin"], summary: "Edit a question and its options", params: idParams, body: updateQuestionRequestSchema, response: { 200: okResponseSchema, ...errors } } },
    async (request) => {
      const actor = currentActor(request);
      const { question, chapter } = await requireQuestionRow(app, request.params.id);
      if (request.body.lessonId) {
        const [lesson] = await app.deps.db.select({ id: lessons.id }).from(lessons).where(and(eq(lessons.id, request.body.lessonId), eq(lessons.chapterId, chapter.id)));
        if (!lesson) throw badRequest("Pick a lesson from this chapter.", "lesson_not_in_chapter");
      }
      await app.deps.db.transaction(async (tx) => {
        const { options, ...fields } = request.body;
        if (Object.keys(fields).length) await tx.update(questions).set(fields).where(eq(questions.id, question.id));
        if (options) await replaceOptions(tx, question.id, options);
        await writeAudit(tx, { actorUserId: actor.userId, action: "training.question_updated", entityType: "question", entityId: question.id, before: { prompt: question.prompt }, after: request.body });
      });
      return { ok: true as const };
    },
  );

  r.delete(
    "/v1/admin/training/questions/:id",
    { schema: { tags: ["admin"], summary: "Delete a question (archived instead if brokers have answered it)", params: idParams, response: { 200: z.object({ outcome: z.enum(["deleted", "archived"]) }), ...errors } } },
    async (request) => {
      const actor = currentActor(request);
      const { question } = await requireQuestionRow(app, request.params.id);
      const answered = await app.deps.db.select({ id: attemptAnswers.id }).from(attemptAnswers).where(eq(attemptAnswers.questionId, question.id)).limit(1);
      const outcome = answered.length ? ("archived" as const) : ("deleted" as const);
      if (outcome === "archived") await app.deps.db.update(questions).set({ active: false }).where(eq(questions.id, question.id));
      else await app.deps.db.delete(questions).where(eq(questions.id, question.id));
      await writeAudit(app.deps.db, { actorUserId: actor.userId, action: `training.question_${outcome}`, entityType: "question", entityId: question.id, before: { prompt: question.prompt } });
      return { outcome };
    },
  );

  r.get(
    "/v1/admin/training/brokers/:id",
    { schema: { tags: ["admin"], summary: "One broker's training progress (3c)", params: idParams, response: { 200: brokerTrainingResponseSchema, 404: errorResponseSchema } } },
    async (request) => brokerTraining(app, request.params.id),
  );

  r.post(
    "/v1/admin/training/brokers/:id/chapters/:chapterId/allow-retake",
    {
      schema: {
        tags: ["admin"],
        summary: "Let a broker retake a failed quiz without re-reading first",
        params: z.object({ id: z.uuid(), chapterId: z.uuid() }),
        response: { 200: okResponseSchema, ...errors },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      const [last] = await app.deps.db
        .select()
        .from(quizAttempts)
        .where(and(eq(quizAttempts.brokerId, request.params.id), eq(quizAttempts.chapterId, request.params.chapterId), eq(quizAttempts.status, "submitted")))
        .orderBy(desc(quizAttempts.attemptNumber))
        .limit(1);
      if (!last || last.passed) throw conflict("There's no failed quiz to allow a retake for.", "nothing_to_waive");
      await app.deps.db.update(quizAttempts).set({ retakeWaivedAt: app.deps.now(), retakeWaivedBy: actor.userId }).where(eq(quizAttempts.id, last.id));
      await writeAudit(app.deps.db, { actorUserId: actor.userId, action: "training.retake_allowed", entityType: "quiz_attempt", entityId: last.id, after: { brokerId: request.params.id, chapterId: request.params.chapterId } });
      return { ok: true as const };
    },
  );

  r.get(
    "/v1/admin/training/overview",
    { schema: { tags: ["admin"], summary: "Training numbers and brokers who need a hand (3a)", response: { 200: trainingOverviewResponseSchema } } },
    async () => {
      const { db } = app.deps;
      const now = app.deps.now();
      const [average] = await db
        .select({ value: sql<number | null>`round(avg(${quizAttempts.scorePct}))::int` })
        .from(quizAttempts)
        .innerJoin(chapters, eq(chapters.id, quizAttempts.chapterId))
        .where(and(eq(quizAttempts.status, "submitted"), eq(quizAttempts.attemptNumber, 1), eq(chapters.status, "live")));
      const active = await db
        .select({ id: brokers.id, name: users.name, lastTrainingAt: brokerTrainingMetrics.lastTrainingAt, onboardedAt: brokers.onboardedAt, joinedAt: brokers.joinedAt })
        .from(brokers)
        .innerJoin(users, eq(users.id, brokers.userId))
        .leftJoin(brokerTrainingMetrics, eq(brokerTrainingMetrics.brokerId, brokers.id))
        .where(eq(brokers.status, "active"));
      const needsHelp: { brokerId: string; name: string; reason: string; kind: "failed_twice" | "inactive" }[] = [];
      for (const broker of active) {
        const snapshot = await loadTrainingSnapshot(db, broker.id);
        const struggling = snapshot.find((chapter) => !chapter.passed && chapter.attempts.filter((attempt) => attempt.passed === false).length >= 2);
        if (struggling) {
          const scores = struggling.attempts.filter((attempt) => attempt.passed === false).map((attempt) => `${attempt.scorePct}%`);
          needsHelp.push({ brokerId: broker.id, name: broker.name, kind: "failed_twice", reason: `Failed ${struggling.label} ${scores.length} times (${scores.join(", ")})` });
          continue;
        }
        const current = snapshot.find((chapter) => !chapter.passed);
        if (!current) continue;
        const since = broker.lastTrainingAt ?? new Date(`${broker.onboardedAt ?? broker.joinedAt}T12:00:00Z`);
        const idleDays = Math.floor((now.getTime() - since.getTime()) / 86_400_000);
        if (idleDays >= INACTIVE_TRAINING_DAYS) {
          needsHelp.push({ brokerId: broker.id, name: broker.name, kind: "inactive", reason: `No training activity in ${idleDays} days · stopped at ${current.label}` });
        }
      }
      return { averageFirstAttemptScore: average?.value ?? null, needsHelp };
    },
  );
}
