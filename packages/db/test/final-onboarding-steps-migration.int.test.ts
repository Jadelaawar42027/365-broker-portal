/**
 * File: packages/db/test/final-onboarding-steps-migration.int.test.ts
 * Purpose: Integration tests on a real Postgres container for migration 0019 (SPEC D32): starting from the database as
 * it was before it (step 10 the 365 email with the brand signature, step 11 the combined platform logins with three
 * video slots, the retired commission step at 12), it retires platform logins, moves retired steps above 100, adds
 * steps 11 to 13 (CRM sign in and training with its read-along transcript and required video, BoatWizard, YachtCloser),
 * moves the three video slots (and any video in them) to the new steps, rewrites step 10 as the 365 email login while
 * leaving an admin-edited field alone, gives brokers todo rows, writes audit rows, and changes nothing when run again.
 *
 * Functions:
 * - runMigration(): runs the SQL of migration 0019 against the test database.
 * - restorePre0019State(): turns the freshly seeded database back into its state before migration 0019.
 * - stepByKey(key): loads one onboarding step row by key.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, brokerSteps, createBroker, onboardingSteps, seedDatabase, stepVideos } from "../src";
import { STEP_GUIDANCE } from "../src/seed/step-guidance";
import { ONBOARDING_STEP_SEEDS } from "../src/seed/steps";
import { startTestDatabase } from "../src/testing";

const MIGRATION = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle", "0019_final_onboarding_steps.sql");
const NEW_KEYS = ["crm_login", "boatwizard_login", "yachtcloser_login"];
const CRM_EMBED = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";
const EDITED_SUMMARY = "Shelly's own summary for the email step.";
const OLD_EMAIL = {
  title: "Activate your 365 email and install the brand signature",
  shortTitle: "365 email + brand signature",
  intro: "House rule: anything that counts as a record goes through your 365 Yachts email with the brand signature. Texts and calls are fine, but never use personal email for client business.",
  instructionsMd: [
    "1. Sign in to your 365 Yachts email with the details you received.",
    "2. Install the 365 brand signature block with the logo.",
    "3. Send yourself a test email to check the signature looks right.",
  ].join("\n"),
  config: { minutes: 10, confirmLabel: "I've activated my 365 email and installed the brand signature" },
  todoItems: [
    "Sign in to your 365 Yachts email.",
    "Install the 365 brand signature with the logo.",
    "Send yourself a test email to check it.",
    "From now on, use this address for all client email.",
  ],
  callouts: [{ kind: "HOUSE RULE" as const, text: "All client email goes through your 365 address with the brand signature. Texts and calls are fine." }],
  fullTextMd: STEP_GUIDANCE.email_signature!.fullTextMd
    .replace("Sign in and pick your own password", "Install the 365 brand signature block with logo")
    .replace("through your 365 Yachts email address. This is", "through your 365 Yachts email address with the brand signature. This is")
    .replace("- 365 email active", "- 365 email active, brand signature installed"),
};

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
let brokerId: string;
const oldVideoIds: Record<string, string> = {};

async function runMigration(): Promise<void> {
  await testDb.sql.unsafe(readFileSync(MIGRATION, "utf8"));
}

async function stepByKey(key: string) {
  const [row] = await testDb.db.select().from(onboardingSteps).where(eq(onboardingSteps.key, key));
  return row;
}

async function restorePre0019State(): Promise<void> {
  const newSteps = await testDb.db.select({ id: onboardingSteps.id }).from(onboardingSteps).where(inArray(onboardingSteps.key, NEW_KEYS));
  const newIds = newSteps.map((step) => step.id);
  await testDb.db.delete(brokerSteps).where(inArray(brokerSteps.stepId, newIds));
  await testDb.db.delete(onboardingSteps).where(inArray(onboardingSteps.id, newIds));
  const [platform] = await testDb.db
    .insert(onboardingSteps)
    .values({
      key: "platform_logins",
      position: 11,
      stage: "your_tools",
      title: "Log in to BoatWizard, YachtCloser and GoHighLevel",
      shortTitle: "BoatWizard, YachtCloser, GoHighLevel logins",
      summary: "Log in to the three platforms you'll use every day and take one first action in each.",
      intro: "These are the tools you sell with: the MLS, contracts and closing, and your CRM.",
      kind: "checklist",
      needsApproval: false,
      instructionsMd: "1. BoatWizard\n2. YachtCloser\n3. GoHighLevel",
      config: { items: [{ value: "boatwizard", label: "BoatWizard" }, { value: "yachtcloser", label: "YachtCloser" }, { value: "gohighlevel", label: "GoHighLevel" }] },
      todoItems: ["BoatWizard: log in.", "YachtCloser: log in.", "GoHighLevel: log in."],
      callouts: [],
      fullTextMd: "Platform text",
    })
    .returning({ id: onboardingSteps.id });
  const slots = await testDb.db
    .insert(stepVideos)
    .values([
      { stepId: platform!.id, position: 1, title: "GoHighLevel CRM walkthrough", source: "embed", provider: "youtube", embedUrl: CRM_EMBED },
      { stepId: platform!.id, position: 2, title: "BoatWizard walkthrough" },
      { stepId: platform!.id, position: 3, title: "YachtCloser walkthrough" },
    ])
    .returning({ id: stepVideos.id, title: stepVideos.title });
  for (const slot of slots) oldVideoIds[slot.title] = slot.id;
  await testDb.db.insert(brokerSteps).values({ brokerId, stepId: platform!.id, status: "approved" });
  await testDb.db.insert(onboardingSteps).values({
    key: "commission_tier",
    position: 12,
    stage: "your_tools",
    title: "Book your 1-on-1 to confirm your commission tier",
    shortTitle: "Commission tier confirmed (1-on-1)",
    summary: "Old step",
    intro: "Old step",
    kind: "admin",
    needsApproval: true,
    instructionsMd: "Old step",
    active: false,
  });
  await testDb.db.update(onboardingSteps).set({ ...OLD_EMAIL, summary: EDITED_SUMMARY }).where(eq(onboardingSteps.key, "email_signature"));
  await testDb.db.delete(auditLog);
}

beforeAll(async () => {
  testDb = await startTestDatabase();
  await seedDatabase(testDb.db, {});
  const created = await testDb.db.transaction((tx) =>
    createBroker(tx, { name: "Existing Broker", email: "existing@example.com", level: "junior", status: "onboarding", joinedAt: "2026-10-01", inHouseSplit: 40, selfGeneratedSplit: 50 }),
  );
  brokerId = created.brokerId;
  await restorePre0019State();
});

afterAll(async () => {
  await testDb?.stop();
});

describe("migration 0019: the final onboarding steps", () => {
  it("retires platform logins, moves retired steps above 100 and adds steps 11 to 13", async () => {
    await runMigration();
    const active = await testDb.db.select().from(onboardingSteps).where(eq(onboardingSteps.active, true)).orderBy(asc(onboardingSteps.position));
    expect(active.map((row) => [row.position, row.key])).toEqual(ONBOARDING_STEP_SEEDS.map((seed) => [seed.position, seed.key]));
    expect(await stepByKey("platform_logins")).toMatchObject({ active: false, position: 111 });
    expect(await stepByKey("commission_tier")).toMatchObject({ active: false, position: 112 });
  });

  it("creates the CRM step with its read-along transcript and required video, as seeded", async () => {
    const crm = (await stepByKey("crm_login"))!;
    const seed = ONBOARDING_STEP_SEEDS.find((step) => step.key === "crm_login")!;
    expect(crm).toMatchObject({ title: seed.title, intro: seed.intro, kind: "confirm", needsApproval: false, config: seed.config });
    expect(crm.config).toMatchObject({ requireVideo: true, fullTextLabel: "Read along with the video" });
    expect(crm.todoItems).toEqual(STEP_GUIDANCE.crm_login!.todoItems);
    expect(crm.callouts).toEqual(STEP_GUIDANCE.crm_login!.callouts);
    expect(crm.fullTextMd).toBe(STEP_GUIDANCE.crm_login!.fullTextMd);
  });

  it("moves the three video slots, with any video in them, to the new steps", async () => {
    for (const [oldTitle, key, newTitle] of [
      ["GoHighLevel CRM walkthrough", "crm_login", "CRM sign in and training"],
      ["BoatWizard walkthrough", "boatwizard_login", "BoatWizard walkthrough"],
      ["YachtCloser walkthrough", "yachtcloser_login", "YachtCloser walkthrough"],
    ] as const) {
      const step = (await stepByKey(key))!;
      const slots = await testDb.db.select().from(stepVideos).where(eq(stepVideos.stepId, step.id));
      expect(slots.map((slot) => [slot.id, slot.title, slot.position]), key).toEqual([[oldVideoIds[oldTitle], newTitle, 1]]);
    }
    const [crmSlot] = await testDb.db.select().from(stepVideos).where(eq(stepVideos.id, oldVideoIds["GoHighLevel CRM walkthrough"]!));
    expect(crmSlot).toMatchObject({ source: "embed", embedUrl: CRM_EMBED });
  });

  it("turns step 10 into the 365 email login, leaving the admin-edited summary alone", async () => {
    const seed = ONBOARDING_STEP_SEEDS.find((step) => step.key === "email_signature")!;
    const guidance = STEP_GUIDANCE.email_signature!;
    expect(await stepByKey("email_signature")).toMatchObject({
      title: seed.title,
      shortTitle: seed.shortTitle,
      intro: seed.intro,
      instructionsMd: seed.instructionsMd,
      config: seed.config,
      todoItems: guidance.todoItems,
      callouts: guidance.callouts,
      fullTextMd: guidance.fullTextMd,
      summary: EDITED_SUMMARY,
    });
  });

  it("gives the broker todo rows for the new steps and keeps their platform logins history", async () => {
    const rows = await testDb.db
      .select({ key: onboardingSteps.key, status: brokerSteps.status })
      .from(brokerSteps)
      .innerJoin(onboardingSteps, eq(onboardingSteps.id, brokerSteps.stepId))
      .where(and(eq(brokerSteps.brokerId, brokerId), inArray(onboardingSteps.key, [...NEW_KEYS, "platform_logins"])))
      .orderBy(asc(onboardingSteps.position));
    expect(rows).toEqual([
      { key: "crm_login", status: "todo" },
      { key: "boatwizard_login", status: "todo" },
      { key: "yachtcloser_login", status: "todo" },
      { key: "platform_logins", status: "approved" },
    ]);
  });

  it("writes audit rows for each change", async () => {
    const actions = (await testDb.db.select({ action: auditLog.action }).from(auditLog)).map((row) => row.action);
    const count = (action: string) => actions.filter((candidate) => candidate === action).length;
    expect(count("step.retired")).toBe(1);
    expect(count("step.position_changed")).toBe(1);
    expect(count("step.created")).toBe(3);
    expect(count("step.video_moved")).toBe(3);
    expect(count("step.video_slot_added")).toBe(0);
    expect(count("step.copy_updated")).toBe(4);
    expect(count("step.config_updated")).toBe(1);
    expect(count("step.guidance_updated")).toBe(3);
  });

  it("changes nothing when run again", async () => {
    const before = await testDb.db.select().from(onboardingSteps).orderBy(asc(onboardingSteps.position));
    const auditsBefore = await testDb.db.select().from(auditLog);
    await runMigration();
    const after = await testDb.db.select().from(onboardingSteps).orderBy(asc(onboardingSteps.position));
    expect(after.map((row) => [row.key, row.position, row.active, row.updatedAt.getTime()])).toEqual(
      before.map((row) => [row.key, row.position, row.active, row.updatedAt.getTime()]),
    );
    expect(await testDb.db.select().from(auditLog)).toHaveLength(auditsBefore.length);
  });
});
