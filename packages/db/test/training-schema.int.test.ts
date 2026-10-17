/**
 * File: packages/db/test/training-schema.int.test.ts
 * Purpose: Integration tests for the phase G training schema on a real Postgres container: the broker_training_metrics
 * view (chapters passed, best and first-attempt averages, drafts ignored), the video and pass-mark constraints, one
 * attempt number per broker and chapter, and metrics_reader being able to read the new view.
 *
 * Functions:
 * - chapter(code, status, position): inserts a Volume One chapter and returns its id.
 * - attempt(brokerId, chapterId, attemptNumber, scorePct, passed): inserts a submitted quiz attempt.
 * - urlForUser(url, username, password): returns the connection URL with different credentials.
 */
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  brokerTrainingMetrics,
  chapters,
  createBroker,
  lessons,
  lessonVideos,
  quizAttempts,
  seedDatabase,
  upsertMetricsLogin,
} from "../src";
import { startTestDatabase } from "../src/testing";

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
let brokerId: string;
let otherBrokerId: string;

async function chapter(code: string, status: "draft" | "live" | "coming_soon", position: number) {
  const [row] = await testDb.db
    .insert(chapters)
    .values({ code, title: `Chapter ${code}`, position, status, volume: status === "coming_soon" ? 2 : 1 })
    .returning({ id: chapters.id });
  return row!.id;
}

async function attempt(broker: string, chapterId: string, attemptNumber: number, scorePct: number, passed: boolean) {
  await testDb.db.insert(quizAttempts).values({
    brokerId: broker,
    chapterId,
    attemptNumber,
    status: "submitted",
    questionIds: [],
    totalCount: 10,
    correctCount: scorePct / 10,
    scorePct,
    passed,
    submittedAt: new Date(`2026-10-1${attemptNumber}T12:00:00Z`),
  });
}

function urlForUser(url: string, username: string, password: string): string {
  const parsed = new URL(url);
  parsed.username = username;
  parsed.password = password;
  return parsed.toString();
}

beforeAll(async () => {
  testDb = await startTestDatabase();
  await seedDatabase(testDb.db, {});
  const created = await testDb.db.transaction(async (tx) => ({
    a: await createBroker(tx, { name: "Trainee A", email: "a@example.com", level: "junior", status: "active", joinedAt: "2026-09-01", onboardedAt: "2026-09-10" }),
    b: await createBroker(tx, { name: "Trainee B", email: "b@example.com", level: "junior", status: "active", joinedAt: "2026-09-01", onboardedAt: "2026-09-10" }),
  }));
  brokerId = created.a.brokerId;
  otherBrokerId = created.b.brokerId;
});

afterAll(async () => {
  await testDb?.stop();
});

describe("broker_training_metrics view", () => {
  it("counts passed live Volume One chapters and averages best and first-attempt scores", async () => {
    const part0 = await chapter("0", "live", 0);
    const module01 = await chapter("01", "live", 1);
    const draft = await chapter("02", "draft", 2);
    await chapter("II", "coming_soon", 10);
    await attempt(brokerId, part0, 1, 60, false);
    await attempt(brokerId, part0, 2, 90, true);
    await attempt(brokerId, module01, 1, 80, true);
    await attempt(brokerId, draft, 1, 100, true);

    const [row] = await testDb.db.select().from(brokerTrainingMetrics).where(eq(brokerTrainingMetrics.brokerId, brokerId));
    expect(row).toMatchObject({ chaptersTotal: 2, chaptersPassed: 2, avgBestScore: 85, avgFirstAttemptScore: 70, quizAttempts: 3 });
    expect(row!.lastTrainingAt?.toISOString()).toBe("2026-10-12T12:00:00.000Z");

    const [other] = await testDb.db.select().from(brokerTrainingMetrics).where(eq(brokerTrainingMetrics.brokerId, otherBrokerId));
    expect(other).toMatchObject({ chaptersTotal: 2, chaptersPassed: 0, avgBestScore: null, quizAttempts: 0, lastTrainingAt: null });
  });

  it("can be read by the metrics_reader login", async () => {
    await upsertMetricsLogin(testDb.sql, { username: "metrics_training", password: "metrics-password-long-enough" });
    const reader = postgres(urlForUser(testDb.url, "metrics_training", "metrics-password-long-enough"), { max: 1, onnotice: () => {} });
    try {
      const rows = await reader`SELECT count(*)::int AS count FROM broker_training_metrics`;
      expect(rows[0]?.count).toBe(2);
      await expect(reader`SELECT * FROM quiz_attempts`).rejects.toThrow(/permission denied/);
    } finally {
      await reader.end({ timeout: 5 });
    }
  });
});

describe("constraints", () => {
  it("allows one attempt number per broker and chapter", async () => {
    const [part0] = await testDb.db.select({ id: chapters.id }).from(chapters).where(eq(chapters.code, "0"));
    await expect(attempt(brokerId, part0!.id, 1, 50, false)).rejects.toThrow();
  });

  it("requires a storage key for uploads and a URL for embeds, and a sane pass mark", async () => {
    const [part0] = await testDb.db.select({ id: chapters.id }).from(chapters).where(eq(chapters.code, "0"));
    const [lesson] = await testDb.db.insert(lessons).values({ chapterId: part0!.id, position: 1, title: "L" }).returning({ id: lessons.id });
    await expect(testDb.db.insert(lessonVideos).values({ lessonId: lesson!.id, source: "upload", provider: "upload" })).rejects.toThrow();
    await expect(testDb.db.insert(lessonVideos).values({ lessonId: lesson!.id, source: "embed", provider: "youtube" })).rejects.toThrow();
    await testDb.db.insert(lessonVideos).values({ lessonId: lesson!.id, source: "embed", provider: "youtube", embedUrl: "https://www.youtube-nocookie.com/embed/abc" });
    await expect(testDb.db.insert(chapters).values({ code: "bad", title: "Bad", position: 99, passMark: 120 })).rejects.toThrow();
  });
});
