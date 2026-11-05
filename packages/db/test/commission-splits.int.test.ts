/**
 * File: packages/db/test/commission-splits.int.test.ts
 * Purpose: Integration tests on a real Postgres container for the two commission splits (SPEC D27, kept in the
 * commission history since D29): createBroker
 * stores them, the database refuses splits outside 0 to 100, and migration 0005 retires an existing step 11
 * (commission_tier) without deleting it or any broker's history, writes one audit row, and is safe to run again.
 *
 * Functions:
 * - runRetireMigration(): runs the SQL of migration 0005 again against the test database.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, brokerMetrics, brokerSteps, brokers, createBroker, currentCommission, onboardingSteps, seedDatabase } from "../src";
import { startTestDatabase } from "../src/testing";

const MIGRATION = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle", "0005_retire_commission_step.sql");

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
let brokerId: string;

async function runRetireMigration(): Promise<void> {
  await testDb.sql.unsafe(readFileSync(MIGRATION, "utf8"));
}

beforeAll(async () => {
  testDb = await startTestDatabase();
  await seedDatabase(testDb.db, {});
  await testDb.db.insert(onboardingSteps).values({
    key: "commission_tier",
    position: 112,
    stage: "your_tools",
    title: "Book your 1-on-1 to confirm your commission tier",
    shortTitle: "Commission tier confirmed (1-on-1)",
    summary: "Old step 11",
    intro: "Old step 11",
    kind: "admin",
    needsApproval: true,
    instructionsMd: "Old step 11",
  });
  const created = await testDb.db.transaction((tx) =>
    createBroker(tx, { name: "Split Tester", email: "split@example.com", level: "junior", status: "onboarding", joinedAt: "2026-10-01", inHouseSplit: 30, selfGeneratedSplit: 55 }),
  );
  brokerId = created.brokerId;
});

afterAll(async () => {
  await testDb?.stop();
});

describe("commission splits", () => {
  it("stores both splits when a broker is created", async () => {
    expect(await currentCommission(testDb.db, brokerId)).toEqual({ inHousePct: 30, selfGeneratedPct: 55 });
  });

  it("refuses a split outside 0 to 100", async () => {
    await expect(testDb.db.update(brokers).set({ inHouseSplit: 101 }).where(eq(brokers.id, brokerId))).rejects.toThrow();
    await expect(testDb.db.update(brokers).set({ selfGeneratedSplit: -1 }).where(eq(brokers.id, brokerId))).rejects.toThrow();
  });
});

describe("migration 0005: retire step 11", () => {
  it("marks the old commission step inactive, keeps its rows, and leaves it out of the totals", async () => {
    const [before] = await testDb.db.select().from(brokerMetrics).where(eq(brokerMetrics.brokerId, brokerId));
    expect(before?.stepsTotal).toBe(15);

    await runRetireMigration();

    const [step] = await testDb.db.select().from(onboardingSteps).where(eq(onboardingSteps.key, "commission_tier"));
    expect(step?.active).toBe(false);
    const kept = await testDb.db
      .select({ id: brokerSteps.id })
      .from(brokerSteps)
      .where(and(eq(brokerSteps.brokerId, brokerId), eq(brokerSteps.stepId, step!.id)));
    expect(kept).toHaveLength(1);
    const [after] = await testDb.db.select().from(brokerMetrics).where(eq(brokerMetrics.brokerId, brokerId));
    expect(after?.stepsTotal).toBe(14);
    const audits = await testDb.db.select().from(auditLog).where(eq(auditLog.entityId, step!.id));
    expect(audits).toMatchObject([{ action: "step.retired", actorUserId: null, before: { active: true }, after: { active: false } }]);
  });

  it("does nothing the second time", async () => {
    await runRetireMigration();
    const [step] = await testDb.db.select().from(onboardingSteps).where(eq(onboardingSteps.key, "commission_tier"));
    expect(await testDb.db.select().from(auditLog).where(eq(auditLog.entityId, step!.id))).toHaveLength(1);
  });

  it("gives brokers created afterwards only the 14 active steps (steps 0 and 1 included)", async () => {
    const created = await testDb.db.transaction((tx) =>
      createBroker(tx, { name: "After Retire", email: "after@example.com", level: "senior", joinedAt: "2026-10-17", inHouseSplit: 50, selfGeneratedSplit: 70 }),
    );
    const rows = await testDb.db.select().from(brokerSteps).where(eq(brokerSteps.brokerId, created.brokerId));
    expect(rows).toHaveLength(14);
  });
});
