/**
 * File: apps/api/src/services/coaching/view.ts
 * Purpose: Turns the coach service's weekly snapshots into the Coaching screens' responses (team overview and broker
 * page). Pure functions: the store does the reading, so these are unit-tested without a database. No score is
 * computed here; snapshot numbers are passed through.
 *
 * Functions:
 * - toWeek(row): a { weekStart, isoWeek, weekNumber } from a snapshot week.
 * - ghlContactUrl(locationId, leadId): the lead's contact page in GoHighLevel, or null without a location id.
 * - cell(snapshot, metric): one metric's value, target, status and sample from a snapshot (Unknown when missing).
 * - focusMetrics(snapshot): the snapshot's focus areas as known metric ids with their playbook action.
 * - median(values): the median of a list of numbers, or null for an empty list.
 * - buildOverview(input): the team overview: totals, who needs a 1:1, and every broker's row (worst score first).
 * - buildBrokerPage(input): one broker's page: header numbers, focus areas with evidence, all metrics with an 8-week history, excused misses, topic, results context, pulse and 1:1 history.
 */
import {
  COACHING_METRICS,
  coachingMetricSchema,
  needsOneOnOneReason,
  suggestedTopic,
  type CoachingBrokerResponse,
  type CoachingMetricId,
  type CoachingOverviewResponse,
  type CoachingStatus,
  type CoachingWeek,
} from "@bp/shared";
import type { ExcuseRow, PulseRow, SnapshotRow } from "./store";

export type PortalBroker = { brokerId: string; name: string; level: string; status: string };

const STATUSES: ReadonlySet<string> = new Set(["green", "amber", "red", "unknown"]);

export function toWeek(row: { weekStart: string; isoWeek: string }): CoachingWeek {
  return { weekStart: row.weekStart, isoWeek: row.isoWeek, weekNumber: Number(row.isoWeek.split("-W")[1] ?? 0) };
}

export function ghlContactUrl(locationId: string | undefined, leadId: string): string | null {
  return locationId ? `https://app.gohighlevel.com/v2/location/${encodeURIComponent(locationId)}/contacts/detail/${encodeURIComponent(leadId)}` : null;
}

function cell(snapshot: SnapshotRow, metric: CoachingMetricId) {
  const m = snapshot.metrics[metric];
  const status = (m && STATUSES.has(m.status) ? m.status : "unknown") as CoachingStatus;
  return { value: m?.value ?? null, target: m?.target ?? null, status, sample: m?.sample ?? 0 };
}

function focusMetrics(snapshot: SnapshotRow): Array<{ metric: CoachingMetricId; action: string | null }> {
  return snapshot.focusAreas.flatMap((f) => {
    const parsed = coachingMetricSchema.safeParse(f.metric);
    return parsed.success ? [{ metric: parsed.data, action: f.action ?? null }] : [];
  });
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function buildOverview(input: {
  weeks: Array<{ weekStart: string; isoWeek: string }>;
  week: { weekStart: string; isoWeek: string } | null;
  snapshots: SnapshotRow[];
  brokers: Map<string, PortalBroker>;
  callsReviewed: number;
  excusesToConfirm: number;
}): CoachingOverviewResponse {
  const rows = input.snapshots
    .filter((s) => input.brokers.has(s.brokerId))
    .map((s) => {
      const broker = input.brokers.get(s.brokerId)!;
      const metrics = Object.fromEntries(COACHING_METRICS.map((m) => [m, cell(s, m)])) as CoachingOverviewResponse["brokers"][number]["metrics"];
      return {
        brokerId: s.brokerId,
        name: broker.name,
        level: broker.level,
        score: s.score,
        provisional: s.provisional,
        coverage: s.coverage,
        trend: s.trend.score ?? null,
        metrics,
        focus: focusMetrics(s).map((f) => f.metric),
        topic: suggestedTopic(focusMetrics(s)),
      };
    })
    .sort((a, b) => (a.score ?? Number.POSITIVE_INFINITY) - (b.score ?? Number.POSITIVE_INFINITY) || a.name.localeCompare(b.name));

  let met = 0;
  let due = 0;
  for (const s of input.snapshots) {
    const m = s.metrics.on_time_touches as { numerator?: number | null; denominator?: number | null } | undefined;
    if (m?.denominator) {
      met += Number(m.numerator ?? 0);
      due += Number(m.denominator);
    }
  }
  const shareable = rows.filter((r) => !r.provisional && r.score !== null).map((r) => r.score!);

  return {
    configured: true,
    weeks: input.weeks.map(toWeek),
    week: input.week ? toWeek(input.week) : null,
    totals: {
      teamScore: shareable.length ? Math.round(shareable.reduce((a, b) => a + b, 0) / shareable.length) : null,
      onTimeRate: due ? met / due : null,
      medianSpeedMinutes: median(rows.map((r) => r.metrics.speed_to_lead).filter((c) => c.status !== "unknown" && c.value !== null).map((c) => c.value!)),
      callsReviewed: input.callsReviewed,
      excusesToConfirm: input.excusesToConfirm,
    },
    needsOneOnOne: rows.flatMap((r) => {
      const reason = needsOneOnOneReason(r);
      return reason ? [{ brokerId: r.brokerId, name: r.name, score: r.score, provisional: r.provisional, trend: r.trend, reason, topic: r.topic }] : [];
    }),
    brokers: rows.map(({ topic: _topic, ...r }) => r),
  };
}

export function buildBrokerPage(input: {
  weeks: Array<{ weekStart: string; isoWeek: string }>;
  week: { weekStart: string; isoWeek: string } | null;
  broker: PortalBroker;
  history: SnapshotRow[];
  excuses: ExcuseRow[];
  pulse: PulseRow | null;
  pulses: PulseRow[];
  ghlLocationId: string | undefined;
}): CoachingBrokerResponse {
  const current = input.week ? (input.history.find((h) => h.weekStart === input.week!.weekStart) ?? null) : null;
  const oldestFirst = [...input.history].slice(0, 8).reverse();
  const withLink = (e: { leadId: string; at: string; note: string }) => ({ leadId: e.leadId, at: e.at, note: e.note, ghlUrl: ghlContactUrl(input.ghlLocationId, e.leadId) });
  const toPulse = (p: PulseRow | null | undefined) =>
    p ? { engagement: p.engagement, attitude: p.attitude, supportNeeded: p.supportNeeded, reviewerName: p.reviewerName, updatedAt: p.updatedAt } : null;
  const pulseByWeek = new Map(input.pulses.map((p) => [p.weekStart, p]));
  const focus = current ? focusMetrics(current) : [];

  return {
    configured: true,
    weeks: input.weeks.map(toWeek),
    week: input.week ? toWeek(input.week) : null,
    broker: input.broker,
    snapshot: current ? { score: current.score, provisional: current.provisional, coverage: current.coverage, trend: current.trend.score ?? null } : null,
    focusAreas: current
      ? focus.map((f) => {
          const c = cell(current, f.metric);
          const evidence = current.focusAreas.find((x) => x.metric === f.metric)?.evidence ?? current.metrics[f.metric]?.evidence ?? [];
          return { metric: f.metric, value: c.value, target: c.target, status: c.status, action: f.action, evidence: evidence.slice(0, 5).map(withLink) };
        })
      : [],
    metrics: current
      ? COACHING_METRICS.map((m) => ({ metric: m, ...cell(current, m), history: oldestFirst.map((h) => cell(h, m).value) }))
      : [],
    excuses: input.excuses.map((e) => ({
      momentKey: e.momentKey,
      leadId: e.leadId,
      dueAt: e.dueAt,
      dueReason: e.dueReason,
      reason: e.reason,
      quote: e.quote,
      sourceKind: e.sourceKind,
      needsConfirmation: e.needsConfirmation,
      decision: e.decision,
      decidedBy: e.decidedBy,
      ghlUrl: ghlContactUrl(input.ghlLocationId, e.leadId),
    })),
    topic: suggestedTopic(focus),
    context: current?.context ?? {},
    pulse: toPulse(input.pulse),
    history: input.history.map((h) => ({
      weekStart: h.weekStart,
      isoWeek: h.isoWeek,
      topic: suggestedTopic(focusMetrics(h)),
      pulse: toPulse(pulseByWeek.get(h.weekStart)),
    })),
  };
}
