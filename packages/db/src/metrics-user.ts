/**
 * File: packages/db/src/metrics-user.ts
 * Purpose: Creates or updates the login that outside tools (Metabase, Sheets, the AI bot) use to read
 * broker_metrics. The login only inherits the metrics_reader role, so it can read that view and nothing else (SPEC D18).
 *
 * Functions:
 * - assertValidMetricsLogin(input): throws if the username is not a plain lowercase identifier or the password is under 16 characters.
 * - upsertMetricsLogin(sql, input): creates the login role (or resets its password) and grants it metrics_reader; returns "created" or "updated".
 */
import type { Sql } from "postgres";

export type MetricsLoginInput = { username: string; password: string };

function assertValidMetricsLogin(input: MetricsLoginInput): void {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(input.username)) {
    throw new Error("Metrics username must be lowercase letters, digits and underscores.");
  }
  if (input.password.length < 16) {
    throw new Error("METRICS_READER_PASSWORD must be at least 16 characters.");
  }
}

export async function upsertMetricsLogin(sql: Sql, input: MetricsLoginInput): Promise<"created" | "updated"> {
  assertValidMetricsLogin(input);
  const existing = await sql`SELECT 1 FROM pg_roles WHERE rolname = ${input.username}`;
  const template = existing.length
    ? "ALTER ROLE %I WITH LOGIN PASSWORD %L"
    : "CREATE ROLE %I WITH LOGIN PASSWORD %L";
  const [statement] = await sql<{ text: string }[]>`
    SELECT format(${template}, ${input.username}::text, ${input.password}::text) AS text
  `;
  await sql.unsafe(statement!.text);
  const [grant] = await sql<{ text: string }[]>`
    SELECT format('GRANT metrics_reader TO %I', ${input.username}::text) AS text
  `;
  await sql.unsafe(grant!.text);
  return existing.length ? "updated" : "created";
}
