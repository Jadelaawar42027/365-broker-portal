/**
 * File: apps/api/src/services/coaching/view.ts
 * Purpose: Turns the coach service's weekly snapshots into the Coaching screens' responses (team overview and broker
 * page). Pure functions: the store does the reading, so these are unit-tested without a database. No score is
 * computed here; snapshot numbers are passed through.
 *
 * Functions:
 * - toWeek(row): a { weekStart, isoWeek, weekNumber } from a snapshot week.
 * - ghlContactUrl(locationId, leadId): the lead's contact page in GoHighLevel, or null without a location id.
 * - cell(snapshot, metric): one metric's value, its own 0-100 points, target (and whether it is a placeholder), status, sample and window (28, 90 or 365 days) from a snapshot (Unknown when missing; no points before rules v4).
 * - focusMetrics(snapshot): the snapshot's focus areas as known metric ids with their playbook action.
 * - median(values): the median of a list of numbers, or null for an empty list.
 * - sumContext(snapshots, key): the sum of a numeric context figure across snapshots, or null when none has it.
 * - cellsOf(snapshot): every metric's cell from a snapshot, keyed by metric.
 * - oneOnOneCells(snapshot): every metric's status, value, target, points, weight, detail and evidence, for the 1:1 details.
 * - coachingEntries(playbook): the playbook's coaching entries (topic, question, things to agree) by metric; plain strings are skipped.
 * - evidenceLeadIds(snapshots): every lead id behind the behaviour metrics' evidence, to look up their names.
 * - toOverride(row): a stored topic override as the 1:1 logic takes it (set by the admin's first name), or null.
 * - topicSource(focus): where a week's topic came from (behaviour gap, results review or an admin's override), for the broker page.
 * - buildOverview(input): the team overview: totals (calls reviewed summed from the snapshots, by call date), who needs a 1:1 (full scores only, highest first, with plain-language details: last week's focus, what's slipping with example leads, results and this week's focus), and every broker's row (full scores highest first, then provisional highest first, then no score A-Z).
 * - buildBrokerPage(input): one broker's page: header numbers, focus areas with evidence, all metrics with an 8-week history, excused misses, the week's 1:1 topic (override, results review or behaviour gap, as on the overview), results context, pulse and 1:1 history with each week's topic and who set it.
 */
import {
  COACHING_METRICS,
  coachingMetricSchema,
  BEHAVIOUR_METRICS,
  buildOneOnOneDetails,
  compareCoachingRows,
  type CoachingEntry,
  type OneOnOneCell,
  needsOneOnOneReason,
  oneOnOneTopic,
  scoreGroup,
  weeklyFocus,
  type TopicOverride,
  type WeeklyFocus,
  type CoachingBrokerResponse,
  type CoachingMetricId,
  type CoachingOverviewResponse,
  type CoachingStatus,
  type CoachingWeek,
} from "@bp/shared";
import type { ExcuseRow, PulseRow, SnapshotRow, TopicOverrideRow } from "./store";

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
  return { value: m?.value ?? null, points: typeof m?.points === "number" ? m.points : null, weight: typeof m?.weight === "number" ? m.weight : null, target: m?.target ?? null, targetPlaceholder: m?.target_placeholder === true, status, sample: m?.sample ?? 0, windowDays: typeof m?.window_days === "number" ? m.window_days : null };
}

function cellsOf(snapshot: SnapshotRow) {
  return Object.fromEntries(COACHING_METRICS.map((m) => [m, cell(snapshot, m)])) as Record<CoachingMetricId, ReturnType<typeof cell>>;
}

function oneOnOneCells(snapshot: SnapshotRow): Partial<Record<CoachingMetricId, OneOnOneCell>> {
  return Object.fromEntries(
    COACHING_METRICS.map((m) => {
      const c = cell(snapshot, m);
      const raw = snapshot.metrics[m];
      return [m, { status: c.status, value: c.value, target: c.target, points: c.points, weight: c.weight, detail: raw?.detail ?? null, evidence: raw?.evidence ?? [] }];
    }),
  );
}

function coachingEntries(playbook: Record<string, unknown>): Partial<Record<CoachingMetricId, CoachingEntry>> {
  const out: Partial<Record<CoachingMetricId, CoachingEntry>> = {};
  for (const m of COACHING_METRICS) {
    const e = playbook[m] as Partial<CoachingEntry> | string | undefined;
    if (e && typeof e === "object" && typeof e.topic === "string") {
      out[m] = { topic: e.topic, question: typeof e.question === "string" ? e.question : "", agree: Array.isArray(e.agree) ? e.agree.filter((a): a is string => typeof a === "string") : [] };
    }
  }
  return out;
}

export function evidenceLeadIds(snapshots: SnapshotRow[]): string[] {
  return [...new Set(snapshots.flatMap((s) => BEHAVIOUR_METRICS.flatMap((m) => (s.metrics[m]?.evidence ?? []).map((e) => e.leadId))))];
}

function sumContext(snapshots: SnapshotRow[], key: string): number | null {
  const values = snapshots.map((s) => s.context[key]).filter((v): v is number => typeof v === "number");
  return values.length ? values.reduce((a, b) => a + b, 0) : null;
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

export function toOverride(row: TopicOverrideRow | undefined): TopicOverride | null {
  if (!row) return null;
  return { topic: row.topic, note: row.note, setBy: row.setByName.trim().split(/\s+/)[0] ?? row.setByName };
}

function topicSource(focus: WeeklyFocus | null) {
  return focus ? { source: focus.source, setBy: focus.setBy, note: focus.note, automaticTopic: focus.automaticTopic } : null;
}

export function buildOverview(input: {
  weeks: Array<{ weekStart: string; isoWeek: string }>;
  week: { weekStart: string; isoWeek: string } | null;
  snapshots: SnapshotRow[];
  brokers: Map<string, PortalBroker>;
  excusesToConfirm: number;
  previousSnapshots?: SnapshotRow[];
  twoBackSnapshots?: SnapshotRow[];
  playbook?: Record<string, unknown>;
  leadNames?: Map<string, string>;
  ghlLocationId?: string;
  overrides?: TopicOverrideRow[];
}): CoachingOverviewResponse {
  const overrideOf = (s: SnapshotRow | undefined) =>
    s ? toOverride((input.overrides ?? []).find((o) => o.brokerId === s.brokerId && o.weekStart === s.weekStart)) : null;
  const playbook = coachingEntries(input.playbook ?? {});
  const byBroker = (list: SnapshotRow[] | undefined) => new Map((list ?? []).map((s) => [s.brokerId, s]));
  const previous = byBroker(input.previousSnapshots);
  const twoBack = byBroker(input.twoBackSnapshots);
  const current = byBroker(input.snapshots);
  const portalSnapshots = input.snapshots.filter((s) => input.brokers.has(s.brokerId));
  const rows = portalSnapshots
    .map((s) => {
      const broker = input.brokers.get(s.brokerId)!;
      const metrics = cellsOf(s) as CoachingOverviewResponse["brokers"][number]["metrics"];
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
        topic: oneOnOneTopic(metrics, focusMetrics(s)),
      };
    })
    .sort(compareCoachingRows);

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
      medianFollowMinutes: median(
        portalSnapshots
          .map((s) => s.metrics.speed_to_follow?.detail?.median_work_minutes_to_next_touch)
          .filter((v): v is number => typeof v === "number"),
      ),
      callsReviewed: sumContext(portalSnapshots, "calls_reviewed"),
      excusesToConfirm: input.excusesToConfirm,
    },
    needsOneOnOne: rows.flatMap((r) => {
      if (scoreGroup(r) !== "full") return [];
      const reason = needsOneOnOneReason(r);
      if (!reason) return [];
      const prev = previous.get(r.brokerId);
      const back = twoBack.get(r.brokerId);
      const details = buildOneOnOneDetails({
        current: oneOnOneCells(current.get(r.brokerId)!),
        previous: prev ? oneOnOneCells(prev) : null,
        twoBack: back ? oneOnOneCells(back) : null,
        playbook,
        leadName: (id) => input.leadNames?.get(id) ?? null,
        ghlUrl: (id) => ghlContactUrl(input.ghlLocationId, id),
        override: overrideOf(current.get(r.brokerId)),
        previousOverride: overrideOf(prev),
        twoBackOverride: overrideOf(back),
      });
      return [{ brokerId: r.brokerId, name: r.name, score: r.score, provisional: r.provisional, trend: r.trend, reason, topic: details.focus?.topic ?? null, details }];
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
  playbook?: Record<string, unknown>;
  overrides?: TopicOverrideRow[];
}): CoachingBrokerResponse {
  const entries = coachingEntries(input.playbook ?? {});
  const focusOf = (h: SnapshotRow) => weeklyFocus(oneOnOneCells(h), entries, toOverride((input.overrides ?? []).find((o) => o.weekStart === h.weekStart)));
  const currentFocus = input.week ? (input.history.find((h) => h.weekStart === input.week!.weekStart) ?? null) : null;
  const weekFocus = currentFocus ? focusOf(currentFocus) : null;
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
          return { metric: f.metric, value: c.value, points: c.points, target: c.target, targetPlaceholder: c.targetPlaceholder, status: c.status, action: f.action, evidence: evidence.slice(0, 5).map(withLink) };
        })
      : [],
    metrics: current
      ? COACHING_METRICS.map((m) => ({ metric: m, ...cell(current, m), detail: current.metrics[m]?.detail ?? null, history: oldestFirst.map((h) => cell(h, m).value) }))
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
    topic: weekFocus?.topic ?? null,
    topicSource: topicSource(weekFocus),
    context: current?.context ?? {},
    pulse: toPulse(input.pulse),
    history: input.history.map((h) => ({
      weekStart: h.weekStart,
      isoWeek: h.isoWeek,
      ...(() => {
        const f = focusOf(h);
        return { topic: f?.topic ?? null, topicSource: topicSource(f) };
      })(),
      pulse: toPulse(pulseByWeek.get(h.weekStart)),
    })),
  };
}
