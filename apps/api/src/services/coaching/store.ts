/**
 * File: apps/api/src/services/coaching/store.ts
 * Purpose: Reads and writes the coach service's tables (schema "coach") through their own connection, made with the
 * least-privilege coach_portal role (COACH_DATABASE_URL). Read-only except Shelly's pulse and excuse decisions.
 * Every query is a postgres.js tagged template, so values are always sent as parameters.
 *
 * Functions:
 * - createCoachStore(url): opens a small pool for the coach database and returns the store.
 * - weeks(): the snapshot weeks available, newest first (up to 26).
 * - snapshots(weekStart): every broker's frozen snapshot for one week.
 * - brokerHistory(brokerId, upToWeekStart, count): one broker's snapshots up to a week, newest first.
 * - callsReviewed(from, to): how many calls got a scored review between two dates.
 * - excusesToConfirm(): broker-note-only excuses that have no decision yet.
 * - excuses(brokerId, from, to): one broker's excused misses due between two dates, with the latest decision.
 * - excuseBroker(momentKey): the broker an excused miss belongs to, or null.
 * - decideExcuse(input): records Shelly's confirm or reject (append-only).
 * - pulse(brokerId, weekStart): Shelly's pulse for a broker and week, or null.
 * - pulses(brokerId): every pulse for a broker, newest first.
 * - savePulse(input): creates or updates the pulse for a broker and week.
 * The store also exposes the pool's close (closed with the app).
 */
import { createDb } from "@bp/db";

export type SnapshotRow = {
  brokerId: string;
  weekStart: string;
  isoWeek: string;
  score: number | null;
  coverage: number;
  provisional: boolean;
  metrics: Record<string, { value: number | null; target: number | null; status: string; sample: number; evidence?: Array<{ leadId: string; at: string; note: string }> }>;
  focusAreas: Array<{ metric: string; action?: string | null; evidence?: Array<{ leadId: string; at: string; note: string }> }>;
  trend: Record<string, number | null>;
  context: Record<string, number | null>;
};

export type ExcuseRow = {
  momentKey: string;
  brokerId: string | null;
  leadId: string;
  dueAt: string;
  dueReason: string;
  reason: string | null;
  quote: string | null;
  sourceKind: string | null;
  needsConfirmation: boolean;
  decision: "confirm" | "reject" | null;
  decidedBy: string | null;
};

export type PulseRow = {
  brokerId: string;
  weekStart: string;
  engagement: number;
  attitude: number;
  supportNeeded: string;
  reviewerName: string;
  updatedAt: string;
};

export type CoachStore = ReturnType<typeof createCoachStore>;

export function createCoachStore(url: string) {
  const { sql, close } = createDb(url, { max: 3 });

  return {
    async weeks(): Promise<Array<{ weekStart: string; isoWeek: string }>> {
      return sql<Array<{ weekStart: string; isoWeek: string }>>`
        SELECT DISTINCT to_char(week_start, 'YYYY-MM-DD') AS "weekStart", iso_week AS "isoWeek"
        FROM coach.weekly_snapshot ORDER BY "weekStart" DESC LIMIT 26`;
    },

    async snapshots(weekStart: string): Promise<SnapshotRow[]> {
      const rows = await sql<SnapshotRow[]>`
        SELECT broker_id AS "brokerId", to_char(week_start, 'YYYY-MM-DD') AS "weekStart", iso_week AS "isoWeek",
               score::float8 AS score, coverage::float8 AS coverage, provisional, metrics, focus_areas AS "focusAreas", trend, context
        FROM coach.weekly_snapshot WHERE week_start = ${weekStart}`;
      return [...rows];
    },

    async brokerHistory(brokerId: string, upToWeekStart: string, count: number): Promise<SnapshotRow[]> {
      const rows = await sql<SnapshotRow[]>`
        SELECT broker_id AS "brokerId", to_char(week_start, 'YYYY-MM-DD') AS "weekStart", iso_week AS "isoWeek",
               score::float8 AS score, coverage::float8 AS coverage, provisional, metrics, focus_areas AS "focusAreas", trend, context
        FROM coach.weekly_snapshot WHERE broker_id = ${brokerId} AND week_start <= ${upToWeekStart}
        ORDER BY week_start DESC LIMIT ${count}`;
      return [...rows];
    },

    async callsReviewed(from: Date, to: Date): Promise<number> {
      const [row] = await sql<Array<{ n: number }>>`
        SELECT count(*)::int AS n FROM coach.call_reviews WHERE overall IS NOT NULL AND reviewed_at > ${from} AND reviewed_at <= ${to}`;
      return row?.n ?? 0;
    },

    async excusesToConfirm(): Promise<number> {
      const [row] = await sql<Array<{ n: number }>>`
        SELECT count(*)::int AS n FROM coach.excuse_checks c
        WHERE c.excused AND c.needs_confirmation
          AND NOT EXISTS (SELECT 1 FROM coach.excuse_decisions d WHERE d.moment_key = c.moment_key)`;
      return row?.n ?? 0;
    },

    async excuses(brokerId: string, from: Date, to: Date): Promise<ExcuseRow[]> {
      const rows = await sql<ExcuseRow[]>`
        SELECT c.moment_key AS "momentKey", c.broker_id AS "brokerId", c.lead_id AS "leadId", c.due_at AS "dueAt",
               c.due_reason AS "dueReason", c.reason, c.quote, c.source_kind AS "sourceKind",
               c.needs_confirmation AS "needsConfirmation", d.decision, d.decided_by_name AS "decidedBy"
        FROM coach.excuse_checks c
        LEFT JOIN LATERAL (
          SELECT decision, decided_by_name FROM coach.excuse_decisions
          WHERE moment_key = c.moment_key ORDER BY decided_at DESC, id DESC LIMIT 1
        ) d ON true
        WHERE c.broker_id = ${brokerId} AND c.excused AND c.due_at > ${from} AND c.due_at <= ${to}
        ORDER BY c.needs_confirmation DESC, c.due_at DESC`;
      return rows.map((r) => ({ ...r, dueAt: new Date(r.dueAt).toISOString() }));
    },

    async excuseBroker(momentKey: string): Promise<string | null> {
      const [row] = await sql<Array<{ brokerId: string | null }>>`
        SELECT broker_id AS "brokerId" FROM coach.excuse_checks WHERE moment_key = ${momentKey} AND excused`;
      return row?.brokerId ?? null;
    },

    async decideExcuse(input: { momentKey: string; decision: "confirm" | "reject"; userId: string; userName: string }): Promise<void> {
      await sql`
        INSERT INTO coach.excuse_decisions (moment_key, decision, decided_by_user_id, decided_by_name)
        VALUES (${input.momentKey}, ${input.decision}, ${input.userId}, ${input.userName})`;
    },

    async pulse(brokerId: string, weekStart: string): Promise<PulseRow | null> {
      const [row] = await sql<PulseRow[]>`
        SELECT broker_id AS "brokerId", to_char(week_start, 'YYYY-MM-DD') AS "weekStart", engagement, attitude,
               support_needed AS "supportNeeded", reviewer_name AS "reviewerName", updated_at AS "updatedAt"
        FROM coach.manager_pulse WHERE broker_id = ${brokerId} AND week_start = ${weekStart}`;
      return row ? { ...row, updatedAt: new Date(row.updatedAt).toISOString() } : null;
    },

    async pulses(brokerId: string): Promise<PulseRow[]> {
      const rows = await sql<PulseRow[]>`
        SELECT broker_id AS "brokerId", to_char(week_start, 'YYYY-MM-DD') AS "weekStart", engagement, attitude,
               support_needed AS "supportNeeded", reviewer_name AS "reviewerName", updated_at AS "updatedAt"
        FROM coach.manager_pulse WHERE broker_id = ${brokerId} ORDER BY week_start DESC LIMIT 26`;
      return rows.map((r) => ({ ...r, updatedAt: new Date(r.updatedAt).toISOString() }));
    },

    async savePulse(input: { brokerId: string; weekStart: string; userId: string; userName: string; engagement: number; attitude: number; supportNeeded: string }): Promise<void> {
      await sql`
        INSERT INTO coach.manager_pulse (broker_id, week_start, reviewer_user_id, reviewer_name, engagement, attitude, support_needed)
        VALUES (${input.brokerId}, ${input.weekStart}, ${input.userId}, ${input.userName}, ${input.engagement}, ${input.attitude}, ${input.supportNeeded})
        ON CONFLICT (broker_id, week_start) DO UPDATE SET reviewer_user_id = EXCLUDED.reviewer_user_id,
          reviewer_name = EXCLUDED.reviewer_name, engagement = EXCLUDED.engagement, attitude = EXCLUDED.attitude,
          support_needed = EXCLUDED.support_needed, updated_at = now()`;
    },

    close,
  };
}
