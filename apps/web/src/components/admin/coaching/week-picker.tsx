/**
 * File: apps/web/src/components/admin/coaching/week-picker.tsx
 * Purpose: The week selector on the Coaching screens: lists the frozen Monday snapshots and reloads the page for the
 * chosen week (?week=YYYY-MM-DD), keeping the address shareable.
 *
 * Functions:
 * - WeekPicker({ weeks, current }): renders the labelled select and navigates on change.
 * - weekLabel(week): "Week 47 · 16 Nov" for a snapshot week.
 */
"use client";

import type { CoachingWeek } from "@bp/shared";
import { usePathname, useRouter } from "next/navigation";
import { selectClasses } from "@/components/ui/misc";

export function weekLabel(week: CoachingWeek): string {
  const start = new Date(`${week.weekStart}T12:00:00Z`);
  return `Week ${week.weekNumber} · ${start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
}

export function WeekPicker({ weeks, current }: { weeks: CoachingWeek[]; current: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  if (weeks.length === 0) return null;
  return (
    <label className="flex items-center gap-3 text-base font-semibold text-muted">
      Week
      <select
        className={`${selectClasses()} min-w-52`}
        value={current ?? ""}
        onChange={(event) => router.push(`${pathname}?week=${encodeURIComponent(event.target.value)}`)}
      >
        {weeks.map((week) => (
          <option key={week.weekStart} value={week.weekStart}>
            {weekLabel(week)}
          </option>
        ))}
      </select>
    </label>
  );
}
