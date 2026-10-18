/**
 * File: apps/web/src/lib/csv.ts
 * Purpose: Builds the "Export CSV" file for the brokers table (SPEC D16) from the rows currently shown: the broker's
 * details, both commission splits as the broker's percentage (SPEC D29), onboarding numbers, then training columns.
 *
 * Functions:
 * - csvCell(value): quotes a value when it contains commas, quotes or line breaks.
 * - buildBrokersCsv(rows): returns the CSV text with a header row and one line per broker.
 */
import type { BrokerListRow } from "@bp/shared";

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildBrokersCsv(rows: readonly BrokerListRow[]): string {
  const header = ["name", "email", "level", "status", "joined_at", "onboarded_at", "left_at", "tenure_days", "days_to_onboard", "steps_approved", "steps_total", "in_house_split_pct", "self_generated_split_pct", "chapters_passed", "chapters_total", "avg_quiz_score"];
  const lines = rows.map((row) =>
    [row.name, row.email, row.level, row.status, row.joinedAt, row.onboardedAt, row.leftAt, row.tenureDays, row.daysToOnboard, row.stepsApproved, row.stepsTotal, row.inHouseSplit, row.selfGeneratedSplit, row.training?.chaptersPassed ?? null, row.training?.chaptersTotal ?? null, row.training?.avgBestScore ?? null]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n") + "\n";
}
