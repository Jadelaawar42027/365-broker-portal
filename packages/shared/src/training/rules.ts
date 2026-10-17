/**
 * File: packages/shared/src/training/rules.ts
 * Purpose: The training rules from phase G, as pure functions shared by the API and the screens: when training opens,
 * which chapters are unlocked (in order, Part 0 first), when a lesson counts as complete, how a quiz is drawn and
 * scored against the chapter's pass mark, when a failed quiz may be retaken, and best / first-attempt scores.
 *
 * Functions:
 * - isTrainingOpen(brokerStatus): training opens once the broker is active.
 * - chapterStates(chapters): returns each chapter's state (passed, in_progress, available, locked) in position order, with the code it unlocks after.
 * - nextChapterId(states): the first unlocked chapter that isn't passed yet, or null.
 * - lessonKind(video): "text", "upload" or "embed" for a lesson, from its video (if any).
 * - isVideoWatched(watchedSeconds, durationSeconds): true once at least 90% of a known duration has been watched.
 * - completesLesson(input): whether an action (marking read, marking watched, a watch heartbeat) completes the lesson.
 * - drawQuestions(poolIds, count, random): picks `count` question ids at random (all of them if the pool is smaller).
 * - scoreAttempt(answers, correctOptionByQuestion, passMark): counts correct answers and returns score %, pass and per-question results.
 * - retakeStatus(input): whether a failed quiz can be retaken now, and which lessons must be re-read first.
 * - quizAvailability(input): what the quiz button should do: locked until lessons are done, blocked by a re-read, resume or start.
 * - attemptSummary(attempts): best score, first-attempt score, number of tries and whether any attempt passed.
 * - minutesLeft(lessons): the read minutes of the lessons not completed yet.
 */
import { VIDEO_COMPLETE_RATIO, type BrokerStatus, type RetakePolicy, type VideoSource } from "../constants";

export type ChapterProgressInput = {
  id: string;
  code: string;
  position: number;
  passed: boolean;
  lessonsTotal: number;
  lessonsCompleted: number;
  attempts: number;
};

export type ChapterState = "passed" | "in_progress" | "available" | "locked";

export function isTrainingOpen(brokerStatus: BrokerStatus | null | undefined): boolean {
  return brokerStatus === "active";
}

export function chapterStates(chapters: readonly ChapterProgressInput[]) {
  const ordered = [...chapters].sort((a, b) => a.position - b.position);
  let previousAllPassed = true;
  let previousCode: string | null = null;
  return ordered.map((chapter) => {
    const unlocked = previousAllPassed;
    let state: ChapterState;
    if (chapter.passed) state = "passed";
    else if (!unlocked) state = "locked";
    else if (chapter.lessonsCompleted > 0 || chapter.attempts > 0) state = "in_progress";
    else state = "available";
    const result = { ...chapter, state, unlocked, unlocksAfterCode: unlocked ? null : previousCode };
    previousAllPassed = previousAllPassed && chapter.passed;
    previousCode = chapter.code;
    return result;
  });
}

export function nextChapterId(states: readonly { id: string; state: ChapterState }[]): string | null {
  return states.find((chapter) => chapter.state === "in_progress" || chapter.state === "available")?.id ?? null;
}

export type LessonKind = "text" | "upload" | "embed";

export function lessonKind(video: { source: VideoSource } | null | undefined): LessonKind {
  return video ? video.source : "text";
}

export function isVideoWatched(watchedSeconds: number, durationSeconds: number | null | undefined): boolean {
  if (!durationSeconds || durationSeconds <= 0) return false;
  return watchedSeconds >= durationSeconds * VIDEO_COMPLETE_RATIO;
}

export function completesLesson(input: {
  kind: LessonKind;
  action: "mark_read" | "mark_watched" | "heartbeat";
  watchedSeconds?: number;
  durationSeconds?: number | null;
  alreadyCompleted: boolean;
}): boolean {
  if (input.alreadyCompleted && input.action !== "heartbeat") return true;
  switch (input.kind) {
    case "text":
      return input.action === "mark_read";
    case "embed":
      return input.action === "mark_watched";
    case "upload":
      if (input.action === "heartbeat") return isVideoWatched(input.watchedSeconds ?? 0, input.durationSeconds);
      return input.action === "mark_watched" && !input.durationSeconds;
  }
}

export function drawQuestions(poolIds: readonly string[], count: number, random: () => number = Math.random): string[] {
  const pool = [...poolIds];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap]!, pool[index]!];
  }
  return pool.slice(0, Math.max(0, Math.min(count, pool.length)));
}

export function scoreAttempt(
  answers: readonly { questionId: string; optionId: string | null }[],
  correctOptionByQuestion: ReadonlyMap<string, string>,
  passMark: number,
) {
  const results = answers.map((answer) => ({
    questionId: answer.questionId,
    isCorrect: answer.optionId !== null && correctOptionByQuestion.get(answer.questionId) === answer.optionId,
  }));
  const totalCount = answers.length;
  const correctCount = results.filter((result) => result.isCorrect).length;
  const scorePct = totalCount === 0 ? 0 : Math.round((correctCount / totalCount) * 100);
  return { correctCount, totalCount, scorePct, passed: totalCount > 0 && scorePct >= passMark, results };
}

export function retakeStatus(input: {
  retakePolicy: RetakePolicy;
  lastAttempt: { passed: boolean; submittedAt: Date; waivedAt: Date | null; missedLessonIds: readonly string[] } | null;
  lessonLastCompletedAt: ReadonlyMap<string, Date | null>;
}): { canRetake: boolean; lessonsToReread: string[] } {
  const last = input.lastAttempt;
  if (!last || last.passed || input.retakePolicy === "immediate" || last.waivedAt) return { canRetake: true, lessonsToReread: [] };
  const lessonsToReread = [...new Set(last.missedLessonIds)].filter((lessonId) => {
    const completedAt = input.lessonLastCompletedAt.get(lessonId);
    return !completedAt || completedAt.getTime() <= last.submittedAt.getTime();
  });
  return { canRetake: lessonsToReread.length === 0, lessonsToReread };
}

export type QuizAvailability = "chapter_locked" | "lessons_unfinished" | "reread_required" | "resume" | "start";

export function quizAvailability(input: {
  chapterUnlocked: boolean;
  lessonsTotal: number;
  lessonsCompleted: number;
  hasAttemptInProgress: boolean;
  canRetake: boolean;
}): QuizAvailability {
  if (!input.chapterUnlocked) return "chapter_locked";
  if (input.lessonsCompleted < input.lessonsTotal) return "lessons_unfinished";
  if (input.hasAttemptInProgress) return "resume";
  if (!input.canRetake) return "reread_required";
  return "start";
}

export function attemptSummary(attempts: readonly { attemptNumber: number; scorePct: number | null; passed: boolean | null }[]) {
  const submitted = attempts.filter((attempt) => attempt.scorePct !== null).sort((a, b) => a.attemptNumber - b.attemptNumber);
  if (submitted.length === 0) return { best: null, first: null, tries: 0, passed: false };
  return {
    best: Math.max(...submitted.map((attempt) => attempt.scorePct!)),
    first: submitted[0]!.scorePct,
    tries: submitted.length,
    passed: submitted.some((attempt) => attempt.passed === true),
  };
}

export function minutesLeft(lessons: readonly { readMinutes: number; completed: boolean }[]): number {
  return lessons.filter((lesson) => !lesson.completed).reduce((total, lesson) => total + lesson.readMinutes, 0);
}
