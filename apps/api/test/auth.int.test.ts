/**
 * File: apps/api/test/auth.int.test.ts
 * Purpose: Integration tests for signing in and out through Better Auth, the inactive-broker rules (SPEC D9), and
 * the basic access rules: anonymous callers get 401 and requests from a foreign origin get 403.
 *
 * Functions:
 * - none
 */
import { brokers, sessions } from "@bp/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, OWNER, PASSWORD, type TestContext } from "./helpers/context";

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(() => ctx?.close());

describe("sign in", () => {
  it("lets the seeded owner sign in and see themselves", async () => {
    const cookie = await ctx.login(OWNER.email, OWNER.password);
    const me = await ctx.call("GET", "/v1/me", { cookie });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      user: { email: OWNER.email, role: "owner" },
      broker: null,
      support: { name: "Shelly", whatsappNumber: "15614459241" },
    });
  });

  it("rejects a wrong password", async () => {
    const response = await ctx.call("POST", "/api/auth/sign-in/email", { body: { email: OWNER.email, password: "nope-nope-nope" } });
    expect(response.statusCode).toBe(401);
  });

  it("does not allow self sign-up", async () => {
    const response = await ctx.call("POST", "/api/auth/sign-up/email", {
      body: { name: "Stranger", email: "stranger@example.com", password: "stranger-pass-1" },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("signs out", async () => {
    const broker = await ctx.createBroker({ email: "signout@example.com" });
    expect((await ctx.call("POST", "/api/auth/sign-out", { cookie: broker.cookie, body: {} })).statusCode).toBe(200);
    expect((await ctx.call("GET", "/v1/me", { cookie: broker.cookie })).statusCode).toBe(401);
  });
});

describe("inactive brokers (SPEC D9)", () => {
  it("cannot log in", async () => {
    await ctx.createBroker({ email: "former@example.com", status: "inactive" });
    const response = await ctx.call("POST", "/api/auth/sign-in/email", { body: { email: "former@example.com", password: PASSWORD } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ message: expect.stringMatching(/no longer active/) });
  });

  it("lose their sessions the moment an admin sets them inactive", async () => {
    const broker = await ctx.createBroker({ email: "leaving@example.com" });
    const owner = await ctx.login(OWNER.email, OWNER.password);
    expect((await ctx.call("GET", "/v1/me/steps", { cookie: broker.cookie })).statusCode).toBe(200);
    const patch = await ctx.call("PATCH", `/v1/admin/brokers/${broker.brokerId}`, {
      cookie: owner,
      body: { status: "inactive", leftAt: "2026-10-15" },
    });
    expect(patch.statusCode).toBe(200);
    expect(await ctx.db.select().from(sessions).where(eq(sessions.userId, broker.userId))).toHaveLength(0);
    expect((await ctx.call("GET", "/v1/me/steps", { cookie: broker.cookie })).statusCode).toBe(401);
  });

  it("are rejected even with a session that survived a direct database change", async () => {
    const broker = await ctx.createBroker({ email: "sneaky@example.com" });
    await ctx.db.update(brokers).set({ status: "inactive" }).where(eq(brokers.id, broker.brokerId));
    expect((await ctx.call("GET", "/v1/me", { cookie: broker.cookie })).statusCode).toBe(401);
    expect(await ctx.db.select().from(sessions).where(eq(sessions.userId, broker.userId))).toHaveLength(0);
  });
});

describe("access basics", () => {
  it("returns 401 to anonymous callers", async () => {
    for (const url of ["/v1/me", "/v1/me/steps", "/v1/admin/overview", "/v1/admin/brokers"]) {
      expect((await ctx.call("GET", url)).statusCode).toBe(401);
    }
  });

  it("refuses state-changing requests from another origin", async () => {
    const broker = await ctx.createBroker({ email: "csrf@example.com" });
    const response = await ctx.call("POST", "/v1/me/steps/bio/submit", {
      cookie: broker.cookie,
      headers: { origin: "https://evil.example" },
      body: { formData: { text: "x".repeat(400) } },
    });
    expect(response.statusCode).toBe(403);
  });
});
