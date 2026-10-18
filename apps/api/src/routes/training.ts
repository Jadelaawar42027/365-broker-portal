/**
 * File: apps/api/src/routes/training.ts
 * Purpose: The broker's training routes (phase G, screens 2a-2d): training home, a chapter, a lesson (with a fresh
 * 5-minute video link), marking a lesson read or watched, video watch heartbeats, and quiz attempts (start or resume,
 * answer, submit, view). Only live chapters are ever shown, a broker only reaches their own attempts, and correct
 * answers appear only after a quiz is submitted.
 *
 * Functions:
 * - registerTrainingRoutes(app): mounts every /v1/me/training route behind the broker check.
 * - requireTrainingOpen(app, brokerId): throws 403 unless the broker is active (training opens after onboarding).
 * - findLesson(snapshot, lessonId): the chapter and lesson for a lesson id among live chapters, or throws 404.
 * - videoView(app, lessonId): the lesson's video for the player: the embed address, or a 5-minute link to the uploaded file.
 * - bestScore(chapter): the broker's best submitted score in a chapter, or null.
 */
import { brokers, chapters, lessons, lessonVideos } from "@bp/db";
import {
  answerRequestSchema,
  completeLessonRequestSchema,
  completesLesson,
  errorResponseSchema,
  isTrainingOpen,
  lessonProgressRequestSchema,
  lessonProgressResponseSchema,
  minutesLeft,
  nextChapterId,
  okResponseSchema,
  quizAttemptResponseSchema,
  quizAvailability,
  startAttemptResponseSchema,
  trainingChapterResponseSchema,
  trainingHomeResponseSchema,
  trainingLessonResponseSchema,
} from "@bp/shared";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { conflict, forbidden, notFound } from "../errors";
import { currentActor, requireBroker } from "../plugins/auth-guard";
import {
  buildAttemptView,
  chapterLabel,
  chapterRetake,
  findChapter,
  loadTrainingSnapshot,
  recordLessonCompletion,
  recordWatchProgress,
  requireUnlocked,
  saveAnswer,
  startOrResumeAttempt,
  submitAttempt,
  type SnapshotChapter,
} from "../services/training";

const VIDEO_URL_TTL_SECONDS = 5 * 60;
const idParams = z.object({ id: z.uuid() });

function bestScore(chapter: SnapshotChapter): number | null {
  const scores = chapter.attempts.map((attempt) => attempt.scorePct).filter((score): score is number => score !== null);
  return scores.length ? Math.max(...scores) : null;
}

async function requireTrainingOpen(app: FastifyInstance, brokerId: string) {
  const [broker] = await app.deps.db.select({ status: brokers.status }).from(brokers).where(eq(brokers.id, brokerId));
  if (!isTrainingOpen(broker?.status)) throw forbidden("Training opens once your onboarding is approved.");
}

function findLesson(snapshot: SnapshotChapter[], lessonId: string) {
  for (const chapter of snapshot) {
    const lesson = chapter.lessons.find((candidate) => candidate.id === lessonId);
    if (lesson) return { chapter, lesson };
  }
  throw notFound("Lesson not found.");
}

async function videoView(app: FastifyInstance, lessonId: string) {
  const [video] = await app.deps.db.select().from(lessonVideos).where(eq(lessonVideos.lessonId, lessonId));
  if (!video) return null;
  const playUrl =
    video.source === "upload" && video.storageKey
      ? await app.deps.storage.presignGet({
          key: video.storageKey,
          fileName: video.fileName ?? "lesson.mp4",
          expiresInSeconds: VIDEO_URL_TTL_SECONDS,
          inline: true,
        })
      : null;
  return {
    source: video.source,
    provider: video.provider,
    embedUrl: video.source === "embed" ? video.embedUrl : null,
    playUrl,
    durationSeconds: video.durationSeconds,
  };
}

export function registerTrainingRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const errors = { 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema };

  r.get(
    "/v1/me/training",
    {
      preHandler: requireBroker,
      schema: { tags: ["broker"], summary: "Training home: chapters, progress and where to continue (2a)", response: { 200: trainingHomeResponseSchema, ...errors } },
    },
    async (request) => {
      const actor = currentActor(request);
      const [broker] = await app.deps.db.select({ status: brokers.status }).from(brokers).where(eq(brokers.id, actor.brokerId!));
      const open = isTrainingOpen(broker?.status);
      const snapshot = await loadTrainingSnapshot(app.deps.db, actor.brokerId!);
      const volumeTwo = await app.deps.db
        .select({ id: chapters.id, code: chapters.code, title: chapters.title, scheduleLabel: chapters.scheduleLabel })
        .from(chapters)
        .where(and(eq(chapters.status, "coming_soon"), eq(chapters.volume, 2)))
        .orderBy(asc(chapters.position));
      const bestScores = snapshot.map(bestScore).filter((score): score is number => score !== null);
      const nextId = open ? nextChapterId(snapshot) : null;
      const next = snapshot.find((chapter) => chapter.id === nextId) ?? null;
      const firstUnread = next?.lessons.find((lesson) => !lesson.completed) ?? null;
      return {
        open,
        stats: {
          chaptersPassed: snapshot.filter((chapter) => chapter.passed).length,
          chaptersTotal: snapshot.length,
          averageScore: bestScores.length ? Math.round(bestScores.reduce((a, b) => a + b, 0) / bestScores.length) : null,
        },
        continue: next
          ? {
              chapterId: next.id,
              label: next.label,
              lessonsTotal: next.lessons.length,
              lessonsCompleted: next.lessons.filter((lesson) => lesson.completed).length,
              minutesLeft: minutesLeft(next.lessons),
              nextLessonId: firstUnread?.id ?? null,
              quizNext: !firstUnread,
            }
          : null,
        volumeOne: snapshot.map((chapter) => ({
          id: chapter.id,
          code: chapter.code,
          label: chapter.label,
          title: chapter.title,
          summary: chapter.summary,
          state: open ? chapter.state : ("locked" as const),
          unlocksAfterCode: open ? chapter.unlocksAfterCode : null,
          lessonsTotal: chapter.lessons.length,
          lessonsCompleted: chapter.lessons.filter((lesson) => lesson.completed).length,
          bestScore: bestScore(chapter),
          passMark: chapter.passMark,
        })),
        volumeTwo: volumeTwo.map((chapter) => ({ id: chapter.id, label: chapterLabel(chapter), title: chapter.title, scheduleLabel: chapter.scheduleLabel })),
      };
    },
  );

  r.get(
    "/v1/me/training/chapters/:id",
    {
      preHandler: requireBroker,
      schema: { tags: ["broker"], summary: "One chapter: lessons and quiz status", params: idParams, response: { 200: trainingChapterResponseSchema, ...errors } },
    },
    async (request) => {
      const actor = currentActor(request);
      await requireTrainingOpen(app, actor.brokerId!);
      const chapter = findChapter(await loadTrainingSnapshot(app.deps.db, actor.brokerId!), request.params.id);
      requireUnlocked(chapter);
      const retake = await chapterRetake(app.deps.db, chapter);
      const inProgress = chapter.attempts.find((attempt) => attempt.status === "in_progress") ?? null;
      const submitted = chapter.attempts.filter((attempt) => attempt.status === "submitted");
      return {
        chapter: {
          id: chapter.id,
          code: chapter.code,
          label: chapter.label,
          title: chapter.title,
          summary: chapter.summary,
          passMark: chapter.passMark,
          retakePolicy: chapter.retakePolicy,
          state: chapter.state,
        },
        lessons: chapter.lessons.map((lesson) => ({
          id: lesson.id,
          position: lesson.position,
          title: lesson.title,
          readMinutes: lesson.readMinutes,
          kind: lesson.kind,
          completed: lesson.completed,
        })),
        quiz: {
          availability: quizAvailability({
            chapterUnlocked: chapter.unlocked,
            lessonsTotal: chapter.lessons.length,
            lessonsCompleted: chapter.lessons.filter((lesson) => lesson.completed).length,
            hasAttemptInProgress: Boolean(inProgress),
            canRetake: retake.canRetake,
          }),
          questionCount: Math.min(chapter.poolSize, chapter.questionsPerAttempt),
          inProgressAttemptId: inProgress?.id ?? null,
          lastAttemptId: retake.lastAttemptId,
          lessonsToReread: retake.lessonsToReread,
          bestScore: submitted.length ? Math.max(...submitted.map((attempt) => attempt.scorePct ?? 0)) : null,
          tries: submitted.length,
          passed: chapter.passed,
        },
      };
    },
  );

  r.get(
    "/v1/me/training/lessons/:id",
    {
      preHandler: requireBroker,
      schema: { tags: ["broker"], summary: "One lesson with its text and video (2b)", params: idParams, response: { 200: trainingLessonResponseSchema, ...errors } },
    },
    async (request) => {
      const actor = currentActor(request);
      await requireTrainingOpen(app, actor.brokerId!);
      const { chapter, lesson } = findLesson(await loadTrainingSnapshot(app.deps.db, actor.brokerId!), request.params.id);
      requireUnlocked(chapter);
      const [full] = await app.deps.db.select().from(lessons).where(eq(lessons.id, lesson.id));
      const index = chapter.lessons.findIndex((candidate) => candidate.id === lesson.id);
      return {
        id: lesson.id,
        chapter: { id: chapter.id, label: chapter.label, title: chapter.title },
        position: lesson.position,
        lessonsTotal: chapter.lessons.length,
        title: lesson.title,
        readMinutes: lesson.readMinutes,
        bodyMd: full!.bodyMd,
        todoItems: full!.todoItems ?? [],
        callouts: full!.callouts ?? [],
        kind: lesson.kind,
        video: await videoView(app, lesson.id),
        videoPlaceholder: full!.videoPlaceholder,
        completed: lesson.completed,
        watchedSeconds: lesson.watchedSeconds,
        lessons: chapter.lessons.map((item) => ({ id: item.id, position: item.position, title: item.title, completed: item.completed })),
        previousLessonId: chapter.lessons[index - 1]?.id ?? null,
        nextLessonId: chapter.lessons[index + 1]?.id ?? null,
        quizQuestionCount: Math.min(chapter.poolSize, chapter.questionsPerAttempt),
      };
    },
  );

  r.post(
    "/v1/me/training/lessons/:id/complete",
    {
      preHandler: requireBroker,
      schema: {
        tags: ["broker"],
        summary: "Mark a lesson read (text) or watched (embedded video)",
        params: idParams,
        body: completeLessonRequestSchema,
        response: { 200: lessonProgressResponseSchema, ...errors },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      await requireTrainingOpen(app, actor.brokerId!);
      const { chapter, lesson } = findLesson(await loadTrainingSnapshot(app.deps.db, actor.brokerId!), request.params.id);
      requireUnlocked(chapter);
      const allowed = completesLesson({
        kind: lesson.kind,
        action: request.body.action,
        durationSeconds: lesson.durationSeconds,
        alreadyCompleted: lesson.completed,
      });
      if (!allowed) {
        throw conflict(
          lesson.kind === "upload" ? "Watch the video to the end to finish this lesson." : "Use the button on the lesson to finish it.",
          "lesson_not_complete",
        );
      }
      await recordLessonCompletion(app.deps.db, { brokerId: actor.brokerId!, lessonId: lesson.id, now: app.deps.now() });
      return { completed: true, watchedSeconds: lesson.watchedSeconds };
    },
  );

  r.post(
    "/v1/me/training/lessons/:id/progress",
    {
      preHandler: requireBroker,
      schema: {
        tags: ["broker"],
        summary: "Video watch heartbeat: furthest second watched (uploaded videos complete at 90%)",
        params: idParams,
        body: lessonProgressRequestSchema,
        response: { 200: lessonProgressResponseSchema, ...errors },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      await requireTrainingOpen(app, actor.brokerId!);
      const { chapter, lesson } = findLesson(await loadTrainingSnapshot(app.deps.db, actor.brokerId!), request.params.id);
      requireUnlocked(chapter);
      if (lesson.kind === "text") throw conflict("This lesson has no video.", "no_video");
      const result = await recordWatchProgress(app.deps.db, {
        brokerId: actor.brokerId!,
        lesson,
        watchedSeconds: request.body.watchedSeconds,
        durationSeconds: request.body.durationSeconds,
        now: app.deps.now(),
      });
      return { completed: result.completed, watchedSeconds: result.watchedSeconds };
    },
  );

  r.get(
    "/v1/me/training/lessons/:id/video-url",
    {
      preHandler: requireBroker,
      schema: {
        tags: ["broker"],
        summary: "A fresh 5-minute link to the lesson's uploaded video",
        params: idParams,
        response: { 200: z.object({ url: z.string(), expiresAt: z.string() }), ...errors },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      await requireTrainingOpen(app, actor.brokerId!);
      const { chapter, lesson } = findLesson(await loadTrainingSnapshot(app.deps.db, actor.brokerId!), request.params.id);
      requireUnlocked(chapter);
      const video = await videoView(app, lesson.id);
      if (!video?.playUrl) throw notFound("This lesson has no uploaded video.");
      return { url: video.playUrl, expiresAt: new Date(app.deps.now().getTime() + VIDEO_URL_TTL_SECONDS * 1000).toISOString() };
    },
  );

  r.post(
    "/v1/me/training/chapters/:id/attempts",
    {
      preHandler: requireBroker,
      schema: { tags: ["broker"], summary: "Start the chapter quiz, or resume the one in progress", params: idParams, response: { 200: startAttemptResponseSchema, ...errors } },
    },
    async (request) => {
      const actor = currentActor(request);
      await requireTrainingOpen(app, actor.brokerId!);
      const chapter = findChapter(await loadTrainingSnapshot(app.deps.db, actor.brokerId!), request.params.id);
      return { attemptId: await startOrResumeAttempt(app.deps.db, { brokerId: actor.brokerId!, chapter }) };
    },
  );

  r.get(
    "/v1/me/training/attempts/:id",
    {
      preHandler: requireBroker,
      schema: { tags: ["broker"], summary: "A quiz attempt: questions while in progress, the result once submitted (2c, 2d)", params: idParams, response: { 200: quizAttemptResponseSchema, ...errors } },
    },
    async (request) => buildAttemptView(app.deps.db, currentActor(request).brokerId!, request.params.id),
  );

  r.put(
    "/v1/me/training/attempts/:id/answers",
    {
      preHandler: requireBroker,
      schema: { tags: ["broker"], summary: "Save the answer to one question", params: idParams, body: answerRequestSchema, response: { 200: okResponseSchema, ...errors } },
    },
    async (request) => {
      const actor = currentActor(request);
      await saveAnswer(app.deps.db, { brokerId: actor.brokerId!, attemptId: request.params.id, ...request.body });
      return { ok: true as const };
    },
  );

  r.post(
    "/v1/me/training/attempts/:id/submit",
    {
      preHandler: requireBroker,
      schema: { tags: ["broker"], summary: "Submit the quiz and get the result", params: idParams, response: { 200: quizAttemptResponseSchema, ...errors } },
    },
    async (request) => {
      const actor = currentActor(request);
      await app.deps.db.transaction((tx) => submitAttempt(tx, { brokerId: actor.brokerId!, attemptId: request.params.id, now: app.deps.now() }));
      return buildAttemptView(app.deps.db, actor.brokerId!, request.params.id);
    },
  );
}
