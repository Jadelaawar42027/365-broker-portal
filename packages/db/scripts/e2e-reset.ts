/**
 * File: packages/db/scripts/e2e-reset.ts
 * Purpose: Prepares the end-to-end test database before Playwright starts the servers: drops and recreates the
 * database named in DATABASE_URL (which must end in "_e2e", so it can never touch real data), applies migrations,
 * seeds the steps, owner, sample brokers (with placeholder files) and the training chapters (published), lets the e2e web origin upload to the bucket,
 * and empties the email outbox folder.
 *
 * Functions:
 * - main(): checks the database name, then resets, migrates and seeds it.
 */
import { createS3Storage, loadRootEnvFile, readStorageConfig } from "@bp/shared/node";
import fs from "node:fs";
import postgres from "postgres";
import { createDb } from "../src/client";
import { readDatabaseUrl } from "../src/database-url";
import { runMigrations } from "../src/migrate";
import { seedDatabase } from "../src/seed";

async function main(): Promise<void> {
  loadRootEnvFile();
  const url = readDatabaseUrl();
  const parsed = new URL(url);
  const name = parsed.pathname.replace(/^\//, "");
  if (!/^[a-z0-9_]+_e2e$/.test(name)) throw new Error(`Refusing to reset "${name}": the e2e database name must end in _e2e.`);
  parsed.pathname = "/postgres";
  const admin = postgres(parsed.toString(), { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end({ timeout: 5 });
  }
  await runMigrations(url);
  const storageConfig = readStorageConfig(process.env);
  const storage = storageConfig ? createS3Storage(storageConfig) : null;
  const { db, close } = createDb(url, { max: 1 });
  try {
    await seedDatabase(db, {
      owner: {
        name: process.env.SEED_OWNER_NAME || "Shelly Melcher",
        email: process.env.SEED_OWNER_EMAIL ?? "owner@e2e.test",
        password: process.env.SEED_OWNER_PASSWORD ?? "e2e-owner-password",
      },
      sampleBrokers: { password: process.env.SEED_SAMPLE_PASSWORD ?? "sample-broker-pass" },
      training: { publish: true },
      storage,
      webOrigin: process.env.WEB_ORIGIN,
    });
  } finally {
    await close();
  }
  const origins = (process.env.E2E_CORS_ORIGINS ?? process.env.WEB_ORIGIN ?? "").split(",").filter(Boolean);
  if (storage && origins.length > 0) await storage.setCors(origins);
  const outbox = process.env.EMAIL_OUTBOX_DIR;
  if (outbox) {
    fs.rmSync(outbox, { recursive: true, force: true });
    fs.mkdirSync(outbox, { recursive: true });
  }
  console.log(`E2E database ${name} is ready.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
