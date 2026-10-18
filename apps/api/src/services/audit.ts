/**
 * File: apps/api/src/services/audit.ts
 * Purpose: Writes rows to audit_log. Every status change, persona edit, admin download and admin account
 * action goes through here (CLAUDE.md Rule 4), inside the same transaction as the change it records.
 *
 * Functions:
 * - writeAudit(tx, entry): inserts one audit_log row.
 */
import { auditLog, type DbOrTx } from "@bp/db";

export type AuditEntry = {
  actorUserId: string | null;
  action: string;
  entityType: "broker" | "broker_step" | "onboarding_step" | "file" | "user" | "account_token" | "chapter" | "lesson" | "question" | "quiz_attempt" | "contract_document" | "company_signature";
  entityId: string;
  before?: unknown;
  after?: unknown;
};

export async function writeAudit(tx: DbOrTx, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}
