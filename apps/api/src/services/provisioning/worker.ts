/**
 * File: apps/api/src/services/provisioning/worker.ts
 * Purpose: Runs provisioning tasks from the provisioning_tasks table inside the api service (no Redis). Each task is
 * claimed in one statement with SELECT ... FOR UPDATE SKIP LOCKED, so two api replicas never run the same task. Google
 * tasks go before GoHighLevel ones. A failure that can help to retry waits 30 s, 1 min, 2 min, 4 min (max 5
 * attempts); one that can't (bad credentials, refused input) fails at once. Tasks for systems that aren't configured
 * stay pending. Tasks left "running" by a crashed process go back to pending after 10 minutes.
 *
 * Functions:
 * - claimNextTask(db, now, systems): marks the next due task of the given systems as running (one more attempt) and returns it, or null.
 * - finishTask(db, task, outcome, now): records done, deferred, a retry with backoff, or failed; failures also write audit_log.
 * - recoverStaleTasks(db, now): puts tasks stuck in "running" for 10+ minutes back to pending; returns how many.
 * - processDueTasks(context, options): runs due tasks one by one until none are left (or the limit); returns how many ran.
 * - startProvisioningWorker(context, options): polls every few seconds in the background; returns { wake, stop }.
 * - loop(): one polling round of the background worker.
 */
import { provisioningTasks, type Database } from "@bp/db";
import { canRetryProvisioning, provisioningBackoffMs, type ProvisioningAction, type ProvisioningSystem, type ProvisioningTaskStatus } from "@bp/shared";
import { and, eq, lt, sql } from "drizzle-orm";
import { writeAudit } from "../audit";
import { ProvisioningError } from "./errors";
import { DeferTask, runTaskAction, type TaskContext } from "./handlers";

export type ClaimedTask = {
  id: string;
  brokerId: string;
  system: ProvisioningSystem;
  action: ProvisioningAction;
  status: ProvisioningTaskStatus;
  attempts: number;
};

type Outcome = { kind: "done" } | { kind: "defer"; message: string } | { kind: "error"; message: string; retryable: boolean };

const STALE_AFTER_MS = 10 * 60 * 1000;
const DEFER_MS = 30_000;

export async function claimNextTask(db: Database, now: Date, systems: ProvisioningSystem[]): Promise<ClaimedTask | null> {
  if (systems.length === 0) return null;
  const rows = await db.execute<{ id: string; broker_id: string; system: ProvisioningSystem; action: ProvisioningAction; status: ProvisioningTaskStatus; attempts: number }>(sql`
    UPDATE provisioning_tasks
    SET status = 'running', attempts = attempts + 1, updated_at = ${now.toISOString()}::timestamptz
    WHERE id = (
      SELECT id FROM provisioning_tasks
      WHERE status = 'pending'
        AND next_attempt_at <= ${now.toISOString()}::timestamptz
        AND system::text IN (${sql.join(systems.map((system) => sql`${system}`), sql`, `)})
      ORDER BY CASE system WHEN 'google' THEN 0 ELSE 1 END, created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, broker_id, system, action, status, attempts
  `);
  const row = rows[0];
  return row ? { id: row.id, brokerId: row.broker_id, system: row.system, action: row.action, status: row.status, attempts: row.attempts } : null;
}

async function finishTask(db: Database, task: ClaimedTask, outcome: Outcome, now: Date): Promise<void> {
  if (outcome.kind === "done") {
    await db.update(provisioningTasks).set({ status: "done", lastError: null, updatedAt: now }).where(eq(provisioningTasks.id, task.id));
    return;
  }
  if (outcome.kind === "defer") {
    await db
      .update(provisioningTasks)
      .set({ status: "pending", attempts: Math.max(0, task.attempts - 1), lastError: outcome.message, nextAttemptAt: new Date(now.getTime() + DEFER_MS), updatedAt: now })
      .where(eq(provisioningTasks.id, task.id));
    return;
  }
  const retry = outcome.retryable && canRetryProvisioning(task.attempts);
  await db.transaction(async (tx) => {
    await tx
      .update(provisioningTasks)
      .set({
        status: retry ? "pending" : "failed",
        lastError: outcome.message,
        nextAttemptAt: retry ? new Date(now.getTime() + provisioningBackoffMs(task.attempts)) : now,
        updatedAt: now,
      })
      .where(eq(provisioningTasks.id, task.id));
    if (!retry) {
      await writeAudit(tx, {
        actorUserId: null,
        action: "provisioning.failed",
        entityType: "broker",
        entityId: task.brokerId,
        after: { system: task.system, action: task.action, attempts: task.attempts, error: outcome.message },
      });
    }
  });
}

export async function recoverStaleTasks(db: Database, now: Date): Promise<number> {
  const recovered = await db
    .update(provisioningTasks)
    .set({ status: "pending", nextAttemptAt: now, updatedAt: now })
    .where(and(eq(provisioningTasks.status, "running"), lt(provisioningTasks.updatedAt, new Date(now.getTime() - STALE_AFTER_MS))))
    .returning({ id: provisioningTasks.id });
  return recovered.length;
}

export async function processDueTasks(context: TaskContext & { log?: { warn: (message: string) => void } }, options: { limit?: number } = {}): Promise<number> {
  const systems = (["google", "ghl"] as const).filter((system) => (system === "google" ? context.integrations.google : context.integrations.ghl));
  let ran = 0;
  const limit = options.limit ?? 50;
  while (ran < limit) {
    const task = await claimNextTask(context.db, context.now(), [...systems]);
    if (!task) break;
    ran += 1;
    let outcome: Outcome;
    try {
      await runTaskAction(context, task);
      outcome = { kind: "done" };
    } catch (error) {
      if (error instanceof DeferTask) outcome = { kind: "defer", message: error.message };
      else if (error instanceof ProvisioningError) outcome = { kind: "error", message: error.message, retryable: error.retryable };
      else outcome = { kind: "error", message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`, retryable: true };
      if (outcome.kind === "error") context.log?.warn(`Provisioning ${task.system} ${task.action} for broker ${task.brokerId} failed (attempt ${task.attempts}): ${outcome.message}`);
    }
    await finishTask(context.db, task, outcome, context.now());
  }
  return ran;
}

export function startProvisioningWorker(
  context: TaskContext & { log: { warn: (message: string) => void; error: (message: string) => void } },
  options: { intervalMs?: number } = {},
) {
  const intervalMs = options.intervalMs ?? 5000;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let running: Promise<void> | null = null;

  async function loop(): Promise<void> {
    timer = null;
    try {
      await recoverStaleTasks(context.db, context.now());
      await processDueTasks(context);
    } catch (error) {
      context.log.error(`Provisioning worker round failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!stopped) timer = setTimeout(() => void (running = loop()), intervalMs);
  }

  running = loop();
  return {
    wake() {
      if (stopped || !timer) return;
      clearTimeout(timer);
      running = loop();
    },
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await running;
    },
  };
}
