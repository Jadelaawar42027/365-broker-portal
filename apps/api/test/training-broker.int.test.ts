/**
 * File: apps/api/test/training-broker.int.test.ts
 * Purpose: Integration tests for a broker's training (phase G): training opens only when active, chapters unlock in
 * order, drafts and coming-soon content stay hidden, lessons complete per kind (read, embedded video, 90% of an uploaded
 * video), quizzes draw N questions, hide answers until submitted, score against the pass mark, require re-reading
 * before a retake (unless an admin waives it), and unlock the next chapter. Brokers only reach their own attempts.
 *
 * Functions:
 * - completeAll(cookie, lessonIds): marks every text lesson read.
 * - takeQuiz(cookie, chapterId, choose): starts the quiz, answers each question with choose(questionId) and submits; returns the result.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, OWNER, type TestContext } from "./helpers/context";
import { buildChapter, correctOptions, wrongOption } from "./helpers/training";

let ctx: TestContext;
let owner: string;
let broker: Awaited<ReturnType<TestContext["createBroker"]>>;
let other: Awaited<ReturnType<TestContext["createBroker"]>>;
let part0: Awaited<ReturnType<typeof buildChapter>>;
let module01: Awaited<ReturnType<typeof buildChapter>>;
let draft: Awaited<ReturnType<typeof buildChapter>>;
let comingSoonId: string;

async function completeAll(cookie: string, lessonIds: string[]) {
  for (const id of lessonIds) {
    const response = await ctx.call("POST", `/v1/me/training/lessons/${id}/complete`, { cookie, body: { action: "mark_read" } });
    expect(response.statusCode).toBe(200);
  }
}

async function takeQuiz(cookie: string, chapterId: string, choose: (questionId: string) => Promise<string>) {
  const started = await ctx.call("POST", `/v1/me/training/chapters/${chapterId}/attempts`, { cookie });
  expect(started.statusCode).toBe(200);
  const attemptId = started.json().attemptId as string;
  const attempt = (await ctx.call("GET", `/v1/me/training/attempts/${attemptId}`, { cookie })).json();
  for (const question of attempt.questions) {
    const saved = await ctx.call("PUT", `/v1/me/training/attempts/${attemptId}/answers`, {
      cookie,
      body: { questionId: question.id, optionId: await choose(question.id) },
    });
    expect(saved.statusCode).toBe(200);
  }
  const submitted = await ctx.call("POST", `/v1/me/training/attempts/${attemptId}/submit`, { cookie });
  expect(submitted.statusCode).toBe(200);
  return { attemptId, ...submitted.json() };
}

beforeAll(async () => {
  ctx = await createTestContext();
  owner = await ctx.login(OWNER.email, OWNER.password);
  broker = await ctx.createBroker({ name: "Daniel Reyes", email: "daniel@example.com", status: "active" });
  other = await ctx.createBroker({ name: "Other Broker", email: "other@example.com", status: "active" });
  part0 = await buildChapter(ctx, owner, { code: "0", title: "Start Here", position: 0, lessons: 2, questions: 6, questionsPerAttempt: 4 });
  module01 = await buildChapter(ctx, owner, { code: "01", title: "Week One Setup", position: 1, lessons: 1, questions: 2 });
  draft = await buildChapter(ctx, owner, { code: "02", title: "Licensing Draft", position: 2, publish: false });
  const soon = await ctx.call("POST", "/v1/admin/training/chapters", {
    cookie: owner,
    body: { volume: 2, code: "II", title: "The Market", scheduleLabel: "Week two", comingSoon: true },
  });
  comingSoonId = soon.json().id;
});
afterAll(() => ctx?.close());

describe("training home", () => {
  it("is locked for brokers who are still onboarding", async () => {
    const onboarding = await ctx.createBroker({ email: "new@example.com", status: "onboarding" });
    const home = (await ctx.call("GET", "/v1/me/training", { cookie: onboarding.cookie })).json();
    expect(home.open).toBe(false);
    expect(home.volumeOne.map((chapter: { state: string }) => chapter.state)).toEqual(["locked", "locked"]);
    expect((await ctx.call("GET", `/v1/me/training/chapters/${part0.chapterId}`, { cookie: onboarding.cookie })).statusCode).toBe(403);
  });

  it("shows live chapters in order, Part 0 first, never drafts, and Volume Two as coming soon", async () => {
    const home = (await ctx.call("GET", "/v1/me/training", { cookie: broker.cookie })).json();
    expect(home.open).toBe(true);
    expect(home.volumeOne.map((chapter: { label: string; state: string; unlocksAfterCode: string | null }) => [chapter.label, chapter.state, chapter.unlocksAfterCode])).toEqual([
      ["Part 0 · Start Here", "available", null],
      ["01 · Week One Setup", "locked", "0"],
    ]);
    expect(home.volumeTwo).toEqual([{ id: comingSoonId, label: "II · The Market", title: "The Market", scheduleLabel: "Week two" }]);
    expect(home.continue).toMatchObject({ chapterId: part0.chapterId, lessonsTotal: 2, lessonsCompleted: 0, nextLessonId: part0.lessonIds[0] });
    expect(JSON.stringify(home)).not.toContain("Licensing Draft");
  });

  it("returns 404 for drafts and coming-soon chapters, and 403 for locked chapters and their lessons", async () => {
    expect((await ctx.call("GET", `/v1/me/training/chapters/${draft.chapterId}`, { cookie: broker.cookie })).statusCode).toBe(404);
    expect((await ctx.call("GET", `/v1/me/training/lessons/${draft.lessonIds[0]}`, { cookie: broker.cookie })).statusCode).toBe(404);
    expect((await ctx.call("GET", `/v1/me/training/chapters/${comingSoonId}`, { cookie: broker.cookie })).statusCode).toBe(404);
    expect((await ctx.call("GET", `/v1/me/training/chapters/${module01.chapterId}`, { cookie: broker.cookie })).statusCode).toBe(403);
    expect((await ctx.call("GET", `/v1/me/training/lessons/${module01.lessonIds[0]}`, { cookie: broker.cookie })).statusCode).toBe(403);
  });
});

describe("lessons", () => {
  it("returns the lesson text and its place in the chapter", async () => {
    const lesson = (await ctx.call("GET", `/v1/me/training/lessons/${part0.lessonIds[0]}`, { cookie: broker.cookie })).json();
    expect(lesson).toMatchObject({ position: 1, lessonsTotal: 2, kind: "text", completed: false, video: null, nextLessonId: part0.lessonIds[1], previousLessonId: null });
    expect(lesson.bodyMd).toContain("> [!WATCH]");
    expect(lesson.quizQuestionCount).toBe(4);
  });

  it("won't start the quiz until every lesson is complete", async () => {
    const response = await ctx.call("POST", `/v1/me/training/chapters/${part0.chapterId}/attempts`, { cookie: broker.cookie });
    expect(response.json().error).toBe("lessons_unfinished");
  });

  it("completes text lessons when marked read", async () => {
    await completeAll(broker.cookie, part0.lessonIds);
    const chapter = (await ctx.call("GET", `/v1/me/training/chapters/${part0.chapterId}`, { cookie: broker.cookie })).json();
    expect(chapter.lessons.every((lesson: { completed: boolean }) => lesson.completed)).toBe(true);
    expect(chapter.quiz).toMatchObject({ availability: "start", questionCount: 4, tries: 0 });
  });
});

describe("quiz", () => {
  let firstAttemptId: string;

  it("draws N questions, resumes the same attempt, and never shows answers before submitting", async () => {
    const started = (await ctx.call("POST", `/v1/me/training/chapters/${part0.chapterId}/attempts`, { cookie: broker.cookie })).json();
    firstAttemptId = started.attemptId;
    const again = (await ctx.call("POST", `/v1/me/training/chapters/${part0.chapterId}/attempts`, { cookie: broker.cookie })).json();
    expect(again.attemptId).toBe(firstAttemptId);
    const attempt = await ctx.call("GET", `/v1/me/training/attempts/${firstAttemptId}`, { cookie: broker.cookie });
    const body = attempt.json();
    expect(body).toMatchObject({ status: "in_progress", attemptNumber: 1, result: null, chapter: { passMark: 80 } });
    expect(body.questions).toHaveLength(4);
    expect(new Set(body.questions.map((question: { id: string }) => question.id)).size).toBe(4);
    expect(attempt.body).not.toMatch(/isCorrect|is_correct|Explanation \d/);
  });

  it("keeps other brokers out of the attempt", async () => {
    expect((await ctx.call("GET", `/v1/me/training/attempts/${firstAttemptId}`, { cookie: other.cookie })).statusCode).toBe(404);
    const attempt = (await ctx.call("GET", `/v1/me/training/attempts/${firstAttemptId}`, { cookie: broker.cookie })).json();
    const question = attempt.questions[0];
    const answer = await ctx.call("PUT", `/v1/me/training/attempts/${firstAttemptId}/answers`, {
      cookie: other.cookie,
      body: { questionId: question.id, optionId: question.options[0].id },
    });
    expect(answer.statusCode).toBe(404);
    expect((await ctx.call("POST", `/v1/me/training/attempts/${firstAttemptId}/submit`, { cookie: other.cookie })).statusCode).toBe(404);
  });

  it("rejects an option that belongs to another question", async () => {
    const attempt = (await ctx.call("GET", `/v1/me/training/attempts/${firstAttemptId}`, { cookie: broker.cookie })).json();
    const response = await ctx.call("PUT", `/v1/me/training/attempts/${firstAttemptId}/answers`, {
      cookie: broker.cookie,
      body: { questionId: attempt.questions[0].id, optionId: attempt.questions[1].options[0].id },
    });
    expect(response.statusCode).toBe(404);
  });

  it("fails below the pass mark, explains the misses and asks for a re-read before retaking", async () => {
    const correct = await correctOptions(ctx, owner, part0.chapterId);
    const attempt = (await ctx.call("GET", `/v1/me/training/attempts/${firstAttemptId}`, { cookie: broker.cookie })).json();
    const missed = attempt.questions[0].id as string;
    for (const question of attempt.questions) {
      const optionId = question.id === missed ? await wrongOption(ctx, owner, part0.chapterId, question.id) : correct.get(question.id)!;
      await ctx.call("PUT", `/v1/me/training/attempts/${firstAttemptId}/answers`, { cookie: broker.cookie, body: { questionId: question.id, optionId } });
    }
    const result = (await ctx.call("POST", `/v1/me/training/attempts/${firstAttemptId}/submit`, { cookie: broker.cookie })).json().result;
    expect(result).toMatchObject({ scorePct: 75, correctCount: 3, totalCount: 4, passed: false, nextChapter: null, canRetake: false });
    expect(result.missed).toHaveLength(1);
    expect(result.missed[0]).toMatchObject({ questionId: missed, correctAnswer: expect.stringMatching(/^A\d$/), yourAnswer: expect.stringMatching(/^[BC]\d$/) });
    expect(result.missed[0].explanation).toMatch(/^Explanation \d/);
    expect(result.lessonsToReread).toHaveLength(1);
    expect((await ctx.call("POST", `/v1/me/training/attempts/${firstAttemptId}/submit`, { cookie: broker.cookie })).statusCode).toBe(409);

    const retry = await ctx.call("POST", `/v1/me/training/chapters/${part0.chapterId}/attempts`, { cookie: broker.cookie });
    expect(retry.json().error).toBe("reread_required");
    const chapter = (await ctx.call("GET", `/v1/me/training/chapters/${part0.chapterId}`, { cookie: broker.cookie })).json();
    expect(chapter.quiz).toMatchObject({ availability: "reread_required", tries: 1, bestScore: 75, passed: false });

    await ctx.call("POST", `/v1/me/training/lessons/${result.lessonsToReread[0].id}/complete`, { cookie: broker.cookie, body: { action: "mark_read" } });
    const reread = (await ctx.call("GET", `/v1/me/training/chapters/${part0.chapterId}`, { cookie: broker.cookie })).json();
    expect(reread.quiz.availability).toBe("start");
  });

  it("passes, unlocks the next chapter and shows it on the home screen", async () => {
    const correct = await correctOptions(ctx, owner, part0.chapterId);
    const result = (await takeQuiz(broker.cookie, part0.chapterId, async (questionId) => correct.get(questionId)!)).result;
    expect(result).toMatchObject({ scorePct: 100, passed: true, missed: [], nextChapter: { id: module01.chapterId, label: "01 · Week One Setup" } });
    const home = (await ctx.call("GET", "/v1/me/training", { cookie: broker.cookie })).json();
    expect(home.stats).toEqual({ chaptersPassed: 1, chaptersTotal: 2, averageScore: 100 });
    expect(home.volumeOne.map((chapter: { state: string }) => chapter.state)).toEqual(["passed", "available"]);
    expect(home.continue.chapterId).toBe(module01.chapterId);
    expect((await ctx.call("GET", `/v1/me/training/chapters/${module01.chapterId}`, { cookie: broker.cookie })).statusCode).toBe(200);
  });

  it("lets an admin waive the re-read for a broker who failed", async () => {
    await completeAll(other.cookie, part0.lessonIds);
    await takeQuiz(other.cookie, part0.chapterId, (questionId) => wrongOption(ctx, owner, part0.chapterId, questionId));
    expect((await ctx.call("POST", `/v1/me/training/chapters/${part0.chapterId}/attempts`, { cookie: other.cookie })).json().error).toBe("reread_required");
    const waived = await ctx.call("POST", `/v1/admin/training/brokers/${other.brokerId}/chapters/${part0.chapterId}/allow-retake`, { cookie: owner });
    expect(waived.statusCode).toBe(200);
    expect((await ctx.call("POST", `/v1/me/training/chapters/${part0.chapterId}/attempts`, { cookie: other.cookie })).statusCode).toBe(200);
  });
});

describe("videos", () => {
  let embedLessonId: string;
  let uploadLessonId: string;

  beforeAll(async () => {
    const embed = await ctx.call("POST", `/v1/admin/training/chapters/${module01.chapterId}/lessons`, { cookie: owner, body: { title: "Watch the CRM tour" } });
    embedLessonId = embed.json().id;
    await ctx.call("PUT", `/v1/admin/training/lessons/${embedLessonId}/video/embed`, { cookie: owner, body: { url: "https://youtu.be/dQw4w9WgXcQ" } });
    const upload = await ctx.call("POST", `/v1/admin/training/chapters/${module01.chapterId}/lessons`, { cookie: owner, body: { title: "Shelly's walkthrough" } });
    uploadLessonId = upload.json().id;
    const bytes = new Uint8Array(2048).fill(7);
    const started = (await ctx.call("POST", `/v1/admin/training/lessons/${uploadLessonId}/video/uploads`, {
      cookie: owner,
      body: { fileName: "walkthrough.mp4", contentType: "video/mp4", sizeBytes: bytes.byteLength, durationSeconds: 100 },
    })).json();
    const put = await fetch(started.parts[0].url, { method: "PUT", body: bytes });
    const done = await ctx.call("POST", `/v1/admin/training/lessons/${uploadLessonId}/video/uploads/complete`, {
      cookie: owner,
      body: { uploadId: started.uploadId, storageKey: started.storageKey, fileName: "walkthrough.mp4", durationSeconds: 100, parts: [{ partNumber: 1, etag: put.headers.get("etag")! }] },
    });
    expect(done.statusCode).toBe(200);
  });

  it("completes an embedded video only with Mark as watched", async () => {
    const lesson = (await ctx.call("GET", `/v1/me/training/lessons/${embedLessonId}`, { cookie: broker.cookie })).json();
    expect(lesson.video).toMatchObject({ source: "embed", provider: "youtube", embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", playUrl: null });
    expect((await ctx.call("POST", `/v1/me/training/lessons/${embedLessonId}/complete`, { cookie: broker.cookie, body: { action: "mark_read" } })).statusCode).toBe(409);
    expect((await ctx.call("POST", `/v1/me/training/lessons/${embedLessonId}/complete`, { cookie: broker.cookie, body: { action: "mark_watched" } })).json().completed).toBe(true);
  });

  it("plays uploaded videos through a short-lived link and completes them at 90% watched", async () => {
    const lesson = (await ctx.call("GET", `/v1/me/training/lessons/${uploadLessonId}`, { cookie: broker.cookie })).json();
    expect(lesson.video).toMatchObject({ source: "upload", provider: "upload", durationSeconds: 100, embedUrl: null });
    const video = await fetch(lesson.video.playUrl);
    expect(video.status).toBe(200);
    expect((await video.arrayBuffer()).byteLength).toBe(2048);
    const fresh = (await ctx.call("GET", `/v1/me/training/lessons/${uploadLessonId}/video-url`, { cookie: broker.cookie })).json();
    expect(fresh.url).toContain("X-Amz-Expires=300");

    expect((await ctx.call("POST", `/v1/me/training/lessons/${uploadLessonId}/complete`, { cookie: broker.cookie, body: { action: "mark_watched" } })).statusCode).toBe(409);
    const halfway = (await ctx.call("POST", `/v1/me/training/lessons/${uploadLessonId}/progress`, { cookie: broker.cookie, body: { watchedSeconds: 50 } })).json();
    expect(halfway).toEqual({ completed: false, watchedSeconds: 50 });
    const backwards = (await ctx.call("POST", `/v1/me/training/lessons/${uploadLessonId}/progress`, { cookie: broker.cookie, body: { watchedSeconds: 20 } })).json();
    expect(backwards.watchedSeconds).toBe(50);
    const done = (await ctx.call("POST", `/v1/me/training/lessons/${uploadLessonId}/progress`, { cookie: broker.cookie, body: { watchedSeconds: 5000 } })).json();
    expect(done).toEqual({ completed: true, watchedSeconds: 100 });
  });

  it("rejects watch progress on text lessons", async () => {
    const response = await ctx.call("POST", `/v1/me/training/lessons/${module01.lessonIds[0]}/progress`, { cookie: broker.cookie, body: { watchedSeconds: 5 } });
    expect(response.json().error).toBe("no_video");
  });
});
