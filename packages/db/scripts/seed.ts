/**
 * File: packages/db/scripts/seed.ts
 * Purpose: `pnpm db:seed` entry point. Seeds the onboarding steps, the owner from SEED_OWNER_* and, outside
 * production, three sample brokers (with placeholder files when S3_* is set). Flags: --refresh-steps overwrites step copy, --no-samples skips sample brokers.
 *
 * Functions:
 * - readOwner(env): returns the owner account settings from the environment, or null (with a warning) if any are missing; throws on an invalid email or short password.
 * - printSummary(summary, samplePassword): prints what the seed changed, sample logins and invite links.
 * - main(argv): loads the environment, runs the seed and closes the connection.
 */
import { emailSchema, passwordSchema } from "@bp/shared";
import { createS3Storage, loadRootEnvFile, readStorageConfig } from "@bp/shared/node";
import { createDb } from "../src/client";
import { readDatabaseUrl } from "../src/database-url";
import { seedDatabase, type SeedSummary } from "../src/seed";

const DEFAULT_SAMPLE_PASSWORD = "sample-broker-pass";

function readOwner(env: NodeJS.ProcessEnv) {
  const { SEED_OWNER_NAME, SEED_OWNER_EMAIL, SEED_OWNER_PASSWORD } = env;
  if (!SEED_OWNER_EMAIL || !SEED_OWNER_PASSWORD) {
    console.warn("SEED_OWNER_EMAIL / SEED_OWNER_PASSWORD not set - skipping the owner account.");
    return null;
  }
  return {
    name: SEED_OWNER_NAME?.trim() || "Owner",
    email: emailSchema.parse(SEED_OWNER_EMAIL),
    password: passwordSchema.parse(SEED_OWNER_PASSWORD),
  };
}

function printSummary(summary: SeedSummary, samplePassword: string | null): void {
  console.log(`Onboarding steps: ${summary.stepsInserted} added, ${summary.stepsUpdated} refreshed.`);
  console.log(`Owner account: ${summary.owner}.`);
  for (const sample of summary.sampleBrokers) {
    console.log(`Sample broker ${sample.email}: ${sample.outcome}.`);
  }
  if (samplePassword && summary.sampleBrokers.some((sample) => sample.outcome === "created")) {
    console.log(`Sample brokers who can log in use the password "${samplePassword}".`);
  }
  for (const invite of summary.inviteLinks) {
    console.log(`Invite link for ${invite.email}: ${invite.url}`);
  }
}

async function main(argv: string[]): Promise<void> {
  loadRootEnvFile();
  const production = process.env.NODE_ENV === "production";
  const withSamples = !production && !argv.includes("--no-samples");
  const samplePassword = withSamples ? process.env.SEED_SAMPLE_PASSWORD || DEFAULT_SAMPLE_PASSWORD : null;
  const { db, close } = createDb(readDatabaseUrl(), { max: 1 });
  try {
    const storageConfig = readStorageConfig(process.env);
    if (withSamples && !storageConfig) console.warn("S3_* not set - sample brokers get no placeholder files.");
    const summary = await seedDatabase(db, {
      storage: withSamples && storageConfig ? createS3Storage(storageConfig) : null,
      owner: readOwner(process.env),
      sampleBrokers: samplePassword ? { password: passwordSchema.parse(samplePassword) } : null,
      refreshSteps: argv.includes("--refresh-steps"),
      webOrigin: process.env.WEB_ORIGIN,
    });
    printSummary(summary, samplePassword);
  } finally {
    await close();
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
