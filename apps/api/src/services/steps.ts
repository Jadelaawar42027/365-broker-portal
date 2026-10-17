/**
 * File: apps/api/src/services/steps.ts
 * Purpose: Reads a broker's onboarding steps and files, and applies step status changes. Every change goes through
 * the shared state machine, is guarded against concurrent edits, records files, and writes an audit_log row. When the
 * last step is approved the broker becomes active (docs/SPEC.md).
 *
 * Functions:
 * - toIso(value): returns an ISO string for a Date, or null.
 * - loadBrokerSteps(db, brokerId): returns every active step of a broker joined with its template and reviewer name, in order.
 * - loadBrokerStepByKey(db, brokerId, key): returns one active step row by step key, or null.
 * - loadBrokerStepById(db, brokerStepId): returns one step row by broker_steps id (with the broker's user id), or null.
 * - loadFiles(db, brokerStepIds): returns file rows (with uploader name and role) for the given steps, newest version first.
 * - toFileView(file): shapes a file row for API responses.
 * - latestVersionFiles(files): keeps only the files of the highest version.
 * - toStepSummary(row, nextKey): shapes a step row as a StepSummary with its status label.
 * - nextFileVersion(tx, brokerStepId): returns the version number the next submission will use.
 * - applyStepAction(tx, input): runs a state-machine action, updates the row, stores files and writes the audit row; returns the old and new status.
 * - activateIfComplete(tx, input): makes an onboarding broker active (and stamps onboarded_at) once every step is approved; returns true if it did.
 */
import { brokerSteps, brokers, files, onboardingSteps, users, type DbOrTx } from "@bp/db";
import {
  isOnboardingComplete,
  STAGE_TITLES,
  stepStatusLabel,
  transitionStep,
  type FileView,
  type StepAction,
  type StepStatus,
  type StepSummary,
  type UserRole,
} from "@bp/shared";
import { and, desc, eq, inArray, max, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { conflict } from "../errors";
import { writeAudit } from "./audit";

export function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

const reviewer = alias(users, "reviewer");

const stepColumns = {
  brokerStepId: brokerSteps.id,
  brokerId: brokerSteps.brokerId,
  stepId: onboardingSteps.id,
  key: onboardingSteps.key,
  position: onboardingSteps.position,
  stage: onboardingSteps.stage,
  title: onboardingSteps.title,
  shortTitle: onboardingSteps.shortTitle,
  summary: onboardingSteps.summary,
  intro: onboardingSteps.intro,
  kind: onboardingSteps.kind,
  needsApproval: onboardingSteps.needsApproval,
  instructionsMd: onboardingSteps.instructionsMd,
  templateFileKey: onboardingSteps.templateFileKey,
  videoUrl: onboardingSteps.videoUrl,
  acceptedTypes: onboardingSteps.acceptedTypes,
  maxSizeBytes: onboardingSteps.maxSizeBytes,
  config: onboardingSteps.config,
  active: onboardingSteps.active,
  status: brokerSteps.status,
  formData: brokerSteps.formData,
  attempts: brokerSteps.attempts,
  submittedAt: brokerSteps.submittedAt,
  reviewedAt: brokerSteps.reviewedAt,
  reviewedBy: brokerSteps.reviewedBy,
  reviewNote: brokerSteps.reviewNote,
  reviewerName: reviewer.name,
};

export type BrokerStepRow = Awaited<ReturnType<typeof loadBrokerSteps>>[number];

export async function loadBrokerSteps(db: DbOrTx, brokerId: string) {
  return db
    .select(stepColumns)
    .from(brokerSteps)
    .innerJoin(onboardingSteps, eq(onboardingSteps.id, brokerSteps.stepId))
    .leftJoin(reviewer, eq(reviewer.id, brokerSteps.reviewedBy))
    .where(and(eq(brokerSteps.brokerId, brokerId), eq(onboardingSteps.active, true)))
    .orderBy(onboardingSteps.position);
}

export async function loadBrokerStepByKey(db: DbOrTx, brokerId: string, key: string) {
  const [row] = await db
    .select(stepColumns)
    .from(brokerSteps)
    .innerJoin(onboardingSteps, eq(onboardingSteps.id, brokerSteps.stepId))
    .leftJoin(reviewer, eq(reviewer.id, brokerSteps.reviewedBy))
    .where(and(eq(brokerSteps.brokerId, brokerId), eq(onboardingSteps.key, key), eq(onboardingSteps.active, true)));
  return row ?? null;
}

export async function loadBrokerStepById(db: DbOrTx, brokerStepId: string) {
  const [row] = await db
    .select({ ...stepColumns, brokerUserId: brokers.userId, brokerStatus: brokers.status })
    .from(brokerSteps)
    .innerJoin(onboardingSteps, eq(onboardingSteps.id, brokerSteps.stepId))
    .innerJoin(brokers, eq(brokers.id, brokerSteps.brokerId))
    .leftJoin(reviewer, eq(reviewer.id, brokerSteps.reviewedBy))
    .where(eq(brokerSteps.id, brokerStepId));
  return row ?? null;
}

const uploader = alias(users, "uploader");

export type FileRow = Awaited<ReturnType<typeof loadFiles>>[number];

export async function loadFiles(db: DbOrTx, brokerStepIds: string[]) {
  if (brokerStepIds.length === 0) return [];
  return db
    .select({
      id: files.id,
      brokerStepId: files.brokerStepId,
      storageKey: files.storageKey,
      fileName: files.fileName,
      mimeType: files.mimeType,
      sizeBytes: files.sizeBytes,
      version: files.version,
      createdAt: files.createdAt,
      uploadedByName: uploader.name,
      uploadedByRole: uploader.role,
    })
    .from(files)
    .leftJoin(uploader, eq(uploader.id, files.uploadedBy))
    .where(inArray(files.brokerStepId, brokerStepIds))
    .orderBy(desc(files.version), files.createdAt);
}

export function toFileView(file: FileRow): FileView {
  const role: UserRole | null = file.uploadedByRole;
  return {
    id: file.id,
    fileName: file.fileName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    version: file.version,
    uploadedAt: file.createdAt.toISOString(),
    uploadedByName: file.uploadedByName,
    uploadedByAdmin: role === "admin" || role === "owner",
  };
}

export function latestVersionFiles(rows: FileRow[]): FileRow[] {
  const latest = rows.reduce((highest, file) => Math.max(highest, file.version), 0);
  return rows.filter((file) => file.version === latest);
}

export function toStepSummary(row: BrokerStepRow, nextKey: string | null): StepSummary {
  const isNext = row.key === nextKey;
  const { label, tone } = stepStatusLabel({
    status: row.status,
    stepKey: row.key,
    needsApproval: row.needsApproval,
    isNext,
  });
  return {
    key: row.key,
    position: row.position,
    stage: row.stage,
    stageTitle: STAGE_TITLES[row.stage],
    title: row.title,
    shortTitle: row.shortTitle,
    summary: row.summary,
    kind: row.kind,
    needsApproval: row.needsApproval,
    status: row.status,
    label,
    tone,
    isNext,
    minutes: row.config.minutes ?? null,
    review:
      row.status === "changes_requested" || row.reviewNote
        ? { note: row.reviewNote, reviewerName: row.reviewerName, reviewedAt: toIso(row.reviewedAt) }
        : null,
  };
}

export async function nextFileVersion(tx: DbOrTx, brokerStepId: string): Promise<number> {
  const [row] = await tx
    .select({ version: max(files.version) })
    .from(files)
    .where(eq(files.brokerStepId, brokerStepId));
  return (row?.version ?? 0) + 1;
}

export type VerifiedFile = { storageKey: string; fileName: string; mimeType: string; sizeBytes: number };

export async function applyStepAction(
  tx: DbOrTx,
  input: {
    row: { brokerStepId: string; brokerId: string; key: string; status: StepStatus; needsApproval: boolean };
    action: StepAction;
    actorUserId: string;
    now: Date;
    note?: string | null;
    formData?: Record<string, unknown> | null;
    files?: VerifiedFile[];
  },
): Promise<{ from: StepStatus; to: StepStatus; version: number | null }> {
  const { row, action, now } = input;
  const from = row.status;
  const to = transitionStep({ from, action, needsApproval: row.needsApproval, note: input.note });

  const changes: Partial<typeof brokerSteps.$inferInsert> = { status: to };
  if (action === "submit") {
    changes.submittedAt = now;
    changes.attempts = sql`${brokerSteps.attempts} + 1` as unknown as number;
    if (input.formData !== undefined) changes.formData = input.formData;
    if (to === "approved") {
      changes.reviewedAt = null;
      changes.reviewedBy = null;
    }
  } else {
    changes.reviewedAt = now;
    changes.reviewedBy = input.actorUserId;
    changes.reviewNote = action === "approve" ? null : (input.note?.trim() || null);
    if (input.formData !== undefined) changes.formData = input.formData;
  }

  const updated = await tx
    .update(brokerSteps)
    .set(changes)
    .where(and(eq(brokerSteps.id, row.brokerStepId), eq(brokerSteps.status, from)))
    .returning({ id: brokerSteps.id });
  if (updated.length === 0) {
    throw conflict("This step changed while you were looking at it. Reload and try again.", "step_changed");
  }

  let version: number | null = null;
  if (input.files && input.files.length > 0) {
    version = await nextFileVersion(tx, row.brokerStepId);
    await tx.insert(files).values(
      input.files.map((file) => ({
        brokerStepId: row.brokerStepId,
        storageKey: file.storageKey,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        version: version!,
        uploadedBy: input.actorUserId,
      })),
    );
  }

  await writeAudit(tx, {
    actorUserId: input.actorUserId,
    action: `step.${action}`,
    entityType: "broker_step",
    entityId: row.brokerStepId,
    before: { status: from },
    after: {
      status: to,
      stepKey: row.key,
      brokerId: row.brokerId,
      ...(input.note ? { note: input.note } : {}),
      ...(version ? { fileVersion: version, fileCount: input.files!.length } : {}),
    },
  });
  return { from, to, version };
}

export async function activateIfComplete(
  tx: DbOrTx,
  input: { brokerId: string; actorUserId: string; today: string },
): Promise<boolean> {
  const steps = await loadBrokerSteps(tx, input.brokerId);
  if (!isOnboardingComplete(steps)) return false;
  const activated = await tx
    .update(brokers)
    .set({ status: "active", onboardedAt: input.today })
    .where(and(eq(brokers.id, input.brokerId), eq(brokers.status, "onboarding")))
    .returning({ id: brokers.id });
  if (activated.length === 0) return false;
  await writeAudit(tx, {
    actorUserId: input.actorUserId,
    action: "broker.onboarded",
    entityType: "broker",
    entityId: input.brokerId,
    before: { status: "onboarding", onboardedAt: null },
    after: { status: "active", onboardedAt: input.today },
  });
  return true;
}
