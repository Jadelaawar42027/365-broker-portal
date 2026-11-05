/**
 * File: apps/api/test/existing-brokers.int.test.ts
 * Purpose: Integration tests for adding a broker who already works with 365 Yachts (POST /v1/admin/brokers/existing) and
 * for the permanent invite link on the profile. An already-onboarded broker is active with every onboarding step approved
 * (only training left) and audited step by step; one still onboarding starts invited with todo steps; their 365 email is
 * linked instead of creating accounts; no email is sent; duplicate emails and bad dates are refused. The profile shows the
 * same link on every visit until the broker signs up, makes one for a broker who has none, leaves an older random invite
 * alone, and drops the link once the broker has an account or is set inactive (which also ends the link).
 *
 * Functions:
 * - addExisting(body): posts an existing broker with sensible defaults; returns the response.
 * - profileOf(brokerId): the admin profile response body.
 * - tokenOf(url): the token at the end of an invite link.
 */
import { accountTokens, auditLog, brokerSteps, brokers, commissionHistory, provisioningTasks, users } from "@bp/db";
import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, OWNER, type TestContext } from "./helpers/context";
import { createFakeGhl, createFakeGoogle, fakeIntegrations } from "./helpers/provisioning-fakes";

let ctx: TestContext;
let owner: string;
const STEPS_TOTAL = 14;

beforeAll(async () => {
  ctx = await createTestContext({ integrations: fakeIntegrations(createFakeGoogle().client, createFakeGhl().client) });
  owner = await ctx.login(OWNER.email, OWNER.password);
});
afterAll(() => ctx?.close());

async function addExisting(body: Record<string, unknown>) {
  return ctx.call("POST", "/v1/admin/brokers/existing", {
    cookie: owner,
    body: { level: "junior", joinedAt: "2026-11-05", progress: "onboarded", ...body },
  });
}

async function profileOf(brokerId: string) {
  return (await ctx.call("GET", `/v1/admin/brokers/${brokerId}`, { cookie: owner })).json();
}

function tokenOf(url: string): string {
  return url.split("/").pop()!;
}

describe("adding an already-onboarded broker", () => {
  let brokerId: string;
  let inviteUrl: string;

  it("creates them active with every onboarding step approved, links their 365 email and sends no email", async () => {
    const response = await addExisting({ name: "Charlie Seitz", phone: "+1 615 948 3641", corporateEmail: "Charlie@365yachts.org", level: "senior", joinedAt: "2026-10-01", onboardedAt: "2026-10-20" });
    expect(response.statusCode).toBe(201);
    ({ brokerId, inviteUrl } = response.json());
    expect(response.json()).toMatchObject({ phone: "+16159483641", inviteUrl: expect.stringMatching(/^http:\/\/localhost:3000\/invite\/[A-Za-z0-9_-]+$/) });

    const [broker] = await ctx.db.select().from(brokers).where(eq(brokers.id, brokerId));
    expect(broker).toMatchObject({ status: "active", level: "senior", joinedAt: "2026-10-01", onboardedAt: "2026-10-20", corporateEmail: "charlie@365yachts.org", crmPhone: null });
    expect(broker!.welcomeSeenAt).not.toBeNull();
    const [user] = await ctx.db.select().from(users).where(eq(users.id, broker!.userId));
    expect(user).toMatchObject({ email: "charlie@365yachts.org", phone: "+16159483641", role: "broker" });

    const steps = await ctx.db.select().from(brokerSteps).where(eq(brokerSteps.brokerId, brokerId));
    expect(steps).toHaveLength(STEPS_TOTAL);
    expect(steps.every((step) => step.status === "approved" && step.reviewNote === "Onboarded before the portal")).toBe(true);
    const profile = await profileOf(brokerId);
    expect(profile.metrics).toMatchObject({ stepsApproved: STEPS_TOTAL, stepsTotal: STEPS_TOTAL });

    const tasks = await ctx.db.select({ system: provisioningTasks.system, action: provisioningTasks.action }).from(provisioningTasks).where(eq(provisioningTasks.brokerId, brokerId));
    expect(tasks.map((task) => `${task.system}:${task.action}`).sort()).toEqual(["ghl:link", "google:link"]);
    expect(await ctx.db.select().from(commissionHistory).where(eq(commissionHistory.brokerId, brokerId))).toEqual([]);
    expect(ctx.emailsTo("charlie@365yachts.org")).toEqual([]);
  });

  it("writes the broker and every step approval to audit_log", async () => {
    const [created] = await ctx.db.select().from(auditLog).where(and(eq(auditLog.entityId, brokerId), eq(auditLog.action, "broker.created")));
    expect(created?.after).toMatchObject({ source: "existing", status: "active", corporateEmail: "charlie@365yachts.org", onboardedAt: "2026-10-20" });
    const approvals = await ctx.db.select().from(auditLog).where(eq(auditLog.action, "step.approved"));
    expect(approvals.filter((row) => (row.after as { brokerId?: string }).brokerId === brokerId)).toHaveLength(STEPS_TOTAL);
  });

  it("shows the same sign-in link on the profile every time, and the link opens the invite page", async () => {
    expect((await profileOf(brokerId)).broker).toMatchObject({ hasLogin: false, inviteUrl });
    expect((await profileOf(brokerId)).broker.inviteUrl).toBe(inviteUrl);
    const info = await ctx.call("GET", `/v1/invites/${tokenOf(inviteUrl)}`);
    expect(info.statusCode).toBe(200);
    expect(info.json()).toMatchObject({ name: "Charlie Seitz", email: "charlie@365yachts.org", phone: "+16159483641" });
    const made = await ctx.db.select().from(auditLog).where(and(eq(auditLog.entityId, brokerId), eq(auditLog.action, "broker.invite_link_created")));
    expect(made).toEqual([]);
  });

  it("drops the link once they have created their account, and keeps them active", async () => {
    const accepted = await ctx.call("POST", `/v1/invites/${tokenOf(inviteUrl)}/accept`, { body: { name: "Charlie Seitz", password: "charlies-password-1" } });
    expect(accepted.statusCode).toBe(200);
    expect((await profileOf(brokerId)).broker).toMatchObject({ hasLogin: true, inviteUrl: null, status: "active" });
  });
});

describe("adding a broker who is still onboarding", () => {
  it("starts them invited with every step to do and queues their accounts to be created", async () => {
    const response = await addExisting({ name: "Nina Castillo", phone: "+15615550151", email: "nina@example.com", progress: "onboarding", inHouseSplit: 40, selfGeneratedSplit: 60 });
    expect(response.statusCode).toBe(201);
    const { brokerId } = response.json();
    const [broker] = await ctx.db.select().from(brokers).where(eq(brokers.id, brokerId));
    expect(broker).toMatchObject({ status: "invited", onboardedAt: null, corporateEmail: null });
    const steps = await ctx.db.select().from(brokerSteps).where(eq(brokerSteps.brokerId, brokerId));
    expect(steps.every((step) => step.status === "todo")).toBe(true);
    const [history] = await ctx.db.select().from(commissionHistory).where(eq(commissionHistory.brokerId, brokerId));
    expect(history).toMatchObject({ inHousePct: 40, selfGeneratedPct: 60, note: "Set when added" });
    const tasks = await ctx.db.select({ system: provisioningTasks.system, action: provisioningTasks.action }).from(provisioningTasks).where(eq(provisioningTasks.brokerId, brokerId));
    expect(tasks.map((task) => `${task.system}:${task.action}`).sort()).toEqual(["ghl:create", "google:create"]);
    expect(ctx.emailsTo("nina@example.com")).toEqual([]);
  });

  it("queues nothing for an onboarded broker without a 365 email, who types their own email at sign-in", async () => {
    const response = await addExisting({ name: "Peter Shaarda", phone: "+12394041441" });
    expect(response.statusCode).toBe(201);
    const { brokerId, inviteUrl } = response.json();
    expect(await ctx.db.select().from(provisioningTasks).where(eq(provisioningTasks.brokerId, brokerId))).toEqual([]);
    expect((await profileOf(brokerId)).broker).toMatchObject({ email: null, inviteUrl });
  });
});

describe("refusing bad input", () => {
  it("refuses an email someone already uses, as a sign-in or a 365 email", async () => {
    for (const body of [{ email: "charlie@365yachts.org" }, { corporateEmail: "CHARLIE@365yachts.org" }, { email: OWNER.email }]) {
      const response = await addExisting({ name: "Copy Person", phone: "+15615550152", ...body });
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe("email_taken");
    }
  });

  it("refuses an onboarding date before the joining date", async () => {
    const response = await addExisting({ name: "Early Bird", phone: "+15615550153", joinedAt: "2026-11-05", onboardedAt: "2026-11-01" });
    expect(response.statusCode).toBe(400);
  });
});

describe("the invite link on the profile", () => {
  it("is made on the first visit for an invited broker who has none, then stays the same", async () => {
    const broker = await ctx.createBroker({ name: "Joseph Graffeo", email: "joseph@example.com", status: "invited" });
    const first = (await profileOf(broker.brokerId)).broker.inviteUrl as string;
    expect(first).toMatch(/^http:\/\/localhost:3000\/invite\//);
    expect((await profileOf(broker.brokerId)).broker.inviteUrl).toBe(first);
    const made = await ctx.db.select().from(auditLog).where(and(eq(auditLog.entityId, broker.brokerId), eq(auditLog.action, "broker.invite_link_created")));
    expect(made).toHaveLength(1);
  });

  it("leaves an older random invite working, and shows a new link only once one is made", async () => {
    const broker = await ctx.createBroker({ name: "David Pattinson", email: "david@example.com", status: "invited" });
    await ctx.db.insert(accountTokens).values({ userId: broker.userId, purpose: "invite", tokenHash: randomBytes(32).toString("hex"), expiresAt: new Date(Date.now() + 86_400_000) });
    expect((await profileOf(broker.brokerId)).broker.inviteUrl).toBeNull();
    const made = await ctx.call("POST", `/v1/admin/brokers/${broker.brokerId}/invite-link`, { cookie: owner });
    expect((await profileOf(broker.brokerId)).broker.inviteUrl).toBe(made.json().inviteUrl);
  });

  it("is ended when the broker is set inactive", async () => {
    const broker = await ctx.createBroker({ name: "Alex Siegers", email: "alex@example.com", status: "invited" });
    const url = (await profileOf(broker.brokerId)).broker.inviteUrl as string;
    const patched = await ctx.call("PATCH", `/v1/admin/brokers/${broker.brokerId}`, { cookie: owner, body: { status: "inactive", leftAt: "2026-11-05" } });
    expect(patched.statusCode).toBe(200);
    expect((await ctx.call("GET", `/v1/invites/${tokenOf(url)}`)).statusCode).toBe(410);
    expect((await profileOf(broker.brokerId)).broker.inviteUrl).toBeNull();
  });
});
