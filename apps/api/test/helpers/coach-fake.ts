/**
 * File: apps/api/test/helpers/coach-fake.ts
 * Purpose: An in-memory stand-in for the coach service's store, so Coaching routes and views can be tested without the
 * coach database. Snapshots, excuses, pulses, the playbook, lead names and targets are plain seed values the test fills in;
 * decisions, pulses, target changes and topic overrides are recorded.
 *
 * Functions:
 * - snapshot(brokerId, weekStart, overrides): a weekly snapshot row with sensible defaults.
 * - latest(rows): the newest override per broker and week, like the real store's DISTINCT ON.
 * - createFakeCoachStore(seed): returns a store with the same methods as the real one, backed by the seed arrays.
 */
import type { CoachStore, ExcuseRow, PulseRow, SnapshotRow, TopicOverrideRow } from "../../src/services/coaching/store";

export function snapshot(brokerId: string, weekStart: string, overrides: Partial<SnapshotRow> = {}): SnapshotRow {
  return {
    brokerId,
    weekStart,
    isoWeek: "2026-W47",
    score: 72,
    coverage: 0.8,
    provisional: false,
    metrics: {
      on_time_touches: { value: 0.6, target: 0.8, status: "red", sample: 10, evidence: [{ leadId: "lead1", at: "2026-11-20T15:00:00.000Z", note: "missed idle due" }] },
      speed_to_follow: {
        value: 55,
        target: 60,
        status: "amber",
        sample: 4,
        window_days: 90,
        detail: { median_work_minutes_to_next_touch: 40, first_calls_value: 50, first_calls_sample: 2 },
      },
    },
    focusAreas: [{ metric: "on_time_touches", action: "Go through the pipeline together", evidence: [{ leadId: "lead1", at: "2026-11-20T15:00:00.000Z", note: "missed idle due" }] }],
    trend: { score: -3 },
    context: { deals_closed_28d: 1, calls_reviewed: 3 },
    ...overrides,
  };
}

function latest(rows: TopicOverrideRow[]): TopicOverrideRow[] {
  const byKey = new Map<string, TopicOverrideRow>();
  for (const r of rows) {
    const k = `${r.brokerId}|${r.weekStart}`;
    if (!byKey.has(k) || byKey.get(k)!.setAt <= r.setAt) byKey.set(k, r);
  }
  return [...byKey.values()];
}

export function createFakeCoachStore(
  seed: {
    snapshots?: SnapshotRow[];
    excuses?: ExcuseRow[];
    pulses?: PulseRow[];
    playbook?: Record<string, unknown>;
    leadNames?: Record<string, string>;
    targets?: Record<string, number>;
    overrides?: TopicOverrideRow[];
  } = {},
) {
  const overrides = seed.overrides ?? [];
  const targets = new Map(Object.entries(seed.targets ?? {}).map(([metric, target]) => [metric, { metric, target, updatedByName: "Initial targets", updatedAt: "2026-11-26T12:00:00.000Z" }]));
  const targetChanges: Array<{ metric: string; oldTarget: number | null; newTarget: number; changedByName: string; changedAt: string }> = [];
  const snapshots = seed.snapshots ?? [];
  const excuses = seed.excuses ?? [];
  const pulses = seed.pulses ?? [];
  const decisions: Array<{ momentKey: string; decision: string; userId: string }> = [];
  const store: CoachStore = {
    weeks: async () =>
      [...new Map(snapshots.map((s) => [s.weekStart, { weekStart: s.weekStart, isoWeek: s.isoWeek }])).values()].sort((a, b) => b.weekStart.localeCompare(a.weekStart)),
    snapshots: async (weekStart) => snapshots.filter((s) => s.weekStart === weekStart),
    brokerHistory: async (brokerId, upTo, count) =>
      snapshots.filter((s) => s.brokerId === brokerId && s.weekStart <= upTo).sort((a, b) => b.weekStart.localeCompare(a.weekStart)).slice(0, count),
    playbook: async () => seed.playbook ?? {},
    leadNames: async (ids) => new Map(ids.flatMap((id) => (seed.leadNames?.[id] ? [[id, seed.leadNames[id]!] as [string, string]] : []))),
    excusesToConfirm: async () => excuses.filter((e) => e.needsConfirmation && !e.decision).length,
    excuses: async (brokerId) => excuses.filter((e) => e.brokerId === brokerId),
    excuseBroker: async (momentKey) => excuses.find((e) => e.momentKey === momentKey)?.brokerId ?? null,
    decideExcuse: async (input) => void decisions.push({ momentKey: input.momentKey, decision: input.decision, userId: input.userId }),
    pulse: async (brokerId, weekStart) => pulses.find((p) => p.brokerId === brokerId && p.weekStart === weekStart) ?? null,
    pulses: async (brokerId) => pulses.filter((p) => p.brokerId === brokerId),
    savePulse: async (input) => {
      const i = pulses.findIndex((p) => p.brokerId === input.brokerId && p.weekStart === input.weekStart);
      const row = { brokerId: input.brokerId, weekStart: input.weekStart, engagement: input.engagement, attitude: input.attitude, supportNeeded: input.supportNeeded, reviewerName: input.userName, updatedAt: new Date().toISOString() };
      if (i >= 0) pulses[i] = row;
      else pulses.push(row);
    },
    targets: async () => [...targets.values()],
    targetChanges: async (limit) => targetChanges.slice(0, limit),
    setTarget: async (input) => {
      const row = targets.get(input.metric);
      if (!row) return null;
      const changedAt = new Date().toISOString();
      targets.set(input.metric, { metric: input.metric, target: input.target, updatedByName: input.userName, updatedAt: changedAt });
      targetChanges.unshift({ metric: input.metric, oldTarget: row.target, newTarget: input.target, changedByName: input.userName, changedAt });
      return { oldTarget: row.target };
    },
    topicOverrides: async (weekStarts, brokerId) =>
      latest(overrides.filter((o) => weekStarts.includes(o.weekStart) && (!brokerId || o.brokerId === brokerId))),
    brokerTopicOverrides: async (brokerId) => latest(overrides.filter((o) => o.brokerId === brokerId)),
    setTopicOverride: async (input) =>
      void overrides.push({ brokerId: input.brokerId, weekStart: input.weekStart, topic: input.topic, note: input.note, setByName: input.userName, setAt: new Date(Date.now() + overrides.length).toISOString() }),
  } satisfies CoachStore;
  return { store, decisions, pulses, targetChanges, overrides };
}
