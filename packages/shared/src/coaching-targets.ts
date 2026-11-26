/**
 * File: packages/shared/src/coaching-targets.ts
 * Purpose: The fixed coaching targets admins edit (one per metric) and their change log: the API contract, the unit each
 * target is typed in and the allowed range. A target sets only a metric's colour (green at target, amber within 20%,
 * red beyond), and so what's slipping and the 1:1 topic; scores are absolute points and never use it. Shares are stored
 * as 0-1 and typed as percentages; reply time in working minutes; closed value in dollars. The API takes the typed value
 * and converts it, so the range check and the conversion happen in one place.
 *
 * Functions:
 * - targetUnit(metric): how a metric's target is typed: "minutes", "percent", "points", "count" or "dollars".
 * - targetToInput(metric, target): the stored target as the number typed in the form (0.8 becomes 80 for a percentage).
 * - targetFromInput(metric, input): the typed number as the stored target (80 becomes 0.8 for a percentage).
 * - targetRangeError(metric, input): why a typed target is out of range or not allowed, or null when it can be saved.
 */
import { z } from "zod";
import { coachingMetricSchema, type CoachingMetricId } from "./api-coaching";

export type TargetUnit = "minutes" | "percent" | "points" | "count" | "dollars";

const UNITS: Record<CoachingMetricId, TargetUnit> = {
  responsiveness: "minutes",
  on_time_touches: "percent",
  promises_kept: "percent",
  next_step_coverage: "percent",
  showing_conversion: "percent",
  pipeline_movement: "percent",
  call_quality: "points",
  speed_to_follow: "points",
  closes: "count",
  showings_completed: "count",
  hot_pipeline: "count",
  closed_value: "dollars",
};

const RANGES: Record<TargetUnit, { min: number; max: number; whole: boolean; text: string }> = {
  minutes: { min: 1, max: 2400, whole: true, text: "a whole number of working minutes from 1 to 2,400" },
  percent: { min: 1, max: 100, whole: false, text: "a percentage from 1 to 100" },
  points: { min: 1, max: 100, whole: false, text: "a number from 1 to 100" },
  count: { min: 1, max: 1000, whole: true, text: "a whole number from 1 to 1,000" },
  dollars: { min: 1, max: 1_000_000_000, whole: true, text: "a whole dollar amount from $1 to $1,000,000,000" },
};

export const TARGET_WINDOWS: Partial<Record<CoachingMetricId, string>> = {
  closes: "per 12 months",
  closed_value: "per 12 months",
  showings_completed: "per 90 days",
  showing_conversion: "over 90 days",
  responsiveness: "in working hours",
};

export function targetUnit(metric: CoachingMetricId): TargetUnit {
  return UNITS[metric];
}

export function targetToInput(metric: CoachingMetricId, target: number): number {
  return UNITS[metric] === "percent" ? Math.round(target * 1000) / 10 : target;
}

export function targetFromInput(metric: CoachingMetricId, input: number): number {
  return UNITS[metric] === "percent" ? Math.round(input * 10) / 1000 : input;
}

export function targetRangeError(metric: CoachingMetricId, input: number): string | null {
  const r = RANGES[UNITS[metric]];
  if (!Number.isFinite(input) || input < r.min || input > r.max || (r.whole && !Number.isInteger(input))) return `Enter ${r.text}.`;
  return null;
}

export const coachingTargetSchema = z.object({
  metric: coachingMetricSchema,
  target: z.number(),
  updatedByName: z.string(),
  updatedAt: z.string(),
});
export type CoachingTarget = z.infer<typeof coachingTargetSchema>;

export const coachingTargetChangeSchema = z.object({
  metric: coachingMetricSchema,
  oldTarget: z.number().nullable(),
  newTarget: z.number(),
  changedByName: z.string(),
  changedAt: z.string(),
});
export type CoachingTargetChange = z.infer<typeof coachingTargetChangeSchema>;

export const coachingTargetsResponseSchema = z.object({
  targets: z.array(coachingTargetSchema),
  changes: z.array(coachingTargetChangeSchema),
});
export type CoachingTargetsResponse = z.infer<typeof coachingTargetsResponseSchema>;

export const coachingTargetBodySchema = z.object({ value: z.number().finite() });
export type CoachingTargetBody = z.infer<typeof coachingTargetBodySchema>;
