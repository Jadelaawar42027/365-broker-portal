/**
 * File: packages/db/test/import.int.test.ts
 * Purpose: Integration tests for the broker importer on a real Postgres container (storage is an in-memory fake):
 * dry runs change nothing, brokers are created and updated by email, onboarded brokers get every step approved as
 * "imported", files and personas are stored, a second run changes nothing, and nothing is ever deleted.
 *
 * Functions:
 * - memoryStorage(): a FileStorage that keeps uploaded objects in a Map.
 * - writeImportFolder(dir, csvRows): writes brokers.csv, one persona and two files into a temp import folder.
 * - stepsFor(email): returns step key, status and review note for a broker, in order.
 */
import type { FileStorage } from "@bp/shared/node";
import { and, eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, brokerSteps, brokers, createBroker, files, onboardingSteps, seedDatabase, users } from "../src";
import { loadImportFolder, runImport } from "../src/import/importer";
import { ONBOARDING_STEP_SEEDS } from "../src/seed/steps";
import { startTestDatabase } from "../src/testing";

const HEADER = "name,email,phone,level,status,joined_at,onboarded_at,left_at,commission_tier";
const UPLOAD_KEYS = ONBOARDING_STEP_SEEDS.filter((step) => step.kind === "upload").map((step) => step.key);
const ROWS = [
  "Jane Example,jane@example.com,+15615550100,senior,active,2025-03-03,2025-03-11,,60/40",
  "John Sample,john@example.com,,junior,onboarding,2026-10-01,,,",
  "Alex Former,alex@example.com,,junior,inactive,2026-01-09,2026-01-20,2026-06-15,50/50",
];

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
const stored = new Map<string, Uint8Array>();
let dir: string;

function memoryStorage(): FileStorage {
  return {
    presignPut: async () => "unused",
    presignGet: async () => "unused",
    putObject: async ({ key, body }) => void stored.set(key, body),
    headObject: async (key) => (stored.has(key) ? { sizeBytes: stored.get(key)!.byteLength, contentType: null } : null),
    setCors: async () => {},
  };
}

function writeImportFolder(target: string, csvRows: string[]) {
  fs.mkdirSync(path.join(target, "personas"), { recursive: true });
  fs.mkdirSync(path.join(target, "files", "john@example.com"), { recursive: true });
  fs.writeFileSync(path.join(target, "brokers.csv"), [HEADER, ...csvRows].join("\n") + "\n");
  fs.writeFileSync(path.join(target, "personas", "jane@example.com.md"), "## Background\nFormer Navy officer.\n");
  fs.writeFileSync(path.join(target, "files", "john@example.com", "w9.pdf"), "%PDF-1.4 john w9");
  fs.writeFileSync(path.join(target, "files", "john@example.com", "photo_id.jpg"), "jpeg bytes");
}

async function stepsFor(email: string) {
  return testDb.db
    .select({ key: onboardingSteps.key, status: brokerSteps.status, note: brokerSteps.reviewNote })
    .from(brokerSteps)
    .innerJoin(onboardingSteps, eq(onboardingSteps.id, brokerSteps.stepId))
    .innerJoin(brokers, eq(brokers.id, brokerSteps.brokerId))
    .innerJoin(users, eq(users.id, brokers.userId))
    .where(eq(users.email, email))
    .orderBy(onboardingSteps.position);
}

beforeAll(async () => {
  testDb = await startTestDatabase();
  await seedDatabase(testDb.db, { owner: { name: "Aj", email: "owner@example.com", password: "owner-password-1" } });
  await testDb.db.transaction((tx) =>
    createBroker(tx, { name: "Not In Csv", email: "keep@example.com", level: "junior", status: "onboarding", joinedAt: "2026-09-01" }),
  );
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "bp-import-"));
  writeImportFolder(dir, ROWS);
});

afterAll(async () => {
  fs.rmSync(dir, { recursive: true, force: true });
  await testDb?.stop();
});

describe("loadImportFolder", () => {
  it("reads the CSV, personas and files", () => {
    const { input, errors } = loadImportFolder(dir, UPLOAD_KEYS);
    expect(errors).toEqual([]);
    expect(input!.rows).toHaveLength(3);
    expect(input!.personas.get("jane@example.com")).toContain("Navy");
    expect(input!.files.get("john@example.com")!.map((file) => [file.stepKey, file.contentType]).sort()).toEqual([
      ["photo_id", "image/jpeg"],
      ["w9", "application/pdf"],
    ]);
  });

  it("explains bad file names, types and a missing CSV", () => {
    const bad = fs.mkdtempSync(path.join(os.tmpdir(), "bp-import-bad-"));
    expect(loadImportFolder(bad, UPLOAD_KEYS).errors[0]).toMatch(/brokers.csv not found/);
    writeImportFolder(bad, ROWS);
    fs.writeFileSync(path.join(bad, "files", "john@example.com", "passport.pdf"), "x");
    fs.writeFileSync(path.join(bad, "files", "john@example.com", "w9.docx"), "x");
    const { errors } = loadImportFolder(bad, UPLOAD_KEYS);
    expect(errors).toEqual([
      expect.stringMatching(/passport.pdf: the name must start with an upload step key/),
      expect.stringMatching(/w9.docx: only PDF, JPG and PNG/),
    ]);
    fs.rmSync(bad, { recursive: true, force: true });
  });
});

describe("runImport", () => {
  it("changes nothing in a dry run but reports exactly what would happen", async () => {
    const { input } = loadImportFolder(dir, UPLOAD_KEYS);
    const summary = await runImport(testDb.db, memoryStorage(), input!, { dryRun: true });
    expect(summary).toMatchObject({ created: ["jane@example.com", "john@example.com", "alex@example.com"], filesUploaded: 2, personasSet: 1 });
    expect(summary.stepsApproved).toBe(11 + 2 + 11);
    expect(await testDb.db.select().from(users).where(eq(users.email, "jane@example.com"))).toHaveLength(0);
    expect(stored.size).toBe(0);
  });

  it("imports brokers, personas and files", async () => {
    const { input } = loadImportFolder(dir, UPLOAD_KEYS);
    const summary = await runImport(testDb.db, memoryStorage(), input!, { dryRun: false });
    expect(summary.created).toHaveLength(3);
    expect(summary.withoutLogin).toEqual(["jane@example.com", "john@example.com"]);

    const jane = await stepsFor("jane@example.com");
    expect(jane).toHaveLength(11);
    expect(jane.every((step) => step.status === "approved" && step.note === "imported")).toBe(true);
    const [janeBroker] = await testDb.db
      .select()
      .from(brokers)
      .innerJoin(users, eq(users.id, brokers.userId))
      .where(eq(users.email, "jane@example.com"));
    expect(janeBroker!.brokers).toMatchObject({ status: "active", level: "senior", onboardedAt: "2025-03-11", commissionTier: "60/40" });
    expect(janeBroker!.brokers.personaMd).toContain("Former Navy officer");
    expect(janeBroker!.brokers.welcomeSeenAt).not.toBeNull();

    const john = await stepsFor("john@example.com");
    expect(john.filter((step) => step.status === "approved").map((step) => step.key)).toEqual(["photo_id", "w9"]);
    expect(stored.size).toBe(2);
    const johnFiles = await testDb.db.select().from(files);
    expect(johnFiles.map((file) => [file.fileName, file.version, file.uploadedBy])).toEqual(
      expect.arrayContaining([["w9.pdf", 1, null], ["photo_id.jpg", 1, null]]),
    );

    expect((await stepsFor("alex@example.com")).every((step) => step.status === "approved")).toBe(true);
    const audit = await testDb.db.select({ action: auditLog.action }).from(auditLog);
    expect(audit.filter((row) => row.action === "broker.imported")).toHaveLength(3);
    expect(audit.filter((row) => row.action === "step.imported")).toHaveLength(24);
  });

  it("is idempotent: a second run changes nothing", async () => {
    const { input } = loadImportFolder(dir, UPLOAD_KEYS);
    const auditBefore = (await testDb.db.select().from(auditLog)).length;
    const summary = await runImport(testDb.db, memoryStorage(), input!, { dryRun: false });
    expect(summary).toMatchObject({ created: [], updated: [], filesUploaded: 0, filesSkipped: 2, stepsApproved: 0, personasSet: 0 });
    expect(summary.unchanged).toHaveLength(3);
    expect((await testDb.db.select().from(auditLog)).length).toBe(auditBefore);
  });

  it("updates changed rows by email, records the change and never deletes anyone", async () => {
    const changed = fs.mkdtempSync(path.join(os.tmpdir(), "bp-import-2-"));
    writeImportFolder(changed, [ROWS[0]!.replace("senior", "junior"), ROWS[1]!]);
    const { input } = loadImportFolder(changed, UPLOAD_KEYS);
    const summary = await runImport(testDb.db, memoryStorage(), input!, { dryRun: false });
    expect(summary.updated).toEqual(["jane@example.com"]);
    const [audit] = await testDb.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "broker.imported")))
      .orderBy(auditLog.createdAt)
      .then((rows) => rows.slice(-1));
    expect(audit).toMatchObject({ before: { level: "senior" }, after: { level: "junior" } });
    for (const email of ["alex@example.com", "keep@example.com"]) {
      expect(await testDb.db.select().from(users).where(eq(users.email, email))).toHaveLength(1);
    }
    fs.rmSync(changed, { recursive: true, force: true });
  });

  it("skips admin accounts and warns about personas with no CSV row", async () => {
    const extra = fs.mkdtempSync(path.join(os.tmpdir(), "bp-import-3-"));
    writeImportFolder(extra, ["Owner Person,owner@example.com,,junior,onboarding,2026-10-01,,,"]);
    const { input } = loadImportFolder(extra, UPLOAD_KEYS);
    const summary = await runImport(testDb.db, memoryStorage(), input!, { dryRun: true });
    expect(summary.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/owner@example.com .* is an admin account/),
        expect.stringMatching(/jane@example.com has a persona or files but no row/),
      ]),
    );
    fs.rmSync(extra, { recursive: true, force: true });
  });
});
