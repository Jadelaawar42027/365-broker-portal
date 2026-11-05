/**
 * File: apps/api/test/admin-brokers.int.test.ts
 * Purpose: Integration tests for admin broker management: overview numbers (3a), the brokers table with filters and
 * persona search (3b), the profile with persona and every file version (3c), edits with date validation, commission split changes (SPEC D29), persona edits,
 * reminders, the metrics feed and the audit rows each action writes.
 *
 * Functions:
 * - none
 */
import { auditLog, brokers, files } from "@bp/db";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, OWNER, type TestContext } from "./helpers/context";

let ctx: TestContext;
let owner: string;
let daniel: Awaited<ReturnType<TestContext["createBroker"]>>;
let kevin: Awaited<ReturnType<TestContext["createBroker"]>>;
let lauren: Awaited<ReturnType<TestContext["createBroker"]>>;

beforeAll(async () => {
  ctx = await createTestContext();
  owner = await ctx.login(OWNER.email, OWNER.password);
  daniel = await ctx.createBroker({ name: "Daniel Reyes", email: "daniel@example.com", joinedAt: "2026-10-13" });
  kevin = await ctx.createBroker({
    name: "Kevin Osei",
    email: "kevin@example.com",
    joinedAt: "2026-08-18",
    personaMd: "## Background\nUS Army veteran, sportfish specialist.",
  });
  lauren = await ctx.createBroker({ name: "Lauren Pike", email: "lauren@example.com", level: "senior", joinedAt: "2026-07-02" });
  await ctx.db.update(brokers).set({ status: "active", onboardedAt: "2026-08-27" }).where(eq(brokers.id, kevin.brokerId));
  await ctx.db.update(brokers).set({ status: "active", onboardedAt: "2026-07-10" }).where(eq(brokers.id, lauren.brokerId));
  await ctx.call("POST", "/v1/me/steps/bio/submit", { cookie: daniel.cookie, body: { formData: { text: "Bio ".repeat(100) } } });
});
afterAll(() => ctx?.close());

describe("GET /v1/admin/overview", () => {
  it("returns the 3a numbers", async () => {
    const response = await ctx.call("GET", "/v1/admin/overview", { cookie: owner });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.counts).toEqual({ active: 2, junior: 1, senior: 1, onboarding: 1, stuck: 0, waitingReview: 1 });
    expect(body.averageDaysToOnboard).toBe(9);
    expect(body.reviews).toEqual([expect.objectContaining({ brokerName: "Daniel Reyes", stepShortTitle: "Professional bio" })]);
    expect(body.inProgress).toEqual([
      {
        brokerId: daniel.brokerId,
        name: "Daniel Reyes",
        approved: 0,
        total: 14,
        nextStep: { key: "start_here", shortTitle: "Start here: portal walkthrough", status: "todo" },
        waitingOnUs: true,
        stuckDays: null,
      },
    ]);
  });

  it("flags a broker with no activity for 4+ days as stuck", async () => {
    const tom = await ctx.createBroker({ name: "Tom Halvorsen", email: "tom@example.com", joinedAt: "2026-10-01" });
    ctx.setNow(new Date("2026-10-17T15:00:00Z"));
    const body = (await ctx.call("GET", "/v1/admin/overview", { cookie: owner })).json();
    ctx.setNow(null);
    const row = body.inProgress.find((item: { brokerId: string }) => item.brokerId === tom.brokerId);
    expect(row.stuckDays).toBeGreaterThanOrEqual(4);
    expect(body.inProgress.at(-1).brokerId).toBe(tom.brokerId);
    expect(body.counts.stuck).toBe(1);
    await ctx.db.update(brokers).set({ status: "inactive" }).where(eq(brokers.id, tom.brokerId));
  });
});

describe("GET /v1/admin/brokers", () => {
  it("lists brokers with counts, onboarding first", async () => {
    const body = (await ctx.call("GET", "/v1/admin/brokers", { cookie: owner })).json();
    expect(body.counts).toMatchObject({ total: 4, active: 2, onboarding: 1, inactive: 1 });
    expect(body.brokers[0]).toMatchObject({ name: "Daniel Reyes", status: "onboarding", stepsTotal: 14, stepsWaitingReview: 1 });
    expect(body.brokers.find((row: { name: string }) => row.name === "Kevin Osei")).toMatchObject({ daysToOnboard: 9, onboardedAt: "2026-08-27" });
  });

  it("filters by status and level", async () => {
    const active = (await ctx.call("GET", "/v1/admin/brokers?status=active", { cookie: owner })).json();
    expect(active.brokers.map((row: { name: string }) => row.name).sort()).toEqual(["Kevin Osei", "Lauren Pike"]);
    const seniors = (await ctx.call("GET", "/v1/admin/brokers?level=senior", { cookie: owner })).json();
    expect(seniors.brokers.map((row: { name: string }) => row.name)).toEqual(["Lauren Pike"]);
    expect((await ctx.call("GET", "/v1/admin/brokers?status=retired", { cookie: owner })).statusCode).toBe(400);
  });

  it("searches name, email and persona text", async () => {
    const byPersona = (await ctx.call("GET", "/v1/admin/brokers?search=veteran", { cookie: owner })).json();
    expect(byPersona.brokers.map((row: { name: string }) => row.name)).toEqual(["Kevin Osei"]);
    const byEmail = (await ctx.call("GET", "/v1/admin/brokers?search=LAUREN@", { cookie: owner })).json();
    expect(byEmail.brokers.map((row: { name: string }) => row.name)).toEqual(["Lauren Pike"]);
    const wildcard = (await ctx.call("GET", "/v1/admin/brokers?search=%25", { cookie: owner })).json();
    expect(wildcard.brokers).toEqual([]);
  });
});

describe("persona", () => {
  it("saves the persona with who and when, and writes the audit log", async () => {
    const markdown = "## Background\nFormer firefighter, loves first-time buyers.";
    const response = await ctx.call("PUT", `/v1/admin/brokers/${lauren.brokerId}/persona`, { cookie: owner, body: { markdown } });
    expect(response.statusCode).toBe(200);
    const profile = (await ctx.call("GET", `/v1/admin/brokers/${lauren.brokerId}`, { cookie: owner })).json();
    expect(profile.persona).toMatchObject({ markdown, updatedByName: "Aj Owner", updatedAt: expect.any(String) });
    const [audit] = await ctx.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, lauren.brokerId), eq(auditLog.action, "broker.persona_updated")));
    expect(audit).toMatchObject({ before: { personaMd: null }, after: { personaMd: markdown } });
    const found = (await ctx.call("GET", "/v1/admin/brokers?search=firefighter", { cookie: owner })).json();
    expect(found.brokers.map((row: { name: string }) => row.name)).toEqual(["Lauren Pike"]);
  });

  it("stores an empty persona as cleared", async () => {
    await ctx.call("PUT", `/v1/admin/brokers/${lauren.brokerId}/persona`, { cookie: owner, body: { markdown: "   " } });
    const profile = (await ctx.call("GET", `/v1/admin/brokers/${lauren.brokerId}`, { cookie: owner })).json();
    expect(profile.persona.markdown).toBeNull();
  });
});

describe("profile and edits", () => {
  it("returns the profile with metrics, steps and every file version", async () => {
    const storageKey = await ctx.upload(daniel.cookie, "/v1/me/steps/photo_id/upload-url", {
      fileName: "id.png",
      contentType: "image/png",
      bytes: new Uint8Array([137, 80, 78, 71, 1, 2, 3]),
    });
    await ctx.call("POST", "/v1/me/steps/photo_id/submit", { cookie: daniel.cookie, body: { files: [{ storageKey, fileName: "id.png" }] } });
    const response = await ctx.call("GET", `/v1/admin/brokers/${daniel.brokerId}`, { cookie: owner });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.broker).toMatchObject({ name: "Daniel Reyes", email: "daniel@example.com", status: "onboarding", hasLogin: true, inHouseSplit: null, selfGeneratedSplit: null });
    expect(body.broker).not.toHaveProperty("commissionTier");
    expect(body.metrics).toMatchObject({ stepsApproved: 0, stepsTotal: 14 });
    expect(body.steps).toHaveLength(14);
    expect(body.steps.map((step: { key: string }) => step.key)).not.toContain("commission_tier");
    expect(body.steps[0].key).toBe("start_here");
    expect(body.steps.find((step: { key: string }) => step.key === "photo_id")).toMatchObject({ key: "photo_id", status: "submitted", label: "Waiting for approval", files: [expect.objectContaining({ fileName: "id.png", version: 1 })] });
  });

  it("writes an audit row when an admin downloads a file", async () => {
    const [file] = await ctx.db.select().from(files);
    const response = await ctx.call("GET", `/v1/files/${file!.id}/download-url?inline=true`, { cookie: owner });
    expect(response.statusCode).toBe(200);
    const audit = await ctx.db.select().from(auditLog).where(eq(auditLog.entityId, file!.id));
    expect(audit.map((row) => row.action)).toEqual(["file.previewed"]);
  });

  it("changes level and records before and after", async () => {
    const response = await ctx.call("PATCH", `/v1/admin/brokers/${daniel.brokerId}`, { cookie: owner, body: { level: "senior" } });
    expect(response.statusCode).toBe(200);
    const [audit] = await ctx.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, daniel.brokerId), eq(auditLog.action, "broker.updated")));
    expect(audit).toMatchObject({ before: { level: "junior" }, after: { level: "senior" } });
  });

  it("changes the commission split through the history and shows it on the profile and to the broker", async () => {
    const response = await ctx.call("POST", `/v1/admin/brokers/${daniel.brokerId}/commission`, { cookie: owner, body: { inHouseSplit: 50, selfGeneratedSplit: 70 } });
    expect(response.statusCode).toBe(201);
    const profile = (await ctx.call("GET", `/v1/admin/brokers/${daniel.brokerId}`, { cookie: owner })).json();
    expect(profile.broker).toMatchObject({ inHouseSplit: 50, selfGeneratedSplit: 70 });
    const me = (await ctx.call("GET", "/v1/me", { cookie: daniel.cookie })).json();
    expect(me.broker).toMatchObject({ inHouseSplit: 50, selfGeneratedSplit: 70 });
  });

  it("rejects a commission split outside 0 to 100", async () => {
    const response = await ctx.call("POST", `/v1/admin/brokers/${daniel.brokerId}/commission`, { cookie: owner, body: { inHouseSplit: 50, selfGeneratedSplit: 120 } });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("validation_error");
  });

  it("never lets a broker change their own commission splits", async () => {
    const patch = await ctx.call("PATCH", `/v1/admin/brokers/${daniel.brokerId}`, { cookie: daniel.cookie, body: { level: "senior" } });
    expect(patch.statusCode).toBe(403);
    const response = await ctx.call("POST", `/v1/admin/brokers/${daniel.brokerId}/commission`, { cookie: daniel.cookie, body: { inHouseSplit: 100, selfGeneratedSplit: 100 } });
    expect(response.statusCode).toBe(403);
  });

  it("ignores no-op edits and rejects bad dates", async () => {
    expect((await ctx.call("PATCH", `/v1/admin/brokers/${daniel.brokerId}`, { cookie: owner, body: { level: "senior" } })).statusCode).toBe(200);
    expect((await ctx.call("PATCH", `/v1/admin/brokers/${daniel.brokerId}`, { cookie: owner, body: {} })).statusCode).toBe(400);
    const before = await ctx.call("PATCH", `/v1/admin/brokers/${daniel.brokerId}`, { cookie: owner, body: { leftAt: "2026-01-01" } });
    expect(before.json().error).toBe("invalid_dates");
    const afterOnboard = await ctx.call("PATCH", `/v1/admin/brokers/${kevin.brokerId}`, { cookie: owner, body: { joinedAt: "2026-09-01" } });
    expect(afterOnboard.json().error).toBe("invalid_dates");
  });

  it("404s for an unknown broker", async () => {
    expect((await ctx.call("GET", "/v1/admin/brokers/00000000-0000-4000-8000-000000000000", { cookie: owner })).statusCode).toBe(404);
  });
});

describe("reminders and metrics", () => {
  it("emails a reminder about the next step", async () => {
    const response = await ctx.call("POST", `/v1/admin/brokers/${daniel.brokerId}/remind`, {
      cookie: owner,
      body: { message: "Shout if you need help!" },
    });
    expect(response.statusCode).toBe(200);
    const email = ctx.emailsTo("daniel@example.com").at(-1)!;
    expect(email.subject).toBe("Reminder: Start here: how the 365 portal works");
    expect(email.text).toContain("Shout if you need help!");
    expect(email.text).toContain("/app/steps/start_here");
  });

  it("only reminds brokers who are onboarding", async () => {
    const response = await ctx.call("POST", `/v1/admin/brokers/${kevin.brokerId}/remind`, { cookie: owner, body: {} });
    expect(response.json().error).toBe("not_onboarding");
  });

  it("serves the broker_metrics rows", async () => {
    const body = (await ctx.call("GET", "/v1/admin/metrics", { cookie: owner })).json();
    expect(body.brokers.map((row: { email: string }) => row.email)).toEqual(
      expect.arrayContaining(["daniel@example.com", "kevin@example.com", "lauren@example.com"]),
    );
  });
});
