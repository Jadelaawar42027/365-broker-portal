/**
 * File: packages/db/src/database-url.ts
 * Purpose: Reads and validates the Postgres connection string so every database entry point
 * (drizzle-kit, seed, import, API) fails with the same clear message when it is missing.
 *
 * Functions:
 * - readDatabaseUrl(env): returns env.DATABASE_URL if it is a postgres:// or postgresql:// URL; throws a readable error otherwise.
 */
export function readDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and run `docker compose up -d`.",
    );
  }
  let protocol: string;
  try {
    protocol = new URL(value).protocol;
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }
  if (protocol !== "postgres:" && protocol !== "postgresql:") {
    throw new Error(`DATABASE_URL must start with postgres:// or postgresql:// (got ${protocol}//).`);
  }
  return value;
}
