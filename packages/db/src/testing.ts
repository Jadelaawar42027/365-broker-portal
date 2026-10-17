/**
 * File: packages/db/src/testing.ts
 * Purpose: Test-only helper that starts a throwaway Postgres 16 container with Testcontainers and applies every
 * migration, so integration tests in any package run against the real schema. Never import from app code.
 *
 * Functions:
 * - startTestDatabase(): starts the container, migrates it and returns { url, db, sql, stop }.
 */
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { createDb } from "./client";
import { runMigrations } from "./migrate";

export async function startTestDatabase() {
  const container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("broker_portal_test")
    .withUsername("bp")
    .withPassword("bp")
    .start();
  const url = container.getConnectionUri();
  await runMigrations(url);
  const { db, sql, close } = createDb(url, { max: 5 });
  return {
    url,
    db,
    sql,
    stop: async () => {
      await close();
      await container.stop();
    },
  };
}
