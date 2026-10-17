/**
 * File: packages/shared/src/metrics.ts
 * Purpose: Date maths behind the broker metrics: days to onboard, tenure, the "time with us" wording on
 * 3b/3c, the overview average and the "stuck" flag. Dates are ISO "YYYY-MM-DD" strings, as stored in Postgres.
 *
 * Functions:
 * - parseIsoDate(value): turns "YYYY-MM-DD" into a UTC-midnight Date; throws on anything else.
 * - todayInTimeZone(now, timeZone): returns today's ISO date in the given zone (default Florida, America/New_York).
 * - daysBetween(from, to): whole days from one ISO date to another (negative if to is earlier).
 * - addDays(isoDate, days): returns the ISO date that many days later (or earlier when negative).
 * - daysToOnboard(joinedAt, onboardedAt): days from joining to onboarding, or null if not onboarded.
 * - tenureDays(joinedAt, leftAt, today): days with 365, ending at leftAt if the broker left, else today.
 * - fullMonthsBetween(from, to): whole calendar months between two ISO dates.
 * - formatTenure(joinedAt, endAt, hasLeft): "4 days", "2 months", "1 yr 7 mo", with " (left)" for former brokers.
 * - averageDaysToOnboard(rows, sampleSize): rounded average days to onboard over the most recently onboarded brokers, or null.
 * - stuckDays(input): days since the broker's last activity (or joining) if they are onboarding and idle 4+ days, else null.
 */
import { DAYS_TO_ONBOARD_SAMPLE_SIZE, STUCK_AFTER_DAYS, type BrokerStatus } from "./constants";

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(value: string): Date {
  const match = ISO_DATE.exec(value);
  if (!match) throw new Error(`Expected a date like 2026-10-17, got "${value}".`);
  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`"${value}" is not a real calendar date.`);
  }
  return date;
}

export function todayInTimeZone(now: Date = new Date(), timeZone = "America/New_York"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / DAY_MS);
}

export function addDays(isoDate: string, days: number): string {
  const date = parseIsoDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysToOnboard(joinedAt: string, onboardedAt: string | null): number | null {
  return onboardedAt ? daysBetween(joinedAt, onboardedAt) : null;
}

export function tenureDays(joinedAt: string, leftAt: string | null, today: string): number {
  return daysBetween(joinedAt, leftAt ?? today);
}

function fullMonthsBetween(from: string, to: string): number {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  const months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
  return end.getUTCDate() < start.getUTCDate() ? months - 1 : months;
}

export function formatTenure(joinedAt: string, endAt: string, hasLeft = false): string {
  const suffix = hasLeft ? " (left)" : "";
  const days = Math.max(0, daysBetween(joinedAt, endAt));
  const months = Math.max(0, fullMonthsBetween(joinedAt, endAt));
  if (months < 1) return `${days} ${days === 1 ? "day" : "days"}${suffix}`;
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"}${suffix}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${years} yr${rest > 0 ? ` ${rest} mo` : ""}${suffix}`;
}

export type OnboardedRow = { onboardedAt: string | null; daysToOnboard: number | null };

export function averageDaysToOnboard(
  rows: readonly OnboardedRow[],
  sampleSize = DAYS_TO_ONBOARD_SAMPLE_SIZE,
): number | null {
  const recent = rows
    .filter((row): row is { onboardedAt: string; daysToOnboard: number } =>
      Boolean(row.onboardedAt) && row.daysToOnboard !== null,
    )
    .sort((a, b) => b.onboardedAt.localeCompare(a.onboardedAt))
    .slice(0, sampleSize);
  if (recent.length === 0) return null;
  const total = recent.reduce((sum, row) => sum + row.daysToOnboard, 0);
  return Math.round(total / recent.length);
}

export type StuckInput = {
  status: BrokerStatus;
  lastActivityAt: Date | null;
  joinedAt: string;
  now: Date;
};

export function stuckDays(input: StuckInput): number | null {
  if (input.status !== "onboarding") return null;
  const reference = input.lastActivityAt ?? parseIsoDate(input.joinedAt);
  const idle = Math.floor((input.now.getTime() - reference.getTime()) / DAY_MS);
  return idle >= STUCK_AFTER_DAYS ? idle : null;
}
