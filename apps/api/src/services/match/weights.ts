/**
 * File: apps/api/src/services/match/weights.ts
 * Purpose: The scoring weights lead matching uses, read from the match_weights table so admins can change them without a
 * redeploy. The newest row applies; with no rows the defaults (fit 45, performance 35, availability 20, follow-up 10
 * points) apply. Each change adds a row and an audit_log entry, so earlier weights stay on record.
 *
 * Functions:
 * - currentMatchWeights(db): the weights in force, whether they are the defaults, and when and by whom they were last changed.
 * - saveMatchWeights(db, weights, actorUserId): stores new weights and audits the change; returns the weights now in force.
 */
import { matchWeights, users, type Database } from "@bp/db";
import { DEFAULT_MATCH_WEIGHTS, type MatchWeights, type MatchWeightsResponse } from "@bp/shared";
import { desc, eq } from "drizzle-orm";
import { writeAudit } from "../audit";

export async function currentMatchWeights(db: Database): Promise<MatchWeightsResponse> {
  const [row] = await db
    .select({
      fit: matchWeights.fit,
      performance: matchWeights.performance,
      availability: matchWeights.availability,
      followUpPoints: matchWeights.followUpPoints,
      createdAt: matchWeights.createdAt,
      createdByName: users.name,
    })
    .from(matchWeights)
    .leftJoin(users, eq(users.id, matchWeights.createdBy))
    .orderBy(desc(matchWeights.createdAt))
    .limit(1);
  if (!row) return { weights: { ...DEFAULT_MATCH_WEIGHTS }, isDefault: true, updatedAt: null, updatedByName: null };
  return {
    weights: { fit: row.fit, performance: row.performance, availability: row.availability, followUpPoints: row.followUpPoints },
    isDefault: false,
    updatedAt: row.createdAt.toISOString(),
    updatedByName: row.createdByName ?? null,
  };
}

export async function saveMatchWeights(db: Database, weights: MatchWeights, actorUserId: string): Promise<MatchWeightsResponse> {
  const before = await currentMatchWeights(db);
  await db.transaction(async (tx) => {
    const [row] = await tx.insert(matchWeights).values({ ...weights, createdBy: actorUserId }).returning({ id: matchWeights.id });
    await writeAudit(tx, {
      actorUserId,
      action: "match.weights_updated",
      entityType: "match_weights",
      entityId: row!.id,
      before: before.weights,
      after: weights,
    });
  });
  return currentMatchWeights(db);
}
