/**
 * File: apps/api/test/coaching.int.test.ts
 * Purpose: Integration tests for the Coaching section: leadership reads the overview and a broker's page, Shelly's
 * pulse and excuse decisions are saved and audit-logged, fixed targets are edited with a change log and audit_log
 * (typed values range-checked and converted), the section answers 503 when the coach database isn't
 * connected, and a broker's own coaching route only ever returns their own data (no IDOR), with pulse notes hidden.
 *
 * Functions:
 * - none
 */
import { auditLog } from "@bp/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ExcuseRow, PulseRow, SnapshotRow } from "../src/services/coaching/store";
import { createFakeCoachStore, snapshot } from "./helpers/coach-fake";
import { createTestContext, OWNER, type TestContext } from "./helpers/context";

let ctx: TestContext;
let owner: string;
let brokerA: Awaited<ReturnType<TestContext["createBroker"]>>;
let brokerB: Awaited<ReturnType<TestContext["createBroker"]>>;
const seed: { snapshots: SnapshotRow[]; excuses: ExcuseRow[]; pulses: PulseRow[] } = { snapshots: [], excuses: [], pulses: [] };
const fake = createFakeCoachStore({ ...seed, targets: { promises_kept: 0.8, call_quality: 65, closed_value: 500000 } });

beforeAll(async () => {
  ctx = await createTestContext({ coach: fake.store, env: { COACHING_BROKER_VIEW: "true" } });
  owner = await ctx.login(OWNER.email, OWNER.password);
  brokerA = await ctx.createBroker({ name: "Broker A", email: "a@example.com" });
  brokerB = await ctx.createBroker({ name: "Broker B", email: "b@example.com" });
  seed.snapshots.push(snapshot(brokerA.brokerId, "2026-11-16", { score: 91 }), snapshot(brokerB.brokerId, "2026-11-16", { score: 55 }));
  seed.excuses.push({
    momentKey: "LB:idle:2026-11-20T15:00:00.000Z", brokerId: brokerB.brokerId, leadId: "LB", dueAt: "2026-11-20T15:00:00.000Z", dueReason: "idle",
    reason: "client travelling", quote: "Away until the 30th", sourceKind: "note", needsConfirmation: true, decision: null, decidedBy: null,
  });
  seed.pulses.push({
    brokerId: brokerA.brokerId, weekStart: "2026-11-16", engagement: 2, attitude: 2, supportNeeded: "PRIVATE-PULSE-NOTE",
    reviewerName: "Shelly", updatedAt: "2026-11-17T10:00:00.000Z",
  });
});
afterAll(() => ctx?.close());

describe("leadership", () => {
  it("sees the team overview, highest score first", async () => {
    const res = await ctx.call("GET", "/v1/admin/coaching/overview", { cookie: owner });
    expect(res.statusCode).toBe(200);
    expect(res.json().brokers.map((b: { name: string }) => b.name)).toEqual(["Broker A", "Broker B"]);
  });

  it("sees any broker's page", async () => {
    const res = await ctx.call("GET", `/v1/admin/coaching/brokers/${brokerB.brokerId}?week=2026-11-16`, { cookie: owner });
    expect(res.statusCode).toBe(200);
    expect(res.json().excuses[0].needsConfirmation).toBe(true);
  });

  it("saves the pulse and writes audit_log", async () => {
    const body = { weekStart: "2026-11-16", engagement: 4, attitude: 5, supportNeeded: "Wants more leads" };
    expect((await ctx.call("PUT", `/v1/admin/coaching/brokers/${brokerB.brokerId}/pulse`, { cookie: owner, body })).statusCode).toBe(200);
    const rows = await ctx.db.select().from(auditLog).where(eq(auditLog.action, "coaching.pulse_saved"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.entityId).toBe(brokerB.brokerId);
  });

  it("confirms an excuse and writes audit_log; unknown keys are 404", async () => {
    const body = { momentKey: "LB:idle:2026-11-20T15:00:00.000Z", decision: "confirm" };
    expect((await ctx.call("POST", "/v1/admin/coaching/excuses/decision", { cookie: owner, body })).statusCode).toBe(200);
    expect((await ctx.call("POST", "/v1/admin/coaching/excuses/decision", { cookie: owner, body: { ...body, momentKey: "nope" } })).statusCode).toBe(404);
    const rows = await ctx.db.select().from(auditLog).where(eq(auditLog.action, "coaching.excuse_confirmed"));
    expect(rows).toHaveLength(1);
  });

  it("lists the fixed targets in metric order", async () => {
    const res = await ctx.call("GET", "/v1/admin/coaching/targets", { cookie: owner });
    expect(res.statusCode).toBe(200);
    expect(res.json().targets.map((t: { metric: string }) => t.metric)).toEqual(["call_quality", "promises_kept", "closed_value"]);
  });

  it("changes a target from the typed value, logs who changed what and writes audit_log", async () => {
    const res = await ctx.call("PUT", "/v1/admin/coaching/targets/promises_kept", { cookie: owner, body: { value: 75 } });
    expect(res.statusCode).toBe(200);
    expect(res.json().target).toBe(0.75);
    const after = (await ctx.call("GET", "/v1/admin/coaching/targets", { cookie: owner })).json();
    expect(after.targets.find((t: { metric: string }) => t.metric === "promises_kept").target).toBe(0.75);
    expect(after.changes[0]).toMatchObject({ metric: "promises_kept", oldTarget: 0.8, newTarget: 0.75 });
    expect(after.changes[0].changedByName).toBeTruthy();
    const rows = await ctx.db.select().from(auditLog).where(eq(auditLog.action, "coaching.target_changed"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.after).toEqual({ metric: "promises_kept", target: 0.75 });
  });

  it("rejects targets out of range, fractional counts and unknown metrics", async () => {
    for (const [metric, value] of [["promises_kept", 0], ["promises_kept", 120], ["closed_value", 1.5], ["call_quality", -3]] as const) {
      expect((await ctx.call("PUT", `/v1/admin/coaching/targets/${metric}`, { cookie: owner, body: { value } })).statusCode).toBe(400);
    }
    expect((await ctx.call("PUT", "/v1/admin/coaching/targets/made_up", { cookie: owner, body: { value: 5 } })).statusCode).toBe(400);
    expect((await ctx.call("PUT", "/v1/admin/coaching/targets/hot_pipeline", { cookie: owner, body: { value: 5 } })).statusCode).toBe(404);
  });

  it("rejects an invalid pulse", async () => {
    const body = { weekStart: "2026-11-16", engagement: 9, attitude: 5, supportNeeded: "" };
    expect((await ctx.call("PUT", `/v1/admin/coaching/brokers/${brokerB.brokerId}/pulse`, { cookie: owner, body })).statusCode).toBe(400);
  });
});

describe("brokers", () => {
  it("cannot reach any leadership coaching route", async () => {
    for (const [method, url] of [
      ["GET", "/v1/admin/coaching/overview"],
      ["GET", `/v1/admin/coaching/brokers/${brokerA.brokerId}`],
      ["GET", "/v1/admin/coaching/targets"],
    ] as const) {
      expect((await ctx.call(method, url, { cookie: brokerA.cookie })).statusCode).toBe(403);
    }
  });

  it("only ever see their own coaching page, whatever id they send", async () => {
    const res = await ctx.call("GET", `/v1/me/coaching?brokerId=${brokerB.brokerId}&id=${brokerB.brokerId}`, { cookie: brokerA.cookie });
    expect(res.statusCode).toBe(200);
    expect(res.json().broker.brokerId).toBe(brokerA.brokerId);
    expect(res.json().snapshot.score).toBe(91);
  });

  it("never see Shelly's pulse notes", async () => {
    const res = await ctx.call("GET", "/v1/me/coaching", { cookie: brokerA.cookie });
    expect(res.body).not.toContain("PRIVATE-PULSE-NOTE");
  });
});

describe("without the coach database", () => {
  it("answers 503 with a clear message", async () => {
    const bare = await createTestContext({ coach: null });
    try {
      const cookie = await bare.login(OWNER.email, OWNER.password);
      const res = await bare.call("GET", "/v1/admin/coaching/overview", { cookie });
      expect(res.statusCode).toBe(503);
      expect(res.json().error).toBe("coaching_not_configured");
    } finally {
      await bare.close();
    }
  });
});
