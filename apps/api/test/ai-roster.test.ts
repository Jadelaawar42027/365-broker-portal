/**
 * File: apps/api/test/ai-roster.test.ts
 * Purpose: Unit tests for the 365 Yachts AI roster sync: it stays off unless AI_ROSTER_SYNC_ENABLED is exactly "true" with
 * the bot's URL and secret set, sends the right add and remove requests, treats "already on the roster" and "not on the
 * roster" as done, never throws when the bot fails, and records each outcome in audit_log (the removal row without name or phone).
 *
 * Functions:
 * - envWith(overrides): a parsed API config with the required variables plus the given ones.
 * - fakeDb(): a stand-in database that keeps the audit rows written to it.
 * - stubBot(status, body): replaces fetch with one that answers the bot's address with that status and body, and records every call.
 */
import type { Database } from "@bp/db";
import type { FastifyBaseLogger } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadApiEnv } from "../src/env";
import { addBrokerToAiRoster, removeBrokerFromAiRoster, rosterPhone, rosterTarget } from "../src/services/ai-roster";

const BOT = "https://bot.example.com";
const required = {
  DATABASE_URL: "postgres://bp:bp@localhost:5432/broker_portal",
  BETTER_AUTH_SECRET: "x".repeat(32),
  S3_BUCKET: "broker-files",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
};
const configured = { AI_ROSTER_API_URL: `${BOT}/`, AI_ROSTER_API_SECRET: "roster-secret" };
const enabled = { ...configured, AI_ROSTER_SYNC_ENABLED: "true" };
const log = { error: vi.fn() } as unknown as FastifyBaseLogger;
const broker = { brokerId: "6f1c2c43-1a7f-4a52-9a3e-1d9b6c7e2f10", name: "Charlie Seitz", phone: "+16159483641", email: "charlie@365yachts.org", actorUserId: null };

function envWith(overrides: Record<string, string>) {
  return loadApiEnv({ ...required, ...overrides });
}

function fakeDb() {
  const rows: { action: string; after: Record<string, unknown> }[] = [];
  const db = { insert: () => ({ values: async (row: { action: string; after: Record<string, unknown> }) => void rows.push(row) }) } as unknown as Database;
  return { db, rows };
}

function stubBot(status: number, body: unknown = {}) {
  const calls: { url: string; method: string; headers: Record<string, string>; body: unknown }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? "GET", headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("rosterTarget", () => {
  it("is off unless the switch is exactly true and the bot's URL and secret are set", () => {
    expect(rosterTarget(envWith(configured))).toBeNull();
    for (const value of ["", "false", "TRUE", "1", "yes"]) {
      expect(rosterTarget(envWith({ ...configured, AI_ROSTER_SYNC_ENABLED: value }))).toBeNull();
    }
    expect(rosterTarget(envWith({ ...enabled, AI_ROSTER_API_URL: "" }))).toBeNull();
    expect(rosterTarget(envWith({ ...enabled, AI_ROSTER_API_SECRET: "" }))).toBeNull();
    expect(rosterTarget(envWith(enabled))).toEqual({ url: BOT, secret: "roster-secret" });
  });

  it("turns a phone into the roster's digits-only id", () => {
    expect(rosterPhone("+1 (615) 948-3641")).toBe("16159483641");
  });
});

describe("addBrokerToAiRoster", () => {
  it("does nothing at all while the sync is off", async () => {
    const calls = stubBot(201);
    const { db, rows } = fakeDb();
    await addBrokerToAiRoster({ env: envWith(configured), db }, log, broker);
    expect(calls).toEqual([]);
    expect(rows).toEqual([]);
  });

  it("adds the broker with the bearer secret and records it", async () => {
    const calls = stubBot(201, { broker: {} });
    const { db, rows } = fakeDb();
    await addBrokerToAiRoster({ env: envWith(enabled), db }, log, broker);
    expect(calls).toEqual([
      {
        url: `${BOT}/api/brokers`,
        method: "POST",
        headers: { authorization: "Bearer roster-secret", "content-type": "application/json" },
        body: { phone: "16159483641", name: "Charlie Seitz", role: "broker", email: "charlie@365yachts.org" },
      },
    ]);
    expect(rows).toEqual([expect.objectContaining({ action: "roster.added", after: { phone: "16159483641", status: 201 } })]);
  });

  it("counts a broker already on the roster as done", async () => {
    stubBot(409, { error: "This phone is already on the roster - use PATCH to edit it." });
    const { db, rows } = fakeDb();
    await addBrokerToAiRoster({ env: envWith(enabled), db }, log, broker);
    expect(rows).toEqual([expect.objectContaining({ action: "roster.added", after: expect.objectContaining({ alreadyOnRoster: true }) })]);
    expect(log.error).not.toHaveBeenCalled();
  });

  it("records a refusal or an unreachable bot without throwing", async () => {
    stubBot(409, { error: '"Charlie Seitz" is already on the roster under 1999.' });
    const { db, rows } = fakeDb();
    await addBrokerToAiRoster({ env: envWith(enabled), db }, log, broker);
    vi.stubGlobal("fetch", async () => {
      throw new Error("connect ECONNREFUSED");
    });
    await expect(addBrokerToAiRoster({ env: envWith(enabled), db }, log, broker)).resolves.toBeUndefined();
    expect(rows.map((row) => [row.action, row.after.error])).toEqual([
      ["roster.add_failed", '"Charlie Seitz" is already on the roster under 1999.'],
      ["roster.add_failed", "connect ECONNREFUSED"],
    ]);
    expect(log.error).toHaveBeenCalledTimes(2);
  });

  it("skips a broker without a phone", async () => {
    const calls = stubBot(201);
    const { db, rows } = fakeDb();
    await addBrokerToAiRoster({ env: envWith(enabled), db }, log, { ...broker, phone: null });
    expect(calls).toEqual([]);
    expect(rows).toEqual([]);
  });
});

describe("removeBrokerFromAiRoster", () => {
  it("deactivates the broker's entry and keeps no name or phone in the audit row", async () => {
    const calls = stubBot(200, { broker: {} });
    const { db, rows } = fakeDb();
    await removeBrokerFromAiRoster({ env: envWith(enabled), db }, log, broker);
    expect(calls).toEqual([expect.objectContaining({ url: `${BOT}/api/brokers/16159483641`, method: "DELETE", body: null })]);
    expect(rows).toEqual([expect.objectContaining({ action: "roster.removed", after: { status: 200 } })]);
    expect(JSON.stringify(rows)).not.toMatch(/Charlie|16159483641/);
  });

  it("counts a broker who isn't on the roster as done, and records other failures", async () => {
    stubBot(404, { error: "No roster entry with that phone." });
    const { db, rows } = fakeDb();
    await removeBrokerFromAiRoster({ env: envWith(enabled), db }, log, broker);
    stubBot(500, { error: "Couldn't save to the database." });
    await removeBrokerFromAiRoster({ env: envWith(enabled), db }, log, broker);
    expect(rows.map((row) => row.action)).toEqual(["roster.removed", "roster.remove_failed"]);
    expect(rows[0]!.after).toMatchObject({ notOnRoster: true });
  });

  it("does nothing while the sync is off", async () => {
    const calls = stubBot(200);
    const { db, rows } = fakeDb();
    await removeBrokerFromAiRoster({ env: envWith(configured), db }, log, broker);
    expect(calls).toEqual([]);
    expect(rows).toEqual([]);
  });
});
