/**
 * File: apps/web/src/components/admin/coaching/status.tsx
 * Purpose: Small pieces shared by the Coaching screens: the score trend against the 4-week average and the card
 * shown while the coach database is not connected.
 *
 * Functions:
 * - TrendText({ trend }): "▲ 4", "▼ 6" or "—" against the 4-week average, coloured and labelled for screen readers.
 * - NotConnected(): explains that COACH_DATABASE_URL must be set on the API service.
 */
import { Card } from "@/components/ui/misc";

export function TrendText({ trend }: { trend: number | null }) {
  if (trend === null || Math.round(trend) === 0) {
    return (
      <span className="text-muted">
        <span aria-hidden="true">—</span>
        <span className="sr-only">no change</span>
      </span>
    );
  }
  const up = trend > 0;
  return (
    <span className={`font-bold tabular-nums ${up ? "text-success" : "text-danger"}`}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span> {Math.abs(Math.round(trend))}
      <span className="sr-only"> {up ? "up" : "down"} on the 4-week average</span>
    </span>
  );
}

export function NotConnected() {
  return (
    <Card className="px-6 py-6">
      <h2 className="text-xl font-bold">Coaching isn&apos;t connected yet</h2>
      <p className="mt-2 text-[17px] text-muted">
        Set COACH_DATABASE_URL on the API service (the coach_portal login on the shared database) and reload this page.
      </p>
    </Card>
  );
}
