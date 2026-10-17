/**
 * File: apps/api/src/release.ts
 * Purpose: The Railway pre-deploy command (`pnpm --filter @bp/api release`): applies database migrations, then runs the
 * idempotent seed (onboarding steps if missing, the owner from SEED_OWNER_* if set). Sample brokers are never created
 * in production. If this fails, Railway does not switch traffic to the new deploy.
 *
 * Functions:
 * - releaseMigrationsFolder(): the packages/db/drizzle folder, found relative to the built file in apps/api/dist.
 * - release(): runs migrations and the seed against DATABASE_URL and prints what changed.
 */
import { createDb, readDatabaseUrl, runMigrations, seedDatabase } from "@bp/db";
import { emailSchema, passwordSchema } from "@bp/shared";
import { loadRootEnvFile } from "@bp/shared/node";
import { fileURLToPath } from "node:url";

function releaseMigrationsFolder(): string {
  return fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url));
}

async function release(): Promise<void> {
  loadRootEnvFile();
  const url = readDatabaseUrl();
  await runMigrations(url, releaseMigrationsFolder());
  console.log("Migrations applied.");
  const { SEED_OWNER_NAME, SEED_OWNER_EMAIL, SEED_OWNER_PASSWORD } = process.env;
  const owner =
    SEED_OWNER_EMAIL && SEED_OWNER_PASSWORD
      ? { name: SEED_OWNER_NAME?.trim() || "Owner", email: emailSchema.parse(SEED_OWNER_EMAIL), password: passwordSchema.parse(SEED_OWNER_PASSWORD) }
      : null;
  const { db, close } = createDb(url, { max: 1 });
  try {
    const summary = await seedDatabase(db, { owner, sampleBrokers: null });
    console.log(`Onboarding steps added: ${summary.stepsInserted}. Owner account: ${summary.owner}.`);
  } finally {
    await close();
  }
}

release().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
