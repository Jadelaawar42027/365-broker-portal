/**
 * File: apps/web/src/components/admin/stat-card.tsx
 * Purpose: The white number tiles on the admin overview (3a): a label, a large number and a one-line detail.
 *
 * Functions:
 * - StatCard({ label, value, detail }): renders one tile.
 */
export function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white px-5 py-6">
      <p className="text-base font-semibold text-muted">{label}</p>
      <p className="mt-2 text-[36px] leading-none font-extrabold tabular-nums">{value}</p>
      <p className="mt-3 text-[15px] text-muted">{detail}</p>
    </div>
  );
}
