/**
 * File: apps/api/test/broker-steps.int.test.ts
 * Purpose: Integration tests for a broker's own onboarding routes: the checklist and next step (SPEC D1), step detail,
 * every kind of answer (text, choice, confirm, checklist, admin-only), and the direct upload flow with versions kept on
 * resubmission. Storage is a real SeaweedFS container; uploads go to real presigned URLs.
 *
 * Functions:
 * - pdf(text): returns a small byte array labelled as a PDF for upload tests.
 */
import { auditLog, files } from "@bp/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, OWNER, type TestContext } from "./helpers/context";

let ctx: TestContext;
let broker: Awaited<ReturnType<TestContext["createBroker"]>>;
let owner: string;

function pdf(text: string): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.4\n${text}\n%%EOF\n`);
}

beforeAll(async () => {
  ctx = await createTestContext();
  owner = await ctx.login(OWNER.email, OWNER.password);
  broker = await ctx.createBroker({ name: "Daniel Reyes", email: "daniel@example.com" });
});
afterAll(() => ctx?.close());

describe("GET /v1/me/steps", () => {
  it("lists all 11 steps with step 0 (Start here) as the next step", async () => {
    const response = await ctx.call("GET", "/v1/me/steps", { cookie: broker.cookie });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.steps).toHaveLength(11);
    expect(body.progress).toEqual({ total: 11, approved: 0, sent: 0 });
    expect(body.nextStepKey).toBe("start_here");
    expect(body.steps[0]).toMatchObject({ key: "start_here", stageTitle: "Start here", label: "Do this next", tone: "info", isNext: true });
    expect(body.steps[1]).toMatchObject({ key: "photo_id", stageTitle: "Paperwork", label: "Coming up", isNext: false });
    expect(body.sentBack).toEqual([]);
  });
});

describe("GET /v1/me/steps/:key", () => {
  it("returns instructions without the admin review checklist", async () => {
    const response = await ctx.call("GET", "/v1/me/steps/w9", { cookie: broker.cookie });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({ key: "w9", position: 5, totalSteps: 11, canSubmit: true, acceptedTypes: ["application/pdf", "image/jpeg", "image/png"] });
    expect(body.config.templateLink.url).toMatch(/irs\.gov/);
    expect(body.config.reviewChecklist).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("Tax ID filled in");
  });

  it("404s for an unknown step", async () => {
    expect((await ctx.call("GET", "/v1/me/steps/nope", { cookie: broker.cookie })).statusCode).toBe(404);
  });

  it("404s for a template that does not exist", async () => {
    expect((await ctx.call("GET", "/v1/me/steps/w9/template-url", { cookie: broker.cookie })).statusCode).toBe(404);
  });
});

describe("answer steps", () => {
  it("sends a bio for approval", async () => {
    const short = await ctx.call("POST", "/v1/me/steps/bio/submit", { cookie: broker.cookie, body: { formData: { text: "Too short." } } });
    expect(short.statusCode).toBe(400);
    expect(short.json().error).toBe("invalid_answer");
    const response = await ctx.call("POST", "/v1/me/steps/bio/submit", {
      cookie: broker.cookie,
      body: { formData: { text: "I grew up on the water. ".repeat(20) } },
    });
    expect(response.json()).toEqual({ status: "submitted", onboardingComplete: false });
    const again = await ctx.call("POST", "/v1/me/steps/bio/submit", { cookie: broker.cookie, body: { formData: { text: "x".repeat(400) } } });
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe("waiting_for_review");
  });

  it("completes the license choice straight away (no approval needed)", async () => {
    expect((await ctx.call("POST", "/v1/me/steps/license_situation/submit", { cookie: broker.cookie, body: { formData: { choice: "maybe" } } })).statusCode).toBe(400);
    const response = await ctx.call("POST", "/v1/me/steps/license_situation/submit", {
      cookie: broker.cookie,
      body: { formData: { choice: "transfer" } },
    });
    expect(response.json()).toEqual({ status: "approved", onboardingComplete: false });
    const list = (await ctx.call("GET", "/v1/me/steps", { cookie: broker.cookie })).json();
    expect(list.steps.find((step: { key: string }) => step.key === "license_situation")).toMatchObject({ label: "Done" });
    const detail = (await ctx.call("GET", "/v1/me/steps/license_situation", { cookie: broker.cookie })).json();
    expect(detail).toMatchObject({ canSubmit: false, formData: { choice: "transfer" }, attempts: 1 });
  });

  it("completes the email confirmation and the platform checklist", async () => {
    expect((await ctx.call("POST", "/v1/me/steps/email_signature/submit", { cookie: broker.cookie, body: { formData: { confirmed: false } } })).statusCode).toBe(400);
    expect((await ctx.call("POST", "/v1/me/steps/email_signature/submit", { cookie: broker.cookie, body: { formData: { confirmed: true } } })).json().status).toBe("approved");
    const partial = await ctx.call("POST", "/v1/me/steps/platform_logins/submit", {
      cookie: broker.cookie,
      body: { formData: { checked: ["boatwizard"] } },
    });
    expect(partial.statusCode).toBe(400);
    const full = await ctx.call("POST", "/v1/me/steps/platform_logins/submit", {
      cookie: broker.cookie,
      body: { formData: { checked: ["boatwizard", "yachtcloser", "gohighlevel"] } },
    });
    expect(full.json().status).toBe("approved");
  });

  it("has no commission step any more: it can't be opened or submitted", async () => {
    expect((await ctx.call("GET", "/v1/me/steps/commission_tier", { cookie: broker.cookie })).statusCode).toBe(404);
    const response = await ctx.call("POST", "/v1/me/steps/commission_tier/submit", { cookie: broker.cookie, body: {} });
    expect(response.statusCode).toBe(404);
  });

  it("writes an audit row for every submission", async () => {
    const rows = await ctx.db.select().from(auditLog).where(eq(auditLog.actorUserId, broker.userId));
    expect(rows.filter((row) => row.action === "step.submit")).toHaveLength(4);
  });
});

describe("uploading a document (direct mode)", () => {
  it("rejects wrong file types and oversized files before issuing a URL", async () => {
    const wrongType = await ctx.call("POST", "/v1/me/steps/w9/upload-url", {
      cookie: broker.cookie,
      body: { fileName: "w9.docx", contentType: "application/msword", sizeBytes: 1000 },
    });
    expect(wrongType.json().error).toBe("file_type_not_allowed");
    const tooBig = await ctx.call("POST", "/v1/me/steps/w9/upload-url", {
      cookie: broker.cookie,
      body: { fileName: "w9.pdf", contentType: "application/pdf", sizeBytes: 11 * 1024 * 1024 },
    });
    expect(tooBig.json().error).toBe("file_too_large");
    const notUpload = await ctx.call("POST", "/v1/me/steps/bio/upload-url", {
      cookie: broker.cookie,
      body: { fileName: "bio.pdf", contentType: "application/pdf", sizeBytes: 100 },
    });
    expect(notUpload.statusCode).toBe(409);
  });

  it("refuses to submit an upload step with no files or a missing file", async () => {
    expect((await ctx.call("POST", "/v1/me/steps/w9/submit", { cookie: broker.cookie, body: {} })).json().error).toBe("files_required");
    const missing = await ctx.call("POST", "/v1/me/steps/w9/submit", {
      cookie: broker.cookie,
      body: { files: [{ storageKey: `brokers/${broker.brokerId}/w9/1-abc-never.pdf`, fileName: "never.pdf" }] },
    });
    expect(missing.json().error).toBe("file_missing");
  });

  it("uploads to storage with a presigned URL, then records the file on submit", async () => {
    const storageKey = await ctx.upload(broker.cookie, "/v1/me/steps/w9/upload-url", {
      fileName: "W9 Daniel Reyes.pdf",
      contentType: "application/pdf",
      bytes: pdf("first"),
    });
    expect(storageKey).toMatch(new RegExp(`^brokers/${broker.brokerId}/w9/1-[0-9a-f]{12}-W9_Daniel_Reyes\\.pdf$`));
    const submit = await ctx.call("POST", "/v1/me/steps/w9/submit", {
      cookie: broker.cookie,
      body: { files: [{ storageKey, fileName: "W9 Daniel Reyes.pdf" }] },
    });
    expect(submit.json()).toEqual({ status: "submitted", onboardingComplete: false });
    const detail = (await ctx.call("GET", "/v1/me/steps/w9", { cookie: broker.cookie })).json();
    expect(detail.files).toEqual([
      expect.objectContaining({ fileName: "W9 Daniel Reyes.pdf", mimeType: "application/pdf", version: 1, uploadedByAdmin: false }),
    ]);
  });

  it("refuses a file stored under a different step", async () => {
    const [file] = await ctx.db.select().from(files);
    const response = await ctx.call("POST", "/v1/me/steps/headshot/submit", {
      cookie: broker.cookie,
      body: { files: [{ storageKey: file!.storageKey, fileName: "again.pdf" }] },
    });
    expect(response.json().error).toBe("file_not_for_step");
  });

  it("refuses to record the same stored file twice", async () => {
    const [file] = await ctx.db.select().from(files);
    const response = await ctx.call("POST", "/v1/me/steps/w9/submit", {
      cookie: broker.cookie,
      body: { files: [{ storageKey: file!.storageKey, fileName: "again.pdf" }] },
    });
    expect(response.json().error).toBe("file_already_submitted");
  });

  it("refuses the same file listed twice in one submission", async () => {
    const key = `brokers/${broker.brokerId}/headshot/1-aaaa-x.png`;
    const response = await ctx.call("POST", "/v1/me/steps/headshot/submit", {
      cookie: broker.cookie,
      body: { files: [{ storageKey: key, fileName: "x.png" }, { storageKey: key, fileName: "x.png" }] },
    });
    expect(response.json().error).toBe("duplicate_file");
  });

  it("keeps the old version when a sent-back step is resubmitted", async () => {
    const w9 = await ctx.stepId(broker.brokerId, "w9");
    const sendBack = await ctx.call("POST", `/v1/admin/broker-steps/${w9}/send-back`, {
      cookie: owner,
      body: { note: "Please sign and date it." },
    });
    expect(sendBack.json().status).toBe("changes_requested");

    const list = (await ctx.call("GET", "/v1/me/steps", { cookie: broker.cookie })).json();
    expect(list.sentBack).toEqual([
      expect.objectContaining({ key: "w9", note: "Please sign and date it.", reviewerName: "Aj Owner" }),
    ]);
    expect(list.steps.find((step: { key: string }) => step.key === "w9")).toMatchObject({ label: "Needs a fix", tone: "danger" });

    const storageKey = await ctx.upload(broker.cookie, "/v1/me/steps/w9/upload-url", {
      fileName: "w9-signed.pdf",
      contentType: "application/pdf",
      bytes: pdf("second"),
    });
    expect(storageKey).toContain("/w9/2-");
    const resubmit = await ctx.call("POST", "/v1/me/steps/w9/submit", {
      cookie: broker.cookie,
      body: { files: [{ storageKey, fileName: "w9-signed.pdf" }] },
    });
    expect(resubmit.json().status).toBe("submitted");
    const versions = await ctx.db.select({ version: files.version }).from(files).where(eq(files.brokerStepId, w9));
    expect(versions.map((row) => row.version).sort()).toEqual([1, 2]);
    const detail = (await ctx.call("GET", "/v1/me/steps/w9", { cookie: broker.cookie })).json();
    expect(detail.files.map((file: { version: number }) => file.version)).toEqual([2]);
    expect(detail.attempts).toBe(2);
  });

  it("lets the broker download their own file through a short-lived link", async () => {
    const detail = (await ctx.call("GET", "/v1/me/steps/w9", { cookie: broker.cookie })).json();
    const link = await ctx.call("GET", `/v1/files/${detail.files[0].id}/download-url`, { cookie: broker.cookie });
    expect(link.statusCode).toBe(200);
    const { url, expiresAt } = link.json();
    expect(new Date(expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000 + 1000);
    const download = await fetch(url);
    expect(download.status).toBe(200);
    expect(await download.text()).toContain("second");
    expect(download.headers.get("content-disposition")).toContain('attachment; filename="w9-signed.pdf"');
  });

  it("marks the welcome screen as seen once", async () => {
    expect((await ctx.call("POST", "/v1/me/welcome-seen", { cookie: broker.cookie })).statusCode).toBe(200);
  });
});
