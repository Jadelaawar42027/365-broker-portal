/**
 * File: packages/db/src/import/csv.ts
 * Purpose: Reads data/import/brokers.csv for the broker importer: a small RFC 4180 CSV parser (quotes, commas and line
 * breaks inside quotes, CRLF, a leading BOM) and validation of every row against the columns in docs/SPEC.md, with
 * line numbers in every error so the spreadsheet is easy to fix.
 *
 * Functions:
 * - parseCsv(text): returns the rows of a CSV file as arrays of cell strings.
 * - normaliseDate(value): accepts 2026-03-11 or 3/11/2026 and returns the ISO date, or null for an empty cell; throws on anything else.
 * - parseBrokerCsv(text): validates the header and every row; returns the valid rows and a list of { line, message } errors.
 */
import { BROKER_LEVELS, BROKER_STATUSES, emailSchema, parseIsoDate, type BrokerLevel, type BrokerStatus } from "@bp/shared";

export const BROKER_CSV_COLUMNS = [
  "name",
  "email",
  "phone",
  "level",
  "status",
  "joined_at",
  "onboarded_at",
  "left_at",
  "commission_tier",
] as const;

export type BrokerCsvRow = {
  line: number;
  name: string;
  email: string;
  phone: string | null;
  level: BrokerLevel;
  status: BrokerStatus;
  joinedAt: string;
  onboardedAt: string | null;
  leftAt: string | null;
  commissionTier: string | null;
};

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ""));
}

export function normaliseDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  const iso = us ? `${us[3]}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}` : trimmed;
  parseIsoDate(iso);
  return iso;
}

export function parseBrokerCsv(text: string): { rows: BrokerCsvRow[]; errors: { line: number; message: string }[] } {
  const [header, ...records] = parseCsv(text);
  const errors: { line: number; message: string }[] = [];
  if (!header) return { rows: [], errors: [{ line: 1, message: "The file is empty." }] };
  const columns = header.map((name) => name.trim().toLowerCase());
  const missing = BROKER_CSV_COLUMNS.filter((name) => !columns.includes(name));
  if (missing.length > 0) {
    return { rows: [], errors: [{ line: 1, message: `Missing columns: ${missing.join(", ")}.` }] };
  }
  const rows: BrokerCsvRow[] = [];
  const seen = new Map<string, number>();
  records.forEach((cells, index) => {
    const line = index + 2;
    const get = (name: (typeof BROKER_CSV_COLUMNS)[number]) => (cells[columns.indexOf(name)] ?? "").trim();
    const problems: string[] = [];
    const name = get("name");
    if (name.length < 2) problems.push("name is missing");
    const email = emailSchema.safeParse(get("email"));
    if (!email.success) problems.push(`email "${get("email")}" is not valid`);
    const level = get("level").toLowerCase() as BrokerLevel;
    if (!BROKER_LEVELS.includes(level)) problems.push(`level must be ${BROKER_LEVELS.join(" or ")}`);
    const status = get("status").toLowerCase() as BrokerStatus;
    if (!BROKER_STATUSES.includes(status)) problems.push(`status must be one of ${BROKER_STATUSES.join(", ")}`);
    const dates: Record<string, string | null> = {};
    for (const column of ["joined_at", "onboarded_at", "left_at"] as const) {
      try {
        dates[column] = normaliseDate(get(column));
      } catch {
        problems.push(`${column} "${get(column)}" is not a date like 2026-03-11`);
      }
    }
    if (!dates.joined_at && !problems.some((problem) => problem.startsWith("joined_at"))) problems.push("joined_at is missing");
    if (dates.joined_at && dates.onboarded_at && dates.onboarded_at < dates.joined_at) problems.push("onboarded_at is before joined_at");
    if (dates.joined_at && dates.left_at && dates.left_at < dates.joined_at) problems.push("left_at is before joined_at");
    if (status === "active" && !dates.onboarded_at) problems.push("active brokers need onboarded_at");
    if (email.success) {
      const previous = seen.get(email.data);
      if (previous) problems.push(`email repeats line ${previous}`);
      else seen.set(email.data, line);
    }
    if (problems.length > 0) {
      errors.push({ line, message: problems.join("; ") });
      return;
    }
    rows.push({
      line,
      name,
      email: email.data!,
      phone: get("phone") || null,
      level,
      status,
      joinedAt: dates.joined_at!,
      onboardedAt: dates.onboarded_at ?? null,
      leftAt: dates.left_at ?? null,
      commissionTier: get("commission_tier") || null,
    });
  });
  return { rows, errors };
}
