/**
 * File: apps/api/test/password-reset.int.test.ts
 * Purpose: Integration tests for password resets (SPEC D8): self-service requests that never reveal whether an email
 * exists, admin-sent links, single use and expiry, the new password working, and every old session being ended.
 *
 * Functions:
 * - none
 */
import { sessions } from "@bp/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, OWNER, PASSWORD, type TestContext } from "./helpers/context";

let ctx: TestContext;
let owner: string;
beforeAll(async () => {
  ctx = await createTestContext();
  owner = await ctx.login(OWNER.email, OWNER.password);
});
afterAll(() => ctx?.close());

describe("self-service reset", () => {
  it("answers 202 for unknown emails and sends nothing", async () => {
    const response = await ctx.call("POST", "/v1/password-reset/request", { body: { email: "nobody@example.com" } });
    expect(response.statusCode).toBe(202);
    expect(ctx.emailsTo("nobody@example.com")).toHaveLength(0);
  });

  it("emails a link that sets a new password and ends every session", async () => {
    const broker = await ctx.createBroker({ email: "forgetful@example.com" });
    expect((await ctx.call("POST", "/v1/password-reset/request", { body: { email: "Forgetful@example.com" } })).statusCode).toBe(202);
    const token = ctx.linkToken(ctx.emailsTo("forgetful@example.com")[0]!, "reset");
    expect((await ctx.call("GET", `/v1/password-reset/${token}`)).json()).toEqual({ email: "forgetful@example.com" });

    const done = await ctx.call("POST", `/v1/password-reset/${token}`, { body: { password: "brand-new-password" } });
    expect(done.statusCode).toBe(200);
    expect(await ctx.db.select().from(sessions).where(eq(sessions.userId, broker.userId))).toHaveLength(0);
    expect((await ctx.call("GET", "/v1/me", { cookie: broker.cookie })).statusCode).toBe(401);
    await expect(ctx.login("forgetful@example.com", PASSWORD)).rejects.toThrow(/Login failed/);
    expect(await ctx.login("forgetful@example.com", "brand-new-password")).toContain("session_token");

    expect((await ctx.call("POST", `/v1/password-reset/${token}`, { body: { password: "another-password" } })).statusCode).toBe(410);
  });

  it("sends nothing to inactive brokers", async () => {
    await ctx.createBroker({ email: "gone@example.com", status: "inactive" });
    await ctx.call("POST", "/v1/password-reset/request", { body: { email: "gone@example.com" } });
    expect(ctx.emailsTo("gone@example.com")).toHaveLength(0);
  });

  it("expires after 24 hours", async () => {
    await ctx.createBroker({ email: "slow@example.com" });
    await ctx.call("POST", "/v1/password-reset/request", { body: { email: "slow@example.com" } });
    const token = ctx.linkToken(ctx.emailsTo("slow@example.com")[0]!, "reset");
    ctx.setNow(new Date(Date.now() + 25 * 60 * 60 * 1000));
    expect((await ctx.call("GET", `/v1/password-reset/${token}`)).statusCode).toBe(410);
    ctx.setNow(null);
  });
});

describe("admin-sent reset link", () => {
  it("emails the broker a reset link", async () => {
    const broker = await ctx.createBroker({ email: "locked-out@example.com" });
    const response = await ctx.call("POST", `/v1/admin/brokers/${broker.brokerId}/reset-password`, { cookie: owner });
    expect(response.statusCode).toBe(200);
    expect(ctx.linkToken(ctx.emailsTo("locked-out@example.com")[0]!, "reset")).toBeTruthy();
  });

  it("refuses brokers who never signed up, and inactive brokers", async () => {
    const invited = await ctx.createBroker({ email: "new-invite@example.com", status: "invited" });
    const notSignedUp = await ctx.call("POST", `/v1/admin/brokers/${invited.brokerId}/reset-password`, { cookie: owner });
    expect(notSignedUp.json().error).toBe("not_signed_up");
    const inactive = await ctx.createBroker({ email: "inactive-reset@example.com", status: "inactive" });
    const refused = await ctx.call("POST", `/v1/admin/brokers/${inactive.brokerId}/reset-password`, { cookie: owner });
    expect(refused.json().error).toBe("broker_inactive");
  });
});
