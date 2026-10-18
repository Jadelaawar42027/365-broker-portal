/**
 * File: apps/api/src/services/provisioning/tasks.ts
 * Purpose: Queues provisioning tasks in the provisioning_tasks table. At most one open (pending or running) task exists
 * per broker, system and action (a partial unique index), so queuing twice is harmless. Systems that aren't configured
 * are skipped with a reason. Every queued task writes audit_log.
 *
 * Functions:
 * - enqueueTask(tx, input): adds one pending task unless an open one exists; returns true when a row was added.
 * - enqueueForSystems(tx, input): queues one action for each configured system (Google first), returning what was queued and what was skipped.
 * - cancelOpenTasks(tx, input): marks a broker's pending create, link or unsuspend tasks as failed with a reason (used when they are set inactive).
 */
import { provisioningTasks, type DbOrTx } from "@bp/db";
import { PROVISIONING_SYSTEMS, type ProvisioningAction, type ProvisioningSystem } from "@bp/shared";
import { and, eq, inArray } from "drizzle-orm";
import { writeAudit } from "../audit";
import { isConfigured, type Integrations } from "./integrations";

export async function enqueueTask(
  tx: DbOrTx,
  input: { brokerId: string; system: ProvisioningSystem; action: ProvisioningAction; createdBy: string | null; now: Date },
): Promise<boolean> {
  const inserted = await tx
    .insert(provisioningTasks)
    .values({ brokerId: input.brokerId, system: input.system, action: input.action, createdBy: input.createdBy, nextAttemptAt: input.now })
    .onConflictDoNothing()
    .returning({ id: provisioningTasks.id });
  if (inserted.length === 0) return false;
  await writeAudit(tx, {
    actorUserId: input.createdBy,
    action: "provisioning.queued",
    entityType: "broker",
    entityId: input.brokerId,
    after: { system: input.system, action: input.action, taskId: inserted[0]!.id },
  });
  return true;
}

export async function enqueueForSystems(
  tx: DbOrTx,
  input: {
    brokerId: string;
    action: ProvisioningAction;
    integrations: Integrations;
    createdBy: string | null;
    now: Date;
    systems?: readonly ProvisioningSystem[];
  },
) {
  const queued: ProvisioningSystem[] = [];
  const skipped: { system: ProvisioningSystem; reason: string }[] = [];
  for (const system of input.systems ?? PROVISIONING_SYSTEMS) {
    if (!isConfigured(input.integrations, system)) {
      skipped.push({ system, reason: "Not configured" });
      continue;
    }
    const added = await enqueueTask(tx, { brokerId: input.brokerId, system, action: input.action, createdBy: input.createdBy, now: input.now });
    if (added) queued.push(system);
    else skipped.push({ system, reason: "Already queued" });
  }
  return { queued, skipped };
}

export async function cancelOpenTasks(tx: DbOrTx, input: { brokerId: string; actions: ProvisioningAction[]; reason: string }): Promise<number> {
  const cancelled = await tx
    .update(provisioningTasks)
    .set({ status: "failed", lastError: input.reason })
    .where(and(eq(provisioningTasks.brokerId, input.brokerId), eq(provisioningTasks.status, "pending"), inArray(provisioningTasks.action, input.actions)))
    .returning({ id: provisioningTasks.id });
  return cancelled.length;
}
