/**
 * File: apps/api/src/services/match/health.ts
 * Purpose: The only place broker health is read. getBrokerHealth returns, for each broker id, a 0-100 health score and a
 * 0-100 follow-up score, or null when there is none. HEALTH_SOURCE picks the source: "none" (the default) returns null for
 * everyone; "mock" returns fake scores that stay the same for a broker across reseeds (worked out from their email), for
 * local testing only; "coach" reads the newest weekly snapshot that coach-api writes into this same Postgres, through a
 * separate connection made from COACH_DATABASE_URL as coach-api's read-only coach_portal role, never the portal's own
 * database user. Without COACH_DATABASE_URL every broker gets null. The portal only ever reads coach-api's tables and never
 * creates them. If the coach query fails, or a broker has no row, that broker gets null; it never fails /api/match and
 * never becomes a made-up neutral score.
 *
 * TODO(coach-api): when coach-api's weekly snapshot table is live, set COACH_SNAPSHOT below to its real schema, table and
 * column names (and brokerKey to the portal value its broker column holds: the broker id, the GoHighLevel user id or the
 * 365 email), deploy with HEALTH_SOURCE=coach and COACH_DATABASE_URL (the coach_portal role's connection string), and check
 * that coach_portal can SELECT from it. The expected query shape is:
 *   SELECT DISTINCT ON (<brokerColumn>) <brokerColumn>, <scoreColumn>, <followUpColumn>
 *   FROM <schema>.<table>
 *   WHERE <brokerColumn> IN (...portal broker keys...)
 *   ORDER BY <brokerColumn>, <weekColumn> DESC
 * Scores outside 0-100 are clamped; a missing or non-numeric score or follow-up score makes that broker's health null.
 *
 * Functions:
 * - getBrokerHealth(deps, brokerIds): a Map from every requested broker id to its health or null (deps.coachDb is the coach_portal connection, null when COACH_DATABASE_URL is unset).
 * - mockHealth(db, brokerIds): fake but stable scores for each broker, from a hash of their email.
 * - coachHealth(db, coachDb, brokerIds): reads the newest coach-api snapshot per broker over the coach_portal connection; throws if the query fails.
 * - coachKeysFor(db, brokerIds): the value coach-api uses for each portal broker (per COACH_SNAPSHOT.brokerKey), read from the portal's own tables.
 * - toScore(value): a database value as a 0-100 score, or null when it isn't a number.
 */
import { brokers, users, type Database } from "@bp/db";
import type { BrokerHealth, HealthSource } from "@bp/shared";
import { eq, inArray, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { createHash } from "node:crypto";

export type HealthDeps = { db: Database; coachDb: Database | null; healthSource: HealthSource; log?: Pick<FastifyBaseLogger, "warn"> };

export const COACH_SNAPSHOT = {
  schema: "public",
  table: "coach_broker_health_weekly",
  brokerColumn: "broker_id",
  brokerKey: "broker_id" as "broker_id" | "ghl_user_id" | "corporate_email",
  weekColumn: "week_start",
  scoreColumn: "health_score",
  followUpColumn: "follow_up_score",
};

export async function getBrokerHealth(deps: HealthDeps, brokerIds: string[]): Promise<Map<string, BrokerHealth>> {
  const result = new Map<string, BrokerHealth>(brokerIds.map((id) => [id, null]));
  if (brokerIds.length === 0 || deps.healthSource === "none") return result;
  if (deps.healthSource === "coach" && !deps.coachDb) return result;
  try {
    const found = deps.healthSource === "mock" ? await mockHealth(deps.db, brokerIds) : await coachHealth(deps.db, deps.coachDb!, brokerIds);
    for (const [id, health] of found) if (result.has(id)) result.set(id, health);
  } catch (error) {
    deps.log?.warn({ err: error, healthSource: deps.healthSource }, "Couldn't read broker health; matching without it");
  }
  return result;
}

async function mockHealth(db: Database, brokerIds: string[]): Promise<Map<string, BrokerHealth>> {
  const rows = await db
    .select({ id: brokers.id, email: users.email })
    .from(brokers)
    .innerJoin(users, eq(users.id, brokers.userId))
    .where(inArray(brokers.id, brokerIds));
  const result = new Map<string, BrokerHealth>();
  for (const row of rows) {
    const digest = createHash("sha256").update(row.email.toLowerCase()).digest();
    result.set(row.id, { score: 35 + (digest[0]! % 61), followUpScore: 20 + (digest[1]! % 81) });
  }
  return result;
}

async function coachKeysFor(db: Database, brokerIds: string[]): Promise<Map<string, string>> {
  if (COACH_SNAPSHOT.brokerKey === "broker_id") return new Map(brokerIds.map((id) => [id, id]));
  const rows = await db
    .select({ id: brokers.id, ghlUserId: brokers.ghlUserId, corporateEmail: brokers.corporateEmail })
    .from(brokers)
    .where(inArray(brokers.id, brokerIds));
  const keys = new Map<string, string>();
  for (const row of rows) {
    const key = COACH_SNAPSHOT.brokerKey === "ghl_user_id" ? row.ghlUserId : row.corporateEmail?.toLowerCase();
    if (key) keys.set(key, row.id);
  }
  return keys;
}

export function toScore(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, Math.round(number)));
}

async function coachHealth(db: Database, coachDb: Database, brokerIds: string[]): Promise<Map<string, BrokerHealth>> {
  const keys = await coachKeysFor(db, brokerIds);
  const result = new Map<string, BrokerHealth>();
  if (keys.size === 0) return result;
  const snapshot = COACH_SNAPSHOT;
  const brokerColumn = sql.identifier(snapshot.brokerColumn);
  const rows = await coachDb.execute<{ broker_key: string; score: unknown; follow_up: unknown }>(sql`
    SELECT DISTINCT ON (${brokerColumn})
      ${brokerColumn}::text AS broker_key,
      ${sql.identifier(snapshot.scoreColumn)} AS score,
      ${sql.identifier(snapshot.followUpColumn)} AS follow_up
    FROM ${sql.identifier(snapshot.schema)}.${sql.identifier(snapshot.table)}
    WHERE ${brokerColumn}::text IN (${sql.join([...keys.keys()].map((key) => sql`${key}`), sql`, `)})
    ORDER BY ${brokerColumn}, ${sql.identifier(snapshot.weekColumn)} DESC
  `);
  for (const row of rows) {
    const brokerId = keys.get(String(row.broker_key));
    if (!brokerId) continue;
    const score = toScore(row.score);
    const followUpScore = toScore(row.follow_up);
    result.set(brokerId, score !== null && followUpScore !== null ? { score, followUpScore } : null);
  }
  return result;
}
