/**
 * File: apps/api/test/coaching-coach-portal.int.test.ts
 * Purpose: Integration test for the Coaching section against coach-api's real tables and the coach_portal role's real
 * grants (copied from coach-api migrations 1764072000000_events, 1764110000000_engine, 1764120000000_ai-layer,
 * 1764130000000_portal-access and 1764190000000_config-v8-playbook: SELECT on config, SELECT (id, name) on leads), with
 * COACH_DATABASE_URL logging in as coach_portal. It checks that the app opens one
 * coach_portal connection even with HEALTH_SOURCE=none, that the Coaching store and the lead-matching health adapter
 * both use that same connection, that it reads lead names and the playbook but no other lead column, and that every Coaching route (overview, broker page, pulse insert and update, excuse
 * confirm then reject, the broker's own page) works within coach_portal's grants.
 *
 * Functions:
 * - asCoachPortal(url): the test database URL with coach_portal's login in place of the owner's.
 */
import { brokers } from "@bp/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getBrokerHealth } from "../src/services/match/health";
import { createTestContext, OWNER, type TestContext } from "./helpers/context";

const COACH_PORTAL_PASSWORD = "coach-portal-test-password";

const COACH_SCHEMA_SQL = `
CREATE SCHEMA coach;
CREATE FUNCTION coach.events_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'coach.events is append-only';
END
$$;
CREATE TABLE coach.call_reviews (
  call_id text PRIMARY KEY, lead_id text, broker_id uuid, call_type text NOT NULL, rubric jsonb NOT NULL, overall numeric,
  promises jsonb NOT NULL DEFAULT '[]'::jsonb, next_step jsonb, coaching_note text, model text NOT NULL,
  prompt_version text NOT NULL, reviewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE coach.config (
  rules_version text PRIMARY KEY, weights jsonb NOT NULL, targets jsonb NOT NULL, windows jsonb NOT NULL,
  min_samples jsonb NOT NULL, playbook jsonb NOT NULL, points jsonb, active_from timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE coach.leads (id text PRIMARY KEY, broker_id uuid, priority text, name text, setter_outcome text);
CREATE TABLE coach.weekly_snapshot (
  broker_id uuid NOT NULL, week_start date NOT NULL, iso_week text NOT NULL, score numeric, coverage numeric NOT NULL,
  provisional boolean NOT NULL, metrics jsonb NOT NULL, focus_areas jsonb NOT NULL, trend jsonb NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb, rules_version text NOT NULL, as_of timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (broker_id, week_start)
);
CREATE TABLE coach.excuse_checks (
  moment_key text PRIMARY KEY, lead_id text NOT NULL, broker_id uuid, due_at timestamptz NOT NULL, due_reason text NOT NULL,
  excused boolean NOT NULL, needs_confirmation boolean NOT NULL DEFAULT false, reason text, quote text, source_id text,
  source_kind text, model text NOT NULL, prompt_version text NOT NULL, checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE coach.manager_pulse (
  broker_id uuid NOT NULL, week_start date NOT NULL, reviewer_user_id uuid NOT NULL, reviewer_name text NOT NULL,
  engagement smallint NOT NULL CHECK (engagement BETWEEN 1 AND 5), attitude smallint NOT NULL CHECK (attitude BETWEEN 1 AND 5),
  support_needed text NOT NULL DEFAULT '' CHECK (length(support_needed) <= 2000), created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (broker_id, week_start)
);
CREATE TABLE coach.excuse_decisions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, moment_key text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('confirm', 'reject')), decided_by_user_id uuid NOT NULL,
  decided_by_name text NOT NULL, decided_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX excuse_decisions_moment_idx ON coach.excuse_decisions (moment_key, decided_at DESC);
CREATE TRIGGER excuse_decisions_no_update_delete
  BEFORE UPDATE OR DELETE ON coach.excuse_decisions
  FOR EACH ROW EXECUTE FUNCTION coach.events_append_only();
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'coach_portal') THEN
    CREATE ROLE coach_portal NOLOGIN;
  END IF;
END
$$;
GRANT USAGE ON SCHEMA coach TO coach_portal;
GRANT SELECT ON coach.weekly_snapshot, coach.excuse_checks, coach.call_reviews, coach.config TO coach_portal;
GRANT SELECT (id, name) ON coach.leads TO coach_portal;
GRANT SELECT, INSERT, UPDATE ON coach.manager_pulse TO coach_portal;
GRANT SELECT, INSERT ON coach.excuse_decisions TO coach_portal;
GRANT USAGE ON SEQUENCE coach.excuse_decisions_id_seq TO coach_portal;
ALTER ROLE coach_portal WITH LOGIN CONNECTION LIMIT 10 PASSWORD '${COACH_PORTAL_PASSWORD}';
`;

function asCoachPortal(url: string): string {
  const parsed = new URL(url);
  parsed.username = "coach_portal";
  parsed.password = COACH_PORTAL_PASSWORD;
  return parsed.toString();
}

let ctx: TestContext;
let owner: string;
let brokerA: Awaited<ReturnType<TestContext["createBroker"]>>;
let brokerB: Awaited<ReturnType<TestContext["createBroker"]>>;

beforeAll(async () => {
  ctx = await createTestContext({ coachDatabaseUrl: asCoachPortal, env: { COACHING_BROKER_VIEW: "true", HEALTH_SOURCE: "none" } });
  await ctx.sql.unsafe(COACH_SCHEMA_SQL);
  owner = await ctx.login(OWNER.email, OWNER.password);
  brokerA = await ctx.createBroker({ name: "Coached A", email: "coached.a@example.com" });
  brokerB = await ctx.createBroker({ name: "Coached B", email: "coached.b@example.com" });
  const metrics = JSON.stringify({
    on_time_touches: { value: 0.75, target: 0.8, status: "amber", sample: 8, window_days: 28 },
    speed_to_follow: { value: 62, target: 60, status: "green", sample: 5, window_days: 90 },
  });
  for (const [brokerId, week, score] of [
    [brokerA.brokerId, "2026-11-09", 70],
    [brokerA.brokerId, "2026-11-16", 88],
    [brokerB.brokerId, "2026-11-16", 52],
  ] as const) {
    await ctx.sql`
      INSERT INTO coach.weekly_snapshot (broker_id, week_start, iso_week, score, coverage, provisional, metrics, focus_areas, trend, context, rules_version, as_of)
      VALUES (${brokerId}, ${week}, ${week === "2026-11-16" ? "2026-W47" : "2026-W46"}, ${score}, ${0.9}, ${false}, ${metrics}::jsonb, ${"[]"}::jsonb, ${"{}"}::jsonb,
        ${JSON.stringify({ calls_reviewed: brokerId === brokerA.brokerId ? 3 : 2 })}::jsonb, ${"v3"}, now())`;
  }
  await ctx.sql`
    INSERT INTO coach.call_reviews (call_id, lead_id, broker_id, call_type, rubric, overall, model, prompt_version, reviewed_at)
    VALUES (${"call-1"}, ${"L1"}, ${brokerA.brokerId}, ${"consultation"}, ${"{}"}::jsonb, ${4.2}, ${"m"}, ${"p1"}, ${"2026-11-18T12:00:00Z"})`;
  await ctx.sql`
    INSERT INTO coach.excuse_checks (moment_key, lead_id, broker_id, due_at, due_reason, excused, needs_confirmation, reason, quote, source_kind, model, prompt_version)
    VALUES (${"LB:idle:2026-11-20T15:00:00.000Z"}, ${"LB"}, ${brokerB.brokerId}, ${"2026-11-20T15:00:00Z"}, ${"idle"}, ${true}, ${true}, ${"client travelling"}, ${"Away until the 30th"}, ${"note"}, ${"m"}, ${"p1"})`;
}, 180_000);

afterAll(() => ctx?.close());

describe("one coach_portal connection for Coaching and lead matching", () => {
  it("is opened from COACH_DATABASE_URL even with HEALTH_SOURCE=none, and logs in as coach_portal", async () => {
    expect(ctx.app.deps.env.HEALTH_SOURCE).toBe("none");
    const coachDb = ctx.app.deps.coachDb;
    expect(coachDb).not.toBeNull();
    expect(ctx.app.deps.coach).not.toBeNull();
    const [row] = await coachDb!.$client<{ user: string }[]>`SELECT current_user AS user`;
    expect(row!.user).toBe("coach_portal");
    await expect(coachDb!.$client`SELECT count(*) FROM public.brokers`).rejects.toThrow(/permission denied/);
  });

  it("reads lead names and the playbook, but no other lead field", async () => {
    await ctx.sql`INSERT INTO coach.leads (id, broker_id, priority, name, setter_outcome) VALUES (${"L-named"}, ${brokerA.brokerId}, ${"Active"}, ${"John Smith"}, ${"Booked"})`;
    await ctx.sql`INSERT INTO coach.config (rules_version, weights, targets, windows, min_samples, playbook) VALUES (${"v8"}, ${"{}"}::jsonb, ${"{}"}::jsonb, ${"{}"}::jsonb, ${"{}"}::jsonb, ${JSON.stringify({ responsiveness: { topic: "Same-day replies", question: "Q", agree: ["A"] } })}::jsonb)`;
    const coach = ctx.app.deps.coach!;
    expect(await coach.leadNames(["L-named", "missing"])).toEqual(new Map([["L-named", "John Smith"]]));
    expect(await coach.playbook()).toMatchObject({ responsiveness: { topic: "Same-day replies" } });
    const coachDb = ctx.app.deps.coachDb!;
    await expect(coachDb.$client`SELECT priority FROM coach.leads`).rejects.toThrow(/permission denied/);
    await expect(coachDb.$client`SELECT setter_outcome FROM coach.leads`).rejects.toThrow(/permission denied/);
  });

  it("serves lead-matching health over the same connection", async () => {
    const health = await getBrokerHealth({ db: ctx.db, coachDb: ctx.app.deps.coachDb, healthSource: "coach" }, [brokerA.brokerId, brokerB.brokerId]);
    expect(health.get(brokerA.brokerId)).toEqual({ score: 88, followUpScore: 75 });
    expect(health.get(brokerB.brokerId)).toEqual({ score: 52, followUpScore: 75 });
  });
});

describe("Coaching routes within coach_portal's grants", () => {
  it("shows the team overview for the latest week", async () => {
    const res = await ctx.call("GET", "/v1/admin/coaching/overview", { cookie: owner });
    expect(res.statusCode).toBe(200);
    expect(res.json().brokers.map((b: { name: string }) => b.name)).toEqual(["Coached A", "Coached B"]);
    expect(Array.isArray(res.json().needsOneOnOne)).toBe(true);
    expect(res.json().totals.callsReviewed).toBe(5);
    expect(res.json().brokers[0].metrics.speed_to_follow).toMatchObject({ value: 62, windowDays: 90 });
  });

  it("shows a broker's page with their history and the excuse waiting for a decision", async () => {
    const res = await ctx.call("GET", `/v1/admin/coaching/brokers/${brokerB.brokerId}?week=2026-11-16`, { cookie: owner });
    expect(res.statusCode).toBe(200);
    expect(res.json().excuses).toHaveLength(1);
    expect(res.json().excuses[0].needsConfirmation).toBe(true);
    const history = await ctx.call("GET", `/v1/admin/coaching/brokers/${brokerA.brokerId}`, { cookie: owner });
    expect(history.statusCode).toBe(200);
  });

  it("saves Shelly's pulse, then updates it (INSERT and UPDATE on manager_pulse)", async () => {
    const url = `/v1/admin/coaching/brokers/${brokerA.brokerId}/pulse`;
    expect((await ctx.call("PUT", url, { cookie: owner, body: { weekStart: "2026-11-16", engagement: 3, attitude: 4, supportNeeded: "First" } })).statusCode).toBe(200);
    expect((await ctx.call("PUT", url, { cookie: owner, body: { weekStart: "2026-11-16", engagement: 5, attitude: 5, supportNeeded: "Second" } })).statusCode).toBe(200);
    const rows = await ctx.sql<{ engagement: number; support_needed: string }[]>`
      SELECT engagement, support_needed FROM coach.manager_pulse WHERE broker_id = ${brokerA.brokerId} AND week_start = ${"2026-11-16"}`;
    expect(rows.map((row) => [row.engagement, row.support_needed])).toEqual([[5, "Second"]]);
  });

  it("confirms and then rejects an excuse, appending both decisions", async () => {
    const momentKey = "LB:idle:2026-11-20T15:00:00.000Z";
    expect((await ctx.call("POST", "/v1/admin/coaching/excuses/decision", { cookie: owner, body: { momentKey, decision: "confirm" } })).statusCode).toBe(200);
    expect((await ctx.call("POST", "/v1/admin/coaching/excuses/decision", { cookie: owner, body: { momentKey, decision: "reject" } })).statusCode).toBe(200);
    const decisions = await ctx.sql<{ decision: string }[]>`SELECT decision FROM coach.excuse_decisions WHERE moment_key = ${momentKey} ORDER BY id`;
    expect(decisions.map((row) => row.decision)).toEqual(["confirm", "reject"]);
    const page = await ctx.call("GET", `/v1/admin/coaching/brokers/${brokerB.brokerId}?week=2026-11-16`, { cookie: owner });
    expect(page.json().excuses[0].decision).toBe("reject");
  });

  it("shows a broker their own page", async () => {
    const res = await ctx.call("GET", "/v1/me/coaching", { cookie: brokerA.cookie });
    expect(res.statusCode).toBe(200);
    expect(res.json().broker.brokerId).toBe(brokerA.brokerId);
    expect(res.json().snapshot.score).toBe(88);
    const [stored] = await ctx.db.select({ id: brokers.id }).from(brokers).where(eq(brokers.id, brokerA.brokerId));
    expect(stored!.id).toBe(brokerA.brokerId);
  });
});
