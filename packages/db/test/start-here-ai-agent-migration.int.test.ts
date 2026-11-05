/**
 * File: packages/db/test/start-here-ai-agent-migration.int.test.ts
 * Purpose: Integration tests on a real Postgres container for migration 0018 (SPEC D30): starting from the database as
 * it was after migration 0017 (11 steps, both of Aj's videos on step 0), it adds step 1 "ai_agent", moves every later
 * step up one number, moves the Part 2 video slot (with its video) to the new step, puts step 0's copy back to one
 * video, renumbers the licensing copy, gives every broker a todo row, leaves admin-edited copy alone, and changes
 * nothing when run again.
 *
 * Functions:
 * - runMigration(): runs the SQL of migration 0018 against the test database.
 * - restorePre0018State(): turns the freshly seeded database back into its state after migration 0017.
 * - stepByKey(key): loads one onboarding step row by key.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, brokerSteps, createBroker, onboardingSteps, seedDatabase, stepVideos } from "../src";
import { startTestDatabase } from "../src/testing";

const MIGRATION = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle", "0018_start_here_ai_agent_step.sql");
const PART_2_TITLE = "Part 2: Introducing Your Personal AI Agent";
const PART_2_EMBED = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";
const OLD_START_HERE = {
  summary: "Watch two short videos from Aj before you begin: the portal walkthrough and your personal AI agent. Takes about 10 minutes.",
  intro: "Aj walks you through the platform: your checklist, sending each step, getting help, and what happens after. Then Aj introduces your personal AI agent.",
  instructionsMd: [
    "1. Watch Part 1: Aj walks you through the platform.",
    "2. Watch Part 2: Aj introduces your personal AI agent.",
    "3. Tick the box to say you've watched both.",
  ].join("\n"),
  todoItems: [
    "Watch both videos above: Aj walks you through the platform, then introduces your personal AI agent.",
    "Your checklist always shows the next step to do.",
    "Open a step, follow What to do, then send it in.",
    "Stuck? Tap Message Shelly on WhatsApp on any step.",
    "Tick the box below once you've watched both.",
  ],
};
const OLD_LICENSE_INTRO = "Florida requires a yacht and ship license to sell any used vessel over 32 feet. Tell us where you stand, and steps 7 and 8 will show you exactly what to do.";
const EDITED_W9_TITLE = "Upload your W-9 (edited by Shelly)";

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
let brokerId: string;

async function runMigration(): Promise<void> {
  await testDb.sql.unsafe(readFileSync(MIGRATION, "utf8"));
}

async function stepByKey(key: string) {
  const [row] = await testDb.db.select().from(onboardingSteps).where(eq(onboardingSteps.key, key));
  return row;
}

async function restorePre0018State(): Promise<void> {
  const startHere = (await stepByKey("start_here"))!;
  const aiAgent = (await stepByKey("ai_agent"))!;
  await testDb.db.update(stepVideos).set({ stepId: startHere.id, position: 2, source: "embed", provider: "youtube", embedUrl: PART_2_EMBED }).where(eq(stepVideos.stepId, aiAgent.id));
  await testDb.db.delete(brokerSteps).where(eq(brokerSteps.stepId, aiAgent.id));
  await testDb.db.delete(onboardingSteps).where(eq(onboardingSteps.id, aiAgent.id));
  await testDb.sql.unsafe("UPDATE onboarding_steps SET position = position + 1000 WHERE position >= 2");
  await testDb.sql.unsafe("UPDATE onboarding_steps SET position = position - 1001 WHERE position >= 1000");
  await testDb.db.update(onboardingSteps).set(OLD_START_HERE).where(eq(onboardingSteps.id, startHere.id));
  const situation = (await stepByKey("license_situation"))!;
  await testDb.db
    .update(onboardingSteps)
    .set({ intro: OLD_LICENSE_INTRO, todoItems: situation.todoItems!.map((item) => item.replace("steps 8 and 9", "steps 7 and 8")) })
    .where(eq(onboardingSteps.id, situation.id));
  for (const key of ["dbpr_filing", "license_bond"]) {
    const step = (await stepByKey(key))!;
    const oldConfig = JSON.stringify(step.config).replaceAll("step 9.", "step 8.").replace("after step 8, so", "after step 7, so").replace("original in step 8.", "original in step 7.").replace("Finish step 8 with", "Finish step 7 with");
    await testDb.db.update(onboardingSteps).set({ config: JSON.parse(oldConfig) }).where(eq(onboardingSteps.id, step.id));
  }
  await testDb.db.update(onboardingSteps).set({ title: EDITED_W9_TITLE }).where(eq(onboardingSteps.key, "w9"));
  await testDb.db.delete(auditLog);
}

beforeAll(async () => {
  testDb = await startTestDatabase();
  await seedDatabase(testDb.db, {});
  const created = await testDb.db.transaction((tx) =>
    createBroker(tx, { name: "Existing Broker", email: "existing@example.com", level: "junior", status: "onboarding", joinedAt: "2026-10-01", inHouseSplit: 40, selfGeneratedSplit: 50 }),
  );
  brokerId = created.brokerId;
  await restorePre0018State();
});

afterAll(async () => {
  await testDb?.stop();
});

describe("migration 0018: the AI agent video becomes step 1", () => {
  it("starts from the post-0017 state: 11 steps, both videos on step 0", async () => {
    const rows = await testDb.db.select().from(onboardingSteps).orderBy(asc(onboardingSteps.position));
    expect(rows.map((row) => [row.position, row.key])).toEqual([
      [0, "start_here"], [1, "photo_id"], [2, "contract_nda"], [3, "bio"], [4, "headshot"], [5, "w9"],
      [6, "license_situation"], [7, "dbpr_filing"], [8, "license_bond"], [9, "email_signature"], [10, "platform_logins"],
    ]);
    const startHere = (await stepByKey("start_here"))!;
    expect(await testDb.db.select().from(stepVideos).where(eq(stepVideos.stepId, startHere.id))).toHaveLength(2);
  });

  it("adds step 1 and moves every later step up one", async () => {
    await runMigration();
    const rows = await testDb.db.select().from(onboardingSteps).orderBy(asc(onboardingSteps.position));
    expect(rows.map((row) => [row.position, row.key])).toEqual([
      [0, "start_here"], [1, "ai_agent"], [2, "photo_id"], [3, "contract_nda"], [4, "bio"], [5, "headshot"], [6, "w9"],
      [7, "license_situation"], [8, "dbpr_filing"], [9, "license_bond"], [10, "email_signature"], [11, "platform_logins"],
    ]);
    expect(rows[1]).toMatchObject({
      stage: "start_here",
      title: "Introducing your personal AI agent",
      kind: "confirm",
      needsApproval: false,
      config: { minutes: 5, confirmLabel: "I've watched the AI agent video" },
    });
    expect(rows[1]!.todoItems).toHaveLength(3);
  });

  it("moves the Part 2 slot with its video to the new step, leaving Part 1 on step 0", async () => {
    const startHere = (await stepByKey("start_here"))!;
    const aiAgent = (await stepByKey("ai_agent"))!;
    const startVideos = await testDb.db.select().from(stepVideos).where(eq(stepVideos.stepId, startHere.id));
    expect(startVideos.map((video) => video.title)).toEqual(["Part 1: Aj walks you through the platform"]);
    const agentVideos = await testDb.db.select().from(stepVideos).where(eq(stepVideos.stepId, aiAgent.id));
    expect(agentVideos).toMatchObject([{ title: PART_2_TITLE, position: 1, source: "embed", embedUrl: PART_2_EMBED }]);
  });

  it("puts step 0's copy back to one video", async () => {
    expect(await stepByKey("start_here")).toMatchObject({
      summary: "Watch Aj's short walkthrough of the portal before you begin. Takes about 10 minutes.",
      intro: "Aj walks you through the platform: your checklist, sending each step, getting help, and what happens after.",
      instructionsMd: "1. Watch Part 1: Aj walks you through the platform.\n2. Tick the box to say you've watched it.",
      todoItems: [
        "Watch the video above: Aj walks you through the platform.",
        "Your checklist always shows the next step to do.",
        "Open a step, follow What to do, then send it in.",
        "Stuck? Tap Message Shelly on WhatsApp on any step.",
        "Tick the box below once you've watched it.",
      ],
    });
  });

  it("renumbers the licensing copy and leaves admin-edited copy alone", async () => {
    const situation = (await stepByKey("license_situation"))!;
    expect(situation.intro).toContain("steps 8 and 9 will show you");
    expect(situation.todoItems).toContain("Your answer sets what you see in steps 8 and 9.");
    const dbpr = JSON.stringify((await stepByKey("dbpr_filing"))!.config);
    expect(dbpr).toContain("You'll need the copy in step 9.");
    expect(dbpr).toContain("You'll upload your license and bond copy in step 9.");
    const bond = JSON.stringify((await stepByKey("license_bond"))!.config);
    expect(bond).toContain("after step 8, so");
    expect(bond).toContain("original in step 8.");
    expect(bond).toContain("Finish step 8 with Shelly first.");
    expect((await stepByKey("w9"))!.title).toBe(EDITED_W9_TITLE);
  });

  it("gives existing brokers a todo row for the new step", async () => {
    const aiAgent = (await stepByKey("ai_agent"))!;
    const rows = await testDb.db.select().from(brokerSteps).where(and(eq(brokerSteps.brokerId, brokerId), eq(brokerSteps.stepId, aiAgent.id)));
    expect(rows).toMatchObject([{ status: "todo" }]);
  });

  it("writes audit rows for each change", async () => {
    const actions = (await testDb.db.select({ action: auditLog.action }).from(auditLog)).map((row) => row.action);
    expect(actions.filter((action) => action === "step.position_changed")).toHaveLength(10);
    expect(actions).toEqual(expect.arrayContaining(["step.created", "step.video_moved", "step.copy_updated", "step.guidance_updated", "step.config_updated"]));
    expect(actions).not.toContain("step.video_slot_added");
  });

  it("changes nothing when run again", async () => {
    const before = await testDb.db.select().from(onboardingSteps).orderBy(asc(onboardingSteps.position));
    const auditsBefore = await testDb.db.select().from(auditLog);
    await runMigration();
    const after = await testDb.db.select().from(onboardingSteps).orderBy(asc(onboardingSteps.position));
    expect(after.map((row) => [row.key, row.position, row.updatedAt.getTime()])).toEqual(before.map((row) => [row.key, row.position, row.updatedAt.getTime()]));
    expect(await testDb.db.select().from(auditLog)).toHaveLength(auditsBefore.length);
    const aiAgent = (await stepByKey("ai_agent"))!;
    expect(await testDb.db.select().from(stepVideos).where(inArray(stepVideos.stepId, [aiAgent.id]))).toHaveLength(1);
  });
});
