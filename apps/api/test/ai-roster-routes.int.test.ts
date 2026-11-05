/**
 * File: apps/api/test/ai-roster-routes.int.test.ts
 * Purpose: Integration tests that the admin routes keep the 365 Yachts AI roster in step when AI_ROSTER_SYNC_ENABLED is
 * "true": inviting a broker and adding an existing broker each add them to the roster, deleting a broker deactivates
 * them there, and a roster failure never stops the portal action. The bot is a stubbed fetch; every other request goes through.
 *
 * Functions:
 * - botCalls(): the requests sent to the stubbed bot so far.
 */
import { auditLog } from "@bp/db";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestContext, OWNER, type TestContext } from "./helpers/context";

const BOT = "https://bot.example.com";
let ctx: TestContext;
let owner: string;
let botStatus = 201;
const calls: { url: string; method: string; body: Record<string, unknown> | null }[] = [];
const realFetch = globalThis.fetch;

function botCalls() {
  return calls;
}

beforeAll(async () => {
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith(BOT)) return realFetch(input, init);
    calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify(botStatus >= 400 ? { error: "Couldn't save to the database." } : { broker: {} }), { status: botStatus });
  });
  ctx = await createTestContext({ env: { AI_ROSTER_SYNC_ENABLED: "true", AI_ROSTER_API_URL: BOT, AI_ROSTER_API_SECRET: "roster-secret" } });
  owner = await ctx.login(OWNER.email, OWNER.password);
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await ctx?.close();
});
beforeEach(() => {
  calls.length = 0;
  botStatus = 201;
});

describe("the AI roster sync, when switched on", () => {
  it("adds an invited broker to the roster", async () => {
    const response = await ctx.call("POST", "/v1/admin/brokers", {
      cookie: owner,
      body: { name: "Ben Fisher", phone: "+1 843 697 3736", email: "ben@example.com", level: "senior", inHouseSplit: 50, selfGeneratedSplit: 70 },
    });
    expect(response.statusCode).toBe(201);
    expect(botCalls()).toEqual([{ url: `${BOT}/api/brokers`, method: "POST", body: { phone: "18436973736", name: "Ben Fisher", role: "broker", email: "ben@example.com" } }]);
    const [audit] = await ctx.db.select().from(auditLog).where(and(eq(auditLog.entityId, response.json().brokerId), eq(auditLog.action, "roster.added")));
    expect(audit).toBeDefined();
  });

  it("adds an existing broker with their 365 email", async () => {
    const response = await ctx.call("POST", "/v1/admin/brokers/existing", {
      cookie: owner,
      body: { name: "Mark Husk", phone: "+19547785521", corporateEmail: "markhusk@365yachts.org", level: "senior", joinedAt: "2026-11-05", progress: "onboarded" },
    });
    expect(response.statusCode).toBe(201);
    expect(botCalls()).toEqual([expect.objectContaining({ method: "POST", body: expect.objectContaining({ phone: "19547785521", email: "markhusk@365yachts.org" }) })]);
  });

  it("still creates the broker when the roster refuses, and records the failure", async () => {
    botStatus = 500;
    const response = await ctx.call("POST", "/v1/admin/brokers/existing", {
      cookie: owner,
      body: { name: "Daniel Moreno", phone: "+17869851985", level: "junior", joinedAt: "2026-11-05", progress: "onboarded" },
    });
    expect(response.statusCode).toBe(201);
    const [failed] = await ctx.db.select().from(auditLog).where(and(eq(auditLog.entityId, response.json().brokerId), eq(auditLog.action, "roster.add_failed")));
    expect(failed?.after).toMatchObject({ status: 500, error: "Couldn't save to the database." });
  });

  it("deactivates a deleted broker on the roster", async () => {
    const created = await ctx.call("POST", "/v1/admin/brokers/existing", {
      cookie: owner,
      body: { name: "Gone Broker", phone: "+15615550161", level: "junior", joinedAt: "2026-11-05", progress: "onboarding" },
    });
    const brokerId = created.json().brokerId;
    calls.length = 0;
    botStatus = 200;
    const deleted = await ctx.call("DELETE", `/v1/admin/brokers/${brokerId}`, { cookie: owner, body: { confirmName: "Gone Broker" } });
    expect(deleted.statusCode).toBe(200);
    expect(botCalls()).toEqual([{ url: `${BOT}/api/brokers/15615550161`, method: "DELETE", body: null }]);
    const rows = await ctx.db.select().from(auditLog).where(eq(auditLog.entityId, brokerId));
    expect(rows.map((row) => row.action).sort()).toEqual(["broker.deleted", "roster.removed"]);
    expect(JSON.stringify(rows)).not.toMatch(/Gone Broker|15615550161/);
  });
});
