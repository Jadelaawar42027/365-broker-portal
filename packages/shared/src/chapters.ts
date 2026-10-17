/**
 * File: packages/shared/src/chapters.ts
 * Purpose: The Volume One chapter list from the 365 Broker Onboarding Manual. Shown greyed out on the locked
 * training page now (SPEC D6) and reused as the starting chapter data in phase 2.
 *
 * Functions:
 * - none
 */
export type Chapter = { code: string; title: string; label: string };

export const VOLUME_ONE_CHAPTERS: readonly Chapter[] = [
  { code: "0", title: "Start Here", label: "Part 0 · Start Here" },
  { code: "01", title: "Week One Setup", label: "01 · Week One Setup" },
  { code: "02", title: "Licensing & Compliance", label: "02 · Licensing & Compliance" },
  { code: "03", title: "Commission Structure", label: "03 · Commission Structure" },
  { code: "04", title: "Commission Income Management", label: "04 · Commission Income Management" },
  { code: "05", title: "KPIs & Benchmarks", label: "05 · KPIs & Benchmarks" },
  { code: "06", title: "Quick Start Checklist", label: "06 · Quick Start Checklist" },
];
