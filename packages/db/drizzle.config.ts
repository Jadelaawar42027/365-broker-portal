/**
 * File: packages/db/drizzle.config.ts
 * Purpose: drizzle-kit settings: where the schema lives, where generated migrations go, and how to reach Postgres.
 *
 * Functions:
 * - none
 */
import { loadRootEnvFile } from "@bp/shared/node";
import { defineConfig } from "drizzle-kit";
import { readDatabaseUrl } from "./src/database-url";

loadRootEnvFile();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: readDatabaseUrl() },
  strict: true,
  verbose: true,
});
