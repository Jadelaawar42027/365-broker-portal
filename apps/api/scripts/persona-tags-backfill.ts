/**
 * File: apps/api/scripts/persona-tags-backfill.ts
 * Purpose: `pnpm match:backfill` extracts persona tags with Claude for every broker whose persona changed since the last
 * extraction (by source hash), and clears tags whose persona was emptied. `pnpm match:backfill -- --force` re-extracts
 * every broker, for example after improving the extraction prompt or to replace the seed fixtures. Needs DATABASE_URL and
 * ANTHROPIC_API_KEY (MATCH_MODEL optional). Admin overrides are never touched.
 *
 * Functions:
 * - main(argv): runs the backfill, printing each broker's outcome and a summary.
 */
import { createDb } from "@bp/db";
import { loadRootEnvFile } from "@bp/shared/node";
import { createMatchAiFromEnv, DEFAULT_MATCH_MODEL } from "../src/services/match/claude";
import { backfillPersonaTags } from "../src/services/persona-tags";

async function main(argv: string[]): Promise<void> {
  loadRootEnvFile();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set.");
  const matchAi = createMatchAiFromEnv({
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY?.trim() || undefined,
    MATCH_MODEL: process.env.MATCH_MODEL?.trim() || DEFAULT_MATCH_MODEL,
  });
  if (!matchAi) throw new Error("ANTHROPIC_API_KEY is not set.");
  const force = argv.includes("--force");
  const { db, close } = createDb(databaseUrl, { max: 4 });
  try {
    console.log(`Extracting persona tags with ${matchAi.model}${force ? " (forced)" : ""}...`);
    const summary = await backfillPersonaTags(
      { db, matchAi, now: () => new Date(), log: console },
      { force, onProgress: (brokerId, outcome) => console.log(`${brokerId}: ${outcome}`) },
    );
    console.log(
      `Checked ${summary.checked}: ${summary.updated} extracted, ${summary.unchanged} unchanged, ${summary.cleared} cleared, ${summary.failed} failed, ${summary.superseded} superseded.`,
    );
    if (summary.failed > 0) process.exitCode = 1;
  } finally {
    await close();
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
