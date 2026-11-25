/**
 * File: apps/web/src/components/admin/coaching/metric-cell.tsx
 * Purpose: One coloured coaching metric value (green on target, amber within 20%, red off target, grey not enough
 * data). The status is also written out for screen readers, so colour is never the only signal.
 *
 * Functions:
 * - statusClasses(status): the background and text colour classes for a status.
 * - statusText(status): "on target", "within 20% of target", "off target" or "not enough data".
 * - MetricCell({ metric, value, status, size }): renders the value pill.
 * - CoachingLegend(): the four-colour legend shown above the broker grid.
 */
import { formatCoachingValue, type CoachingMetricId, type CoachingStatus } from "@bp/shared";

const CLASSES: Record<CoachingStatus, string> = {
  green: "bg-success-soft text-success",
  amber: "bg-warn-soft text-warn",
  red: "bg-danger-soft text-danger",
  unknown: "bg-neutral-soft text-muted",
};

const TEXT: Record<CoachingStatus, string> = {
  green: "on target",
  amber: "within 20% of target",
  red: "off target",
  unknown: "not enough data",
};

export function statusClasses(status: CoachingStatus): string {
  return CLASSES[status];
}

export function statusText(status: CoachingStatus): string {
  return TEXT[status];
}

export function MetricCell({
  metric,
  value,
  status,
  size = "md",
}: {
  metric: CoachingMetricId;
  value: number | null;
  status: CoachingStatus;
  size?: "md" | "lg";
}) {
  return (
    <span
      className={`inline-flex min-w-[68px] items-center justify-center rounded-lg px-2.5 font-bold tabular-nums ${size === "lg" ? "py-1.5 text-[17px]" : "py-1 text-[15px]"} ${CLASSES[status]}`}
    >
      {formatCoachingValue(metric, value)}
      <span className="sr-only"> ({TEXT[status]})</span>
    </span>
  );
}

export function CoachingLegend() {
  return (
    <ul aria-label="Colour key" className="flex flex-wrap gap-x-4 gap-y-2 text-[15px] text-muted">
      {(Object.keys(TEXT) as CoachingStatus[]).map((status) => (
        <li key={status} className="flex items-center gap-2">
          <span aria-hidden="true" className={`size-3.5 rounded ${CLASSES[status]} ring-1 ring-inset ring-black/10`} />
          {TEXT[status].replace(/^./, (c) => c.toUpperCase())}
        </li>
      ))}
    </ul>
  );
}
