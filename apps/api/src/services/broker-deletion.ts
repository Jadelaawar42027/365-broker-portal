/**
 * File: apps/api/src/services/broker-deletion.ts
 * Purpose: Permanently deletes a broker and everything stored about them: their login (user, sessions, password,
 * invite and reset links), onboarding steps and file records, agreements, commission history, persona, training
 * progress and quiz answers, provisioning tasks, and every audit_log row about them, in one transaction. Then it removes
 * every stored file under brokers/{brokerId}/ in the bucket. One audit row remains, saying which admin deleted a broker
 * and when, with counts only and no personal details. Google Workspace and GoHighLevel accounts are not touched.
 *
 * Functions:
 * - deleteBrokerCompletely(deps, input): deletes the broker after checking the typed name matches; returns what was removed.
 * - sameName(a, b): true when two names match, ignoring case and extra spaces.
 */
import {
  auditLog,
  brokerSteps,
  brokers,
  contractDocuments,
  files,
  quizAttempts,
  users,
  verifications,
  type Database,
} from "@bp/db";
import type { FileStorage } from "@bp/shared/node";
import { eq, inArray, or } from "drizzle-orm";
import { badRequest, conflict } from "../errors";
import { writeAudit } from "./audit";
import { loadBrokerWithUser } from "./brokers";

export type BrokerDeletionResult = {
  stepsDeleted: number;
  fileRecordsDeleted: number;
  agreementsDeleted: number;
  auditRowsDeleted: number;
  storedFilesDeleted: number;
  storageError: string | null;
  externalAccounts: { google: string | null; ghl: string | null };
};

function sameName(a: string, b: string): boolean {
  const normalise = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  return normalise(a) === normalise(b);
}

export async function deleteBrokerCompletely(
  deps: { db: Database; storage: FileStorage; log: { error: (object: object, message: string) => void } },
  input: { brokerId: string; confirmName: string; actorUserId: string },
): Promise<BrokerDeletionResult> {
  const { broker, user } = await loadBrokerWithUser(deps.db, input.brokerId);
  if (user.role !== "broker") throw conflict("This account isn't a broker.", "not_a_broker");
  if (!sameName(input.confirmName, user.name)) throw badRequest(`Type the broker's full name, ${user.name}, to confirm.`, "name_mismatch");

  const counts = await deps.db.transaction(async (tx) => {
    const steps = await tx.select({ id: brokerSteps.id }).from(brokerSteps).where(eq(brokerSteps.brokerId, broker.id));
    const stepIds = steps.map((step) => step.id);
    const fileRows = stepIds.length ? await tx.select({ id: files.id }).from(files).where(inArray(files.brokerStepId, stepIds)) : [];
    const documents = await tx.select({ id: contractDocuments.id }).from(contractDocuments).where(eq(contractDocuments.brokerId, broker.id));
    const attempts = await tx.select({ id: quizAttempts.id }).from(quizAttempts).where(eq(quizAttempts.brokerId, broker.id));
    const entityIds = [broker.id, user.id, ...stepIds, ...fileRows.map((row) => row.id), ...documents.map((row) => row.id), ...attempts.map((row) => row.id)];
    const auditRows = await tx.delete(auditLog).where(inArray(auditLog.entityId, entityIds)).returning({ id: auditLog.id });
    if (fileRows.length) {
      await tx.update(contractDocuments).set({ finalFileId: null }).where(eq(contractDocuments.brokerId, broker.id));
      await tx.delete(files).where(inArray(files.id, fileRows.map((row) => row.id)));
    }
    await tx.delete(brokers).where(eq(brokers.id, broker.id));
    await tx.delete(verifications).where(or(eq(verifications.identifier, user.email), eq(verifications.identifier, user.id)));
    await tx.delete(users).where(eq(users.id, user.id));
    const result = { stepsDeleted: stepIds.length, fileRecordsDeleted: fileRows.length, agreementsDeleted: documents.length, auditRowsDeleted: auditRows.length };
    await writeAudit(tx, { actorUserId: input.actorUserId, action: "broker.deleted", entityType: "broker", entityId: broker.id, after: result });
    return result;
  });

  let storedFilesDeleted = 0;
  let storageError: string | null = null;
  try {
    storedFilesDeleted = await deps.storage.deletePrefix(`brokers/${broker.id}/`);
  } catch (error) {
    storageError = "The broker's records are deleted, but some stored files couldn't be removed from the bucket. Try again later or remove the folder by hand.";
    deps.log.error({ brokerId: broker.id, err: error }, "Deleting a broker's stored files failed");
  }
  return { ...counts, storedFilesDeleted, storageError, externalAccounts: { google: broker.googleUserId, ghl: broker.ghlUserId } };
}
