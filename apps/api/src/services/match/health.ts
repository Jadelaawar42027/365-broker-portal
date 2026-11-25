/**
 * File: apps/api/src/services/match/health.ts
 * Purpose: The only place broker health is read. getBrokerHealth returns, for each broker id, a 0-100 health score and a
 * 0-100 follow-up score, or null when there is none. HEALTH_SOURCE picks the source: "none" (the default) returns null for
 * everyone; "mock" returns fake scores that stay the same for a broker across reseeds (worked out from their email), for
 * local testing only; "coach" reads coach-api's latest weekly snapshot (coach.weekly_snapshot, written by coach-api into
 * this same Postgres) through a separate connection made from COACH_DATABASE_URL as coach-api's read-only coach_portal role,
 * never the portal's own database user. Without COACH_DATABASE_URL every broker gets null. The portal only ever reads
 * coach-api's tables and never creates them. If the coach query fails, or a broker has no row, that broker gets null; it
 * never fails /api/match and never becomes a made-up neutral score.
 *
 * Coach snapshot (coach-api migrations 1764110000000_engine.sql and 1764130000000_portal-access.sql): one row per broker
 * per week, keyed by broker_id, which is the portal's own brokers.id (coach-api maps GoHighLevel users to portal brokers by
 * email in coach.broker_ghl_users before it writes the snapshot). Only the newest week_start in the table counts, so a
 * broker without a row that week gets null rather than an older week's numbers. The health score is the score column
 * (already 0-100, null while coach-api has too little data); the follow-up score is the on-time touches share
 * (metrics -> 'on_time_touches' ->> 'value', 0-1, the "team follow-up rate" in coach-api) times 100. Scores outside 0-100
 * are clamped; a missing or non-numeric score or follow-up share makes that broker's health null.
 *
 * Functions:
 * - getBrokerHealth(deps, brokerIds): a Map from every requested broker id to its health or null (deps.coachDb is the coach_portal connection, null when COACH_DATABASE_URL is unset).
 * - mockHealth(db, brokerIds): fake but stable scores for each broker, from a hash of their email.
 * - coachHealth(coachDb, brokerIds): reads each broker's row in coach-api's latest weekly snapshot over the coach_portal connection; throws if the query fails.
 * - toScore(value): a database value as a 0-100 score, or null when it isn't a number.
 * - toFollowUpScore(share): an on-time touches share (0-1) as a 0-100 follow-up score, or null when it isn't a number.
 */
import { brokers, users, type Database } from "@bp/db";
import type { BrokerHealth, HealthSource } from "@bp/shared";
import { eq, inArray, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { createHash } from "node:crypto";

export type HealthDeps = { db: Database; coachDb: Database | null; healthSource: HealthSource; log?: Pick<FastifyBaseLogger, "warn"> };

export const COACH_SNAPSHOT = {
  schema: "coach",
  table: "weekly_snapshot",
  brokerColumn: "broker_id",
  weekColumn: "week_start",
  scoreColumn: "score",
  metricsColumn: "metrics",
  followUpMetric: "on_time_touches",
} as const;

export async function getBrokerHealth(deps: HealthDeps, brokerIds: string[]): Promise<Map<string, BrokerHealth>> {
  const result = new Map<string, BrokerHealth>(brokerIds.map((id) => [id, null]));
  if (brokerIds.length === 0 || deps.healthSource === "none") return result;
  if (deps.healthSource === "coach" && !deps.coachDb) return result;
  try {
    const found = deps.healthSource === "mock" ? await mockHealth(deps.db, brokerIds) : await coachHealth(deps.coachDb!, brokerIds);
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

export function toScore(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, Math.round(number)));
}

export function toFollowUpScore(share: unknown): number | null {
  if (share === null || share === undefined || share === "") return null;
  const number = Number(share);
  if (!Number.isFinite(number)) return null;
  return toScore(number * 100);
}

async function coachHealth(coachDb: Database, brokerIds: string[]): Promise<Map<string, BrokerHealth>> {
  const snapshot = COACH_SNAPSHOT;
  const table = sql`${sql.identifier(snapshot.schema)}.${sql.identifier(snapshot.table)}`;
  const brokerColumn = sql.identifier(snapshot.brokerColumn);
  const weekColumn = sql.identifier(snapshot.weekColumn);
  const rows = await coachDb.execute<{ broker_id: string; score: unknown; follow_up_share: unknown }>(sql`
    SELECT
      ${brokerColumn}::text AS broker_id,
      ${sql.identifier(snapshot.scoreColumn)} AS score,
      ${sql.identifier(snapshot.metricsColumn)} -> ${snapshot.followUpMetric}::text ->> 'value' AS follow_up_share
    FROM ${table}
    WHERE ${weekColumn} = (SELECT max(${weekColumn}) FROM ${table})
      AND ${brokerColumn}::text IN (${sql.join(brokerIds.map((id) => sql`${id}`), sql`, `)})
  `);
  const result = new Map<string, BrokerHealth>();
  for (const row of rows) {
    const score = toScore(row.score);
    const followUpScore = toFollowUpScore(row.follow_up_share);
    result.set(String(row.broker_id), score !== null && followUpScore !== null ? { score, followUpScore } : null);
  }
  return result;
}
