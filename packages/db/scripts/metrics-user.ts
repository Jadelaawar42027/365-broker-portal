/**
 * File: packages/db/scripts/metrics-user.ts
 * Purpose: `pnpm db:metrics-user` entry point. Creates (or resets the password of) the read-only login for
 * broker_metrics, named METRICS_READER_USER (default metrics_login), with METRICS_READER_PASSWORD (SPEC D18).
 *
 * Functions:
 * - main(): loads the environment, upserts the login and prints the outcome without echoing the password.
 */
import { loadRootEnvFile } from "@bp/shared/node";
import { createDb } from "../src/client";
import { readDatabaseUrl } from "../src/database-url";
import { upsertMetricsLogin } from "../src/metrics-user";

async function main(): Promise<void> {
  loadRootEnvFile();
  const password = process.env.METRICS_READER_PASSWORD;
  if (!password) throw new Error("METRICS_READER_PASSWORD is not set.");
  const username = process.env.METRICS_READER_USER?.trim() || "metrics_login";
  const { sql, close } = createDb(readDatabaseUrl(), { max: 1 });
  try {
    const outcome = await upsertMetricsLogin(sql, { username, password });
    console.log(`Metrics login "${username}" ${outcome}. It can read broker_metrics only.`);
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
