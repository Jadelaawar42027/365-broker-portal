/**
 * File: apps/api/test/match-health-coach.int.test.ts
 * Purpose: Integration test for HEALTH_SOURCE=coach against coach-api's real schema in a real Postgres: coach.weekly_snapshot
 * and the coach_portal grants exactly as coach-api's migrations 1764110000000_engine.sql and 1764130000000_portal-access.sql
 * create them, read over a coach_portal login. Checks that only the latest week counts, the health score and the
 * on-time touches follow-up score per broker, null for missing data or brokers without a row that week, and that
 * coach_portal can read the snapshot with its grants alone.
 *
 * Functions:
 * - coachPortalUrl(url): the test database URL with coach_portal's login in place of the owner's.
 * - snapshotRow(brokerId, weekStart, score, onTimeShare): inserts one coach.weekly_snapshot row with the given score and on-time touches share.
 */
import { createDb, type Database } from "@bp/db";
import { startTestDatabase } from "@bp/db/testing";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getBrokerHealth } from "../src/services/match/health";

const COACH_SCHEMA_SQL = `
CREATE SCHEMA coach;
CREATE TABLE coach.weekly_snapshot (
  broker_id      uuid NOT NULL,
  week_start     date NOT NULL,
  iso_week       text NOT NULL,
  score          numeric,
  coverage       numeric NOT NULL,
  provisional    boolean NOT NULL,
  metrics        jsonb NOT NULL,
  focus_areas    jsonb NOT NULL,
  trend          jsonb NOT NULL,
  context        jsonb NOT NULL DEFAULT '{}'::jsonb,
  rules_version  text NOT NULL,
  as_of          timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (broker_id, week_start)
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'coach_portal') THEN
    CREATE ROLE coach_portal NOLOGIN;
  END IF;
END
$$;
GRANT USAGE ON SCHEMA coach TO coach_portal;
GRANT SELECT ON coach.weekly_snapshot TO coach_portal;
ALTER ROLE coach_portal WITH LOGIN PASSWORD 'coach-portal-test';
`;

const LATEST = "2026-11-16";
const PREVIOUS = "2026-11-09";

const current = randomUUID();
const onlyLastWeek = randomUUID();
const noScore = randomUUID();
const noFollowUp = randomUUID();
const outOfRange = randomUUID();
const notInSnapshot = randomUUID();
const notAsked = randomUUID();

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
let coach: ReturnType<typeof createDb>;

function coachPortalUrl(url: string): string {
  const parsed = new URL(url);
  parsed.username = "coach_portal";
  parsed.password = "coach-portal-test";
  return parsed.toString();
}

async function snapshotRow(brokerId: string, weekStart: string, score: number | null, onTimeShare: number | null) {
  const metrics = {
    on_time_touches: { value: onTimeShare, target: 0.8, achievement: null, status: "unknown", sample: 6 },
    speed_to_lead: { value: 12, target: 15, achievement: 1, status: "green", sample: 4 },
  };
  await testDb.sql`
    INSERT INTO coach.weekly_snapshot (broker_id, week_start, iso_week, score, coverage, provisional, metrics, focus_areas, trend, rules_version, as_of)
    VALUES (${brokerId}, ${weekStart}, ${"2026-W47"}, ${score}, ${0.8}, ${false}, ${JSON.stringify(metrics)}::jsonb, ${"[]"}::jsonb, ${"{}"}::jsonb, ${"v1"}, now())
  `;
}

beforeAll(async () => {
  testDb = await startTestDatabase();
  await testDb.sql.unsafe(COACH_SCHEMA_SQL);
  await snapshotRow(current, PREVIOUS, 40, 0.2);
  await snapshotRow(current, LATEST, 82.6, 0.734);
  await snapshotRow(onlyLastWeek, PREVIOUS, 90, 0.9);
  await snapshotRow(noScore, LATEST, null, 0.5);
  await snapshotRow(noFollowUp, LATEST, 70, null);
  await snapshotRow(outOfRange, LATEST, 120, 1.4);
  await snapshotRow(notAsked, LATEST, 50, 0.5);
  coach = createDb(coachPortalUrl(testDb.url), { max: 1 });
}, 120_000);

afterAll(async () => {
  await coach?.close();
  await testDb?.stop();
});

describe("getBrokerHealth with HEALTH_SOURCE=coach on coach-api's schema", () => {
  it("reads each broker's row in the latest weekly snapshot over the coach_portal login", async () => {
    const asked = [current, onlyLastWeek, noScore, noFollowUp, outOfRange, notInSnapshot];
    const health = await getBrokerHealth({ db: testDb.db, coachDb: coach.db as Database, healthSource: "coach" }, asked);
    expect(Object.fromEntries(health)).toEqual({
      [current]: { score: 83, followUpScore: 73 },
      [onlyLastWeek]: null,
      [noScore]: null,
      [noFollowUp]: null,
      [outOfRange]: { score: 100, followUpScore: 100 },
      [notInSnapshot]: null,
    });
    expect(health.has(notAsked)).toBe(false);
  });

  it("runs as coach_portal, which can read the snapshot but not the portal's tables", async () => {
    const [role] = await coach.sql<{ user: string }[]>`SELECT current_user AS user`;
    expect(role!.user).toBe("coach_portal");
    await expect(coach.sql`SELECT count(*) FROM coach.weekly_snapshot`).resolves.toHaveLength(1);
    await expect(coach.sql`SELECT count(*) FROM public.brokers`).rejects.toThrow(/permission denied/);
  });

  it("returns null for everyone without failing when the coach query fails", async () => {
    await testDb.sql`REVOKE SELECT ON coach.weekly_snapshot FROM coach_portal`;
    try {
      const warnings: unknown[] = [];
      const health = await getBrokerHealth(
        { db: testDb.db, coachDb: coach.db as Database, healthSource: "coach", log: { warn: (...args: unknown[]) => warnings.push(args) } },
        [current],
      );
      expect(health.get(current)).toBeNull();
      expect(warnings).toHaveLength(1);
    } finally {
      await testDb.sql`GRANT SELECT ON coach.weekly_snapshot TO coach_portal`;
    }
  });
});
