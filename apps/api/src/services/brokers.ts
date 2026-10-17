/**
 * File: apps/api/src/services/brokers.ts
 * Purpose: Admin queries over brokers. Every number comes from the broker_metrics view (CLAUDE.md Rule 4), and the
 * brokers table search also matches persona text with a simple ILIKE (docs/SPEC.md).
 *
 * Functions:
 * - toBrokerListRow(row): shapes a broker_metrics row for API responses.
 * - escapeLike(value): escapes %, _ and \ so user text is matched literally in ILIKE.
 * - listBrokerMetrics(db, filters): returns broker_metrics rows filtered by status, level and search, in table order.
 * - countBrokersByStatus(db): returns how many brokers are in each status, plus the total.
 * - loadBrokerWithUser(db, brokerId): returns the broker row joined with its user, or throws 404.
 */
import { brokerMetrics, brokers, users, type DbOrTx } from "@bp/db";
import type { BrokerLevel, BrokerListRow, BrokerStatus } from "@bp/shared";
import { and, desc, eq, getViewSelectedFields, ilike, or, sql, type SQL } from "drizzle-orm";
import { notFound } from "../errors";
import { toIso } from "./steps";

type MetricsRow = typeof brokerMetrics.$inferSelect;

export function toBrokerListRow(row: MetricsRow): BrokerListRow {
  return {
    brokerId: row.brokerId,
    name: row.name,
    email: row.email,
    level: row.level,
    status: row.status,
    joinedAt: row.joinedAt,
    onboardedAt: row.onboardedAt,
    leftAt: row.leftAt,
    tenureDays: row.tenureDays,
    daysToOnboard: row.daysToOnboard,
    stepsApproved: row.stepsApproved,
    stepsTotal: row.stepsTotal,
    stepsWaitingReview: row.stepsWaitingReview,
    lastActivityAt: toIso(row.lastActivityAt),
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export async function listBrokerMetrics(
  db: DbOrTx,
  filters: { status?: BrokerStatus; level?: BrokerLevel; search?: string } = {},
) {
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(brokerMetrics.status, filters.status));
  if (filters.level) conditions.push(eq(brokerMetrics.level, filters.level));
  if (filters.search) {
    const pattern = `%${escapeLike(filters.search)}%`;
    conditions.push(
      or(ilike(brokerMetrics.name, pattern), ilike(brokerMetrics.email, pattern), ilike(brokers.personaMd, pattern))!,
    );
  }
  const statusOrder = sql`CASE ${brokerMetrics.status} WHEN 'onboarding' THEN 0 WHEN 'invited' THEN 1 WHEN 'active' THEN 2 ELSE 3 END`;
  return db
    .select(getViewSelectedFields(brokerMetrics))
    .from(brokerMetrics)
    .innerJoin(brokers, eq(brokers.id, brokerMetrics.brokerId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(statusOrder, desc(brokerMetrics.joinedAt), brokerMetrics.name);
}

export async function countBrokersByStatus(db: DbOrTx) {
  const rows = await db
    .select({ status: brokers.status, count: sql<number>`count(*)::int` })
    .from(brokers)
    .groupBy(brokers.status);
  const counts = { total: 0, invited: 0, onboarding: 0, active: 0, inactive: 0 };
  for (const row of rows) {
    counts[row.status] = row.count;
    counts.total += row.count;
  }
  return counts;
}

export async function loadBrokerWithUser(db: DbOrTx, brokerId: string) {
  const [row] = await db
    .select({ broker: brokers, user: users })
    .from(brokers)
    .innerJoin(users, eq(users.id, brokers.userId))
    .where(eq(brokers.id, brokerId));
  if (!row) throw notFound("Broker not found.");
  return row;
}
