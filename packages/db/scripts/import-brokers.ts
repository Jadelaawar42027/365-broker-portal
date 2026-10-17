/**
 * File: packages/db/scripts/import-brokers.ts
 * Purpose: `pnpm import:brokers` entry point. Phase A placeholder so the command already runs; phase F
 * implements the CSV, persona and file import described in docs/SPEC.md.
 *
 * Functions:
 * - main(argv): reports whether --dry-run was passed and that the importer is not built yet.
 */
function main(argv: string[]): void {
  const dryRun = argv.includes("--dry-run");
  console.log(`import:brokers${dryRun ? " (dry run)" : ""} - not built yet (arrives in phase F).`);
}

main(process.argv.slice(2));
