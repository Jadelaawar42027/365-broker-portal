/**
 * File: packages/db/test/boatwizard-training-migration.int.test.ts
 * Purpose: Integration tests on a real Postgres container for migration 0023 (SPEC D35): starting from step 12 as
 * migration 0019 left it, every field still on that wording gets the BoatWizard training copy from today's seed (with
 * one audit_log row per field), fields an admin edited are left alone, and running it again changes nothing.
 *
 * Functions:
 * - runMigration(): runs the SQL of migration 0023 against the test database.
 * - oldFullTextMd(): step 12's full text exactly as migration 0019 wrote it.
 * - restorePre0023State(overrides): puts step 12 back to its 0019 wording (with any admin edits given) and clears audit_log.
 * - boatWizardStep(): loads the step 12 row.
 * - migrationAuditRows(): the audit_log rows migration 0023 writes, oldest first.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, onboardingSteps, seedDatabase } from "../src";
import { STEP_GUIDANCE } from "../src/seed/step-guidance";
import { ONBOARDING_STEP_SEEDS } from "../src/seed/steps";
import { startTestDatabase } from "../src/testing";

const DRIZZLE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle");
const MIGRATION = path.join(DRIZZLE, "0023_boatwizard_training.sql");
const OLD_STEP = {
  summary: "Sign in to BoatWizard, the MLS, and run one practice search. Takes about 10 minutes.",
  intro: "BoatWizard / YachtWorld is the MLS: listings, buyer searches and sold comps.",
  instructionsMd: ["1. Sign in to BoatWizard with the login details you received.", "2. Run one practice search.", "3. Tick the box once you've done it."].join("\n"),
  config: { minutes: 10, confirmLabel: "I signed in to BoatWizard and ran one practice search" },
  todoItems: [
    "Sign in to BoatWizard with the login details you received.",
    "Run one practice search for a boat a client might want.",
    "Look at a few sold comps to see recent prices.",
    "Tick the box below once you've done it.",
  ],
  callouts: [],
};
const EDITED_SUMMARY = "Shelly's own summary for the BoatWizard step.";
const EDITED_TODO = ["Sign in to BoatWizard.", "Run a search.", "Tick the box."];
const SEED = ONBOARDING_STEP_SEEDS.find((step) => step.key === "boatwizard_login")!;
const GUIDANCE = STEP_GUIDANCE.boatwizard_login!;
const MIGRATION_ACTIONS = ["step.copy_updated", "step.config_updated", "step.guidance_updated"];

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;

async function runMigration(): Promise<void> {
  await testDb.sql.unsafe(readFileSync(MIGRATION, "utf8"));
}

function oldFullTextMd(): string {
  const statement = readFileSync(path.join(DRIZZLE, "0019_final_onboarding_steps.sql"), "utf8")
    .split("--> statement-breakpoint")
    .find((part) => part.includes("'boatwizard_login',\n    12,"))!;
  return [...statement.matchAll(/\$g\$([\s\S]*?)\$g\$/g)].map((match) => match[1]!)[11]!;
}

async function restorePre0023State(overrides: Partial<{ summary: string; todoItems: string[] }> = {}): Promise<void> {
  await testDb.db
    .update(onboardingSteps)
    .set({ ...OLD_STEP, fullTextMd: oldFullTextMd(), ...overrides })
    .where(eq(onboardingSteps.key, "boatwizard_login"));
  await testDb.db.delete(auditLog);
}

async function boatWizardStep() {
  const [row] = await testDb.db.select().from(onboardingSteps).where(eq(onboardingSteps.key, "boatwizard_login"));
  return row!;
}

async function migrationAuditRows() {
  return testDb.db.select().from(auditLog).where(inArray(auditLog.action, MIGRATION_ACTIONS)).orderBy(asc(auditLog.createdAt));
}

beforeAll(async () => {
  testDb = await startTestDatabase();
  await seedDatabase(testDb.db, {});
});
afterAll(() => testDb?.stop());

describe("migration 0023: BoatWizard training copy on step 12", () => {
  it("starts from the wording migration 0019 wrote", () => {
    expect(oldFullTextMd()).toContain("Target 100 names in the CRM by day seven.");
  });

  it("gives a step still on the 0019 wording the seed's BoatWizard training copy, auditing each field", async () => {
    await restorePre0023State();
    const before = await boatWizardStep();
    await runMigration();
    const after = await boatWizardStep();
    expect(after).toMatchObject({
      id: before.id,
      title: before.title,
      position: before.position,
      summary: SEED.summary,
      intro: SEED.intro,
      instructionsMd: SEED.instructionsMd,
      todoItems: GUIDANCE.todoItems,
      callouts: GUIDANCE.callouts,
      fullTextMd: GUIDANCE.fullTextMd,
    });
    expect(after.config).toEqual(SEED.config);
    const rows = await migrationAuditRows();
    expect(rows.map((row) => row.action).sort()).toEqual([
      "step.config_updated",
      "step.copy_updated",
      "step.copy_updated",
      "step.copy_updated",
      "step.guidance_updated",
      "step.guidance_updated",
      "step.guidance_updated",
    ]);
    for (const row of rows) expect(row).toMatchObject({ entityType: "onboarding_step", entityId: before.id, actorUserId: null });
    expect(rows.find((row) => row.action === "step.config_updated")).toMatchObject({ before: OLD_STEP.config, after: { minutes: 20, fullTextSource: "From the video" } });
  });

  it("changes nothing when run again", async () => {
    const before = await boatWizardStep();
    await runMigration();
    expect(await migrationAuditRows()).toHaveLength(7);
    expect((await boatWizardStep()).updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it("leaves fields an admin edited alone and still updates the rest", async () => {
    await restorePre0023State({ summary: EDITED_SUMMARY, todoItems: EDITED_TODO });
    await runMigration();
    const after = await boatWizardStep();
    expect(after).toMatchObject({ summary: EDITED_SUMMARY, todoItems: EDITED_TODO, intro: SEED.intro, fullTextMd: GUIDANCE.fullTextMd, callouts: GUIDANCE.callouts });
    expect(after.config).toEqual(SEED.config);
    expect(await migrationAuditRows()).toHaveLength(5);
  });
});
