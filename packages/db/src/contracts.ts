/**
 * File: packages/db/src/contracts.ts
 * Purpose: Database rules for contract documents shared by the API and the importer (SPEC D31). Voiding marks every
 * open document of a broker (not yet countersigned) as voided, keeps it for the record, resets onboarding step 2 to
 * "to do" when it wasn't approved yet, and writes audit_log rows. Fully signed documents are never voided this way.
 *
 * Functions:
 * - voidOpenContracts(tx, input): voids a broker's pending and broker-signed documents and resets step 2 (unless resetStep is false); returns how many were voided and whether any had been signed by the broker.
 */
import { CONTRACT_STEP_KEY } from "@bp/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "./client";
import { auditLog, brokerSteps, contractDocuments, onboardingSteps } from "./schema";

export async function voidOpenContracts(
  tx: DbOrTx,
  input: { brokerId: string; reason: string; actorUserId: string | null; now: Date; resetStep?: boolean },
): Promise<{ voided: number; brokerHadSigned: boolean }> {
  const voided = await tx
    .update(contractDocuments)
    .set({ status: "voided", voidedAt: input.now, voidedBy: input.actorUserId, voidReason: input.reason })
    .where(and(eq(contractDocuments.brokerId, input.brokerId), inArray(contractDocuments.status, ["pending", "broker_signed"])))
    .returning({ id: contractDocuments.id, templateKey: contractDocuments.templateKey, brokerSignedAt: contractDocuments.brokerSignedAt });
  for (const document of voided) {
    await tx.insert(auditLog).values({
      actorUserId: input.actorUserId,
      action: "contract.voided",
      entityType: "contract_document",
      entityId: document.id,
      after: { templateKey: document.templateKey, reason: input.reason },
    });
  }
  const brokerHadSigned = voided.some((document) => document.brokerSignedAt !== null);
  if (brokerHadSigned && input.resetStep !== false) {
    const [step] = await tx
      .select({ id: brokerSteps.id, status: brokerSteps.status })
      .from(brokerSteps)
      .innerJoin(onboardingSteps, eq(onboardingSteps.id, brokerSteps.stepId))
      .where(and(eq(brokerSteps.brokerId, input.brokerId), eq(onboardingSteps.key, CONTRACT_STEP_KEY)));
    if (step && step.status !== "approved" && step.status !== "todo") {
      await tx.update(brokerSteps).set({ status: "todo", reviewNote: `Please sign again: ${input.reason}` }).where(eq(brokerSteps.id, step.id));
      await tx.insert(auditLog).values({
        actorUserId: input.actorUserId,
        action: "step.reset",
        entityType: "broker_step",
        entityId: step.id,
        before: { status: step.status },
        after: { status: "todo", reason: input.reason },
      });
    }
  }
  return { voided: voided.length, brokerHadSigned };
}
