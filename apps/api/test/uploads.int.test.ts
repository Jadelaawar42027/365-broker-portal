/**
 * File: apps/api/test/uploads.int.test.ts
 * Purpose: Integration tests for the proxy upload mode (SPEC D11), lesson video uploads being refused in that mode, and
 * for admins uploading on a broker's behalf:
 * upload tokens are tied to the user, size and type, cannot be tampered with or reused by someone else, and admin
 * uploads are stored, attributed to the admin and mark the step approved.
 *
 * Functions:
 * - target(): asks the API for a proxy upload target for the broker's DBPR step (still open) and returns it.
 */
import { files } from "@bp/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, OWNER, type TestContext } from "./helpers/context";

let ctx: TestContext;
let owner: string;
let broker: Awaited<ReturnType<TestContext["createBroker"]>>;
const bytes = new TextEncoder().encode("%PDF-1.4 proxy upload body");

beforeAll(async () => {
  ctx = await createTestContext({ uploadMode: "proxy", supportNumber: "" });
  owner = await ctx.login(OWNER.email, OWNER.password);
  broker = await ctx.createBroker({ name: "Proxy Broker", email: "proxy@example.com" });
});
afterAll(() => ctx?.close());

async function target() {
  const response = await ctx.call("POST", "/v1/me/steps/dbpr_filing/upload-url", {
    cookie: broker.cookie,
    body: { fileName: "w9.pdf", contentType: "application/pdf", sizeBytes: bytes.byteLength },
  });
  return response.json() as { storageKey: string; upload: { url: string; headers: Record<string, string> } };
}

describe("proxy upload mode", () => {
  it("returns an API upload URL instead of a storage URL", async () => {
    const { upload } = await target();
    expect(upload.url).toMatch(/^\/v1\/uploads\/[\w-]+\.[\w-]+$/);
    expect(upload.headers).toEqual({ "content-type": "application/pdf" });
  });

  it("uploads through the API and the file can be submitted", async () => {
    const storageKey = await ctx.upload(broker.cookie, "/v1/me/steps/w9/upload-url", {
      fileName: "w9.pdf",
      contentType: "application/pdf",
      bytes,
    });
    const submit = await ctx.call("POST", "/v1/me/steps/w9/submit", { cookie: broker.cookie, body: { files: [{ storageKey, fileName: "w9.pdf" }] } });
    expect(submit.json().status).toBe("submitted");
    expect(await ctx.storage.headObject(storageKey)).toEqual({ sizeBytes: bytes.byteLength, contentType: "application/pdf" });
  });

  it("rejects a body whose size or type differs from what was announced", async () => {
    const { upload } = await target();
    const wrongSize = await ctx.call("PUT", upload.url, { cookie: broker.cookie, headers: upload.headers, rawBody: Buffer.from("short") });
    expect(wrongSize.json().error).toBe("size_mismatch");
    const wrongType = await ctx.call("PUT", upload.url, {
      cookie: broker.cookie,
      headers: { "content-type": "image/png" },
      rawBody: Buffer.from(bytes),
    });
    expect(wrongType.json().error).toBe("type_mismatch");
  });

  it("rejects tampered tokens and tokens issued to someone else", async () => {
    const { upload } = await target();
    const tampered = upload.url.replace(/.$/, (last) => (last === "A" ? "B" : "A"));
    const bad = await ctx.call("PUT", tampered, { cookie: broker.cookie, headers: upload.headers, rawBody: Buffer.from(bytes) });
    expect(bad.json().error).toBe("invalid_upload_token");
    const other = await ctx.createBroker({ email: "other@example.com" });
    const stolen = await ctx.call("PUT", upload.url, { cookie: other.cookie, headers: upload.headers, rawBody: Buffer.from(bytes) });
    expect(stolen.statusCode).toBe(403);
    expect((await ctx.call("PUT", upload.url, { headers: upload.headers, rawBody: Buffer.from(bytes) })).statusCode).toBe(401);
  });

  it("rejects expired tokens", async () => {
    const { upload } = await target();
    ctx.setNow(new Date(Date.now() + 16 * 60 * 1000));
    const expired = await ctx.call("PUT", upload.url, { cookie: broker.cookie, headers: upload.headers, rawBody: Buffer.from(bytes) });
    ctx.setNow(null);
    expect(expired.json().error).toBe("upload_token_expired");
  });

  it("hides the WhatsApp contact when no number is configured", async () => {
    const me = (await ctx.call("GET", "/v1/me", { cookie: broker.cookie })).json();
    expect(me.support).toEqual({ name: "Shelly", whatsappNumber: null });
  });
});

describe("lesson video uploads in proxy mode", () => {
  it("are refused with a clear message, because large videos must go straight to the bucket", async () => {
    const chapter = await ctx.call("POST", "/v1/admin/training/chapters", { cookie: owner, body: { code: "V1", title: "Video chapter" } });
    const lesson = await ctx.call("POST", `/v1/admin/training/chapters/${chapter.json().id}/lessons`, { cookie: owner, body: { title: "Video lesson" } });
    const response = await ctx.call("POST", `/v1/admin/training/lessons/${lesson.json().id}/video/uploads`, {
      cookie: owner,
      body: { fileName: "a.mp4", contentType: "video/mp4", sizeBytes: 1000 },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: "video_upload_unavailable", message: expect.stringMatching(/YouTube, Loom or Vimeo/) });
  });
});

describe("admin upload on behalf", () => {
  it("stores the file as the admin's upload and approves the step", async () => {
    const storageKey = await ctx.upload(owner, `/v1/admin/brokers/${broker.brokerId}/steps/license_bond/upload-url`, {
      fileName: "bond.pdf",
      contentType: "application/pdf",
      bytes,
    });
    const complete = await ctx.call("POST", `/v1/admin/brokers/${broker.brokerId}/steps/license_bond/upload-complete`, {
      cookie: owner,
      body: { files: [{ storageKey, fileName: "bond.pdf" }] },
    });
    expect(complete.json()).toEqual({ status: "approved", onboardingComplete: false });
    const profile = (await ctx.call("GET", `/v1/admin/brokers/${broker.brokerId}`, { cookie: owner })).json();
    const step = profile.steps.find((row: { key: string }) => row.key === "license_bond");
    expect(step).toMatchObject({ status: "approved", reviewerName: "Aj Owner" });
    expect(step.files).toEqual([expect.objectContaining({ fileName: "bond.pdf", uploadedByName: "Aj Owner", uploadedByAdmin: true })]);
    const [row] = await ctx.db.select().from(files).where(eq(files.storageKey, storageKey));
    expect(row?.version).toBe(1);
  });

  it("refuses steps that don't take uploads and unknown brokers", async () => {
    const notUpload = await ctx.call("POST", `/v1/admin/brokers/${broker.brokerId}/steps/bio/upload-url`, {
      cookie: owner,
      body: { fileName: "a.pdf", contentType: "application/pdf", sizeBytes: 10 },
    });
    expect(notUpload.json().error).toBe("not_an_upload_step");
    const unknown = await ctx.call("POST", "/v1/admin/brokers/00000000-0000-4000-8000-000000000000/steps/w9/upload-url", {
      cookie: owner,
      body: { fileName: "a.pdf", contentType: "application/pdf", sizeBytes: 10 },
    });
    expect(unknown.statusCode).toBe(404);
  });
});
