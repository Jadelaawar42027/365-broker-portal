/**
 * File: apps/api/src/services/step-content.ts
 * Purpose: Reads the extra content of an onboarding step (SPEC D28): its short guidance, its video slots (uploaded
 * videos play through 5-minute presigned links, like lesson videos) and its knowledge-check questions. Broker views
 * never include which option is correct; that is only used to check answers on the server.
 *
 * Functions:
 * - toGuidanceView(step): the What to do bullets, callouts and full text of a step, or null when it has no bullets.
 * - loadStepVideos(db, stepId): the step's video slots in order.
 * - toBrokerStepVideo(deps, video): a video slot as the broker sees it, with a short-lived play link for uploads.
 * - loadStepQuestions(db, stepId): the step's knowledge-check questions with their options (including which is correct).
 * - toBrokerCheckQuestion(question): a question without correctness, for the broker's step page.
 * - stepVideoKey(stepId, fileName): a fresh storage key for an uploaded step video.
 */
import { randomBytes } from "node:crypto";
import { stepQuestionOptions, stepQuestions, stepVideos, type DbOrTx } from "@bp/db";
import { safeFileName, type GuidanceView, type StepCheckQuestionView, type StepVideoView } from "@bp/shared";
import { asc, eq, inArray } from "drizzle-orm";
import type { AppDeps } from "../deps";

export const STEP_VIDEO_URL_TTL_SECONDS = 5 * 60;

export type StepVideoRow = typeof stepVideos.$inferSelect;
export type StepQuestionWithOptions = Awaited<ReturnType<typeof loadStepQuestions>>[number];

export function toGuidanceView(step: { todoItems: string[] | null; callouts: GuidanceView["callouts"] | null; fullTextMd: string | null }): GuidanceView | null {
  if (!step.todoItems?.length) return null;
  return { todoItems: step.todoItems, callouts: step.callouts ?? [], fullTextMd: step.fullTextMd ?? "" };
}

export async function loadStepVideos(db: DbOrTx, stepId: string): Promise<StepVideoRow[]> {
  return db.select().from(stepVideos).where(eq(stepVideos.stepId, stepId)).orderBy(asc(stepVideos.position));
}

export async function toBrokerStepVideo(deps: Pick<AppDeps, "storage">, video: StepVideoRow): Promise<StepVideoView> {
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
  };
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
