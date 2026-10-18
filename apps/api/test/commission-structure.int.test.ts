/**
 * File: apps/api/test/commission-structure.int.test.ts
 * Purpose: Integration tests for phase H1, the commission structure (SPEC D29), on a real Postgres container: inviting
 * with an E.164 phone and no email (the invite link comes back for the admin to send, nothing is emailed, and the
 * placeholder email is never shown), making a fresh invite link, accepting an invite with the broker's own email,
 * changing the commission split through the history (dated, noted, audited, never in the future), and both splits in
 * the brokers list and the metrics feed.
 *
 * Functions:
 * - tokenFrom(url): the invite token at the end of an invite link.
 * - inviteWithoutEmail(name, phone): invites a broker with no email and returns the response body.
 */
import { auditLog, brokers, users } from "@bp/db";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, OWNER, type TestContext } from "./helpers/context";

let ctx: TestContext;
let owner: string;

function tokenFrom(url: string): string {
  return url.split("/invite/")[1]!;
}

async function inviteWithoutEmail(name: string, phone: string) {
  const response = await ctx.call("POST", "/v1/admin/brokers", { cookie: owner, body: { name, phone, level: "senior", inHouseSplit: 50, selfGeneratedSplit: 70 } });
  expect(response.statusCode).toBe(201);
  return response.json() as { brokerId: string; inviteUrl: string };
}

beforeAll(async () => {
  ctx = await createTestContext();
  owner = await ctx.login(OWNER.email, OWNER.password);
});
afterAll(() => ctx?.close());

describe("inviting without an email", () => {
  it("needs a phone in international form", async () => {
    const body = { name: "Phone Check", email: "phone.check@example.com", level: "junior", inHouseSplit: 40, selfGeneratedSplit: 60 };
    expect((await ctx.call("POST", "/v1/admin/brokers", { cookie: owner, body })).statusCode).toBe(400);
    expect((await ctx.call("POST", "/v1/admin/brokers", { cookie: owner, body: { ...body, phone: "(561) 555-0123" } })).statusCode).toBe(400);
  });

  it("returns the invite link, emails nobody, and never shows the placeholder email", async () => {
    const { brokerId, inviteUrl } = await inviteWithoutEmail("Nina Castillo", "+1 561 555 0140");
    expect(inviteUrl).toMatch(/^http:\/\/localhost:3000\/invite\/[A-Za-z0-9_-]+$/);
    const [row] = await ctx.db.select({ email: users.email, phone: users.phone }).from(brokers).innerJoin(users, eq(users.id, brokers.userId)).where(eq(brokers.id, brokerId));
    expect(row!.email).toMatch(/@invite\.invalid$/);
    expect(row!.phone).toBe("+15615550140");
    expect(ctx.emailsTo(row!.email)).toEqual([]);

    const profile = (await ctx.call("GET", `/v1/admin/brokers/${brokerId}`, { cookie: owner })).json();
    expect(profile.broker.email).toBeNull();
    expect(profile.commissionHistory).toEqual([expect.objectContaining({ inHouseSplit: 50, selfGeneratedSplit: 70, note: "Set at invite", changedByName: "Aj Owner" })]);
    const list = (await ctx.call("GET", "/v1/admin/brokers", { cookie: owner })).json();
    expect(list.brokers.find((item: { brokerId: string }) => item.brokerId === brokerId)).toMatchObject({ email: null, inHouseSplit: 50, selfGeneratedSplit: 70 });
    const info = (await ctx.call("GET", `/v1/invites/${tokenFrom(inviteUrl)}`)).json();
    expect(info).toMatchObject({ email: null, name: "Nina Castillo" });
  });

  it("can't email the invite again, but makes a fresh link that replaces the old one", async () => {
    const { brokerId, inviteUrl } = await inviteWithoutEmail("Omar Haddad", "+15615550141");
    const resend = await ctx.call("POST", `/v1/admin/brokers/${brokerId}/resend-invite`, { cookie: owner });
    expect(resend.statusCode).toBe(409);
    expect(resend.json().error).toBe("no_email");
    const fresh = await ctx.call("POST", `/v1/admin/brokers/${brokerId}/invite-link`, { cookie: owner });
    expect(fresh.statusCode).toBe(200);
    const freshUrl = fresh.json().inviteUrl as string;
    expect(freshUrl).not.toBe(inviteUrl);
    expect((await ctx.call("GET", `/v1/invites/${tokenFrom(inviteUrl)}`)).statusCode).toBe(410);
    expect((await ctx.call("GET", `/v1/invites/${tokenFrom(freshUrl)}`)).statusCode).toBe(200);
    const audits = await ctx.db.select().from(auditLog).where(and(eq(auditLog.entityId, brokerId), eq(auditLog.action, "broker.invite_link_created")));
    expect(audits).toHaveLength(1);
  });

  it("asks for the broker's own email when they accept, refuses one already in use, and signs them in with it", async () => {
    const { brokerId, inviteUrl } = await inviteWithoutEmail("Lena Park", "+15615550142");
    const token = tokenFrom(inviteUrl);
    const base = { name: "Lena Park", password: "lenas-password-1", phone: "(561) 555-0142" };
    const missing = await ctx.call("POST", `/v1/invites/${token}/accept`, { body: base });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error).toBe("email_required");
    const taken = await ctx.call("POST", `/v1/invites/${token}/accept`, { body: { ...base, email: OWNER.email } });
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error).toBe("email_taken");
    const accepted = await ctx.call("POST", `/v1/invites/${token}/accept`, { body: { ...base, email: "Lena.Park@Example.com" } });
    expect(accepted.statusCode).toBe(200);
    expect(await ctx.login("lena.park@example.com", base.password)).toContain("session_token");
    const profile = (await ctx.call("GET", `/v1/admin/brokers/${brokerId}`, { cookie: owner })).json();
    expect(profile.broker).toMatchObject({ email: "lena.park@example.com", status: "onboarding", hasLogin: true });
    const again = await ctx.call("POST", `/v1/admin/brokers/${brokerId}/invite-link`, { cookie: owner });
    expect(again.json().error).toBe("already_signed_up");
  });
});

describe("changing the commission split", () => {
  let broker: Awaited<ReturnType<TestContext["createBroker"]>>;

  beforeAll(async () => {
    broker = await ctx.createBroker({ name: "Kevin Osei", email: "kevin@example.com", status: "active", joinedAt: "2026-08-18" });
  });

  it("adds a dated, noted history row, writes audit_log, and becomes the current split", async () => {
    const first = await ctx.call("POST", `/v1/admin/brokers/${broker.brokerId}/commission`, { cookie: owner, body: { inHouseSplit: 40, selfGeneratedSplit: 60, effectiveFrom: "2026-09-01" } });
    expect(first.statusCode).toBe(201);
    const second = await ctx.call("POST", `/v1/admin/brokers/${broker.brokerId}/commission`, { cookie: owner, body: { inHouseSplit: 50, selfGeneratedSplit: 65, note: "Top performer, September" } });
    expect(second.statusCode).toBe(201);

    const profile = (await ctx.call("GET", `/v1/admin/brokers/${broker.brokerId}`, { cookie: owner })).json();
    expect(profile.broker).toMatchObject({ inHouseSplit: 50, selfGeneratedSplit: 65 });
    expect(profile.commissionHistory.map((entry: { inHouseSplit: number; selfGeneratedSplit: number; note: string | null; changedByName: string }) => [entry.inHouseSplit, entry.selfGeneratedSplit, entry.note, entry.changedByName])).toEqual([
      [50, 65, "Top performer, September", "Aj Owner"],
      [40, 60, null, "Aj Owner"],
    ]);
    const audits = await ctx.db.select().from(auditLog).where(and(eq(auditLog.entityId, broker.brokerId), eq(auditLog.action, "broker.commission_changed")));
    expect(audits).toHaveLength(2);
    expect(audits.find((row) => (row.after as { note: string | null }).note === "Top performer, September")).toMatchObject({
      before: { inHouseSplit: 40, selfGeneratedSplit: 60 },
      after: { inHouseSplit: 50, selfGeneratedSplit: 65 },
    });
    const me = (await ctx.call("GET", "/v1/me", { cookie: broker.cookie })).json();
    expect(me.broker).toMatchObject({ inHouseSplit: 50, selfGeneratedSplit: 65 });
  });

  it("refuses a start date in the future or before the broker joined", async () => {
    const future = await ctx.call("POST", `/v1/admin/brokers/${broker.brokerId}/commission`, { cookie: owner, body: { inHouseSplit: 50, selfGeneratedSplit: 70, effectiveFrom: "2099-01-01" } });
    expect(future.json().error).toBe("future_effective_date");
    const early = await ctx.call("POST", `/v1/admin/brokers/${broker.brokerId}/commission`, { cookie: owner, body: { inHouseSplit: 50, selfGeneratedSplit: 70, effectiveFrom: "2026-01-01" } });
    expect(early.json().error).toBe("invalid_dates");
  });

  it("shows both splits in the brokers list and the metrics feed", async () => {
    const list = (await ctx.call("GET", "/v1/admin/brokers", { cookie: owner })).json();
    expect(list.brokers.find((item: { brokerId: string }) => item.brokerId === broker.brokerId)).toMatchObject({ inHouseSplit: 50, selfGeneratedSplit: 65 });
    const metrics = (await ctx.call("GET", "/v1/admin/metrics", { cookie: owner })).json();
    expect(metrics.brokers.find((item: { brokerId: string }) => item.brokerId === broker.brokerId)).toMatchObject({ inHouseSplit: 50, selfGeneratedSplit: 65 });
  });
});
