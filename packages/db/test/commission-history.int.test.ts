/**
 * File: packages/db/test/commission-history.int.test.ts
 * Purpose: Integration tests on a real Postgres container for the commission history (SPEC D29): createBroker writes
 * the first row, the latest row (by effective date, then by when it was written) is the current split, the database
 * refuses percentages outside 0 to 100, broker_metrics shows the current split, and migration 0008 gives existing
 * brokers a first row from the old split columns and commission_tier without changing those columns, and is safe to
 * run again.
 *
 * Functions:
 * - runBackfill(): runs the SQL of migration 0008 again against the test database.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addCommissionChange, brokerMetrics, brokers, commissionHistory, commissionHistoryFor, createBroker, currentCommission, seedDatabase } from "../src";
import { startTestDatabase } from "../src/testing";

const BACKFILL = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle", "0008_commission_history_backfill.sql");

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
let brokerId: string;

async function runBackfill(): Promise<void> {
  await testDb.sql.unsafe(readFileSync(BACKFILL, "utf8"));
}

beforeAll(async () => {
  testDb = await startTestDatabase();
  await seedDatabase(testDb.db, {});
  const created = await testDb.db.transaction((tx) =>
    createBroker(tx, { name: "History Tester", email: "history@example.com", level: "junior", status: "onboarding", joinedAt: "2026-09-01", inHouseSplit: 30, selfGeneratedSplit: 50, commissionNote: "Set at invite" }),
  );
  brokerId = created.brokerId;
});

afterAll(async () => {
  await testDb?.stop();
});

describe("commission history", () => {
  it("writes the first row when a broker is created, dated from when they joined", async () => {
    const rows = await commissionHistoryFor(testDb.db, brokerId);
    expect(rows.map((row) => [row.inHousePct, row.selfGeneratedPct, row.effectiveFrom, row.note])).toEqual([[30, 50, "2026-09-01", "Set at invite"]]);
  });

  it("treats the latest row as the current split, by effective date and then by when it was written", async () => {
    await addCommissionChange(testDb.db, { brokerId, inHousePct: 40, selfGeneratedPct: 60, effectiveFrom: "2026-10-01" });
    await addCommissionChange(testDb.db, { brokerId, inHousePct: 35, selfGeneratedPct: 55, effectiveFrom: "2026-09-15" });
    expect(await currentCommission(testDb.db, brokerId)).toEqual({ inHousePct: 40, selfGeneratedPct: 60 });
    await addCommissionChange(testDb.db, { brokerId, inHousePct: 50, selfGeneratedPct: 70, effectiveFrom: "2026-10-01", note: "Same day, later" });
    expect(await currentCommission(testDb.db, brokerId)).toEqual({ inHousePct: 50, selfGeneratedPct: 70 });
    const rows = await commissionHistoryFor(testDb.db, brokerId);
    expect(rows.map((row) => row.effectiveFrom)).toEqual(["2026-10-01", "2026-10-01", "2026-09-15", "2026-09-01"]);
  });

  it("refuses percentages outside 0 to 100", async () => {
    await expect(addCommissionChange(testDb.db, { brokerId, inHousePct: 101, selfGeneratedPct: 50 })).rejects.toThrow();
    await expect(addCommissionChange(testDb.db, { brokerId, inHousePct: 40, selfGeneratedPct: -1 })).rejects.toThrow();
  });

  it("shows the current split in broker_metrics", async () => {
    const [row] = await testDb.db.select().from(brokerMetrics).where(eq(brokerMetrics.brokerId, brokerId));
    expect(row).toMatchObject({ inHousePct: 50, selfGeneratedPct: 70 });
  });

  it("returns nulls for a broker without history", async () => {
    const created = await testDb.db.transaction((tx) => createBroker(tx, { name: "No Split", email: "nosplit@example.com", level: "junior", joinedAt: "2026-10-01" }));
    expect(await currentCommission(testDb.db, created.brokerId)).toEqual({ inHousePct: null, selfGeneratedPct: null });
    const [row] = await testDb.db.select().from(brokerMetrics).where(eq(brokerMetrics.brokerId, created.brokerId));
    expect(row).toMatchObject({ inHousePct: null, selfGeneratedPct: null });
  });
});

describe("migration 0008: commission history backfill", () => {
  it("gives a broker from before D29 a first row from the old columns and tier, leaving the columns alone", async () => {
    const created = await testDb.db.transaction((tx) => createBroker(tx, { name: "Old Timer", email: "old@example.com", level: "senior", status: "active", joinedAt: "2025-03-03", onboardedAt: "2025-03-11" }));
    await testDb.db.update(brokers).set({ inHouseSplit: 40, selfGeneratedSplit: 60, commissionTier: " 60/40 " }).where(eq(brokers.id, created.brokerId));
    const tierOnly = await testDb.db.transaction((tx) => createBroker(tx, { name: "Tier Only", email: "tier@example.com", level: "junior", joinedAt: "2026-01-05" }));
    await testDb.db.update(brokers).set({ commissionTier: "50/50" }).where(eq(brokers.id, tierOnly.brokerId));

    await runBackfill();

    expect((await commissionHistoryFor(testDb.db, created.brokerId)).map((row) => [row.inHousePct, row.selfGeneratedPct, row.effectiveFrom, row.note, row.changedByName])).toEqual([
      [40, 60, "2025-03-03", "Previous commission tier: 60/40", null],
    ]);
    expect((await commissionHistoryFor(testDb.db, tierOnly.brokerId)).map((row) => [row.inHousePct, row.selfGeneratedPct, row.note])).toEqual([[null, null, "Previous commission tier: 50/50"]]);
    const [old] = await testDb.db.select().from(brokers).where(eq(brokers.id, created.brokerId));
    expect(old).toMatchObject({ inHouseSplit: 40, selfGeneratedSplit: 60, commissionTier: " 60/40 " });
  });

  it("skips brokers that already have history and does nothing the second time", async () => {
    const before = (await testDb.db.select().from(commissionHistory)).length;
    await runBackfill();
    expect((await testDb.db.select().from(commissionHistory)).length).toBe(before);
    expect(await commissionHistoryFor(testDb.db, brokerId)).toHaveLength(4);
  });
});
