/**
 * File: packages/db/src/migrate.ts
 * Purpose: Applies the checked-in migrations from packages/db/drizzle programmatically. Used by integration tests;
 * `pnpm db:migrate` (drizzle-kit) does the same job from the command line and on Railway.
 *
 * Functions:
 * - migrationsFolder(): returns the absolute path of the drizzle migrations folder.
 * - runMigrations(url): opens a single connection, applies pending migrations and closes it.
 */
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export function migrationsFolder(): string {
  return fileURLToPath(new URL("../drizzle", import.meta.url));
}

export async function runMigrations(url: string): Promise<void> {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle({ client: sql }), { migrationsFolder: migrationsFolder() });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
