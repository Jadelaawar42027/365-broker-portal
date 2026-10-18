/**
 * File: packages/db/test/training-seed.int.test.ts
 * Purpose: Integration tests for the training seed on real Postgres containers: production seeds Volume One as drafts
 * and Volume Two as coming soon, development seeds Volume One live, the one Volume One chapter (How you get paid &
 * measured, 80% pass mark) arrives with its short-layout lessons and questions with their options, and running the
 * seed again never adds duplicates or overwrites an admin's edits.
 *
 * Functions:
 * - chapterRows(db): every chapter's code, volume, status and title, by position.
 */
import { asc, count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chapters, lessons, questionOptions, questions, seedDatabase, type Database } from "../src";
import { TRAINING_SEED_CHAPTERS } from "../src/seed/training-content";
import { startTestDatabase } from "../src/testing";

const NOW = new Date("2026-10-17T16:00:00Z");

let production: Awaited<ReturnType<typeof startTestDatabase>>;
let development: Awaited<ReturnType<typeof startTestDatabase>>;

async function chapterRows(db: Database) {
  return db
    .select({ code: chapters.code, volume: chapters.volume, status: chapters.status, title: chapters.title, publishedAt: chapters.publishedAt })
    .from(chapters)
    .orderBy(asc(chapters.position));
}

beforeAll(async () => {
  [production, development] = await Promise.all([startTestDatabase(), startTestDatabase()]);
});

afterAll(async () => {
  await Promise.all([production?.stop(), development?.stop()]);
});

describe("training seed", () => {
  it("adds Volume One as drafts and Volume Two as coming soon when not publishing", async () => {
    const summary = await seedDatabase(production.db, { training: { publish: false }, now: NOW });
    expect(summary.trainingChaptersInserted).toBe(TRAINING_SEED_CHAPTERS.length);
    const rows = await chapterRows(production.db);
    expect(rows.map((row) => row.code)).toEqual(TRAINING_SEED_CHAPTERS.map((chapter) => chapter.code));
    for (const row of rows) {
      expect(row.status).toBe(row.volume === 1 ? "draft" : "coming_soon");
      expect(row.publishedAt).toBeNull();
    }
  });

  it("stores every lesson, question and option, with exactly one correct option per question", async () => {
    const expectedLessons = TRAINING_SEED_CHAPTERS.reduce((sum, chapter) => sum + chapter.lessons.length, 0);
    const expectedQuestions = TRAINING_SEED_CHAPTERS.reduce((sum, chapter) => sum + chapter.questions.length, 0);
    const [lessonCount] = await production.db.select({ value: count() }).from(lessons);
    const [questionCount] = await production.db.select({ value: count() }).from(questions);
    const [correctCount] = await production.db.select({ value: count() }).from(questionOptions).where(eq(questionOptions.isCorrect, true));
    expect(lessonCount!.value).toBe(expectedLessons);
    expect(questionCount!.value).toBe(expectedQuestions);
    expect(correctCount!.value).toBe(expectedQuestions);
    const guided = await production.db.select({ todoItems: lessons.todoItems, callouts: lessons.callouts, adminNote: lessons.adminNote }).from(lessons);
    for (const row of guided) expect(row.todoItems?.length).toBeGreaterThanOrEqual(3);
    expect(guided.some((row) => /verify before publishing/i.test(row.adminNote ?? ""))).toBe(true);
    const [chapter] = await production.db.select().from(chapters).where(eq(chapters.code, "I"));
    expect(chapter).toMatchObject({ title: "How you get paid & measured", passMark: 80, position: 0, volume: 1 });
    const readMinutes = await production.db.select({ value: lessons.readMinutes }).from(lessons);
    for (const row of readMinutes) expect(row.value).toBeGreaterThanOrEqual(2);
  });

  it("leaves existing chapters alone when run again", async () => {
    await production.db.update(chapters).set({ title: "Paid & measured (edited by Shelly)" }).where(eq(chapters.code, "I"));
    const summary = await seedDatabase(production.db, { training: { publish: true }, now: NOW });
    expect(summary.trainingChaptersInserted).toBe(0);
    const rows = await chapterRows(production.db);
    expect(rows).toHaveLength(TRAINING_SEED_CHAPTERS.length);
    expect(rows[0]!.title).toBe("Paid & measured (edited by Shelly)");
    expect(rows.filter((row) => row.volume === 1).every((row) => row.status === "draft")).toBe(true);
    const [lessonCount] = await production.db.select({ value: count() }).from(lessons);
    expect(lessonCount!.value).toBe(TRAINING_SEED_CHAPTERS.reduce((sum, chapter) => sum + chapter.lessons.length, 0));
  });

  it("publishes Volume One when asked, as in development", async () => {
    await seedDatabase(development.db, { training: { publish: true }, now: NOW });
    const rows = await chapterRows(development.db);
    for (const row of rows) {
      expect(row.status).toBe(row.volume === 1 ? "live" : "coming_soon");
      expect(row.publishedAt?.toISOString() ?? null).toBe(row.volume === 1 ? NOW.toISOString() : null);
    }
  });

  it("adds no chapters unless training is requested", async () => {
    const summary = await seedDatabase(development.db, {});
    expect(summary.trainingChaptersInserted).toBe(0);
  });
});
