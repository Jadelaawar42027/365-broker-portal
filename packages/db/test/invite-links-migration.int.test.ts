/**
 * File: packages/db/test/invite-links-migration.int.test.ts
 * Purpose: Integration tests on a real Postgres container for migration 0021: starting from the database as it was after
 * migration 0020 (account_tokens.expires_at required), it lets a token have no expiry (a broker's permanent invite link),
 * keeps the expiry of tokens that already had one, and changes nothing when run again.
 *
 * Functions:
 * - runMigration(): runs the SQL of migration 0021 against the test database.
 * - insertToken(expiresAt): inserts an invite token for the test user with the given expiry (or none).
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { accountTokens, createBroker } from "../src";
import { startTestDatabase } from "../src/testing";

const MIGRATION = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle", "0021_invite_links_without_expiry.sql");
const TIMED = new Date("2026-11-12T16:00:00.000Z");

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
let userId: string;

async function runMigration(): Promise<void> {
  await testDb.sql.unsafe(readFileSync(MIGRATION, "utf8"));
}

async function insertToken(expiresAt: Date | null) {
  const [row] = await testDb.db
    .insert(accountTokens)
    .values({ userId, purpose: "invite", tokenHash: randomBytes(32).toString("hex"), expiresAt })
    .returning({ id: accountTokens.id });
  return row!.id;
}

beforeAll(async () => {
  testDb = await startTestDatabase();
  const created = await testDb.db.transaction((tx) => createBroker(tx, { name: "Charlie Seitz", email: "charlie@365yachts.org", level: "senior", joinedAt: "2026-11-05" }));
  userId = created.userId;
  await testDb.sql.unsafe('ALTER TABLE "account_tokens" ALTER COLUMN "expires_at" SET NOT NULL;');
});
afterAll(() => testDb?.stop());

describe("migration 0021: invite links without expiry", () => {
  let timedId: string;

  it("starts from a database where every token needs an expiry", async () => {
    timedId = await insertToken(TIMED);
    await expect(insertToken(null)).rejects.toThrow();
  });

  it("allows a token with no expiry and keeps existing expiries", async () => {
    await runMigration();
    const permanentId = await insertToken(null);
    const [permanent] = await testDb.db.select().from(accountTokens).where(eq(accountTokens.id, permanentId));
    expect(permanent?.expiresAt).toBeNull();
    const [timed] = await testDb.db.select().from(accountTokens).where(eq(accountTokens.id, timedId));
    expect(timed?.expiresAt?.toISOString()).toBe(TIMED.toISOString());
  });

  it("changes nothing when run again", async () => {
    await runMigration();
    const rows = await testDb.sql<{ is_nullable: string }[]>`
      SELECT is_nullable FROM information_schema.columns WHERE table_name = 'account_tokens' AND column_name = 'expires_at'`;
    expect(rows[0]?.is_nullable).toBe("YES");
    expect(await testDb.db.select().from(accountTokens).where(eq(accountTokens.userId, userId))).toHaveLength(2);
  });
});
