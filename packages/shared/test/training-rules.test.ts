/**
 * File: packages/shared/test/training-rules.test.ts
 * Purpose: Unit tests for the phase G training rules: opening training, chapter unlocking in order, lesson completion
 * per lesson kind, drawing and scoring quizzes against the pass mark, retakes after re-reading, and score summaries.
 *
 * Functions:
 * - chapter(code, position, passed, lessonsCompleted, attempts): a chapter progress row for the unlock tests.
 * - seeded(values): a fake random number generator that returns the given values in turn.
 */
import { describe, expect, it } from "vitest";
import {
  attemptSummary,
  chapterStates,
  completesLesson,
  drawQuestions,
  isTrainingOpen,
  isVideoWatched,
  lessonKind,
  minutesLeft,
  nextChapterId,
  quizAvailability,
  retakeStatus,
  scoreAttempt,
} from "../src/training/rules";

function chapter(code: string, position: number, passed = false, lessonsCompleted = 0, attempts = 0) {
  return { id: `c${code}`, code, position, passed, lessonsTotal: 4, lessonsCompleted, attempts };
}

function seeded(values: number[]) {
  let index = 0;
  return () => values[index++ % values.length]!;
}

describe("isTrainingOpen", () => {
  it("opens only for active brokers", () => {
    expect(isTrainingOpen("active")).toBe(true);
    for (const status of ["invited", "onboarding", "inactive", null] as const) expect(isTrainingOpen(status)).toBe(false);
  });
});

describe("chapterStates", () => {
  it("unlocks Part 0 first and each chapter only after the previous one is passed (mockup 2a)", () => {
    const states = chapterStates([chapter("02", 2, false, 2), chapter("0", 0, true), chapter("03", 3), chapter("01", 1, true), chapter("04", 4)]);
    expect(states.map((state) => [state.code, state.state, state.unlocksAfterCode])).toEqual([
      ["0", "passed", null],
      ["01", "passed", null],
      ["02", "in_progress", null],
      ["03", "locked", "02"],
      ["04", "locked", "03"],
    ]);
    expect(nextChapterId(states)).toBe("c02");
  });

  it("marks an unlocked chapter with no activity as available, and stays locked after a gap", () => {
    const states = chapterStates([chapter("0", 0), chapter("01", 1, true)]);
    expect(states.map((state) => state.state)).toEqual(["available", "passed"]);
    expect(states[1]!.unlocked).toBe(false);
    expect(nextChapterId(chapterStates([chapter("0", 0, true)]))).toBeNull();
  });
});

describe("lesson completion", () => {
  it("knows the lesson kind", () => {
    expect(lessonKind(null)).toBe("text");
    expect(lessonKind({ source: "upload" })).toBe("upload");
    expect(lessonKind({ source: "embed" })).toBe("embed");
  });

  it("completes text lessons when marked read", () => {
    expect(completesLesson({ kind: "text", action: "mark_read", alreadyCompleted: false })).toBe(true);
    expect(completesLesson({ kind: "text", action: "heartbeat", alreadyCompleted: false })).toBe(false);
  });

  it("completes embedded videos only with Mark as watched", () => {
    expect(completesLesson({ kind: "embed", action: "mark_watched", alreadyCompleted: false })).toBe(true);
    expect(completesLesson({ kind: "embed", action: "mark_read", alreadyCompleted: false })).toBe(false);
  });

  it("completes uploaded videos at 90% watched, and lets a finished lesson be marked again to re-read", () => {
    expect(isVideoWatched(89, 100)).toBe(false);
    expect(isVideoWatched(90, 100)).toBe(true);
    expect(isVideoWatched(500, null)).toBe(false);
    expect(completesLesson({ kind: "upload", action: "heartbeat", watchedSeconds: 90, durationSeconds: 100, alreadyCompleted: false })).toBe(true);
    expect(completesLesson({ kind: "upload", action: "heartbeat", watchedSeconds: 50, durationSeconds: 100, alreadyCompleted: false })).toBe(false);
    expect(completesLesson({ kind: "upload", action: "mark_watched", durationSeconds: 100, alreadyCompleted: false })).toBe(false);
    expect(completesLesson({ kind: "upload", action: "mark_watched", durationSeconds: null, alreadyCompleted: false })).toBe(true);
    expect(completesLesson({ kind: "upload", action: "mark_read", durationSeconds: 100, alreadyCompleted: true })).toBe(true);
  });
});

describe("drawQuestions", () => {
  it("draws N distinct questions from the pool, or all of a smaller pool", () => {
    const pool = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10", "q11", "q12"];
    const drawn = drawQuestions(pool, 8, seeded([0.1, 0.9, 0.5, 0.3, 0.7]));
    expect(drawn).toHaveLength(8);
    expect(new Set(drawn).size).toBe(8);
    expect(drawn.every((id) => pool.includes(id))).toBe(true);
    expect(drawQuestions(["a", "b"], 8).sort()).toEqual(["a", "b"]);
    expect(drawQuestions(pool, 0)).toEqual([]);
  });

  it("gives different orders for different random sequences", () => {
    const pool = ["a", "b", "c", "d", "e", "f"];
    expect(drawQuestions(pool, 6, seeded([0.01]))).not.toEqual(drawQuestions(pool, 6, seeded([0.99])));
  });
});

describe("scoreAttempt", () => {
  const correct = new Map([["q1", "o1"], ["q2", "o2"], ["q3", "o3"], ["q4", "o4"], ["q5", "o5"], ["q6", "o6"], ["q7", "o7"], ["q8", "o8"]]);

  it("scores 7 of 8 as 88% and passes at 80% (mockup 2d)", () => {
    const answers = [...correct.keys()].map((questionId, index) => ({ questionId, optionId: index === 3 ? "wrong" : correct.get(questionId)! }));
    const result = scoreAttempt(answers, correct, 80);
    expect(result).toMatchObject({ correctCount: 7, totalCount: 8, scorePct: 88, passed: true });
    expect(result.results.filter((item) => !item.isCorrect).map((item) => item.questionId)).toEqual(["q4"]);
  });

  it("treats unanswered questions as wrong and fails below the pass mark", () => {
    const answers = [...correct.keys()].map((questionId, index) => ({ questionId, optionId: index < 6 ? correct.get(questionId)! : null }));
    expect(scoreAttempt(answers, correct, 80)).toMatchObject({ correctCount: 6, scorePct: 75, passed: false });
    expect(scoreAttempt(answers, correct, 75).passed).toBe(true);
    expect(scoreAttempt([], correct, 80)).toMatchObject({ scorePct: 0, passed: false });
  });
});

describe("retakeStatus", () => {
  const failed = { passed: false, submittedAt: new Date("2026-10-17T10:00:00Z"), waivedAt: null, missedLessonIds: ["l2", "l4", "l2"] };

  it("asks for the lessons behind missed questions to be re-read after the failed attempt", () => {
    const status = retakeStatus({
      retakePolicy: "reread",
      lastAttempt: failed,
      lessonLastCompletedAt: new Map([["l2", new Date("2026-10-17T11:00:00Z")], ["l4", new Date("2026-10-16T09:00:00Z")]]),
    });
    expect(status).toEqual({ canRetake: false, lessonsToReread: ["l4"] });
  });

  it("allows the retake once every lesson is re-read, after a waiver, with the immediate policy, or after a pass", () => {
    const reread = new Map([["l2", new Date("2026-10-17T11:00:00Z")], ["l4", new Date("2026-10-17T12:00:00Z")]]);
    expect(retakeStatus({ retakePolicy: "reread", lastAttempt: failed, lessonLastCompletedAt: reread }).canRetake).toBe(true);
    expect(retakeStatus({ retakePolicy: "reread", lastAttempt: { ...failed, waivedAt: new Date() }, lessonLastCompletedAt: new Map() }).canRetake).toBe(true);
    expect(retakeStatus({ retakePolicy: "immediate", lastAttempt: failed, lessonLastCompletedAt: new Map() }).canRetake).toBe(true);
    expect(retakeStatus({ retakePolicy: "reread", lastAttempt: null, lessonLastCompletedAt: new Map() }).canRetake).toBe(true);
  });
});

describe("quizAvailability", () => {
  const base = { chapterUnlocked: true, lessonsTotal: 4, lessonsCompleted: 4, hasAttemptInProgress: false, canRetake: true };
  it("explains what the quiz button should do", () => {
    expect(quizAvailability({ ...base, chapterUnlocked: false })).toBe("chapter_locked");
    expect(quizAvailability({ ...base, lessonsCompleted: 3 })).toBe("lessons_unfinished");
    expect(quizAvailability({ ...base, hasAttemptInProgress: true })).toBe("resume");
    expect(quizAvailability({ ...base, canRetake: false })).toBe("reread_required");
    expect(quizAvailability(base)).toBe("start");
  });
});

describe("summaries", () => {
  it("reports best, first-attempt and tries, ignoring unfinished attempts", () => {
    expect(
      attemptSummary([
        { attemptNumber: 2, scorePct: 88, passed: true },
        { attemptNumber: 1, scorePct: 62, passed: false },
        { attemptNumber: 3, scorePct: null, passed: null },
      ]),
    ).toEqual({ best: 88, first: 62, tries: 2, passed: true });
    expect(attemptSummary([])).toEqual({ best: null, first: null, tries: 0, passed: false });
  });

  it("adds up the minutes left", () => {
    expect(minutesLeft([{ readMinutes: 3, completed: true }, { readMinutes: 4, completed: false }, { readMinutes: 2, completed: false }])).toBe(6);
  });
});
