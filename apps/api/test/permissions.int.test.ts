/**
 * File: apps/api/test/permissions.int.test.ts
 * Purpose: The mandatory permission tests (CLAUDE.md Rule 3): brokers get 403 on every /v1/admin route, anonymous
 * callers get 401, broker A can never read or change broker B's steps or files, admins cannot use broker-only routes,
 * and persona notes never appear in any broker-facing response.
 *
 * Functions:
 * - adminRoutes(brokerId, brokerStepId, chapterId): every admin route with sample ids and valid bodies, so none can be missed.
 */
import { files } from "@bp/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, OWNER, type TestContext } from "./helpers/context";

let ctx: TestContext;
let owner: string;
let brokerA: Awaited<ReturnType<TestContext["createBroker"]>>;
let brokerB: Awaited<ReturnType<TestContext["createBroker"]>>;
const SECRET_PERSONA = "Prefers veterans. SECRET-PERSONA-MARKER";

function adminRoutes(brokerId: string, brokerStepId: string, chapterId = brokerStepId): [string, string, unknown?][] {
  const id = brokerStepId;
  return [
    ["GET", "/v1/admin/overview"],
    ["GET", "/v1/admin/reviews"],
    ["GET", "/v1/admin/metrics"],
    ["GET", "/v1/admin/brokers"],
    ["POST", "/v1/admin/brokers", { name: "New Person", email: "new@example.com", level: "junior", inHouseSplit: 40, selfGeneratedSplit: 60 }],
    ["GET", `/v1/admin/brokers/${brokerId}`],
    ["PATCH", `/v1/admin/brokers/${brokerId}`, { level: "senior" }],
    ["PUT", `/v1/admin/brokers/${brokerId}/persona`, { markdown: "hacked" }],
    ["POST", `/v1/admin/brokers/${brokerId}/resend-invite`],
    ["POST", `/v1/admin/brokers/${brokerId}/reset-password`],
    ["POST", `/v1/admin/brokers/${brokerId}/remind`, {}],
    ["POST", `/v1/admin/brokers/${brokerId}/steps/w9/upload-url`, { fileName: "a.pdf", contentType: "application/pdf", sizeBytes: 10 }],
    ["POST", `/v1/admin/brokers/${brokerId}/steps/w9/upload-complete`, { files: [{ storageKey: "x", fileName: "a.pdf" }] }],
    ["GET", `/v1/admin/broker-steps/${brokerStepId}`],
    ["POST", `/v1/admin/broker-steps/${brokerStepId}/approve`],
    ["POST", `/v1/admin/broker-steps/${brokerStepId}/send-back`, { note: "no" }],
    ["POST", `/v1/admin/broker-steps/${brokerStepId}/mark-done`, {}],
    ["POST", "/v1/admin/admins", { name: "Evil Admin", email: "evil@example.com" }],
    ["GET", "/v1/admin/training/chapters"],
    ["POST", "/v1/admin/training/chapters", { code: "Z9", title: "Nope chapter" }],
    ["GET", `/v1/admin/training/chapters/${id}`],
    ["PATCH", `/v1/admin/training/chapters/${id}`, { title: "Nope chapter" }],
    ["DELETE", `/v1/admin/training/chapters/${id}`],
    ["POST", `/v1/admin/training/chapters/${id}/publish`],
    ["POST", `/v1/admin/training/chapters/${id}/unpublish`],
    ["POST", `/v1/admin/training/chapters/${id}/lessons`, { title: "Nope lesson" }],
    ["PUT", `/v1/admin/training/chapters/${id}/lesson-order`, { lessonIds: ["00000000-0000-4000-8000-000000000000"] }],
    ["POST", `/v1/admin/training/chapters/${id}/questions`, { prompt: "Nope question?", options: [{ label: "A", isCorrect: true }, { label: "B", isCorrect: false }] }],
    ["PATCH", `/v1/admin/training/lessons/${id}`, { title: "Nope lesson" }],
    ["DELETE", `/v1/admin/training/lessons/${id}`],
    ["PUT", `/v1/admin/training/lessons/${id}/video/embed`, { url: "https://youtu.be/dQw4w9WgXcQ" }],
    ["DELETE", `/v1/admin/training/lessons/${id}/video`],
    ["POST", `/v1/admin/training/lessons/${id}/video/uploads`, { fileName: "a.mp4", contentType: "video/mp4", sizeBytes: 10 }],
    ["POST", `/v1/admin/training/lessons/${id}/video/uploads/complete`, { uploadId: "x", storageKey: "x", fileName: "a.mp4", parts: [{ partNumber: 1, etag: "x" }] }],
    ["POST", `/v1/admin/training/lessons/${id}/video/uploads/abort`, { uploadId: "x", storageKey: "x" }],
    ["PATCH", `/v1/admin/training/questions/${id}`, { prompt: "Nope question?" }],
    ["DELETE", `/v1/admin/training/questions/${id}`],
    ["GET", `/v1/admin/training/brokers/${brokerId}`],
    ["POST", `/v1/admin/training/brokers/${brokerId}/chapters/${chapterId}/allow-retake`],
    ["GET", "/v1/admin/training/overview"],
    ["GET", "/v1/admin/steps"],
    ["GET", "/v1/admin/steps/w9"],
    ["PATCH", "/v1/admin/steps/w9", { todoItems: ["Hacked"] }],
    ["POST", "/v1/admin/steps/w9/videos", { title: "Nope video" }],
    ["POST", "/v1/admin/steps/w9/questions", { prompt: "Nope question?", explanation: "No.", options: [{ label: "A", isCorrect: true }, { label: "B", isCorrect: false }] }],
    ["PATCH", `/v1/admin/step-videos/${id}`, { title: "Nope video" }],
    ["DELETE", `/v1/admin/step-videos/${id}`],
    ["PUT", `/v1/admin/step-videos/${id}/embed`, { url: "https://youtu.be/dQw4w9WgXcQ" }],
    ["DELETE", `/v1/admin/step-videos/${id}/video`],
    ["POST", `/v1/admin/step-videos/${id}/uploads`, { fileName: "a.mp4", contentType: "video/mp4", sizeBytes: 10 }],
    ["POST", `/v1/admin/step-videos/${id}/uploads/complete`, { uploadId: "x", storageKey: "x", fileName: "a.mp4", parts: [{ partNumber: 1, etag: "x" }] }],
    ["POST", `/v1/admin/step-videos/${id}/uploads/abort`, { uploadId: "x", storageKey: "x" }],
    ["PATCH", `/v1/admin/step-questions/${id}`, { prompt: "Nope question?", explanation: "No.", options: [{ label: "A", isCorrect: true }, { label: "B", isCorrect: false }] }],
    ["DELETE", `/v1/admin/step-questions/${id}`],
  ];
}

beforeAll(async () => {
  ctx = await createTestContext();
  owner = await ctx.login(OWNER.email, OWNER.password);
  brokerA = await ctx.createBroker({ name: "Broker A", email: "a@example.com", personaMd: SECRET_PERSONA });
  brokerB = await ctx.createBroker({ name: "Broker B", email: "b@example.com", personaMd: SECRET_PERSONA });
  const storageKey = await ctx.upload(brokerB.cookie, "/v1/me/steps/w9/upload-url", {
    fileName: "b-w9.pdf",
    contentType: "application/pdf",
    bytes: new TextEncoder().encode("%PDF-1.4 broker B tax id"),
  });
  await ctx.call("POST", "/v1/me/steps/w9/submit", { cookie: brokerB.cookie, body: { files: [{ storageKey, fileName: "b-w9.pdf" }] } });
});
afterAll(() => ctx?.close());

describe("admin routes", () => {
  it("are listed in OpenAPI exactly as tested here", async () => {
    const spec = (await ctx.call("GET", "/docs/json")).json() as { paths: Record<string, Record<string, unknown>> };
    const documented = Object.entries(spec.paths)
      .filter(([path]) => path.startsWith("/v1/admin"))
      .flatMap(([path, methods]) => Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`))
      .sort();
    const tested = adminRoutes("{id}", "{id}", "{chapterId}")
      .map(([method, path]) => `${method} ${path.replace(/\/w9(\/|$)/, "/{key}$1")}`)
      .sort();
    expect(tested).toEqual(documented);
  });

  it("return 403 to a broker, every one of them", async () => {
    const stepId = await ctx.stepId(brokerB.brokerId, "w9");
    for (const [method, url, body] of adminRoutes(brokerB.brokerId, stepId)) {
      const response = await ctx.call(method, url, { cookie: brokerA.cookie, body });
      expect({ method, url, status: response.statusCode }).toEqual({ method, url, status: 403 });
    }
  });

  it("return 401 to anonymous callers, every one of them", async () => {
    const stepId = await ctx.stepId(brokerB.brokerId, "w9");
    for (const [method, url, body] of adminRoutes(brokerB.brokerId, stepId)) {
      const response = await ctx.call(method, url, { body });
      expect({ method, url, status: response.statusCode }).toEqual({ method, url, status: 401 });
    }
  });

  it("changed nothing while refusing", async () => {
    const profile = (await ctx.call("GET", `/v1/admin/brokers/${brokerB.brokerId}`, { cookie: owner })).json();
    expect(profile.broker.level).toBe("junior");
    expect(profile.persona.markdown).toBe(SECRET_PERSONA);
    expect(profile.steps.find((step: { key: string }) => step.key === "w9").status).toBe("submitted");
  });
});

describe("broker A and broker B", () => {
  it("A cannot download B's file", async () => {
    const [file] = await ctx.db.select().from(files);
    const response = await ctx.call("GET", `/v1/files/${file!.id}/download-url`, { cookie: brokerA.cookie });
    expect(response.statusCode).toBe(404);
    expect((await ctx.call("GET", `/v1/files/${file!.id}/download-url`, { cookie: brokerB.cookie })).statusCode).toBe(200);
  });

  it("A cannot submit B's stored file as their own", async () => {
    const [file] = await ctx.db.select().from(files);
    const response = await ctx.call("POST", "/v1/me/steps/w9/submit", {
      cookie: brokerA.cookie,
      body: { files: [{ storageKey: file!.storageKey, fileName: "stolen.pdf" }] },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("file_not_for_step");
  });

  it("A only ever sees A's own steps", async () => {
    const mine = (await ctx.call("GET", "/v1/me/steps", { cookie: brokerA.cookie })).json();
    expect(mine.steps.find((step: { key: string }) => step.key === "w9").status).toBe("todo");
    const detail = (await ctx.call("GET", "/v1/me/steps/w9", { cookie: brokerA.cookie })).json();
    expect(detail.files).toEqual([]);
  });
});

describe("persona notes", () => {
  it("never appear in any broker-facing response", async () => {
    const responses = await Promise.all(
      ["/v1/me", "/v1/me/steps", "/v1/me/steps/w9", "/v1/me/steps/bio"].map((url) => ctx.call("GET", url, { cookie: brokerA.cookie })),
    );
    for (const response of responses) {
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain("SECRET-PERSONA-MARKER");
      expect(response.body).not.toMatch(/"persona\w*"\s*:/i);
    }
  });
});

describe("broker-only routes", () => {
  it("refuse admins with 403", async () => {
    for (const [method, url] of [
      ["GET", "/v1/me/steps"],
      ["GET", "/v1/me/steps/w9"],
      ["POST", "/v1/me/welcome-seen"],
    ] as const) {
      expect((await ctx.call(method, url, { cookie: owner })).statusCode).toBe(403);
    }
  });
});
