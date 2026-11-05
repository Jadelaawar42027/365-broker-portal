/**
 * File: packages/db/src/brokers.ts
 * Purpose: Database operations for creating a broker. Creating one always creates their user row, their broker
 * row, one broker_steps row per active onboarding step and (when splits or a note are given) the first commission
 * history row together, so no broker can exist without a checklist.
 * Used by the seed, the invite and "add an existing broker" routes and the importer.
 *
 * Functions:
 * - createBroker(tx, input): inserts the user, broker (with level, status and dates), its first commission history row and todo step rows inside the given transaction; returns the broker and user ids.
 * - approveAllSteps(tx, input): marks every not-yet-approved step of the broker approved with the given reviewer and note; returns each changed step's id, key and previous status for the audit log.
 */
import type { BrokerLevel, BrokerStatus, StepStatus } from "@bp/shared";
import { and, eq, ne } from "drizzle-orm";
import type { Transaction } from "./client";
import { addCommissionChange } from "./commission";
import { brokerSteps, brokers, onboardingSteps, users } from "./schema";

export type CreateBrokerInput = {
  name: string;
  email: string;
  phone?: string | null;
  level: BrokerLevel;
  status?: BrokerStatus;
  joinedAt: string;
  onboardedAt?: string | null;
  leftAt?: string | null;
  inHouseSplit?: number | null;
  selfGeneratedSplit?: number | null;
  commissionNote?: string | null;
  commissionChangedBy?: string | null;
  personaMd?: string | null;
};

export async function createBroker(tx: Transaction, input: CreateBrokerInput) {
  const [user] = await tx
    .insert(users)
    .values({ name: input.name, email: input.email.toLowerCase(), phone: input.phone ?? null, role: "broker" })
    .returning({ id: users.id });
  const [broker] = await tx
    .insert(brokers)
    .values({
      userId: user!.id,
      level: input.level,
      status: input.status ?? "invited",
      joinedAt: input.joinedAt,
      onboardedAt: input.onboardedAt ?? null,
      leftAt: input.leftAt ?? null,
      personaMd: input.personaMd ?? null,
    })
    .returning({ id: brokers.id });
  const steps = await tx
    .select({ id: onboardingSteps.id })
    .from(onboardingSteps)
    .where(eq(onboardingSteps.active, true));
  const hasCommission = input.inHouseSplit != null || input.selfGeneratedSplit != null || Boolean(input.commissionNote);
  if (hasCommission) {
    await addCommissionChange(tx, {
      brokerId: broker!.id,
      inHousePct: input.inHouseSplit ?? null,
      selfGeneratedPct: input.selfGeneratedSplit ?? null,
      effectiveFrom: input.joinedAt,
      changedBy: input.commissionChangedBy ?? null,
      note: input.commissionNote ?? null,
    });
  }
  if (steps.length > 0) {
    await tx.insert(brokerSteps).values(steps.map((step) => ({ brokerId: broker!.id, stepId: step.id })));
  }
  return { brokerId: broker!.id, userId: user!.id };
}

export async function approveAllSteps(
  tx: Transaction,
  input: { brokerId: string; reviewedBy: string | null; note: string; now: Date },
): Promise<{ brokerStepId: string; stepKey: string; before: StepStatus }[]> {
  const pending = await tx
    .select({ brokerStepId: brokerSteps.id, stepKey: onboardingSteps.key, before: brokerSteps.status })
    .from(brokerSteps)
    .innerJoin(onboardingSteps, eq(onboardingSteps.id, brokerSteps.stepId))
    .where(and(eq(brokerSteps.brokerId, input.brokerId), eq(onboardingSteps.active, true), ne(brokerSteps.status, "approved")));
  for (const step of pending) {
    await tx
      .update(brokerSteps)
      .set({ status: "approved", reviewNote: input.note, reviewedAt: input.now, reviewedBy: input.reviewedBy })
      .where(eq(brokerSteps.id, step.brokerStepId));
  }
  return pending;
}
