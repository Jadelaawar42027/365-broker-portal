/**
 * File: packages/db/test/import-accounts.int.test.ts
 * Purpose: Integration tests on a real Postgres container for the importer's account columns (phase H2): the optional
 * corporate_email and crm_phone columns are validated and saved, an email on GOOGLE_DOMAIN counts as the corporate one,
 * --link queues one Google and one GHL "link" task per broker (never twice), and a re-import finds a broker whose login
 * email has become their corporate email instead of creating a duplicate.
 *
 * Functions:
 * - csv(lines): a brokers.csv text with the account columns.
 * - importText(text, options): parses the CSV and runs the import with no personas or files.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { brokers, parseBrokerCsv, provisioningTasks, runImport, seedDatabase, users } from "../src";
import { startTestDatabase } from "../src/testing";

const HEADER = "name,email,phone,level,status,joined_at,onboarded_at,left_at,commission_tier,corporate_email,crm_phone";

function csv(lines: string[]): string {
  return [HEADER, ...lines].join("\n");
}

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;

async function importText(text: string, options: { link?: boolean; googleDomain?: string | null; dryRun?: boolean } = {}) {
  const { rows, errors } = parseBrokerCsv(text);
  expect(errors).toEqual([]);
  return runImport(testDb.db, null, { rows, personas: new Map(), files: new Map() }, { dryRun: options.dryRun ?? false, link: options.link, googleDomain: options.googleDomain ?? null });
}

beforeAll(async () => {
  testDb = await startTestDatabase();
  await seedDatabase(testDb.db, {});
});

afterAll(async () => {
  await testDb?.stop();
});

describe("importing account columns", () => {
  it("refuses a CRM phone that isn't E.164 and a bad corporate email, with the line number", () => {
    const { errors } = parseBrokerCsv(csv(["Ana Ruiz,ana@example.com,,junior,onboarding,2026-01-05,,,,not-an-email,555-0100"]));
    expect(errors).toEqual([{ line: 2, message: expect.stringMatching(/corporate_email "not-an-email" is not valid; crm_phone "555-0100" must be in international form/) }]);
  });

  it("saves the corporate email and CRM phone, and queues one link per system with --link", async () => {
    const summary = await importText(csv(["Ana Ruiz,ana@example.com,,junior,active,2026-01-05,2026-01-20,,,ana.ruiz@365yachts.org,+1 561 555 0100"]), { link: true });
    expect(summary).toMatchObject({ accountsUpdated: 1, linksQueued: 2 });
    const [row] = await testDb.db.select().from(brokers).innerJoin(users, eq(users.id, brokers.userId)).where(eq(users.email, "ana@example.com"));
    expect(row!.brokers).toMatchObject({ corporateEmail: "ana.ruiz@365yachts.org", crmPhone: "+15615550100" });
    const tasks = await testDb.db.select().from(provisioningTasks).where(eq(provisioningTasks.brokerId, row!.brokers.id));
    expect(tasks.map((task) => [task.system, task.action, task.status]).sort()).toEqual([
      ["ghl", "link", "pending"],
      ["google", "link", "pending"],
    ]);
    const again = await importText(csv(["Ana Ruiz,ana@example.com,,junior,active,2026-01-05,2026-01-20,,,ana.ruiz@365yachts.org,+15615550100"]), { link: true });
    expect(again).toMatchObject({ accountsUpdated: 0, linksQueued: 0 });
  });

  it("treats an email on GOOGLE_DOMAIN as the corporate email", async () => {
    await importText(csv(["Ben Cole,ben.cole@365yachts.org,,senior,onboarding,2026-02-01,,,,,"]), { googleDomain: "365yachts.org" });
    const [row] = await testDb.db.select({ corporateEmail: brokers.corporateEmail }).from(brokers).innerJoin(users, eq(users.id, brokers.userId)).where(eq(users.email, "ben.cole@365yachts.org"));
    expect(row!.corporateEmail).toBe("ben.cole@365yachts.org");
  });

  it("finds a broker whose login became their corporate email instead of creating a duplicate", async () => {
    await testDb.db.update(users).set({ email: "ana.ruiz@365yachts.org" }).where(eq(users.email, "ana@example.com"));
    const summary = await importText(csv(["Ana Ruiz,ana@example.com,,junior,active,2026-01-05,2026-01-20,,,ana.ruiz@365yachts.org,"]));
    expect(summary.created).toEqual([]);
    const matching = await testDb.db.select({ id: users.id }).from(users).where(eq(users.name, "Ana Ruiz"));
    expect(matching).toHaveLength(1);
  });

  it("changes nothing in a dry run", async () => {
    const summary = await importText(csv(["Cara Diaz,cara@example.com,,junior,onboarding,2026-03-01,,,,cara.diaz@365yachts.org,"]), { link: true, dryRun: true });
    expect(summary).toMatchObject({ created: ["cara@example.com"], linksQueued: 2 });
    expect(await testDb.db.select().from(users).where(eq(users.email, "cara@example.com"))).toEqual([]);
  });
});
