/**
 * File: packages/db/src/commission.ts
 * Purpose: Database operations for a broker's commission history (SPEC D29). Each change of the two splits is a new
 * commission_history row; the current split is the latest row (by effective date, then by when it was written).
 *
 * Functions:
 * - addCommissionChange(tx, input): inserts one history row; returns its id.
 * - commissionHistoryFor(db, brokerId): every history row of a broker, newest first, with the name of who changed it.
 * - currentCommission(db, brokerId): the latest row's two percentages, or nulls when the broker has no history.
 */
import { desc, eq } from "drizzle-orm";
import type { DbOrTx } from "./client";
import { commissionHistory, users } from "./schema";

export type CommissionChangeInput = {
  brokerId: string;
  inHousePct: number | null;
  selfGeneratedPct: number | null;
  effectiveFrom?: string;
  changedBy?: string | null;
  note?: string | null;
};

export async function addCommissionChange(tx: DbOrTx, input: CommissionChangeInput): Promise<string> {
  const [row] = await tx
    .insert(commissionHistory)
    .values({
      brokerId: input.brokerId,
      inHousePct: input.inHousePct,
      selfGeneratedPct: input.selfGeneratedPct,
      ...(input.effectiveFrom ? { effectiveFrom: input.effectiveFrom } : {}),
      changedBy: input.changedBy ?? null,
      note: input.note ?? null,
    })
    .returning({ id: commissionHistory.id });
  return row!.id;
}

export async function commissionHistoryFor(db: DbOrTx, brokerId: string) {
  return db
    .select({
      id: commissionHistory.id,
      inHousePct: commissionHistory.inHousePct,
      selfGeneratedPct: commissionHistory.selfGeneratedPct,
      effectiveFrom: commissionHistory.effectiveFrom,
      changedByName: users.name,
      note: commissionHistory.note,
      createdAt: commissionHistory.createdAt,
    })
    .from(commissionHistory)
    .leftJoin(users, eq(users.id, commissionHistory.changedBy))
    .where(eq(commissionHistory.brokerId, brokerId))
    .orderBy(desc(commissionHistory.effectiveFrom), desc(commissionHistory.createdAt));
}

export async function currentCommission(db: DbOrTx, brokerId: string): Promise<{ inHousePct: number | null; selfGeneratedPct: number | null }> {
  const [latest] = await db
    .select({ inHousePct: commissionHistory.inHousePct, selfGeneratedPct: commissionHistory.selfGeneratedPct })
    .from(commissionHistory)
    .where(eq(commissionHistory.brokerId, brokerId))
    .orderBy(desc(commissionHistory.effectiveFrom), desc(commissionHistory.createdAt))
    .limit(1);
  return latest ?? { inHousePct: null, selfGeneratedPct: null };
}
