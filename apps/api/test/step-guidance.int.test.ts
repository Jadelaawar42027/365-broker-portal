/**
 * File: apps/api/test/step-guidance.int.test.ts
 * Purpose: Integration tests for the short step and lesson layout (SPEC D28) on a real Postgres container: brokers get
 * a step's guidance, video slots and knowledge-check questions without the answers; checking an answer returns right
 * or wrong with the explanation; a step with a check can't be sent until every answer is right; uploaded step videos
 * play through short-lived links; and admins edit guidance, video slots and questions (validated, capped at 3,
 * audited). Lessons return and save their What to do bullets and callouts.
 *
 * Functions:
 * - depositQuestion(): the step 8 knowledge-check question with its option ids, read from the database.
 */
import { auditLog, onboardingSteps, stepQuestionOptions, stepQuestions, stepVideos } from "@bp/db";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, OWNER, type TestContext } from "./helpers/context";
import { buildChapter } from "./helpers/training";

let ctx: TestContext;
let owner: string;
let broker: Awaited<ReturnType<TestContext["createBroker"]>>;

async function depositQuestion() {
  const [step] = await ctx.db.select({ id: onboardingSteps.id }).from(onboardingSteps).where(eq(onboardingSteps.key, "license_bond"));
  const [question] = await ctx.db.select().from(stepQuestions).where(eq(stepQuestions.stepId, step!.id));
  const options = await ctx.db.select().from(stepQuestionOptions).where(eq(stepQuestionOptions.questionId, question!.id));
  return { stepId: step!.id, id: question!.id, right: options.find((option) => option.isCorrect)!.id, wrong: options.find((option) => !option.isCorrect)!.id };
}

beforeAll(async () => {
  ctx = await createTestContext();
  owner = await ctx.login(OWNER.email, OWNER.password);
  broker = await ctx.createBroker({ name: "Lena Park", email: "lena@example.com" });
});
afterAll(() => ctx?.close());

describe("a broker's step page", () => {
  it("returns the short guidance with its callouts and the manual's full text", async () => {
    const body = (await ctx.call("GET", "/v1/me/steps/license_bond", { cookie: broker.cookie })).json();
    expect(body.guidance.todoItems.length).toBeGreaterThanOrEqual(3);
    expect(body.guidance.callouts.map((callout: { kind: string }) => callout.kind)).toEqual(["NEVER", "WATCH"]);
    expect(body.guidance.fullTextMd).toContain("brokerage escrow account by wire");
  });

  it("sends the knowledge-check questions without the correct answer or explanation", async () => {
    const response = await ctx.call("GET", "/v1/me/steps/license_bond", { cookie: broker.cookie });
    const body = response.json();
    expect(body.checkQuestions).toHaveLength(1);
    expect(body.checkQuestions[0].prompt).toBe("Where must a client's deposit go?");
    expect(body.checkQuestions[0].options).toHaveLength(4);
    expect(response.body).not.toContain("isCorrect");
    expect(response.body).not.toContain("Taking a deposit into a personal account");
  });

  it("lists step 10's three empty video slots in order", async () => {
    const body = (await ctx.call("GET", "/v1/me/steps/platform_logins", { cookie: broker.cookie })).json();
    expect(body.videos.map((video: { title: string; source: string | null; playUrl: string | null }) => [video.title, video.source, video.playUrl])).toEqual([
      ["GoHighLevel CRM walkthrough", null, null],
      ["BoatWizard walkthrough", null, null],
      ["YachtCloser walkthrough", null, null],
    ]);
    expect(body.checkQuestions).toEqual([]);
  });

  it("plays an uploaded step video through a short-lived link", async () => {
    const [slot] = await ctx.db.select().from(stepVideos).where(eq(stepVideos.title, "BoatWizard walkthrough"));
    await ctx.db.update(stepVideos).set({ source: "upload", provider: "upload", storageKey: `onboarding/steps/${slot!.stepId}/videos/abc-bw.mp4`, fileName: "bw.mp4" }).where(eq(stepVideos.id, slot!.id));
    const body = (await ctx.call("GET", "/v1/me/steps/platform_logins", { cookie: broker.cookie })).json();
    expect(body.videos[1].playUrl).toMatch(/^https?:\/\//);
    const fresh = await ctx.call("GET", `/v1/me/steps/platform_logins/videos/${slot!.id}/url`, { cookie: broker.cookie });
    expect(fresh.statusCode).toBe(200);
    expect(fresh.json().url).toMatch(/X-Amz-Expires=300/);
    const empty = (await ctx.db.select().from(stepVideos).where(eq(stepVideos.title, "YachtCloser walkthrough")))[0]!;
    expect((await ctx.call("GET", `/v1/me/steps/platform_logins/videos/${empty.id}/url`, { cookie: broker.cookie })).statusCode).toBe(404);
    expect((await ctx.call("GET", `/v1/me/steps/w9/videos/${slot!.id}/url`, { cookie: broker.cookie })).statusCode).toBe(404);
  });
});

describe("the knowledge check", () => {
  it("says whether an answer is right, with the explanation, and allows another try", async () => {
    const question = await depositQuestion();
    const wrong = await ctx.call("POST", "/v1/me/steps/license_bond/check", { cookie: broker.cookie, body: { questionId: question.id, optionId: question.wrong } });
    expect(wrong.json()).toEqual({ correct: false, explanation: expect.stringContaining("Never hold client funds personally") });
    const right = await ctx.call("POST", "/v1/me/steps/license_bond/check", { cookie: broker.cookie, body: { questionId: question.id, optionId: question.right } });
    expect(right.json().correct).toBe(true);
  });

  it("refuses a question that belongs to another step", async () => {
    const question = await depositQuestion();
    const response = await ctx.call("POST", "/v1/me/steps/w9/check", { cookie: broker.cookie, body: { questionId: question.id, optionId: question.right } });
    expect(response.statusCode).toBe(404);
  });

  it("blocks sending the step until every answer is right", async () => {
    const question = await depositQuestion();
    const storageKey = await ctx.upload(broker.cookie, "/v1/me/steps/license_bond/upload-url", { fileName: "bond.pdf", contentType: "application/pdf", bytes: new TextEncoder().encode("%PDF-1.4 bond") });
    const files = [{ storageKey, fileName: "bond.pdf" }];
    const none = await ctx.call("POST", "/v1/me/steps/license_bond/submit", { cookie: broker.cookie, body: { files } });
    expect(none.statusCode).toBe(409);
    expect(none.json().error).toBe("check_not_passed");
    const wrong = await ctx.call("POST", "/v1/me/steps/license_bond/submit", { cookie: broker.cookie, body: { files, checkAnswers: { [question.id]: question.wrong } } });
    expect(wrong.json().error).toBe("check_not_passed");
    const right = await ctx.call("POST", "/v1/me/steps/license_bond/submit", { cookie: broker.cookie, body: { files, checkAnswers: { [question.id]: question.right } } });
    expect(right.statusCode).toBe(200);
    expect(right.json().status).toBe("submitted");
  });

  it("lets steps without a check be sent as before", async () => {
    const response = await ctx.call("POST", "/v1/me/steps/email_signature/submit", { cookie: broker.cookie, body: { formData: { confirmed: true } } });
    expect(response.json().status).toBe("approved");
  });
});

describe("the admin step editor", () => {
  it("lists the 10 steps with their guidance, video slots and checks", async () => {
    const body = (await ctx.call("GET", "/v1/admin/steps", { cookie: owner })).json();
    expect(body.steps).toHaveLength(10);
    expect(body.steps.find((step: { key: string }) => step.key === "platform_logins")).toMatchObject({ videoCount: 1, emptyVideoSlots: 2, checkQuestionCount: 0 });
    expect(body.steps.find((step: { key: string }) => step.key === "license_bond")).toMatchObject({ checkQuestionCount: 1 });
    const detail = (await ctx.call("GET", "/v1/admin/steps/license_bond", { cookie: owner })).json();
    expect(detail.questions[0].options.filter((option: { isCorrect: boolean }) => option.isCorrect)).toHaveLength(1);
  });

  it("saves guidance, refuses too many bullets or an unknown callout, and writes audit_log", async () => {
    const tooMany = await ctx.call("PATCH", "/v1/admin/steps/w9", { cookie: owner, body: { todoItems: ["a1", "b2", "c3", "d4", "e5", "f6"] } });
    expect(tooMany.statusCode).toBe(400);
    const edgeCallout = await ctx.call("PATCH", "/v1/admin/steps/w9", { cookie: owner, body: { callouts: [{ kind: "EDGE", text: "Not allowed here" }] } });
    expect(edgeCallout.statusCode).toBe(400);
    const saved = await ctx.call("PATCH", "/v1/admin/steps/w9", {
      cookie: owner,
      body: { todoItems: ["Download the W-9.", "Fill it in.", "Upload it."], callouts: [{ kind: "WATCH", text: "Sign it before you upload." }] },
    });
    expect(saved.statusCode).toBe(200);
    const step = (await ctx.call("GET", "/v1/me/steps/w9", { cookie: broker.cookie })).json();
    expect(step.guidance.todoItems).toEqual(["Download the W-9.", "Fill it in.", "Upload it."]);
    expect(step.guidance.callouts).toEqual([{ kind: "WATCH", text: "Sign it before you upload." }]);
    const [w9] = await ctx.db.select({ id: onboardingSteps.id }).from(onboardingSteps).where(eq(onboardingSteps.key, "w9"));
    const audits = await ctx.db.select().from(auditLog).where(and(eq(auditLog.entityId, w9!.id), eq(auditLog.action, "step.guidance_updated")));
    expect(audits).toHaveLength(1);
  });

  it("adds a video slot, sets an embed link, clears it and removes the slot", async () => {
    const created = await ctx.call("POST", "/v1/admin/steps/w9/videos", { cookie: owner, body: { title: "Filling in your W-9" } });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;
    expect((await ctx.call("PUT", `/v1/admin/step-videos/${id}/embed`, { cookie: owner, body: { url: "https://example.com/video.mp4" } })).json().error).toBe("invalid_video_url");
    expect((await ctx.call("PUT", `/v1/admin/step-videos/${id}/embed`, { cookie: owner, body: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } })).statusCode).toBe(200);
    let step = (await ctx.call("GET", "/v1/me/steps/w9", { cookie: broker.cookie })).json();
    expect(step.videos).toEqual([expect.objectContaining({ title: "Filling in your W-9", source: "embed", provider: "youtube", embedUrl: expect.stringContaining("youtube-nocookie.com/embed/dQw4w9WgXcQ") })]);
    expect((await ctx.call("DELETE", `/v1/admin/step-videos/${id}/video`, { cookie: owner })).statusCode).toBe(200);
    step = (await ctx.call("GET", "/v1/me/steps/w9", { cookie: broker.cookie })).json();
    expect(step.videos[0]).toMatchObject({ source: null, embedUrl: null });
    expect((await ctx.call("PATCH", `/v1/admin/step-videos/${id}`, { cookie: owner, body: { title: "W-9 walkthrough" } })).statusCode).toBe(200);
    expect((await ctx.call("DELETE", `/v1/admin/step-videos/${id}`, { cookie: owner })).statusCode).toBe(200);
    step = (await ctx.call("GET", "/v1/me/steps/w9", { cookie: broker.cookie })).json();
    expect(step.videos).toEqual([]);
  });

  it("starts an MP4 upload for a slot with a step-scoped key and refuses uploads for another step", async () => {
    const [slot] = await ctx.db.select().from(stepVideos).where(eq(stepVideos.title, "YachtCloser walkthrough"));
    const start = await ctx.call("POST", `/v1/admin/step-videos/${slot!.id}/uploads`, { cookie: owner, body: { fileName: "yc.mp4", contentType: "video/mp4", sizeBytes: 40 * 1024 * 1024 } });
    expect(start.statusCode).toBe(200);
    const body = start.json();
    expect(body.parts).toHaveLength(3);
    expect(body.storageKey).toMatch(new RegExp(`^onboarding/steps/${slot!.stepId}/videos/[0-9a-f]{12}-yc\\.mp4$`));
    const [other] = await ctx.db.select().from(stepVideos).where(eq(stepVideos.title, "How to file your DBPR application"));
    const wrongStep = await ctx.call("POST", `/v1/admin/step-videos/${other!.id}/uploads/complete`, {
      cookie: owner,
      body: { uploadId: body.uploadId, storageKey: body.storageKey, fileName: "yc.mp4", parts: [{ partNumber: 1, etag: "x" }] },
    });
    expect(wrongStep.json().error).toBe("upload_not_for_step");
    expect((await ctx.call("POST", `/v1/admin/step-videos/${slot!.id}/uploads/abort`, { cookie: owner, body: { uploadId: body.uploadId, storageKey: body.storageKey } })).statusCode).toBe(200);
  });

  it("adds, edits and deletes knowledge-check questions, at most 3 per step", async () => {
    const question = (number: number) => ({
      prompt: `W-9 check question ${number}?`,
      explanation: "Because the manual says so.",
      options: [{ label: "Right", isCorrect: true }, { label: "Wrong", isCorrect: false }],
    });
    const ids: string[] = [];
    for (const number of [1, 2, 3]) {
      const created = await ctx.call("POST", "/v1/admin/steps/w9/questions", { cookie: owner, body: question(number) });
      expect(created.statusCode).toBe(201);
      ids.push(created.json().id);
    }
    const fourth = await ctx.call("POST", "/v1/admin/steps/w9/questions", { cookie: owner, body: question(4) });
    expect(fourth.json().error).toBe("too_many_questions");
    const twoCorrect = await ctx.call("PATCH", `/v1/admin/step-questions/${ids[0]}`, {
      cookie: owner,
      body: { ...question(1), options: [{ label: "A", isCorrect: true }, { label: "B", isCorrect: true }] },
    });
    expect(twoCorrect.statusCode).toBe(400);
    expect((await ctx.call("PATCH", `/v1/admin/step-questions/${ids[0]}`, { cookie: owner, body: { ...question(1), prompt: "Edited W-9 question?" } })).statusCode).toBe(200);
    const step = (await ctx.call("GET", "/v1/me/steps/w9", { cookie: broker.cookie })).json();
    expect(step.checkQuestions.map((item: { prompt: string }) => item.prompt)).toEqual(["Edited W-9 question?", "W-9 check question 2?", "W-9 check question 3?"]);
    for (const id of ids) expect((await ctx.call("DELETE", `/v1/admin/step-questions/${id}`, { cookie: owner })).statusCode).toBe(200);
    expect((await ctx.call("GET", "/v1/me/steps/w9", { cookie: broker.cookie })).json().checkQuestions).toEqual([]);
  });

  it("never lets a broker reach the step editor", async () => {
    expect((await ctx.call("GET", "/v1/admin/steps/w9", { cookie: broker.cookie })).statusCode).toBe(403);
    expect((await ctx.call("PATCH", "/v1/admin/steps/w9", { cookie: broker.cookie, body: { todoItems: ["Hacked"] } })).statusCode).toBe(403);
  });
});

describe("lesson bullets and callouts", () => {
  it("saves What to do bullets and callouts on a lesson and returns them to brokers", async () => {
    const chapter = await buildChapter(ctx, owner, { code: "I", position: 0, lessons: 1, questions: 1, questionsPerAttempt: 1 });
    await ctx.call("POST", `/v1/admin/training/chapters/${chapter.chapterId}/publish`, { cookie: owner });
    const saved = await ctx.call("PATCH", `/v1/admin/training/lessons/${chapter.lessonIds[0]}`, {
      cookie: owner,
      body: { todoItems: ["Open a second account.", "Move the tax share the same day.", "Ask a CPA."], callouts: [{ kind: "WATCH", text: "Gross is not net." }] },
    });
    expect(saved.statusCode).toBe(200);
    const active = await ctx.createBroker({ name: "Kevin Osei", email: "kevin@example.com", status: "active" });
    const lesson = (await ctx.call("GET", `/v1/me/training/lessons/${chapter.lessonIds[0]}`, { cookie: active.cookie })).json();
    expect(lesson.todoItems).toEqual(["Open a second account.", "Move the tax share the same day.", "Ask a CPA."]);
    expect(lesson.callouts).toEqual([{ kind: "WATCH", text: "Gross is not net." }]);
    const admin = (await ctx.call("GET", `/v1/admin/training/chapters/${chapter.chapterId}`, { cookie: owner })).json();
    expect(admin.lessons[0].todoItems).toHaveLength(3);
  });
});
