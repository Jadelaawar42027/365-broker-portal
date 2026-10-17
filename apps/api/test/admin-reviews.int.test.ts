/**
 * File: apps/api/test/admin-reviews.int.test.ts
 * Purpose: Integration tests for reviewing submissions (3d): the queue and its order, review detail with checklist and
 * prev/next, approve, send back (note required), mark done with the commission tier (SPEC D2), concurrent reviews,
 * and the spec rule that approving the last step makes the broker active and notifies everyone.
 *
 * Functions:
 * - none
 */
import { auditLog, brokers } from "@bp/db";
import { todayInTimeZone } from "@bp/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, OWNER, type TestContext } from "./helpers/context";

let ctx: TestContext;
let owner: string;
let daniel: Awaited<ReturnType<TestContext["createBroker"]>>;
let marisol: Awaited<ReturnType<TestContext["createBroker"]>>;

const ALL_BUT_LAST = [
  "photo_id", "contract_nda", "bio", "headshot", "w9", "license_situation",
  "dbpr_filing", "license_bond", "email_signature", "platform_logins",
];

beforeAll(async () => {
  ctx = await createTestContext();
  owner = await ctx.login(OWNER.email, OWNER.password);
  daniel = await ctx.createBroker({ name: "Daniel Reyes", email: "daniel@example.com" });
  marisol = await ctx.createBroker({ name: "Marisol Vega", email: "marisol@example.com" });
  await ctx.call("POST", "/v1/me/steps/bio/submit", { cookie: daniel.cookie, body: { formData: { text: "Bio text ".repeat(50) } } });
  await ctx.call("POST", "/v1/me/steps/bio/submit", { cookie: marisol.cookie, body: { formData: { text: "Other bio ".repeat(50) } } });
});
afterAll(() => ctx?.close());

describe("review queue", () => {
  it("lists submissions oldest first", async () => {
    const response = await ctx.call("GET", "/v1/admin/reviews", { cookie: owner });
    expect(response.json().reviews.map((item: { brokerName: string }) => item.brokerName)).toEqual(["Daniel Reyes", "Marisol Vega"]);
  });

  it("shows a submission with its checklist and position in the queue", async () => {
    const id = await ctx.stepId(daniel.brokerId, "bio");
    const response = await ctx.call("GET", `/v1/admin/broker-steps/${id}`, { cookie: owner });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "submitted",
      position: 3,
      totalSteps: 11,
      stageTitle: "Paperwork",
      step: { key: "bio", shortTitle: "Professional bio" },
      broker: { name: "Daniel Reyes", firstName: "Daniel" },
      attempts: 1,
      formData: { text: expect.stringContaining("Bio text") },
      reviewChecklist: ["Professional tone", "No spelling mistakes", "Roughly 100 to 200 words"],
      queue: { index: 1, total: 2, previousId: null, nextId: await ctx.stepId(marisol.brokerId, "bio") },
    });
  });

  it("404s for an unknown submission", async () => {
    expect((await ctx.call("GET", "/v1/admin/broker-steps/00000000-0000-4000-8000-000000000000", { cookie: owner })).statusCode).toBe(404);
  });
});

describe("send back", () => {
  it("requires a note", async () => {
    const id = await ctx.stepId(marisol.brokerId, "bio");
    for (const body of [{}, { note: "   " }]) {
      const response = await ctx.call("POST", `/v1/admin/broker-steps/${id}/send-back`, { cookie: owner, body });
      expect(response.statusCode).toBe(400);
    }
  });

  it("sends the step back, emails the broker and writes the audit log", async () => {
    const id = await ctx.stepId(marisol.brokerId, "bio");
    const response = await ctx.call("POST", `/v1/admin/broker-steps/${id}/send-back`, {
      cookie: owner,
      body: { note: "Please make it first person." },
    });
    expect(response.json()).toEqual({ status: "changes_requested", onboardingComplete: false });
    const email = ctx.emailsTo("marisol@example.com").at(-1)!;
    expect(email.subject).toBe("Please fix and resend: Write your professional bio");
    expect(email.text).toContain('"Please make it first person."');
    expect(email.text).toContain("http://localhost:3000/app/steps/bio");
    const [audit] = await ctx.db.select().from(auditLog).where(and(eq(auditLog.entityId, id), eq(auditLog.action, "step.send_back")));
    expect(audit).toMatchObject({ before: { status: "submitted" }, after: expect.objectContaining({ status: "changes_requested", note: "Please make it first person." }) });
  });

  it("cannot send back a step that is not waiting for review", async () => {
    const id = await ctx.stepId(marisol.brokerId, "bio");
    const response = await ctx.call("POST", `/v1/admin/broker-steps/${id}/send-back`, { cookie: owner, body: { note: "Again" } });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("not_submitted");
  });
});

describe("approve", () => {
  it("approves a submitted step and emails the broker", async () => {
    const id = await ctx.stepId(daniel.brokerId, "bio");
    const response = await ctx.call("POST", `/v1/admin/broker-steps/${id}/approve`, { cookie: owner });
    expect(response.json()).toEqual({ status: "approved", onboardingComplete: false });
    expect(ctx.emailsTo("daniel@example.com").at(-1)?.subject).toBe("Approved: Write your professional bio");
  });

  it("returns 409 if the step was already reviewed (e.g. two admins at once)", async () => {
    const id = await ctx.stepId(daniel.brokerId, "bio");
    const response = await ctx.call("POST", `/v1/admin/broker-steps/${id}/approve`, { cookie: owner });
    expect(response.statusCode).toBe(409);
  });
});

describe("mark done and finishing onboarding", () => {
  it("requires the commission tier on step 11", async () => {
    const id = await ctx.stepId(daniel.brokerId, "commission_tier");
    const response = await ctx.call("POST", `/v1/admin/broker-steps/${id}/mark-done`, { cookie: owner, body: {} });
    expect(response.json().error).toBe("commission_tier_required");
  });

  it("approving the last step makes the broker active and notifies broker and admins", async () => {
    await ctx.setStepStatus(daniel.brokerId, ALL_BUT_LAST, "approved");
    const id = await ctx.stepId(daniel.brokerId, "commission_tier");
    const response = await ctx.call("POST", `/v1/admin/broker-steps/${id}/mark-done`, {
      cookie: owner,
      body: { commissionTier: "60/40", note: "Agreed in the 1-on-1." },
    });
    expect(response.json()).toEqual({ status: "approved", onboardingComplete: true });

    const [broker] = await ctx.db.select().from(brokers).where(eq(brokers.id, daniel.brokerId));
    expect(broker).toMatchObject({ status: "active", onboardedAt: todayInTimeZone(), commissionTier: "60/40" });

    const actions = (await ctx.db.select().from(auditLog).where(eq(auditLog.entityId, daniel.brokerId))).map((row) => row.action);
    expect(actions).toEqual(expect.arrayContaining(["broker.updated", "broker.onboarded"]));

    expect(ctx.emailsTo("daniel@example.com").at(-1)?.subject).toBe("You're officially a 365 broker");
    expect(ctx.emailsTo(OWNER.email).at(-1)?.subject).toBe("Daniel Reyes finished onboarding");

    const me = (await ctx.call("GET", "/v1/me", { cookie: daniel.cookie })).json();
    expect(me.broker).toMatchObject({ status: "active", commissionTier: "60/40", showWelcome: true });
    await ctx.call("POST", "/v1/me/welcome-seen", { cookie: daniel.cookie });
    expect((await ctx.call("GET", "/v1/me", { cookie: daniel.cookie })).json().broker.showWelcome).toBe(false);
  });

  it("approving a regular last step through the review screen also activates the broker", async () => {
    const tom = await ctx.createBroker({ name: "Tom Halvorsen", email: "tom@example.com" });
    await ctx.setStepStatus(tom.brokerId, [...ALL_BUT_LAST.filter((key) => key !== "w9"), "commission_tier"], "approved");
    await ctx.setStepStatus(tom.brokerId, ["w9"], "submitted");
    const id = await ctx.stepId(tom.brokerId, "w9");
    const response = await ctx.call("POST", `/v1/admin/broker-steps/${id}/approve`, { cookie: owner });
    expect(response.json()).toEqual({ status: "approved", onboardingComplete: true });
    const [broker] = await ctx.db.select({ status: brokers.status }).from(brokers).where(eq(brokers.id, tom.brokerId));
    expect(broker?.status).toBe("active");
  });

  it("does not re-activate or re-stamp a broker who is already active", async () => {
    const id = await ctx.stepId(daniel.brokerId, "w9");
    const response = await ctx.call("POST", `/v1/admin/broker-steps/${id}/mark-done`, { cookie: owner, body: {} });
    expect(response.json()).toEqual({ status: "approved", onboardingComplete: false });
  });
});
