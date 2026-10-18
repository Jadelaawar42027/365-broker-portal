/**
 * File: apps/api/src/services/provisioning/status.ts
 * Purpose: Works out what the Accounts panel (3c) and the brokers table icons (3b) show for each system: Not configured,
 * Not set up, Pending, Created, Failed or Suspended, from the broker's stored account id and their latest provisioning
 * task for that system.
 *
 * Functions:
 * - deriveAccountStatus(input): the status for one system from configured, the stored id and the latest task.
 * - latestTasks(db, brokerIds): the newest provisioning task per broker and system, keyed "brokerId:system".
 * - loadAccountViews(db, integrations, broker): the Accounts panel rows (status, id, email, plain-words error, Retry / Link availability).
 * - loadAccountSummaries(db, integrations, brokers): { google, ghl } status per broker id for the brokers table.
 */
import { provisioningTasks, type DbOrTx } from "@bp/db";
import {
  ACCOUNT_STATUS_LABELS,
  PROVISIONING_SYSTEM_LABELS,
  PROVISIONING_SYSTEMS,
  type AccountStatus,
  type AccountSystemView,
  type ProvisioningSystem,
} from "@bp/shared";
import { desc, inArray } from "drizzle-orm";
import { isConfigured, type Integrations } from "./integrations";

type TaskRow = typeof provisioningTasks.$inferSelect;

type AccountBroker = { id: string; corporateEmail: string | null; googleUserId: string | null; ghlUserId: string | null };

export function deriveAccountStatus(input: { configured: boolean; accountId: string | null; latest: Pick<TaskRow, "action" | "status"> | null }): AccountStatus {
  const { latest } = input;
  if (latest && (latest.status === "pending" || latest.status === "running")) return input.configured ? "pending" : "not_configured";
  if (latest?.status === "failed") return "failed";
  if (input.accountId) return latest?.status === "done" && latest.action === "suspend" ? "suspended" : "created";
  return input.configured ? "not_set_up" : "not_configured";
}

export async function latestTasks(db: DbOrTx, brokerIds: string[]): Promise<Map<string, TaskRow>> {
  const latest = new Map<string, TaskRow>();
  if (brokerIds.length === 0) return latest;
  const rows = await db.select().from(provisioningTasks).where(inArray(provisioningTasks.brokerId, brokerIds)).orderBy(desc(provisioningTasks.createdAt));
  for (const row of rows) {
    const key = `${row.brokerId}:${row.system}`;
    if (!latest.has(key)) latest.set(key, row);
  }
  return latest;
}

export async function loadAccountViews(db: DbOrTx, integrations: Integrations, broker: AccountBroker): Promise<AccountSystemView[]> {
  const latest = await latestTasks(db, [broker.id]);
  return PROVISIONING_SYSTEMS.map((system: ProvisioningSystem) => {
    const configured = isConfigured(integrations, system);
    const accountId = system === "google" ? broker.googleUserId : broker.ghlUserId;
    const task = latest.get(`${broker.id}:${system}`) ?? null;
    const status = deriveAccountStatus({ configured, accountId, latest: task });
    return {
      system,
      label: PROVISIONING_SYSTEM_LABELS[system],
      status,
      statusLabel: ACCOUNT_STATUS_LABELS[status],
      accountId,
      email: accountId ? broker.corporateEmail : null,
      error: status === "failed" || status === "pending" ? (task?.lastError ?? null) : null,
      lastTask: task
        ? {
            action: task.action,
            status: task.status,
            attempts: task.attempts,
            updatedAt: task.updatedAt.toISOString(),
            nextAttemptAt: task.status === "pending" ? task.nextAttemptAt.toISOString() : null,
          }
        : null,
      canRetry: configured && (status === "failed" || status === "not_set_up"),
      canLink: configured && status !== "pending" && Boolean(broker.corporateEmail),
    };
  });
}

export async function loadAccountSummaries(db: DbOrTx, integrations: Integrations, brokers: AccountBroker[]) {
  const latest = await latestTasks(db, brokers.map((broker) => broker.id));
  const summaries = new Map<string, Record<ProvisioningSystem, AccountStatus>>();
  for (const broker of brokers) {
    summaries.set(broker.id, {
      google: deriveAccountStatus({ configured: isConfigured(integrations, "google"), accountId: broker.googleUserId, latest: latest.get(`${broker.id}:google`) ?? null }),
      ghl: deriveAccountStatus({ configured: isConfigured(integrations, "ghl"), accountId: broker.ghlUserId, latest: latest.get(`${broker.id}:ghl`) ?? null }),
    });
  }
  return summaries;
}
