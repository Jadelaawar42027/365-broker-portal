/**
 * File: packages/db/src/seed/training.ts
 * Purpose: Seeds the training chapters from the manual (training-content.ts). Additive only: a chapter whose code
 * already exists is left exactly as it is, so admin edits and broker progress are never touched. Volume One chapters
 * start as drafts (production) or live (development, so the screens can be tried); Volume Two parts are "coming soon".
 * Lessons carry their What to do bullets and callouts (SPEC D28).
 *
 * Functions:
 * - seedTraining(tx, options): inserts every missing chapter with its lessons, questions and options; returns how many chapters were added.
 * - removeRetiredTrainingDrafts(tx, now): deletes the pre-D28 Volume One chapters (Part 0 and 01 to 06) that were never published and that no broker has progress or quiz attempts on; writes audit_log and returns the labels it deleted.
 * - insertChapter(tx, chapter, position, publish, now): inserts one chapter and its content.
 * - lessonReadMinutes(bodyMd): the read time shown to brokers, at least two minutes.
 */
import { estimateReadMinutes } from "@bp/shared";
import type { Transaction } from "../client";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { auditLog, chapters, lessonProgress, lessons, questionOptions, questions, quizAttempts } from "../schema";
import { TRAINING_SEED_CHAPTERS, type TrainingSeedChapter } from "./training-content";

const MIN_READ_MINUTES = 2;

function lessonReadMinutes(bodyMd: string): number {
  return Math.max(MIN_READ_MINUTES, estimateReadMinutes(bodyMd));
}

async function insertChapter(tx: Transaction, chapter: TrainingSeedChapter, position: number, publish: boolean, now: Date): Promise<void> {
  const status = chapter.volume === 2 ? "coming_soon" : publish ? "live" : "draft";
  const [row] = await tx
    .insert(chapters)
    .values({
      volume: chapter.volume,
      code: chapter.code,
      title: chapter.title,
      summary: chapter.summary,
      position,
      scheduleLabel: chapter.scheduleLabel ?? null,
      ...(chapter.passMark ? { passMark: chapter.passMark } : {}),
      status,
      publishedAt: status === "live" ? now : null,
    })
    .returning({ id: chapters.id });
  const lessonIds: string[] = [];
  for (const [index, lesson] of chapter.lessons.entries()) {
    const [inserted] = await tx
      .insert(lessons)
      .values({
        chapterId: row!.id,
        position: index + 1,
        title: lesson.title,
        bodyMd: lesson.bodyMd,
        todoItems: lesson.todoItems ?? null,
        callouts: lesson.callouts ?? null,
        readMinutes: lesson.videoPlaceholder ? MIN_READ_MINUTES : lessonReadMinutes(lesson.bodyMd),
        adminNote: lesson.adminNote ?? null,
        videoPlaceholder: lesson.videoPlaceholder ?? false,
      })
      .returning({ id: lessons.id });
    lessonIds.push(inserted!.id);
  }
  for (const [index, question] of chapter.questions.entries()) {
    const [inserted] = await tx
      .insert(questions)
      .values({
        chapterId: row!.id,
        lessonId: lessonIds[question.lesson] ?? null,
        position: index + 1,
        prompt: question.prompt,
        explanation: question.explanation,
        adminNote: question.adminNote ?? null,
      })
      .returning({ id: questions.id });
    await tx.insert(questionOptions).values(
      question.options.map((label, optionIndex) => ({ questionId: inserted!.id, position: optionIndex, label, isCorrect: optionIndex === question.correct })),
    );
  }
}

export async function seedTraining(tx: Transaction, options: { publish: boolean; now: Date }): Promise<{ chaptersInserted: number }> {
  const existing = new Set((await tx.select({ code: chapters.code }).from(chapters)).map((row) => row.code));
  let chaptersInserted = 0;
  for (const [index, chapter] of TRAINING_SEED_CHAPTERS.entries()) {
    if (existing.has(chapter.code)) continue;
    await insertChapter(tx, chapter, chapter.volume === 2 ? 100 + index : index, options.publish, options.now);
    chaptersInserted += 1;
  }
  return { chaptersInserted };
}

const RETIRED_CHAPTER_CODES = ["0", "01", "02", "03", "04", "05", "06"];

export async function removeRetiredTrainingDrafts(tx: Transaction, now: Date): Promise<string[]> {
  const candidates = await tx
    .select({ id: chapters.id, code: chapters.code, title: chapters.title })
    .from(chapters)
    .where(and(inArray(chapters.code, RETIRED_CHAPTER_CODES), eq(chapters.volume, 1), eq(chapters.status, "draft"), isNull(chapters.publishedAt)));
  const deleted: string[] = [];
  for (const chapter of candidates) {
    const [attempt] = await tx.select({ id: quizAttempts.id }).from(quizAttempts).where(eq(quizAttempts.chapterId, chapter.id)).limit(1);
    if (attempt) continue;
    const [progress] = await tx
      .select({ id: lessonProgress.id })
      .from(lessonProgress)
      .innerJoin(lessons, eq(lessons.id, lessonProgress.lessonId))
      .where(eq(lessons.chapterId, chapter.id))
      .limit(1);
    if (progress) continue;
    await tx.delete(chapters).where(eq(chapters.id, chapter.id));
    await tx.insert(auditLog).values({
      actorUserId: null,
      action: "chapter.retired_draft_deleted",
      entityType: "chapter",
      entityId: chapter.id,
      before: { code: chapter.code, title: chapter.title, status: "draft" },
      after: { deletedAt: now.toISOString(), reason: "Volume One onboarding chapters moved into the onboarding steps (SPEC D28)" },
    });
    deleted.push(chapter.code === "0" ? `Part 0 · ${chapter.title}` : `${chapter.code} · ${chapter.title}`);
  }
  return deleted;
}
