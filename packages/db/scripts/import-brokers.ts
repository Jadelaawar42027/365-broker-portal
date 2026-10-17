/**
 * File: packages/db/scripts/import-brokers.ts
 * Purpose: `pnpm import:brokers [-- --dry-run] [-- --dir path]` entry point. Reads data/import/ (gitignored), checks
 * everything first, then imports existing brokers, personas and files (docs/SPEC.md). Stops without changing anything
 * if any row or file is invalid.
 *
 * Functions:
 * - readDirFlag(argv): returns the folder given with --dir, or the repo's data/import folder.
 * - printSummary(summary, dryRun): prints what was (or would be) created, updated and uploaded, plus warnings.
 * - main(argv): loads the environment, validates the folder, runs the import and prints the summary.
 */
import { createS3Storage, loadRootEnvFile, readStorageConfig } from "@bp/shared/node";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "../src/client";
import { readDatabaseUrl } from "../src/database-url";
import { loadImportFolder, runImport, type ImportSummary } from "../src/import/importer";
import { ONBOARDING_STEP_SEEDS } from "../src/seed/steps";

function readDirFlag(argv: string[]): string {
  const index = argv.indexOf("--dir");
  if (index !== -1 && argv[index + 1]) return path.resolve(argv[index + 1]!);
  return fileURLToPath(new URL("../../../data/import", import.meta.url));
}

function printSummary(summary: ImportSummary, dryRun: boolean): void {
  const verb = dryRun ? "would be" : "were";
  console.log(dryRun ? "\nDry run — nothing was changed.\n" : "\nImport finished.\n");
  console.log(`Brokers ${verb} created: ${summary.created.length}${summary.created.length ? ` (${summary.created.join(", ")})` : ""}`);
  console.log(`Brokers ${verb} updated: ${summary.updated.length}${summary.updated.length ? ` (${summary.updated.join(", ")})` : ""}`);
  console.log(`Brokers already up to date: ${summary.unchanged.length}`);
  console.log(`Personas ${verb} set: ${summary.personasSet}`);
  console.log(`Files ${verb} uploaded: ${summary.filesUploaded} (already there: ${summary.filesSkipped})`);
  console.log(`Steps ${verb} marked approved as "imported": ${summary.stepsApproved}`);
  if (summary.withoutLogin.length > 0) {
    console.log(`\n${summary.withoutLogin.length} broker(s) can't sign in yet. Open each profile in /admin and click "Resend invite":`);
    for (const email of summary.withoutLogin) console.log(`  - ${email}`);
  }
  for (const warning of summary.warnings) console.warn(`Warning: ${warning}`);
}

async function main(argv: string[]): Promise<void> {
  loadRootEnvFile();
  const dryRun = argv.includes("--dry-run");
  const dir = readDirFlag(argv);
  const uploadKeys = ONBOARDING_STEP_SEEDS.filter((step) => step.kind === "upload").map((step) => step.key);
  const { input, errors } = loadImportFolder(dir, uploadKeys);
  if (!input || errors.length > 0) {
    console.error(`Nothing was imported. Fix these first (${dir}):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  const storageConfig = readStorageConfig(process.env);
  const { db, close } = createDb(readDatabaseUrl(), { max: 1 });
  try {
    const summary = await runImport(db, storageConfig ? createS3Storage(storageConfig) : null, input, { dryRun });
    printSummary(summary, dryRun);
  } finally {
    await close();
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
