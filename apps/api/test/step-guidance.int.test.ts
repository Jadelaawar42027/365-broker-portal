/**
 * File: apps/api/test/step-guidance.int.test.ts
 * Purpose: Integration tests for the short step and lesson layout (SPEC D28) on a real Postgres container: brokers get
 * a step's guidance, video slots and knowledge-check questions without the answers; checking an answer returns right
 * or wrong with the explanation; a step with a check can't be sent until every answer is right; uploaded step videos
 * play through short-lived links; the two Start here steps each have their own video slot; step 11 (CRM training)
 * can't be finished until its video is watched (uploaded MP4s tracked to 90%; step videos are MP4s only, SPEC D34, so
 * links are refused and a slot still holding an old link counts as empty), with progress kept per broker and only for
 * the step's own videos; and admins edit a step's
 * titles (title, sub-header, short title, summary), guidance, video slots and questions (validated, capped at 3,
 * audited). Lessons return and save their What to do bullets and callouts.
 *
 * Functions:
 * - depositQuestion(): the step 9 knowledge-check question with its option ids, read from the database.
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

  it("gives step 0 the Part 1 video slot and step 1 the Part 2 slot", async () => {
    const startHere = (await ctx.call("GET", "/v1/me/steps/start_here", { cookie: broker.cookie })).json();
    expect(startHere.videos.map((video: { title: string }) => video.title)).toEqual(["Part 1: Aj walks you through the platform"]);
    const aiAgent = (await ctx.call("GET", "/v1/me/steps/ai_agent", { cookie: broker.cookie })).json();
    expect(aiAgent).toMatchObject({ position: 1, stageTitle: "Start here", kind: "confirm", needsApproval: false, title: "Introducing your personal AI agent" });
    expect(aiAgent.videos.map((video: { title: string }) => video.title)).toEqual(["Part 2: Introducing Your Personal AI Agent"]);
  });

  it("gives steps 11 to 13 one empty video slot each", async () => {
    for (const [key, title] of [
      ["crm_login", "CRM sign in and training"],
      ["boatwizard_login", "BoatWizard walkthrough"],
      ["yachtcloser_login", "YachtCloser walkthrough"],
    ] as const) {
      const body = (await ctx.call("GET", `/v1/me/steps/${key}`, { cookie: broker.cookie })).json();
      expect(body.videos.map((video: { title: string; source: string | null; playUrl: string | null }) => [video.title, video.source, video.playUrl]), key).toEqual([[title, null, null]]);
      expect(body.checkQuestions, key).toEqual([]);
    }
  });

  it("plays an uploaded step video through a short-lived link", async () => {
    const [slot] = await ctx.db.select().from(stepVideos).where(eq(stepVideos.title, "BoatWizard walkthrough"));
    await ctx.db.update(stepVideos).set({ source: "upload", provider: "upload", storageKey: `onboarding/steps/${slot!.stepId}/videos/abc-bw.mp4`, fileName: "bw.mp4" }).where(eq(stepVideos.id, slot!.id));
    const body = (await ctx.call("GET", "/v1/me/steps/boatwizard_login", { cookie: broker.cookie })).json();
    expect(body.videos[0].playUrl).toMatch(/^https?:\/\//);
    const fresh = await ctx.call("GET", `/v1/me/steps/boatwizard_login/videos/${slot!.id}/url`, { cookie: broker.cookie });
    expect(fresh.statusCode).toBe(200);
    expect(fresh.json().url).toMatch(/X-Amz-Expires=300/);
    const empty = (await ctx.db.select().from(stepVideos).where(eq(stepVideos.title, "YachtCloser walkthrough")))[0]!;
    expect((await ctx.call("GET", `/v1/me/steps/yachtcloser_login/videos/${empty.id}/url`, { cookie: broker.cookie })).statusCode).toBe(404);
    expect((await ctx.call("GET", `/v1/me/steps/w9/videos/${slot!.id}/url`, { cookie: broker.cookie })).statusCode).toBe(404);
  });
});

describe("step 11 needs its video watched", () => {
  async function crmSlotId(): Promise<string> {
    const [slot] = await ctx.db.select({ id: stepVideos.id }).from(stepVideos).where(eq(stepVideos.title, "CRM sign in and training"));
    return slot!.id;
  }

  async function finishCrm(cookie: string) {
    return ctx.call("POST", "/v1/me/steps/crm_login/submit", { cookie, body: { formData: { confirmed: true } } });
  }

  it("shows the read-along transcript and refuses to finish while the video slot is empty", async () => {
    const step = (await ctx.call("GET", "/v1/me/steps/crm_login", { cookie: broker.cookie })).json();
    expect(step).toMatchObject({ videoRequired: true, videosWatched: false, config: { requireVideo: true, fullTextLabel: "Read along with the video", fullTextSource: "Transcript" } });
    expect(step.guidance.fullTextMd).toContain("## Conversations");
    const response = await finishCrm(broker.cookie);
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("video_not_ready");
  });

  it("tracks an uploaded MP4 and unlocks the step at 90% watched", async () => {
    const slotId = await crmSlotId();
    const [slot] = await ctx.db.select().from(stepVideos).where(eq(stepVideos.id, slotId));
    await ctx.db
      .update(stepVideos)
      .set({ source: "upload", provider: "upload", storageKey: `onboarding/steps/${slot!.stepId}/videos/abc-crm.mp4`, fileName: "crm.mp4", durationSeconds: 300 })
      .where(eq(stepVideos.id, slotId));
    expect((await finishCrm(broker.cookie)).json().error).toBe("video_not_watched");
    expect((await ctx.call("POST", `/v1/me/steps/crm_login/videos/${slotId}/watched`, { cookie: broker.cookie })).statusCode).toBe(404);
    const progress = (seconds: number) =>
      ctx.call("POST", `/v1/me/steps/crm_login/videos/${slotId}/progress`, { cookie: broker.cookie, body: { watchedSeconds: seconds, durationSeconds: 9000 } });
    expect((await progress(100)).json()).toEqual({ watched: false, watchedSeconds: 100 });
    expect((await progress(50)).json()).toEqual({ watched: false, watchedSeconds: 100 });
    expect((await finishCrm(broker.cookie)).json().error).toBe("video_not_watched");
    expect((await progress(270)).json()).toEqual({ watched: true, watchedSeconds: 270 });
    const step = (await ctx.call("GET", "/v1/me/steps/crm_login", { cookie: broker.cookie })).json();
    expect(step).toMatchObject({ videosWatched: true, videos: [expect.objectContaining({ watched: true, watchedSeconds: 270 })] });
    expect((await finishCrm(broker.cookie)).json().status).toBe("approved");
  });

  it("keeps progress per broker", async () => {
    const other = await ctx.createBroker({ name: "Second Broker", email: "second-crm@example.com" });
    const step = (await ctx.call("GET", "/v1/me/steps/crm_login", { cookie: other.cookie })).json();
    expect(step).toMatchObject({ videosWatched: false, videos: [expect.objectContaining({ watched: false, watchedSeconds: 0 })] });
    expect((await finishCrm(other.cookie)).json().error).toBe("video_not_watched");
  });

  it("treats a slot still holding an old YouTube, Loom or Vimeo link as empty", async () => {
    const slotId = await crmSlotId();
    const [uploaded] = await ctx.db.select().from(stepVideos).where(eq(stepVideos.id, slotId));
    await ctx.db
      .update(stepVideos)
      .set({ source: "embed", provider: "loom", embedUrl: "https://www.loom.com/embed/0123456789abcdef0123456789abcdef", storageKey: null, fileName: null })
      .where(eq(stepVideos.id, slotId));
    const legacyBroker = await ctx.createBroker({ name: "Legacy Broker", email: "legacy-crm@example.com" });
    const step = (await ctx.call("GET", "/v1/me/steps/crm_login", { cookie: legacyBroker.cookie })).json();
    expect(step.videos).toEqual([{ id: slotId, title: "CRM sign in and training", source: null, playUrl: null, watched: false, watchedSeconds: 0 }]);
    const progress = await ctx.call("POST", `/v1/me/steps/crm_login/videos/${slotId}/progress`, { cookie: legacyBroker.cookie, body: { watchedSeconds: 10 } });
    expect(progress.statusCode).toBe(409);
    expect(progress.json().error).toBe("video_not_uploaded");
    expect((await finishCrm(legacyBroker.cookie)).json().error).toBe("video_not_ready");
    await ctx.db.update(stepVideos).set({ source: uploaded!.source, provider: uploaded!.provider, embedUrl: null, storageKey: uploaded!.storageKey, fileName: uploaded!.fileName }).where(eq(stepVideos.id, slotId));
  });

  it("only records progress on the step's own videos", async () => {
    const slotId = await crmSlotId();
    const response = await ctx.call("POST", `/v1/me/steps/w9/videos/${slotId}/progress`, { cookie: broker.cookie, body: { watchedSeconds: 10 } });
    expect(response.statusCode).toBe(404);
  });

  it("doesn't need a video on steps without requireVideo", async () => {
    const step = (await ctx.call("GET", "/v1/me/steps/boatwizard_login", { cookie: broker.cookie })).json();
    expect(step.videoRequired).toBe(false);
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
  it("lists the 14 steps with their guidance, video slots and checks", async () => {
    const body = (await ctx.call("GET", "/v1/admin/steps", { cookie: owner })).json();
    expect(body.steps).toHaveLength(14);
    expect(body.steps[0]).toMatchObject({ key: "start_here", emptyVideoSlots: 1, checkQuestionCount: 0 });
    expect(body.steps[1]).toMatchObject({ key: "ai_agent", position: 1, emptyVideoSlots: 1, checkQuestionCount: 0 });
    expect(body.steps.find((step: { key: string }) => step.key === "boatwizard_login")).toMatchObject({ videoCount: 1, emptyVideoSlots: 0, checkQuestionCount: 0 });
    expect(body.steps.find((step: { key: string }) => step.key === "yachtcloser_login")).toMatchObject({ videoCount: 0, emptyVideoSlots: 1, checkQuestionCount: 0 });
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

  it("edits a step's title, sub-header, short title and summary, and writes step.copy_updated", async () => {
    const before = (await ctx.call("GET", "/v1/admin/steps/headshot", { cookie: owner })).json();
    expect(before.step).toMatchObject({ title: "Upload a professional headshot", shortTitle: "Professional headshot", summary: expect.stringContaining("A recent photo") });
    const blank = await ctx.call("PATCH", "/v1/admin/steps/headshot", { cookie: owner, body: { title: " " } });
    expect(blank.statusCode).toBe(400);
    const saved = await ctx.call("PATCH", "/v1/admin/steps/headshot", {
      cookie: owner,
      body: { title: "  Send us your headshot  ", intro: "A sharp photo for your profile.", shortTitle: "Headshot", summary: "One photo, shoulders up." },
    });
    expect(saved.statusCode).toBe(200);
    const step = (await ctx.call("GET", "/v1/me/steps/headshot", { cookie: broker.cookie })).json();
    expect(step).toMatchObject({ title: "Send us your headshot", intro: "A sharp photo for your profile.", shortTitle: "Headshot", summary: "One photo, shoulders up." });
    const [headshot] = await ctx.db.select({ id: onboardingSteps.id }).from(onboardingSteps).where(eq(onboardingSteps.key, "headshot"));
    const audits = await ctx.db.select().from(auditLog).where(eq(auditLog.entityId, headshot!.id));
    expect(audits).toMatchObject([
      {
        action: "step.copy_updated",
        before: { title: "Upload a professional headshot", shortTitle: "Professional headshot" },
        after: { title: "Send us your headshot", intro: "A sharp photo for your profile.", shortTitle: "Headshot", summary: "One photo, shoulders up." },
      },
    ]);
  });

  it("refuses a title edit from a broker", async () => {
    const response = await ctx.call("PATCH", "/v1/admin/steps/headshot", { cookie: broker.cookie, body: { title: "Hacked" } });
    expect(response.statusCode).toBe(403);
  });

  it("adds a video slot, refuses a YouTube link, clears an uploaded video and removes the slot", async () => {
    const created = await ctx.call("POST", "/v1/admin/steps/w9/videos", { cookie: owner, body: { title: "Filling in your W-9" } });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;
    expect((await ctx.call("PUT", `/v1/admin/step-videos/${id}/embed`, { cookie: owner, body: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } })).statusCode).toBe(404);
    const [slot] = await ctx.db.select().from(stepVideos).where(eq(stepVideos.id, id));
    await ctx.db.update(stepVideos).set({ source: "upload", provider: "upload", storageKey: `onboarding/steps/${slot!.stepId}/videos/abc-w9.mp4`, fileName: "w9.mp4", sizeBytes: 2048 }).where(eq(stepVideos.id, id));
    let step = (await ctx.call("GET", "/v1/me/steps/w9", { cookie: broker.cookie })).json();
    expect(step.videos).toEqual([expect.objectContaining({ title: "Filling in your W-9", source: "upload", playUrl: expect.stringMatching(/^https?:\/\//) })]);
    expect(step.videos[0]).not.toHaveProperty("embedUrl");
    const admin = (await ctx.call("GET", "/v1/admin/steps/w9", { cookie: owner })).json();
    expect(admin.videos).toEqual([{ id, position: 1, title: "Filling in your W-9", source: "upload", fileName: "w9.mp4", sizeBytes: 2048 }]);
    expect((await ctx.call("DELETE", `/v1/admin/step-videos/${id}/video`, { cookie: owner })).statusCode).toBe(200);
    step = (await ctx.call("GET", "/v1/me/steps/w9", { cookie: broker.cookie })).json();
    expect(step.videos[0]).toMatchObject({ source: null, playUrl: null });
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
