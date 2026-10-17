/**
 * File: apps/api/src/services/training.ts
 * Purpose: Reads and changes training data for one broker (phase G): a snapshot of every live chapter with its lessons,
 * the broker's progress and attempts and the shared unlock rules applied; lesson completion and video watch progress;
 * starting, answering and submitting quiz attempts; and building the result with explanations once submitted.
 *
 * Functions:
 * - chapterLabel(chapter): "Part 0 · Start Here", "02 · Licensing & Compliance" or "II · The Market".
 * - loadTrainingSnapshot(db, brokerId): every live Volume One chapter with lessons, progress, attempts, question pool size and state.
 * - findChapter(snapshot, chapterId): one chapter from the snapshot, or throws 404 (drafts and other volumes are never found).
 * - requireUnlocked(chapter): throws 403 unless the chapter is unlocked for this broker.
 * - missedLessonIds(db, attemptId): the lessons behind the questions missed (or left blank) in a submitted attempt.
 * - chapterRetake(db, chapter): whether the chapter's quiz can be retaken now and which lessons must be re-read first.
 * - recordLessonCompletion(db, input): marks a lesson complete (keeping the first completion date) and stamps the latest one.
 * - recordWatchProgress(db, input): stores the furthest watched second and completes uploaded videos at 90%.
 * - startOrResumeAttempt(db, input): returns the in-progress attempt, or draws a new set of questions after checking the rules.
 * - loadAttempt(db, brokerId, attemptId): the broker's own attempt with its chapter, or throws 404.
 * - saveAnswer(db, input): records the chosen option for one question of an in-progress attempt.
 * - submitAttempt(db, input): scores an in-progress attempt, stores every answer's result and returns the scored attempt id.
 * - buildAttemptView(db, brokerId, attemptId): the attempt as the broker sees it: questions without answers while in progress, the full result once submitted.
 */
import {
  attemptAnswers,
  chapters,
  lessonProgress,
  lessons,
  lessonVideos,
  questionOptions,
  questions,
  quizAttempts,
  type DbOrTx,
} from "@bp/db";
import {
  chapterStates,
  completesLesson,
  drawQuestions,
  isVideoWatched,
  lessonKind,
  quizAvailability,
  retakeStatus,
  scoreAttempt,
  type ChapterState,
  type LessonKind,
  type QuizAttemptResponse,
} from "@bp/shared";
import { and, asc, eq, inArray, max, sql } from "drizzle-orm";
import { conflict, forbidden, notFound } from "../errors";

export function chapterLabel(chapter: { code: string; title: string }): string {
  return chapter.code === "0" ? `Part 0 · ${chapter.title}` : `${chapter.code} · ${chapter.title}`;
}

export type SnapshotLesson = {
  id: string;
  position: number;
  title: string;
  readMinutes: number;
  kind: LessonKind;
  durationSeconds: number | null;
  completed: boolean;
  lastCompletedAt: Date | null;
  watchedSeconds: number;
};

export type SnapshotChapter = typeof chapters.$inferSelect & {
  label: string;
  lessons: SnapshotLesson[];
  attempts: (typeof quizAttempts.$inferSelect)[];
  poolSize: number;
  state: ChapterState;
  unlocked: boolean;
  unlocksAfterCode: string | null;
  passed: boolean;
};

export async function loadTrainingSnapshot(db: DbOrTx, brokerId: string) {
  const chapterRows = await db
    .select()
    .from(chapters)
    .where(and(eq(chapters.status, "live"), eq(chapters.volume, 1)))
    .orderBy(asc(chapters.position));
  const chapterIds = chapterRows.map((chapter) => chapter.id);
  const lessonRows = chapterIds.length
    ? await db
        .select({
          id: lessons.id,
          chapterId: lessons.chapterId,
          position: lessons.position,
          title: lessons.title,
          readMinutes: lessons.readMinutes,
          source: lessonVideos.source,
          durationSeconds: lessonVideos.durationSeconds,
        })
        .from(lessons)
        .leftJoin(lessonVideos, eq(lessonVideos.lessonId, lessons.id))
        .where(inArray(lessons.chapterId, chapterIds))
        .orderBy(asc(lessons.position))
    : [];
  const progressRows = lessonRows.length
    ? await db
        .select()
        .from(lessonProgress)
        .where(and(eq(lessonProgress.brokerId, brokerId), inArray(lessonProgress.lessonId, lessonRows.map((lesson) => lesson.id))))
    : [];
  const attemptRows = chapterIds.length
    ? await db
        .select()
        .from(quizAttempts)
        .where(and(eq(quizAttempts.brokerId, brokerId), inArray(quizAttempts.chapterId, chapterIds)))
        .orderBy(asc(quizAttempts.attemptNumber))
    : [];
  const pools = chapterIds.length
    ? await db
        .select({ chapterId: questions.chapterId, count: sql<number>`count(*)::int` })
        .from(questions)
        .where(and(inArray(questions.chapterId, chapterIds), eq(questions.active, true)))
        .groupBy(questions.chapterId)
    : [];

  const assembled = chapterRows.map((chapter) => {
    const chapterLessons: SnapshotLesson[] = lessonRows
      .filter((lesson) => lesson.chapterId === chapter.id)
      .map((lesson) => {
        const progress = progressRows.find((row) => row.lessonId === lesson.id);
        return {
          id: lesson.id,
          position: lesson.position,
          title: lesson.title,
          readMinutes: lesson.readMinutes,
          kind: lessonKind(lesson.source ? { source: lesson.source } : null),
          durationSeconds: lesson.durationSeconds,
          completed: Boolean(progress?.completedAt),
          lastCompletedAt: progress?.lastCompletedAt ?? null,
          watchedSeconds: progress?.watchedSeconds ?? 0,
        };
      });
    const attempts = attemptRows.filter((attempt) => attempt.chapterId === chapter.id);
    return {
      chapter,
      lessons: chapterLessons,
      attempts,
      poolSize: pools.find((pool) => pool.chapterId === chapter.id)?.count ?? 0,
      passed: attempts.some((attempt) => attempt.passed === true),
    };
  });
  const states = chapterStates(
    assembled.map((item) => ({
      id: item.chapter.id,
      code: item.chapter.code,
      position: item.chapter.position,
      passed: item.passed,
      lessonsTotal: item.lessons.length,
      lessonsCompleted: item.lessons.filter((lesson) => lesson.completed).length,
      attempts: item.attempts.length,
    })),
  );
  return assembled.map((item, index): SnapshotChapter => {
    const state = states.find((candidate) => candidate.id === item.chapter.id) ?? states[index]!;
    return {
      ...item.chapter,
      label: chapterLabel(item.chapter),
      lessons: item.lessons,
      attempts: item.attempts,
      poolSize: item.poolSize,
      passed: item.passed,
      state: state.state,
      unlocked: state.unlocked,
      unlocksAfterCode: state.unlocksAfterCode,
    };
  });
}

export function findChapter(snapshot: SnapshotChapter[], chapterId: string): SnapshotChapter {
  const chapter = snapshot.find((candidate) => candidate.id === chapterId);
  if (!chapter) throw notFound("Chapter not found.");
  return chapter;
}

export function requireUnlocked(chapter: SnapshotChapter): void {
  if (!chapter.unlocked) throw forbidden(`This chapter opens after you pass ${chapter.unlocksAfterCode ?? "the chapter before it"}.`);
}

export async function missedLessonIds(db: DbOrTx, attemptId: string): Promise<string[]> {
  const rows = await db
    .select({ lessonId: questions.lessonId })
    .from(attemptAnswers)
    .innerJoin(questions, eq(questions.id, attemptAnswers.questionId))
    .where(and(eq(attemptAnswers.attemptId, attemptId), sql`${attemptAnswers.isCorrect} IS NOT TRUE`));
  return [...new Set(rows.map((row) => row.lessonId).filter((id): id is string => Boolean(id)))];
}

export async function chapterRetake(db: DbOrTx, chapter: SnapshotChapter) {
  const last = [...chapter.attempts].reverse().find((attempt) => attempt.status === "submitted") ?? null;
  const status = retakeStatus({
    retakePolicy: chapter.retakePolicy,
    lastAttempt: last
      ? {
          passed: last.passed === true,
          submittedAt: last.submittedAt!,
          waivedAt: last.retakeWaivedAt,
          missedLessonIds: last.passed ? [] : await missedLessonIds(db, last.id),
        }
      : null,
    lessonLastCompletedAt: new Map(chapter.lessons.map((lesson) => [lesson.id, lesson.lastCompletedAt])),
  });
  const lessonsToReread = chapter.lessons
    .filter((lesson) => status.lessonsToReread.includes(lesson.id))
    .map((lesson) => ({ id: lesson.id, position: lesson.position, title: lesson.title }));
  return { canRetake: status.canRetake, lessonsToReread, lastAttemptId: last?.id ?? null };
}

export async function recordLessonCompletion(db: DbOrTx, input: { brokerId: string; lessonId: string; now: Date }) {
  await db
    .insert(lessonProgress)
    .values({ brokerId: input.brokerId, lessonId: input.lessonId, completedAt: input.now, lastCompletedAt: input.now })
    .onConflictDoUpdate({
      target: [lessonProgress.brokerId, lessonProgress.lessonId],
      set: { completedAt: sql`COALESCE(${lessonProgress.completedAt}, ${input.now.toISOString()}::timestamptz)`, lastCompletedAt: input.now },
    });
}

export async function recordWatchProgress(
  db: DbOrTx,
  input: { brokerId: string; lesson: SnapshotLesson; watchedSeconds: number; durationSeconds?: number; now: Date },
) {
  const duration = input.lesson.durationSeconds ?? input.durationSeconds ?? null;
  const capped = duration ? Math.min(input.watchedSeconds, duration) : input.watchedSeconds;
  const watched = Math.max(capped, input.lesson.watchedSeconds);
  await db
    .insert(lessonProgress)
    .values({ brokerId: input.brokerId, lessonId: input.lesson.id, watchedSeconds: watched })
    .onConflictDoUpdate({
      target: [lessonProgress.brokerId, lessonProgress.lessonId],
      set: { watchedSeconds: sql`GREATEST(${lessonProgress.watchedSeconds}, ${watched})` },
    });
  const completes = completesLesson({
    kind: input.lesson.kind,
    action: "heartbeat",
    watchedSeconds: watched,
    durationSeconds: duration,
    alreadyCompleted: input.lesson.completed,
  });
  if (completes && !input.lesson.completed) {
    await recordLessonCompletion(db, { brokerId: input.brokerId, lessonId: input.lesson.id, now: input.now });
  }
  return { completed: input.lesson.completed || completes, watchedSeconds: watched, reachedEnd: isVideoWatched(watched, duration) };
}

export async function startOrResumeAttempt(db: DbOrTx, input: { brokerId: string; chapter: SnapshotChapter; random?: () => number }) {
  const { chapter } = input;
  const inProgress = chapter.attempts.find((attempt) => attempt.status === "in_progress");
  const retake = await chapterRetake(db, chapter);
  const availability = quizAvailability({
    chapterUnlocked: chapter.unlocked,
    lessonsTotal: chapter.lessons.length,
    lessonsCompleted: chapter.lessons.filter((lesson) => lesson.completed).length,
    hasAttemptInProgress: Boolean(inProgress),
    canRetake: retake.canRetake,
  });
  if (availability === "resume") return inProgress!.id;
  if (availability === "chapter_locked") throw forbidden("This chapter isn't open yet.");
  if (availability === "lessons_unfinished") throw conflict("Finish every lesson in this chapter before the quiz.", "lessons_unfinished");
  if (availability === "reread_required") {
    throw conflict(`Re-read ${retake.lessonsToReread.map((lesson) => lesson.title).join(", ")} before you retake the quiz.`, "reread_required");
  }
  const pool = await db
    .select({ id: questions.id })
    .from(questions)
    .where(and(eq(questions.chapterId, chapter.id), eq(questions.active, true)));
  if (pool.length === 0) throw conflict("This chapter has no quiz questions yet.", "no_questions");
  const drawn = drawQuestions(pool.map((row) => row.id), chapter.questionsPerAttempt, input.random);
  const [numbers] = await db
    .select({ highest: max(quizAttempts.attemptNumber) })
    .from(quizAttempts)
    .where(and(eq(quizAttempts.brokerId, input.brokerId), eq(quizAttempts.chapterId, chapter.id)));
  const [created] = await db
    .insert(quizAttempts)
    .values({
      brokerId: input.brokerId,
      chapterId: chapter.id,
      attemptNumber: (numbers?.highest ?? 0) + 1,
      questionIds: drawn,
      totalCount: drawn.length,
    })
    .returning({ id: quizAttempts.id });
  return created!.id;
}

export async function loadAttempt(db: DbOrTx, brokerId: string, attemptId: string) {
  const [row] = await db
    .select({ attempt: quizAttempts, chapter: chapters })
    .from(quizAttempts)
    .innerJoin(chapters, eq(chapters.id, quizAttempts.chapterId))
    .where(and(eq(quizAttempts.id, attemptId), eq(quizAttempts.brokerId, brokerId)));
  if (!row) throw notFound("Quiz attempt not found.");
  return row;
}

export async function saveAnswer(db: DbOrTx, input: { brokerId: string; attemptId: string; questionId: string; optionId: string }) {
  const { attempt } = await loadAttempt(db, input.brokerId, input.attemptId);
  if (attempt.status !== "in_progress") throw conflict("This quiz has already been submitted.", "attempt_submitted");
  if (!attempt.questionIds.includes(input.questionId)) throw notFound("That question isn't part of this quiz.");
  const [option] = await db
    .select({ id: questionOptions.id })
    .from(questionOptions)
    .where(and(eq(questionOptions.id, input.optionId), eq(questionOptions.questionId, input.questionId)));
  if (!option) throw notFound("That answer isn't one of the options.");
  await db
    .insert(attemptAnswers)
    .values({ attemptId: attempt.id, questionId: input.questionId, optionId: input.optionId })
    .onConflictDoUpdate({
      target: [attemptAnswers.attemptId, attemptAnswers.questionId],
      set: { optionId: input.optionId, answeredAt: new Date() },
    });
}

export async function submitAttempt(db: DbOrTx, input: { brokerId: string; attemptId: string; now: Date }) {
  const { attempt, chapter } = await loadAttempt(db, input.brokerId, input.attemptId);
  if (attempt.status !== "in_progress") throw conflict("This quiz has already been submitted.", "attempt_submitted");
  const answered = await db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, attempt.id));
  const correct = attempt.questionIds.length
    ? await db
        .select({ questionId: questionOptions.questionId, optionId: questionOptions.id })
        .from(questionOptions)
        .where(and(inArray(questionOptions.questionId, attempt.questionIds), eq(questionOptions.isCorrect, true)))
    : [];
  const scored = scoreAttempt(
    attempt.questionIds.map((questionId) => ({
      questionId,
      optionId: answered.find((answer) => answer.questionId === questionId)?.optionId ?? null,
    })),
    new Map(correct.map((row) => [row.questionId, row.optionId])),
    chapter.passMark,
  );
  for (const result of scored.results) {
    await db
      .insert(attemptAnswers)
      .values({ attemptId: attempt.id, questionId: result.questionId, optionId: null, isCorrect: result.isCorrect })
      .onConflictDoUpdate({ target: [attemptAnswers.attemptId, attemptAnswers.questionId], set: { isCorrect: result.isCorrect } });
  }
  const updated = await db
    .update(quizAttempts)
    .set({
      status: "submitted",
      submittedAt: input.now,
      correctCount: scored.correctCount,
      scorePct: scored.scorePct,
      passed: scored.passed,
    })
    .where(and(eq(quizAttempts.id, attempt.id), eq(quizAttempts.status, "in_progress")))
    .returning({ id: quizAttempts.id });
  if (updated.length === 0) throw conflict("This quiz has already been submitted.", "attempt_submitted");
  return { attemptId: attempt.id, ...scored };
}

export async function buildAttemptView(db: DbOrTx, brokerId: string, attemptId: string): Promise<QuizAttemptResponse> {
  const { attempt, chapter } = await loadAttempt(db, brokerId, attemptId);
  const questionRows = attempt.questionIds.length
    ? await db
        .select({ question: questions, lessonPosition: lessons.position, lessonTitle: lessons.title })
        .from(questions)
        .leftJoin(lessons, eq(lessons.id, questions.lessonId))
        .where(inArray(questions.id, attempt.questionIds))
    : [];
  const optionRows = attempt.questionIds.length
    ? await db.select().from(questionOptions).where(inArray(questionOptions.questionId, attempt.questionIds)).orderBy(asc(questionOptions.position))
    : [];
  const answers = await db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, attempt.id));
  const ordered = attempt.questionIds
    .map((id) => questionRows.find((row) => row.question.id === id))
    .filter((row): row is (typeof questionRows)[number] => Boolean(row));
  const lessonLink = (row: (typeof questionRows)[number]) =>
    row.question.lessonId && row.lessonTitle
      ? { id: row.question.lessonId, position: row.lessonPosition!, title: row.lessonTitle }
      : null;

  const view: QuizAttemptResponse = {
    id: attempt.id,
    status: attempt.status,
    attemptNumber: attempt.attemptNumber,
    chapter: { id: chapter.id, label: chapterLabel(chapter), title: chapter.title, passMark: chapter.passMark, retakePolicy: chapter.retakePolicy },
    questions: ordered.map((row) => ({
      id: row.question.id,
      prompt: row.question.prompt,
      options: optionRows.filter((option) => option.questionId === row.question.id).map((option) => ({ id: option.id, label: option.label })),
      answeredOptionId: answers.find((answer) => answer.questionId === row.question.id)?.optionId ?? null,
      lesson: lessonLink(row),
    })),
    result: null,
  };
  if (attempt.status !== "submitted") return view;

  const snapshot = await loadTrainingSnapshot(db, brokerId);
  const index = snapshot.findIndex((candidate) => candidate.id === chapter.id);
  const next = attempt.passed && index !== -1 ? snapshot[index + 1] : undefined;
  const current = index !== -1 ? snapshot[index]! : null;
  const retake = current ? await chapterRetake(db, current) : { canRetake: true, lessonsToReread: [], lastAttemptId: null };
  view.result = {
    scorePct: attempt.scorePct ?? 0,
    correctCount: attempt.correctCount ?? 0,
    totalCount: attempt.totalCount,
    passed: attempt.passed === true,
    nextChapter: next && next.unlocked ? { id: next.id, label: next.label, title: next.title } : null,
    missed: ordered
      .filter((row) => answers.find((answer) => answer.questionId === row.question.id)?.isCorrect !== true)
      .map((row) => {
        const options = optionRows.filter((option) => option.questionId === row.question.id);
        const chosen = answers.find((answer) => answer.questionId === row.question.id)?.optionId;
        return {
          questionId: row.question.id,
          prompt: row.question.prompt,
          yourAnswer: options.find((option) => option.id === chosen)?.label ?? null,
          correctAnswer: options.find((option) => option.isCorrect)?.label ?? "",
          explanation: row.question.explanation,
          lesson: lessonLink(row),
        };
      }),
    lessonsToReread: attempt.passed ? [] : retake.lessonsToReread,
    canRetake: retake.canRetake,
  };
  return view;
}
