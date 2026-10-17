/**
 * File: packages/db/test/database-url.test.ts
 * Purpose: Unit tests for readDatabaseUrl.
 *
 * Functions:
 * - none
 */
import { describe, expect, it } from "vitest";
import { readDatabaseUrl } from "../src/database-url";

describe("readDatabaseUrl", () => {
  it("returns a postgres URL", () => {
    const url = "postgres://bp:bp@localhost:5432/broker_portal";
    expect(readDatabaseUrl({ DATABASE_URL: url })).toBe(url);
  });

  it("accepts the postgresql:// scheme Railway uses", () => {
    const url = "postgresql://u:p@db.railway.internal:5432/railway";
    expect(readDatabaseUrl({ DATABASE_URL: url })).toBe(url);
  });

  it("explains how to fix a missing value", () => {
    expect(() => readDatabaseUrl({})).toThrow(/Copy .env.example to .env/);
  });

  it("rejects a non-URL", () => {
    expect(() => readDatabaseUrl({ DATABASE_URL: "not a url" })).toThrow(/not a valid URL/);
  });

  it("rejects other databases", () => {
    expect(() => readDatabaseUrl({ DATABASE_URL: "mysql://u:p@h/db" })).toThrow(/must start with postgres/);
  });
});
