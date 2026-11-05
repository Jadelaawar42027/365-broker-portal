/**
 * File: apps/api/src/services/step-content.ts
 * Purpose: Reads the extra content of an onboarding step (SPEC D28): its short guidance, its video slots (uploaded
 * videos play through 5-minute presigned links, like lesson videos) and its knowledge-check questions. Broker views
 * never include which option is correct; that is only used to check answers on the server. It also records how far a
 * broker has watched each step video, for steps that must have their video watched (config.requireVideo, SPEC D32).
 *
 * Functions:
 * - toGuidanceView(step): the What to do bullets, callouts and full text of a step, or null when it has no bullets.
 * - loadStepVideos(db, stepId): the step's video slots in order.
 * - toBrokerStepVideo(deps, video, progress): a video slot as the broker sees it, with a short-lived play link for uploads and whether this broker has watched it.
 * - loadStepVideoProgress(db, brokerId, videoIds): this broker's progress on those videos, as a map from video id.
 * - recordStepVideoProgress(db, input): stores the furthest second watched of an uploaded, YouTube or Vimeo video and marks it watched at 90%; returns { watched, watchedSeconds }.
 * - markStepVideoWatched(db, input): marks a Loom video watched (the broker's "I've watched this video"); returns { watched, watchedSeconds }.
 * - loadStepQuestions(db, stepId): the step's knowledge-check questions with their options (including which is correct).
 * - toBrokerCheckQuestion(question): a question without correctness, for the broker's step page.
 * - stepVideoKey(stepId, fileName): a fresh storage key for an uploaded step video.
 */
import { randomBytes } from "node:crypto";
import { stepQuestionOptions, stepQuestions, stepVideoProgress, stepVideos, type DbOrTx } from "@bp/db";
import { isVideoWatched, safeFileName, type GuidanceView, type StepCheckQuestionView, type StepVideoView } from "@bp/shared";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { AppDeps } from "../deps";

export const STEP_VIDEO_URL_TTL_SECONDS = 5 * 60;

export type StepVideoRow = typeof stepVideos.$inferSelect;
export type StepVideoProgressRow = { watchedSeconds: number; watchedAt: Date | null };
export type StepQuestionWithOptions = Awaited<ReturnType<typeof loadStepQuestions>>[number];

export function toGuidanceView(step: { todoItems: string[] | null; callouts: GuidanceView["callouts"] | null; fullTextMd: string | null }): GuidanceView | null {
  if (!step.todoItems?.length) return null;
  return { todoItems: step.todoItems, callouts: step.callouts ?? [], fullTextMd: step.fullTextMd ?? "" };
}

export async function loadStepVideos(db: DbOrTx, stepId: string): Promise<StepVideoRow[]> {
  return db.select().from(stepVideos).where(eq(stepVideos.stepId, stepId)).orderBy(asc(stepVideos.position));
}

export async function toBrokerStepVideo(deps: Pick<AppDeps, "storage">, video: StepVideoRow, progress?: StepVideoProgressRow): Promise<StepVideoView> {
  const playUrl =
    video.source === "upload" && video.storageKey
      ? await deps.storage.presignGet({ key: video.storageKey, fileName: video.fileName ?? "video.mp4", expiresInSeconds: STEP_VIDEO_URL_TTL_SECONDS, inline: true })
      : null;
  return {
    id: video.id,
    title: video.title,
    source: video.source,
    provider: video.provider,
    embedUrl: video.source === "embed" ? video.embedUrl : null,
    playUrl,
    watched: Boolean(progress?.watchedAt),
    watchedSeconds: progress?.watchedSeconds ?? 0,
  };
}

export async function loadStepVideoProgress(db: DbOrTx, brokerId: string, videoIds: string[]): Promise<Map<string, StepVideoProgressRow>> {
  if (videoIds.length === 0) return new Map();
  const rows = await db
    .select({ stepVideoId: stepVideoProgress.stepVideoId, watchedSeconds: stepVideoProgress.watchedSeconds, watchedAt: stepVideoProgress.watchedAt })
    .from(stepVideoProgress)
    .where(and(eq(stepVideoProgress.brokerId, brokerId), inArray(stepVideoProgress.stepVideoId, videoIds)));
  return new Map(rows.map((row) => [row.stepVideoId, { watchedSeconds: row.watchedSeconds, watchedAt: row.watchedAt }]));
}

export async function recordStepVideoProgress(
  db: DbOrTx,
  input: { brokerId: string; video: StepVideoRow; watchedSeconds: number; durationSeconds?: number; now: Date },
): Promise<{ watched: boolean; watchedSeconds: number }> {
  const duration = input.video.durationSeconds ?? input.durationSeconds ?? null;
  const reported = duration ? Math.min(input.watchedSeconds, duration) : input.watchedSeconds;
  const reachedEnd = isVideoWatched(reported, duration);
  const [row] = await db
    .insert(stepVideoProgress)
    .values({ brokerId: input.brokerId, stepVideoId: input.video.id, watchedSeconds: reported, watchedAt: reachedEnd ? input.now : null })
    .onConflictDoUpdate({
      target: [stepVideoProgress.brokerId, stepVideoProgress.stepVideoId],
      set: {
        watchedSeconds: sql`GREATEST(${stepVideoProgress.watchedSeconds}, ${reported})`,
        watchedAt: reachedEnd ? sql`COALESCE(${stepVideoProgress.watchedAt}, ${input.now.toISOString()}::timestamptz)` : sql`${stepVideoProgress.watchedAt}`,
        updatedAt: input.now,
      },
    })
    .returning({ watchedSeconds: stepVideoProgress.watchedSeconds, watchedAt: stepVideoProgress.watchedAt });
  return { watched: Boolean(row?.watchedAt), watchedSeconds: row?.watchedSeconds ?? reported };
}

export async function markStepVideoWatched(db: DbOrTx, input: { brokerId: string; videoId: string; now: Date }): Promise<{ watched: boolean; watchedSeconds: number }> {
  const [row] = await db
    .insert(stepVideoProgress)
    .values({ brokerId: input.brokerId, stepVideoId: input.videoId, watchedAt: input.now })
    .onConflictDoUpdate({
      target: [stepVideoProgress.brokerId, stepVideoProgress.stepVideoId],
      set: { watchedAt: sql`COALESCE(${stepVideoProgress.watchedAt}, ${input.now.toISOString()}::timestamptz)`, updatedAt: input.now },
    })
    .returning({ watchedSeconds: stepVideoProgress.watchedSeconds });
  return { watched: true, watchedSeconds: row?.watchedSeconds ?? 0 };
}

export async function loadStepQuestions(db: DbOrTx, stepId: string) {
  const questions = await db.select().from(stepQuestions).where(eq(stepQuestions.stepId, stepId)).orderBy(asc(stepQuestions.position));
  if (questions.length === 0) return [];
  const options = await db
    .select()
    .from(stepQuestionOptions)
    .where(inArray(stepQuestionOptions.questionId, questions.map((question) => question.id)))
    .orderBy(asc(stepQuestionOptions.position));
  return questions.map((question) => ({
    ...question,
    options: options.filter((option) => option.questionId === question.id).map((option) => ({ id: option.id, label: option.label, isCorrect: option.isCorrect })),
  }));
}

export function toBrokerCheckQuestion(question: StepQuestionWithOptions): StepCheckQuestionView {
  return { id: question.id, prompt: question.prompt, options: question.options.map((option) => ({ id: option.id, label: option.label })) };
}

export function stepVideoKey(stepId: string, fileName: string): string {
  return `onboarding/steps/${stepId}/videos/${randomBytes(6).toString("hex")}-${safeFileName(fileName)}`;
}
