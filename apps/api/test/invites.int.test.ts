/**
 * File: apps/api/test/invites.int.test.ts
 * Purpose: Integration tests for inviting brokers and admins: the invite email, opening and accepting the link,
 * single use, expiry, resending, duplicate emails, the two required commission splits (SPEC D27), and the owner-only admin invite (SPEC D7, D8).
 *
 * Functions:
 * - none
 */
import { auditLog, brokers, users } from "@bp/db";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, OWNER, type TestContext } from "./helpers/context";

let ctx: TestContext;
let owner: string;
beforeAll(async () => {
  ctx = await createTestContext();
  owner = await ctx.login(OWNER.email, OWNER.password);
});
afterAll(() => ctx?.close());

const acceptBody = { name: "Daniel Reyes", password: "daniels-password-1", phone: "(561) 555-0123" };

describe("inviting a broker", () => {
  let brokerId: string;
  let token: string;

  it("creates the broker as invited and emails an invite link", async () => {
    const response = await ctx.call("POST", "/v1/admin/brokers", {
      cookie: owner,
      body: { name: "Daniel Reyes", email: "Daniel.Reyes@Example.com", level: "junior", joinedAt: "2026-10-13", inHouseSplit: 40, selfGeneratedSplit: 60 },
    });
    expect(response.statusCode).toBe(201);
    brokerId = response.json().brokerId;
    const [broker] = await ctx.db.select().from(brokers).where(eq(brokers.id, brokerId));
    expect(broker).toMatchObject({ status: "invited", level: "junior", joinedAt: "2026-10-13", inHouseSplit: 40, selfGeneratedSplit: 60 });
    const [created] = await ctx.db.select().from(auditLog).where(and(eq(auditLog.entityId, brokerId), eq(auditLog.action, "broker.created")));
    expect(created?.after).toMatchObject({ inHouseSplit: 40, selfGeneratedSplit: 60 });
    const [email] = ctx.emailsTo("daniel.reyes@example.com");
    expect(email?.subject).toMatch(/Welcome to 365 Yachts/);
    expect(email?.text).toContain("wa.me/15614459241");
    token = ctx.linkToken(email!, "invite");
  });

  it("refuses a second broker with the same email", async () => {
    const response = await ctx.call("POST", "/v1/admin/brokers", {
      cookie: owner,
      body: { name: "Copy", email: "daniel.reyes@example.com", level: "senior", inHouseSplit: 50, selfGeneratedSplit: 70 },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("email_taken");
  });

  it("validates the new broker's details", async () => {
    const response = await ctx.call("POST", "/v1/admin/brokers", { cookie: owner, body: { name: "X", email: "bad", level: "pro" } });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("validation_error");
  });

  it("needs both commission splits, each a whole percentage from 0 to 100", async () => {
    const base = { name: "Split Person", email: "split.person@example.com", level: "junior" };
    for (const splits of [{}, { inHouseSplit: 40 }, { selfGeneratedSplit: 60 }, { inHouseSplit: 40, selfGeneratedSplit: 101 }, { inHouseSplit: 40.5, selfGeneratedSplit: 60 }]) {
      const response = await ctx.call("POST", "/v1/admin/brokers", { cookie: owner, body: { ...base, ...splits } });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe("validation_error");
    }
    expect(await ctx.db.select().from(users).where(eq(users.email, base.email))).toHaveLength(0);
  });

  it("shows who the invite is for", async () => {
    const response = await ctx.call("GET", `/v1/invites/${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ email: "daniel.reyes@example.com", name: "Daniel Reyes", firstName: "Daniel", role: "broker" });
  });

  it("rejects a weak password or a bad phone number", async () => {
    expect((await ctx.call("POST", `/v1/invites/${token}/accept`, { body: { ...acceptBody, password: "short" } })).statusCode).toBe(400);
    expect((await ctx.call("POST", `/v1/invites/${token}/accept`, { body: { ...acceptBody, phone: "call me" } })).statusCode).toBe(400);
  });

  it("accepting creates the account, starts onboarding and signs the broker in", async () => {
    const response = await ctx.call("POST", `/v1/invites/${token}/accept`, { body: acceptBody });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ role: "broker" });
    const cookie = ([] as string[]).concat(response.headers["set-cookie"] ?? []).map((value) => value.split(";")[0]).join("; ");
    const me = await ctx.call("GET", "/v1/me", { cookie });
    expect(me.json()).toMatchObject({ user: { name: "Daniel Reyes", phone: "(561) 555-0123" }, broker: { status: "onboarding" } });
    const audit = await ctx.db.select().from(auditLog).where(eq(auditLog.entityId, brokerId));
    expect(audit.map((row) => row.action)).toEqual(expect.arrayContaining(["broker.created", "broker.status_changed"]));
    expect(await ctx.login("daniel.reyes@example.com", acceptBody.password)).toContain("session_token");
  });

  it("works only once", async () => {
    expect((await ctx.call("GET", `/v1/invites/${token}`)).statusCode).toBe(410);
    const again = await ctx.call("POST", `/v1/invites/${token}/accept`, { body: acceptBody });
    expect(again.statusCode).toBe(410);
    expect(again.json().error).toBe("link_used");
  });

  it("rejects unknown tokens with 404", async () => {
    expect((await ctx.call("GET", "/v1/invites/not-a-real-token-at-all")).statusCode).toBe(404);
  });

  it("will not resend an invite to someone who already signed up", async () => {
    const response = await ctx.call("POST", `/v1/admin/brokers/${brokerId}/resend-invite`, { cookie: owner });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("already_signed_up");
  });
});

describe("invite expiry and resending", () => {
  it("expires after 7 days and a resent link replaces the old one", async () => {
    const created = await ctx.call("POST", "/v1/admin/brokers", {
      cookie: owner,
      body: { name: "Marisol Vega", email: "marisol@example.com", level: "senior", inHouseSplit: 50, selfGeneratedSplit: 70 },
    });
    const brokerId = created.json().brokerId;
    const firstToken = ctx.linkToken(ctx.emailsTo("marisol@example.com")[0]!, "invite");

    ctx.setNow(new Date(Date.now() + 8 * 24 * 60 * 60 * 1000));
    const expired = await ctx.call("GET", `/v1/invites/${firstToken}`);
    expect(expired.statusCode).toBe(410);
    expect(expired.json().error).toBe("link_expired");
    ctx.setNow(null);

    expect((await ctx.call("POST", `/v1/admin/brokers/${brokerId}/resend-invite`, { cookie: owner })).statusCode).toBe(200);
    const secondToken = ctx.linkToken(ctx.emailsTo("marisol@example.com")[1]!, "invite");
    expect(secondToken).not.toBe(firstToken);
    expect((await ctx.call("GET", `/v1/invites/${firstToken}`)).statusCode).toBe(410);
    expect((await ctx.call("GET", `/v1/invites/${secondToken}`)).statusCode).toBe(200);
  });
});

describe("inviting admins (owner only)", () => {
  it("lets the owner invite an admin who can then reach admin routes", async () => {
    const response = await ctx.call("POST", "/v1/admin/admins", {
      cookie: owner,
      body: { name: "Shelly Melcher", email: "shelly@example.com" },
    });
    expect(response.statusCode).toBe(201);
    const [user] = await ctx.db.select().from(users).where(eq(users.email, "shelly@example.com"));
    expect(user?.role).toBe("admin");
    const email = ctx.emailsTo("shelly@example.com")[0]!;
    expect(email.subject).toMatch(/admin/);
    const token = ctx.linkToken(email, "invite");
    const accepted = await ctx.call("POST", `/v1/invites/${token}/accept`, {
      body: { name: "Shelly Melcher", password: "shelly-password-1", phone: "561-445-9241" },
    });
    expect(accepted.json()).toEqual({ role: "admin" });
    const shelly = await ctx.login("shelly@example.com", "shelly-password-1");
    expect((await ctx.call("GET", "/v1/admin/overview", { cookie: shelly })).statusCode).toBe(200);
  });

  it("refuses admins and brokers", async () => {
    const shelly = await ctx.login("shelly@example.com", "shelly-password-1");
    const broker = await ctx.createBroker({ email: "wannabe@example.com" });
    for (const cookie of [shelly, broker.cookie]) {
      const response = await ctx.call("POST", "/v1/admin/admins", { cookie, body: { name: "Nope Person", email: "nope@example.com" } });
      expect(response.statusCode).toBe(403);
    }
  });

  it("refuses an email that already exists", async () => {
    const response = await ctx.call("POST", "/v1/admin/admins", { cookie: owner, body: { name: "Dup", email: OWNER.email } });
    expect(response.statusCode).toBe(409);
  });
});
