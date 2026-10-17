/**
 * File: packages/db/src/client.ts
 * Purpose: Creates the Drizzle database client on top of postgres.js, with the full schema attached so queries
 * are typed. Every process (API, scripts, tests) gets its client from here.
 *
 * Functions:
 * - createDb(url, options): opens a connection pool and returns { db, sql, close }.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDb(url: string, options: { max?: number } = {}) {
  const sql = postgres(url, { max: options.max ?? 10, onnotice: () => {} });
  const db = drizzle({ client: sql, schema });
  return { db, sql, close: () => sql.end({ timeout: 5 }) };
}

export type Database = ReturnType<typeof createDb>["db"];
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Transaction;
