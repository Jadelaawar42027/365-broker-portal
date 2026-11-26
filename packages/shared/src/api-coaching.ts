/**
 * File: packages/shared/src/api-coaching.ts
 * Purpose: The Coaching section's API contract (team overview, broker page, excuse decisions, Shelly's weekly pulse)
 * and the small pure helpers both the API and the web app use to label and format coaching metrics. The numbers
 * themselves come from the coach service's weekly snapshots; nothing here computes a score.
 *
 * Functions:
 * - coachingMetricGroup(metric): "behaviour" or "results", the half of the score a metric belongs to.
 * - formatCoachingValue(metric, value): "47 min", "82%", "61" (points or a count) or "$1.2M" (closed value) for a metric value, "—" when unknown.
 * - formatCoachingTarget(metric, target): "≤ 30 min" or "≥ 85%" for a target, "—" when there is none.
 * - formatWorkMinutes(value): working minutes as "47 min" or "2.5 h", "—" when unknown.
 * - formatPoints(points): a metric's own 0-100 points as "56", "—" when unknown.
 * - windowLabel(windowDays): "90-day data" (or "12-month data" from 365 days) when a metric was measured over more than 28 days, else null.
 * - scoreBand(score, provisional): the label and tone for a broker's score ("At risk", "Needs attention", "On track", "Provisional").
 * - needsOneOnOneReason(row): why a broker needs a 1:1 this week (a red metric, a drop of 10+ points, thin data), or null.
 * - suggestedTopic(focusAreas): the 1:1 topic from the first focus area and its playbook action, or null.
 */
import { z } from "zod";

export const COACHING_METRICS = [
  "speed_to_follow",
  "on_time_touches",
  "next_step_coverage",
  "call_quality",
  "responsiveness",
  "promises_kept",
  "showings_completed",
  "hot_pipeline",
  "closes",
  "closed_value",
  "showing_conversion",
  "pipeline_movement",
] as const;
export const coachingMetricSchema = z.enum(COACHING_METRICS);
export type CoachingMetricId = z.infer<typeof coachingMetricSchema>;

export const COACHING_METRIC_LABELS: Record<CoachingMetricId, string> = {
  speed_to_follow: "Speed to follow",
  next_step_coverage: "Next step",
  on_time_touches: "On-time touches",
  responsiveness: "Reply time",
  showing_conversion: "Showing conversion",
  call_quality: "Call quality",
  promises_kept: "Promises kept",
  pipeline_movement: "Pipeline movement",
  showings_completed: "Showings completed",
  hot_pipeline: "Hot pipeline",
  closes: "Closes",
  closed_value: "Closed value",
};

const BEHAVIOUR_METRICS: ReadonlySet<CoachingMetricId> = new Set([
  "speed_to_follow",
  "on_time_touches",
  "next_step_coverage",
  "call_quality",
  "responsiveness",
  "promises_kept",
]);

export function coachingMetricGroup(metric: CoachingMetricId): "behaviour" | "results" {
  return BEHAVIOUR_METRICS.has(metric) ? "behaviour" : "results";
}

const MINUTE_METRICS: ReadonlySet<CoachingMetricId> = new Set(["responsiveness"]);
const POINT_METRICS: ReadonlySet<CoachingMetricId> = new Set(["speed_to_follow", "call_quality", "showings_completed", "hot_pipeline", "closes"]);
const MONEY_METRICS: ReadonlySet<CoachingMetricId> = new Set(["closed_value"]);
const COMPACT_USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });
const BASE_WINDOW_DAYS = 28;
const YEAR_DAYS = 365;

export const coachingStatusSchema = z.enum(["green", "amber", "red", "unknown"]);
export type CoachingStatus = z.infer<typeof coachingStatusSchema>;

export const coachingWeekSchema = z.object({ weekStart: z.string(), isoWeek: z.string(), weekNumber: z.number() });
export type CoachingWeek = z.infer<typeof coachingWeekSchema>;

export const coachingEvidenceSchema = z.object({
  leadId: z.string(),
  at: z.string(),
  note: z.string(),
  ghlUrl: z.string().nullable(),
});

const metricCellSchema = z.object({
  value: z.number().nullable(),
  points: z.number().nullable(),
  target: z.number().nullable(),
  targetPlaceholder: z.boolean(),
  status: coachingStatusSchema,
  sample: z.number(),
  windowDays: z.number().nullable(),
});

export const coachingOverviewResponseSchema = z.object({
  configured: z.boolean(),
  weeks: z.array(coachingWeekSchema),
  week: coachingWeekSchema.nullable(),
  totals: z.object({
    teamScore: z.number().nullable(),
    onTimeRate: z.number().nullable(),
    medianFollowMinutes: z.number().nullable(),
    callsReviewed: z.number().nullable(),
    excusesToConfirm: z.number(),
  }),
  needsOneOnOne: z.array(
    z.object({
      brokerId: z.string(),
      name: z.string(),
      score: z.number().nullable(),
      provisional: z.boolean(),
      trend: z.number().nullable(),
      reason: z.string(),
      topic: z.string().nullable(),
    }),
  ),
  brokers: z.array(
    z.object({
      brokerId: z.string(),
      name: z.string(),
      level: z.string(),
      score: z.number().nullable(),
      provisional: z.boolean(),
      coverage: z.number(),
      trend: z.number().nullable(),
      metrics: z.record(coachingMetricSchema, metricCellSchema),
      focus: z.array(coachingMetricSchema),
    }),
  ),
});
export type CoachingOverviewResponse = z.infer<typeof coachingOverviewResponseSchema>;
export type CoachingOverviewBroker = CoachingOverviewResponse["brokers"][number];

export const coachingPulseSchema = z.object({
  engagement: z.number().int().min(1).max(5),
  attitude: z.number().int().min(1).max(5),
  supportNeeded: z.string(),
  reviewerName: z.string(),
  updatedAt: z.string(),
});

export const coachingBrokerResponseSchema = z.object({
  configured: z.boolean(),
  weeks: z.array(coachingWeekSchema),
  week: coachingWeekSchema.nullable(),
  broker: z.object({ brokerId: z.string(), name: z.string(), level: z.string(), status: z.string() }),
  snapshot: z
    .object({ score: z.number().nullable(), provisional: z.boolean(), coverage: z.number(), trend: z.number().nullable() })
    .nullable(),
  focusAreas: z.array(
    z.object({
      metric: coachingMetricSchema,
      value: z.number().nullable(),
      points: z.number().nullable(),
      target: z.number().nullable(),
      targetPlaceholder: z.boolean(),
      status: coachingStatusSchema,
      action: z.string().nullable(),
      evidence: z.array(coachingEvidenceSchema),
    }),
  ),
  metrics: z.array(
    z.object({
      metric: coachingMetricSchema,
      value: z.number().nullable(),
      points: z.number().nullable(),
      target: z.number().nullable(),
      targetPlaceholder: z.boolean(),
      status: coachingStatusSchema,
      sample: z.number(),
      windowDays: z.number().nullable(),
      detail: z.record(z.string(), z.number().nullable()).nullable(),
      history: z.array(z.number().nullable()),
    }),
  ),
  excuses: z.array(
    z.object({
      momentKey: z.string(),
      leadId: z.string(),
      dueAt: z.string(),
      dueReason: z.string(),
      reason: z.string().nullable(),
      quote: z.string().nullable(),
      sourceKind: z.string().nullable(),
      needsConfirmation: z.boolean(),
      decision: z.enum(["confirm", "reject"]).nullable(),
      decidedBy: z.string().nullable(),
      ghlUrl: z.string().nullable(),
    }),
  ),
  topic: z.string().nullable(),
  context: z.record(z.string(), z.number().nullable()),
  pulse: coachingPulseSchema.nullable(),
  history: z.array(z.object({ weekStart: z.string(), isoWeek: z.string(), topic: z.string().nullable(), pulse: coachingPulseSchema.nullable() })),
});
export type CoachingBrokerResponse = z.infer<typeof coachingBrokerResponseSchema>;

export const excuseDecisionBodySchema = z.object({
  momentKey: z.string().min(1).max(300),
  decision: z.enum(["confirm", "reject"]),
});
export type ExcuseDecisionBody = z.infer<typeof excuseDecisionBodySchema>;

export const pulseBodySchema = z.object({
  weekStart: z.iso.date(),
  engagement: z.number().int().min(1).max(5),
  attitude: z.number().int().min(1).max(5),
  supportNeeded: z.string().trim().max(2000),
});
export type PulseBody = z.infer<typeof pulseBodySchema>;

export function formatCoachingValue(metric: CoachingMetricId, value: number | null): string {
  if (value === null) return "—";
  if (MINUTE_METRICS.has(metric)) return formatWorkMinutes(value);
  if (MONEY_METRICS.has(metric)) return COMPACT_USD.format(value);
  if (POINT_METRICS.has(metric)) return String(Math.round(value));
  return `${Math.round(value * 100)}%`;
}

export function formatWorkMinutes(value: number | null): string {
  if (value === null) return "—";
  return value >= 90 ? `${Math.round(value / 6) / 10} h` : `${Math.round(value)} min`;
}

export function formatPoints(points: number | null): string {
  return points === null ? "—" : String(Math.round(points));
}

export function windowLabel(windowDays: number | null): string | null {
  if (windowDays === null || windowDays <= BASE_WINDOW_DAYS) return null;
  return windowDays >= YEAR_DAYS ? "12-month data" : `${windowDays}-day data`;
}

export function formatCoachingTarget(metric: CoachingMetricId, target: number | null): string {
  if (target === null) return "—";
  return `${MINUTE_METRICS.has(metric) ? "≤" : "≥"} ${formatCoachingValue(metric, target)}`;
}

export function scoreBand(score: number | null, provisional: boolean): { label: string; tone: "success" | "warning" | "danger" | "neutral" } {
  if (provisional || score === null) return { label: "Provisional", tone: "neutral" };
  if (score >= 80) return { label: "On track", tone: "success" };
  if (score >= 65) return { label: "Needs attention", tone: "warning" };
  return { label: "At risk", tone: "danger" };
}

export function needsOneOnOneReason(row: {
  provisional: boolean;
  coverage: number;
  trend: number | null;
  metrics: Partial<Record<CoachingMetricId, { status: CoachingStatus; value: number | null }>>;
}): string | null {
  const red = COACHING_METRICS.filter((m) => row.metrics[m]?.status === "red");
  if (red.length) {
    return `Off target: ${red.map((m) => `${COACHING_METRIC_LABELS[m].toLowerCase()} ${formatCoachingValue(m, row.metrics[m]?.value ?? null)}`).join(", ")}`;
  }
  if (row.trend !== null && row.trend <= -10) return `Score down ${Math.abs(Math.round(row.trend))} points on the 4-week average`;
  if (row.provisional) return `Only ${Math.round(row.coverage * 100)}% of the score has enough data`;
  return null;
}

export function suggestedTopic(focusAreas: Array<{ metric: CoachingMetricId; action: string | null }>): string | null {
  const first = focusAreas[0];
  if (!first) return null;
  const label = COACHING_METRIC_LABELS[first.metric];
  return first.action ? `${label}: ${first.action}` : label;
}
