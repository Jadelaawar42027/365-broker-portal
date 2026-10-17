/**
 * File: packages/db/src/brokers.ts
 * Purpose: Database operations for creating a broker. Creating one always creates their user row, their broker
 * row and one broker_steps row per active onboarding step together, so no broker can exist without a checklist.
 * Used by the seed now and by the invite route and importer later.
 *
 * Functions:
 * - createBroker(tx, input): inserts the user, broker (with level, status, dates and commission splits) and todo step rows inside the given transaction; returns the broker and user ids.
 */
import type { BrokerLevel, BrokerStatus } from "@bp/shared";
import { eq } from "drizzle-orm";
import type { Transaction } from "./client";
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
  commissionTier?: string | null;
  inHouseSplit?: number | null;
  selfGeneratedSplit?: number | null;
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
      commissionTier: input.commissionTier ?? null,
      inHouseSplit: input.inHouseSplit ?? null,
      selfGeneratedSplit: input.selfGeneratedSplit ?? null,
      personaMd: input.personaMd ?? null,
    })
    .returning({ id: brokers.id });
  const steps = await tx
    .select({ id: onboardingSteps.id })
    .from(onboardingSteps)
    .where(eq(onboardingSteps.active, true));
  if (steps.length > 0) {
    await tx.insert(brokerSteps).values(steps.map((step) => ({ brokerId: broker!.id, stepId: step.id })));
  }
  return { brokerId: broker!.id, userId: user!.id };
}
