/**
 * File: apps/api/test/training-admin.int.test.ts
 * Purpose: Integration tests for the admin training editor (phase G): chapter, lesson and question editing with
 * validation and ordering, embed links limited to YouTube / Loom / Vimeo, MP4-only video uploads up to 1 GB, publish
 * rules, per-question correct rates, each broker's progress (3c), the "needs a hand" overview (3a), the training
 * columns on the brokers table (3b) and audit rows.
 *
 * Functions:
 * - none
 */
import { auditLog } from "@bp/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, OWNER, type TestContext } from "./helpers/context";
import { buildChapter, correctOptions, wrongOption } from "./helpers/training";

let ctx: TestContext;
let owner: string;

beforeAll(async () => {
  ctx = await createTestContext();
  owner = await ctx.login(OWNER.email, OWNER.password);
});
afterAll(() => ctx?.close());

describe("chapters", () => {
  it("creates drafts, refuses duplicate codes and edits settings", async () => {
    const created = await ctx.call("POST", "/v1/admin/training/chapters", { cookie: owner, body: { code: "03", title: "Commission Structure", passMark: 85 } });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    expect((await ctx.call("POST", "/v1/admin/training/chapters", { cookie: owner, body: { code: "03", title: "Again" } })).json().error).toBe("code_taken");
    expect((await ctx.call("PATCH", `/v1/admin/training/chapters/${id}`, { cookie: owner, body: { questionsPerAttempt: 6, retakePolicy: "immediate" } })).statusCode).toBe(200);
    expect((await ctx.call("PATCH", `/v1/admin/training/chapters/${id}`, { cookie: owner, body: { passMark: 120 } })).statusCode).toBe(400);
    const detail = (await ctx.call("GET", `/v1/admin/training/chapters/${id}`, { cookie: owner })).json();
    expect(detail.chapter).toMatchObject({ status: "draft", passMark: 85, questionsPerAttempt: 6, retakePolicy: "immediate", label: "03 · Commission Structure" });
  });

  it("won't publish without lessons and questions, then publishes and unpublishes with audit rows", async () => {
    const { chapterId } = await buildChapter(ctx, owner, { code: "04", lessons: 0, questions: 0, publish: false });
    expect((await ctx.call("POST", `/v1/admin/training/chapters/${chapterId}/publish`, { cookie: owner })).json().error).toBe("no_lessons");
    await ctx.call("POST", `/v1/admin/training/chapters/${chapterId}/lessons`, { cookie: owner, body: { title: "Only lesson" } });
    expect((await ctx.call("POST", `/v1/admin/training/chapters/${chapterId}/publish`, { cookie: owner })).json().error).toBe("no_questions");
    const full = await buildChapter(ctx, owner, { code: "05", publish: false });
    expect((await ctx.call("POST", `/v1/admin/training/chapters/${full.chapterId}/publish`, { cookie: owner })).statusCode).toBe(200);
    expect((await ctx.call("DELETE", `/v1/admin/training/chapters/${full.chapterId}`, { cookie: owner })).json().error).toBe("chapter_live");
    expect((await ctx.call("POST", `/v1/admin/training/chapters/${full.chapterId}/unpublish`, { cookie: owner })).statusCode).toBe(200);
    const actions = (await ctx.db.select().from(auditLog).where(eq(auditLog.entityId, full.chapterId))).map((row) => row.action);
    expect(actions).toEqual(expect.arrayContaining(["training.chapter_created", "training.chapter_published", "training.chapter_unpublished"]));
    expect((await ctx.call("DELETE", `/v1/admin/training/chapters/${full.chapterId}`, { cookie: owner })).statusCode).toBe(200);
  });

  it("lists chapters with counts and flags notes that need checking", async () => {
    const { chapterId, lessonIds } = await buildChapter(ctx, owner, { code: "06", lessons: 2, questions: 3, publish: false });
    await ctx.call("PATCH", `/v1/admin/training/lessons/${lessonIds[0]}`, { cookie: owner, body: { adminNote: "Verify before publishing: DBPR fees" } });
    const row = (await ctx.call("GET", "/v1/admin/training/chapters", { cookie: owner })).json().chapters.find((chapter: { id: string }) => chapter.id === chapterId);
    expect(row).toMatchObject({ lessonsCount: 2, questionsCount: 3, flagged: true, status: "draft", averageScore: null });
  });
});

describe("lessons and videos", () => {
  let chapterId: string;
  let lessonIds: string[];

  beforeAll(async () => {
    ({ chapterId, lessonIds } = await buildChapter(ctx, owner, { code: "L1", lessons: 3, questions: 1, publish: false }));
  });

  it("reorders lessons and refuses an incomplete order", async () => {
    const reversed = [...lessonIds].reverse();
    expect((await ctx.call("PUT", `/v1/admin/training/chapters/${chapterId}/lesson-order`, { cookie: owner, body: { lessonIds: reversed } })).statusCode).toBe(200);
    const detail = (await ctx.call("GET", `/v1/admin/training/chapters/${chapterId}`, { cookie: owner })).json();
    expect(detail.lessons.map((lesson: { id: string }) => lesson.id)).toEqual(reversed);
    expect(detail.lessons[0].readMinutes).toBe(1);
    expect((await ctx.call("PUT", `/v1/admin/training/chapters/${chapterId}/lesson-order`, { cookie: owner, body: { lessonIds: reversed.slice(1) } })).json().error).toBe("invalid_order");
  });

  it("accepts YouTube, Loom and Vimeo links only", async () => {
    const lessonId = lessonIds[0]!;
    expect((await ctx.call("PUT", `/v1/admin/training/lessons/${lessonId}/video/embed`, { cookie: owner, body: { url: "https://evil.example/video.mp4" } })).json().error).toBe("invalid_video_url");
    expect((await ctx.call("PUT", `/v1/admin/training/lessons/${lessonId}/video/embed`, { cookie: owner, body: { url: "https://vimeo.com/123456789" } })).statusCode).toBe(200);
    const detail = (await ctx.call("GET", `/v1/admin/training/chapters/${chapterId}`, { cookie: owner })).json();
    expect(detail.lessons.find((lesson: { id: string }) => lesson.id === lessonId).video).toMatchObject({ source: "embed", provider: "vimeo", embedUrl: "https://player.vimeo.com/video/123456789" });
    expect((await ctx.call("DELETE", `/v1/admin/training/lessons/${lessonId}/video`, { cookie: owner })).statusCode).toBe(200);
  });

  it("only takes MP4 videos up to 1 GB, and splits big files into 16 MB parts", async () => {
    const lessonId = lessonIds[1]!;
    const notMp4 = await ctx.call("POST", `/v1/admin/training/lessons/${lessonId}/video/uploads`, { cookie: owner, body: { fileName: "a.mov", contentType: "video/quicktime", sizeBytes: 1000 } });
    expect(notMp4.statusCode).toBe(400);
    const tooBig = await ctx.call("POST", `/v1/admin/training/lessons/${lessonId}/video/uploads`, { cookie: owner, body: { fileName: "a.mp4", contentType: "video/mp4", sizeBytes: 1024 * 1024 * 1024 + 1 } });
    expect(tooBig.statusCode).toBe(400);
    const big = (await ctx.call("POST", `/v1/admin/training/lessons/${lessonId}/video/uploads`, { cookie: owner, body: { fileName: "big.mp4", contentType: "video/mp4", sizeBytes: 600 * 1024 * 1024 } })).json();
    expect(big.parts).toHaveLength(38);
    expect(big.partSize).toBe(16 * 1024 * 1024);
    expect(big.storageKey).toMatch(new RegExp(`^training/lessons/${lessonId}/[0-9a-f]{12}-big\\.mp4$`));
    expect((await ctx.call("POST", `/v1/admin/training/lessons/${lessonId}/video/uploads/abort`, { cookie: owner, body: { uploadId: big.uploadId, storageKey: big.storageKey } })).statusCode).toBe(200);
    const wrongLesson = await ctx.call("POST", `/v1/admin/training/lessons/${lessonIds[2]}/video/uploads/complete`, {
      cookie: owner,
      body: { uploadId: big.uploadId, storageKey: big.storageKey, fileName: "big.mp4", parts: [{ partNumber: 1, etag: "x" }] },
    });
    expect(wrongLesson.json().error).toBe("upload_not_for_lesson");
  });

  it("deletes lessons only while the chapter is unpublished", async () => {
    const live = await buildChapter(ctx, owner, { code: "L2" });
    expect((await ctx.call("DELETE", `/v1/admin/training/lessons/${live.lessonIds[0]}`, { cookie: owner })).json().error).toBe("chapter_live");
    expect((await ctx.call("DELETE", `/v1/admin/training/lessons/${lessonIds[2]}`, { cookie: owner })).statusCode).toBe(200);
  });
});

describe("questions and statistics", () => {
  let chapter: Awaited<ReturnType<typeof buildChapter>>;
  let broker: Awaited<ReturnType<TestContext["createBroker"]>>;

  beforeAll(async () => {
    chapter = await buildChapter(ctx, owner, { code: "0", position: 0, lessons: 1, questions: 2, questionsPerAttempt: 2 });
    broker = await ctx.createBroker({ name: "Kevin Osei", email: "kevin@example.com", status: "active" });
  });

  it("validates questions: exactly one correct option, and a lesson from the same chapter", async () => {
    const twoCorrect = await ctx.call("POST", `/v1/admin/training/chapters/${chapter.chapterId}/questions`, {
      cookie: owner,
      body: { prompt: "Which two?", options: [{ label: "A", isCorrect: true }, { label: "B", isCorrect: true }] },
    });
    expect(twoCorrect.statusCode).toBe(400);
    const other = await buildChapter(ctx, owner, { code: "Q9", publish: false });
    const wrongLesson = await ctx.call("POST", `/v1/admin/training/chapters/${chapter.chapterId}/questions`, {
      cookie: owner,
      body: { prompt: "Which lesson?", lessonId: other.lessonIds[0], options: [{ label: "A", isCorrect: true }, { label: "B", isCorrect: false }] },
    });
    expect(wrongLesson.json().error).toBe("lesson_not_in_chapter");
  });

  it("edits options in place and deletes unanswered questions", async () => {
    const detail = (await ctx.call("GET", `/v1/admin/training/chapters/${chapter.chapterId}`, { cookie: owner })).json();
    const question = detail.questions[0];
    const options = question.options.map((option: { id: string; label: string }, index: number) => ({ id: option.id, label: `${option.label} edited`, isCorrect: index === 1 }));
    expect((await ctx.call("PATCH", `/v1/admin/training/questions/${question.id}`, { cookie: owner, body: { options } })).statusCode).toBe(200);
    const after = (await ctx.call("GET", `/v1/admin/training/chapters/${chapter.chapterId}`, { cookie: owner })).json().questions[0];
    expect(after.options.map((option: { id: string; isCorrect: boolean }) => [option.id, option.isCorrect])).toEqual(options.map((option: { id: string; isCorrect: boolean }) => [option.id, option.isCorrect]));
    const extra = await ctx.call("POST", `/v1/admin/training/chapters/${chapter.chapterId}/questions`, {
      cookie: owner,
      body: { prompt: "Throwaway question?", options: [{ label: "A", isCorrect: true }, { label: "B", isCorrect: false }] },
    });
    expect((await ctx.call("DELETE", `/v1/admin/training/questions/${extra.json().id}`, { cookie: owner })).json()).toEqual({ outcome: "deleted" });
  });

  it("reports per-question correct rates, broker progress, the needs-a-hand list and the brokers table", async () => {
    await ctx.call("POST", `/v1/me/training/lessons/${chapter.lessonIds[0]}/complete`, { cookie: broker.cookie, body: { action: "mark_read" } });
    await ctx.call("PATCH", `/v1/admin/training/chapters/${chapter.chapterId}`, { cookie: owner, body: { retakePolicy: "immediate" } });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { attemptId } = (await ctx.call("POST", `/v1/me/training/chapters/${chapter.chapterId}/attempts`, { cookie: broker.cookie })).json();
      const view = (await ctx.call("GET", `/v1/me/training/attempts/${attemptId}`, { cookie: broker.cookie })).json();
      for (const question of view.questions) {
        await ctx.call("PUT", `/v1/me/training/attempts/${attemptId}/answers`, { cookie: broker.cookie, body: { questionId: question.id, optionId: await wrongOption(ctx, owner, chapter.chapterId, question.id) } });
      }
      await ctx.call("POST", `/v1/me/training/attempts/${attemptId}/submit`, { cookie: broker.cookie });
    }
    const progress = (await ctx.call("GET", `/v1/admin/training/brokers/${broker.brokerId}`, { cookie: owner })).json();
    expect(progress.open).toBe(true);
    expect(progress.chapters[0]).toMatchObject({ code: "0", tries: 2, bestScore: 0, firstScore: 0, needsHelp: true, state: "in_progress" });
    const overview = (await ctx.call("GET", "/v1/admin/training/overview", { cookie: owner })).json();
    expect(overview.averageFirstAttemptScore).toBe(0);
    expect(overview.needsHelp).toEqual([expect.objectContaining({ brokerId: broker.brokerId, kind: "failed_twice", reason: expect.stringMatching(/^Failed Part 0 · Chapter 0 2 times \(0%, 0%\)$/) })]);

    const correct = await correctOptions(ctx, owner, chapter.chapterId);
    const { attemptId } = (await ctx.call("POST", `/v1/me/training/chapters/${chapter.chapterId}/attempts`, { cookie: broker.cookie })).json();
    for (const [questionId, optionId] of correct) await ctx.call("PUT", `/v1/me/training/attempts/${attemptId}/answers`, { cookie: broker.cookie, body: { questionId, optionId } });
    expect((await ctx.call("POST", `/v1/me/training/attempts/${attemptId}/submit`, { cookie: broker.cookie })).json().result.passed).toBe(true);

    const detail = (await ctx.call("GET", `/v1/admin/training/chapters/${chapter.chapterId}`, { cookie: owner })).json();
    expect(detail.chapter.averageScore).toBe(33);
    expect(detail.questions.filter((question: { active: boolean }) => question.active).map((question: { stats: unknown }) => question.stats)).toEqual([
      { answered: 3, correctPct: 33, firstTimeCorrectPct: 0 },
      { answered: 3, correctPct: 33, firstTimeCorrectPct: 0 },
    ]);
    expect((await ctx.call("DELETE", `/v1/admin/training/questions/${detail.questions[0].id}`, { cookie: owner })).json()).toEqual({ outcome: "archived" });

    const row = (await ctx.call("GET", "/v1/admin/brokers", { cookie: owner })).json().brokers.find((item: { brokerId: string }) => item.brokerId === broker.brokerId);
    expect(row.training).toEqual({ chaptersPassed: 1, chaptersTotal: 2, avgBestScore: 100 });
    expect((await ctx.call("GET", "/v1/admin/training/overview", { cookie: owner })).json().needsHelp).toEqual([]);
  });

  it("flags active brokers with no training activity for a week", async () => {
    const idle = await ctx.createBroker({ name: "Lauren Pike", email: "lauren@example.com", status: "active" });
    ctx.setNow(new Date(Date.now() + 10 * 86_400_000));
    const overview = (await ctx.call("GET", "/v1/admin/training/overview", { cookie: owner })).json();
    ctx.setNow(null);
    expect(overview.needsHelp).toEqual(expect.arrayContaining([expect.objectContaining({ brokerId: idle.brokerId, kind: "inactive", reason: expect.stringMatching(/^No training activity in \d+ days · stopped at Part 0/) })]));
  });
});
