/**
 * File: apps/web/src/components/admin/coaching/sparkline.tsx
 * Purpose: A small line of a metric's last weekly values (oldest to newest) on the broker coaching page. Gaps where a
 * week had too little data are skipped; with fewer than two known points it shows a dash.
 *
 * Functions:
 * - Sparkline({ values, label }): renders the SVG line with an accessible label.
 */
export function Sparkline({ values, label }: { values: Array<number | null>; label: string }) {
  const known = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (known.length < 2) return <span className="text-muted">—</span>;
  const min = Math.min(...known.map((p) => p.v));
  const max = Math.max(...known.map((p) => p.v));
  const span = max - min || 1;
  const step = 88 / Math.max(1, values.length - 1);
  const points = known.map((p) => `${(4 + p.i * step).toFixed(1)},${(22 - ((p.v - min) / span) * 18).toFixed(1)}`).join(" ");
  return (
    <svg width="96" height="26" viewBox="0 0 96 26" role="img" aria-label={label}>
      <polyline points={points} fill="none" stroke="var(--color-brand)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
