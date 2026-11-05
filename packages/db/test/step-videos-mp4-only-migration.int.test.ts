/**
 * File: packages/db/test/step-videos-mp4-only-migration.int.test.ts
 * Purpose: Integration tests on a real Postgres container for migration 0022 (SPEC D34): a step video slot still holding
 * a YouTube, Loom or Vimeo link is emptied (its title and place stay) with one audit_log row, uploaded MP4s and empty
 * slots are left alone, and running it again changes nothing.
 *
 * Functions:
 * - runMigration(): runs the SQL of migration 0022 against the test database.
 * - slotByTitle(title): loads one step video slot by its title.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, seedDatabase, stepVideos } from "../src";
import { startTestDatabase } from "../src/testing";

const MIGRATION = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle", "0022_step_videos_mp4_only.sql");
const LOOM_EMBED = "https://www.loom.com/embed/0123456789abcdef0123456789abcdef";

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;

async function runMigration(): Promise<void> {
  await testDb.sql.unsafe(readFileSync(MIGRATION, "utf8"));
}

async function slotByTitle(title: string) {
  const [row] = await testDb.db.select().from(stepVideos).where(eq(stepVideos.title, title));
  return row!;
}

beforeAll(async () => {
  testDb = await startTestDatabase();
  await seedDatabase(testDb.db, {});
  const crm = await slotByTitle("CRM sign in and training");
  await testDb.db.update(stepVideos).set({ source: "embed", provider: "loom", embedUrl: LOOM_EMBED }).where(eq(stepVideos.id, crm.id));
  const boatWizard = await slotByTitle("BoatWizard walkthrough");
  await testDb.db
    .update(stepVideos)
    .set({ source: "upload", provider: "upload", storageKey: `onboarding/steps/${boatWizard.stepId}/videos/abc-bw.mp4`, fileName: "bw.mp4", durationSeconds: 120 })
    .where(eq(stepVideos.id, boatWizard.id));
});
afterAll(() => testDb?.stop());

describe("migration 0022: step videos are MP4s only", () => {
  it("empties a slot holding a link, keeping its title and place, and audits it", async () => {
    const before = await slotByTitle("CRM sign in and training");
    await runMigration();
    const after = await slotByTitle("CRM sign in and training");
    expect(after).toMatchObject({ id: before.id, position: before.position, source: null, provider: null, embedUrl: null, storageKey: null });
    const rows = await testDb.db.select().from(auditLog).where(eq(auditLog.action, "step.video_cleared"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entityType: "onboarding_step", entityId: before.stepId, before: { videoId: before.id, source: "embed", provider: "loom", embedUrl: LOOM_EMBED } });
  });

  it("leaves uploaded MP4s and empty slots alone", async () => {
    expect(await slotByTitle("BoatWizard walkthrough")).toMatchObject({ source: "upload", provider: "upload", fileName: "bw.mp4", durationSeconds: 120 });
    expect(await slotByTitle("YachtCloser walkthrough")).toMatchObject({ source: null, storageKey: null });
  });

  it("changes nothing when run again", async () => {
    await runMigration();
    expect(await testDb.db.select().from(auditLog).where(eq(auditLog.action, "step.video_cleared"))).toHaveLength(1);
    expect(await slotByTitle("BoatWizard walkthrough")).toMatchObject({ source: "upload" });
  });
});
