/**
 * File: packages/db/src/import/importer.ts
 * Purpose: Imports existing brokers (docs/SPEC.md "Import existing brokers"): reads the import folder, then upserts
 * each broker by email, sets personas, uploads their paperwork and marks onboarded brokers' steps approved with the
 * note "imported". Never deletes anything, runs in one transaction, writes audit_log rows, and is safe to run again.
 * A dry run does the same work and rolls it back, so its summary is exact.
 *
 * Functions:
 * - contentTypeFor(fileName): the MIME type for a .pdf, .jpg/.jpeg or .png file, or null.
 * - matchStepKey(baseName, stepKeys): the upload step a file name belongs to ("w9" or "w9-page2" → "w9"), or null.
 * - loadImportFolder(dir, uploadStepKeys): reads brokers.csv, personas/{email}.md and files/{email}/{stepKey}.{ext}; returns the parsed input and any errors.
 * - runImport(db, storage, input, options): applies the import (or rehearses it with dryRun) and returns the summary.
 * - importRow(tx, context, row): creates or updates one broker and everything that belongs to them; blank commission split cells leave the current splits alone.
 * - approveForImport(tx, context, brokerStepId, before): marks one step approved as imported and records it in audit_log.
 * - audit(tx, entry): inserts an audit_log row with no actor (the importer).
 * - DryRunRollback.constructor(summary): the error used to roll back a dry run while keeping its summary.
 */
import { buildStorageKey, MAX_UPLOAD_BYTES, type StepStatus } from "@bp/shared";
import type { FileStorage } from "@bp/shared/node";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { createBroker } from "../brokers";
import type { Database, Transaction } from "../client";
import { accounts, auditLog, brokerSteps, brokers, files, onboardingSteps, sessions, users } from "../schema";
import { parseBrokerCsv, type BrokerCsvRow } from "./csv";

export type ImportFile = { stepKey: string; fileName: string; contentType: string; body: Uint8Array };

export type ImportInput = {
  rows: BrokerCsvRow[];
  personas: Map<string, string>;
  files: Map<string, ImportFile[]>;
};

export type ImportSummary = {
  created: string[];
  updated: string[];
  unchanged: string[];
  personasSet: number;
  filesUploaded: number;
  filesSkipped: number;
  stepsApproved: number;
  withoutLogin: string[];
  warnings: string[];
};

type ImportContext = {
  storage: FileStorage | null;
  dryRun: boolean;
  now: Date;
  summary: ImportSummary;
  input: ImportInput;
};

const CONTENT_TYPES: Record<string, string> = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };

function contentTypeFor(fileName: string): string | null {
  return CONTENT_TYPES[path.extname(fileName).toLowerCase()] ?? null;
}

export function matchStepKey(baseName: string, stepKeys: readonly string[]): string | null {
  const name = baseName.toLowerCase();
  return [...stepKeys].sort((a, b) => b.length - a.length).find((key) => name === key || name.startsWith(`${key}-`)) ?? null;
}

export function loadImportFolder(dir: string, uploadStepKeys: readonly string[]) {
  const errors: string[] = [];
  const csvPath = path.join(dir, "brokers.csv");
  if (!fs.existsSync(csvPath)) {
    return { input: null, errors: [`${csvPath} not found. Copy docs/templates/brokers-import-example.csv there and fill it in.`] };
  }
  const parsed = parseBrokerCsv(fs.readFileSync(csvPath, "utf8"));
  errors.push(...parsed.errors.map((error) => `brokers.csv line ${error.line}: ${error.message}`));

  const personas = new Map<string, string>();
  const personaDir = path.join(dir, "personas");
  if (fs.existsSync(personaDir)) {
    for (const entry of fs.readdirSync(personaDir)) {
      if (entry.toLowerCase().endsWith(".md")) {
        personas.set(entry.slice(0, -3).toLowerCase(), fs.readFileSync(path.join(personaDir, entry), "utf8"));
      }
    }
  }

  const importFiles = new Map<string, ImportFile[]>();
  const filesDir = path.join(dir, "files");
  if (fs.existsSync(filesDir)) {
    for (const emailFolder of fs.readdirSync(filesDir)) {
      const folder = path.join(filesDir, emailFolder);
      if (!fs.statSync(folder).isDirectory()) continue;
      for (const fileName of fs.readdirSync(folder)) {
        if (fileName.startsWith(".")) continue;
        const where = `files/${emailFolder}/${fileName}`;
        const contentType = contentTypeFor(fileName);
        const stepKey = matchStepKey(path.basename(fileName, path.extname(fileName)), uploadStepKeys);
        const size = fs.statSync(path.join(folder, fileName)).size;
        if (!contentType) errors.push(`${where}: only PDF, JPG and PNG files can be imported.`);
        else if (!stepKey) errors.push(`${where}: the name must start with an upload step key (${uploadStepKeys.join(", ")}).`);
        else if (size === 0 || size > MAX_UPLOAD_BYTES) errors.push(`${where}: files must be between 1 byte and 10 MB.`);
        else {
          const list = importFiles.get(emailFolder.toLowerCase()) ?? [];
          list.push({ stepKey, fileName, contentType, body: fs.readFileSync(path.join(folder, fileName)) });
          importFiles.set(emailFolder.toLowerCase(), list);
        }
      }
    }
  }
  return { input: { rows: parsed.rows, personas, files: importFiles } satisfies ImportInput, errors };
}

class DryRunRollback extends Error {
  readonly summary: ImportSummary;

  constructor(summary: ImportSummary) {
    super("dry run");
    this.summary = summary;
  }
}

async function audit(tx: Transaction, entry: { action: string; entityType: string; entityId: string; before?: unknown; after?: unknown }) {
  await tx.insert(auditLog).values({ actorUserId: null, before: null, after: null, ...entry });
}

async function approveForImport(tx: Transaction, context: ImportContext, brokerStepId: string, before: StepStatus) {
  await tx
    .update(brokerSteps)
    .set({ status: "approved", reviewNote: "imported", reviewedAt: context.now, reviewedBy: null })
    .where(eq(brokerSteps.id, brokerStepId));
  await audit(tx, { action: "step.imported", entityType: "broker_step", entityId: brokerStepId, before: { status: before }, after: { status: "approved", note: "imported" } });
  context.summary.stepsApproved += 1;
}

async function importRow(tx: Transaction, context: ImportContext, row: BrokerCsvRow) {
  const { summary, now } = context;
  const [existing] = await tx
    .select({ user: users, broker: brokers })
    .from(users)
    .leftJoin(brokers, eq(brokers.userId, users.id))
    .where(eq(users.email, row.email));
  if (existing && (existing.user.role !== "broker" || !existing.broker)) {
    summary.warnings.push(`${row.email} (line ${row.line}) is an admin account, not a broker — skipped.`);
    return;
  }
  const persona = context.input.personas.get(row.email) ?? null;
  const desired = {
    level: row.level,
    status: row.status,
    joinedAt: row.joinedAt,
    onboardedAt: row.onboardedAt,
    leftAt: row.leftAt,
    commissionTier: row.commissionTier,
    ...(row.inHouseSplit === null ? {} : { inHouseSplit: row.inHouseSplit }),
    ...(row.selfGeneratedSplit === null ? {} : { selfGeneratedSplit: row.selfGeneratedSplit }),
  };

  let brokerId: string;
  let userId: string;
  if (!existing) {
    const created = await createBroker(tx, { name: row.name, email: row.email, phone: row.phone, personaMd: persona, ...desired });
    brokerId = created.brokerId;
    userId = created.userId;
    if (persona) {
      await tx.update(brokers).set({ personaUpdatedAt: now }).where(eq(brokers.id, brokerId));
      summary.personasSet += 1;
    }
    await audit(tx, { action: "broker.imported", entityType: "broker", entityId: brokerId, after: { email: row.email, ...desired } });
    summary.created.push(row.email);
  } else {
    const broker = existing.broker!;
    brokerId = broker.id;
    userId = existing.user.id;
    const brokerChanges = Object.fromEntries(
      Object.entries(desired).filter(([key, value]) => broker[key as keyof typeof broker] !== value),
    ) as Partial<typeof desired>;
    const userChanges: { name?: string; phone?: string | null } = {};
    if (existing.user.name !== row.name) userChanges.name = row.name;
    if (row.phone && existing.user.phone !== row.phone) userChanges.phone = row.phone;
    const personaChanged = persona !== null && broker.personaMd !== persona;
    if (Object.keys(brokerChanges).length > 0 || personaChanged) {
      await tx
        .update(brokers)
        .set({ ...brokerChanges, ...(personaChanged ? { personaMd: persona, personaUpdatedAt: now, personaUpdatedBy: null } : {}) })
        .where(eq(brokers.id, brokerId));
    }
    if (Object.keys(userChanges).length > 0) await tx.update(users).set(userChanges).where(eq(users.id, userId));
    if (brokerChanges.status === "inactive") await tx.delete(sessions).where(eq(sessions.userId, userId));
    if (personaChanged) summary.personasSet += 1;
    const changed = Object.keys(brokerChanges).length > 0 || Object.keys(userChanges).length > 0 || personaChanged;
    if (changed) {
      await audit(tx, {
        action: "broker.imported",
        entityType: "broker",
        entityId: brokerId,
        before: Object.fromEntries(Object.keys(brokerChanges).map((key) => [key, broker[key as keyof typeof broker]])),
        after: { ...brokerChanges, ...userChanges, ...(personaChanged ? { personaMd: persona } : {}) },
      });
      summary.updated.push(row.email);
    } else {
      summary.unchanged.push(row.email);
    }
  }

  const steps = await tx
    .select({ id: brokerSteps.id, key: onboardingSteps.key, status: brokerSteps.status })
    .from(brokerSteps)
    .innerJoin(onboardingSteps, eq(onboardingSteps.id, brokerSteps.stepId))
    .where(and(eq(brokerSteps.brokerId, brokerId), eq(onboardingSteps.active, true)));

  for (const file of context.input.files.get(row.email) ?? []) {
    const step = steps.find((candidate) => candidate.key === file.stepKey);
    if (!step) continue;
    const already = await tx
      .select({ id: files.id, version: files.version, fileName: files.fileName, sizeBytes: files.sizeBytes })
      .from(files)
      .where(eq(files.brokerStepId, step.id));
    if (already.some((existingFile) => existingFile.fileName === file.fileName && existingFile.sizeBytes === file.body.byteLength)) {
      summary.filesSkipped += 1;
      continue;
    }
    const version = already.reduce((highest, existingFile) => Math.max(highest, existingFile.version), 0) + 1;
    const storageKey = buildStorageKey({ brokerId, stepKey: step.key, version, nonce: randomBytes(6).toString("hex"), fileName: file.fileName });
    if (!context.dryRun) {
      if (!context.storage) throw new Error("File storage is not configured (S3_*), so files can't be imported.");
      await context.storage.putObject({ key: storageKey, body: file.body, contentType: file.contentType });
    }
    const [inserted] = await tx
      .insert(files)
      .values({ brokerStepId: step.id, storageKey, fileName: file.fileName, mimeType: file.contentType, sizeBytes: file.body.byteLength, version, uploadedBy: null })
      .returning({ id: files.id });
    await audit(tx, { action: "file.imported", entityType: "file", entityId: inserted!.id, after: { stepKey: step.key, fileName: file.fileName, version } });
    summary.filesUploaded += 1;
    if (step.status !== "approved") {
      await approveForImport(tx, context, step.id, step.status);
      step.status = "approved";
    }
  }

  if (row.status === "active" || (row.status === "inactive" && row.onboardedAt)) {
    for (const step of steps.filter((candidate) => candidate.status !== "approved")) {
      await approveForImport(tx, context, step.id, step.status);
    }
    await tx.update(brokers).set({ welcomeSeenAt: now }).where(and(eq(brokers.id, brokerId), isNull(brokers.welcomeSeenAt)));
  }

  const login = await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")));
  if (login.length === 0 && row.status !== "inactive") summary.withoutLogin.push(row.email);
}

export async function runImport(
  db: Database,
  storage: FileStorage | null,
  input: ImportInput,
  options: { dryRun: boolean; now?: Date },
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    created: [],
    updated: [],
    unchanged: [],
    personasSet: 0,
    filesUploaded: 0,
    filesSkipped: 0,
    stepsApproved: 0,
    withoutLogin: [],
    warnings: [],
  };
  const emails = new Set(input.rows.map((row) => row.email));
  for (const email of [...input.personas.keys(), ...input.files.keys()]) {
    if (!emails.has(email)) summary.warnings.push(`${email} has a persona or files but no row in brokers.csv — skipped.`);
  }
  const context: ImportContext = { storage, dryRun: options.dryRun, now: options.now ?? new Date(), summary, input };
  try {
    await db.transaction(async (tx) => {
      for (const row of input.rows) await importRow(tx, context, row);
      if (options.dryRun) throw new DryRunRollback(summary);
    });
  } catch (error) {
    if (error instanceof DryRunRollback) return error.summary;
    throw error;
  }
  return summary;
}
