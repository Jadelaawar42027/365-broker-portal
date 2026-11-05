/**
 * File: packages/db/test/step-guidance-seed.int.test.ts
 * Purpose: Integration tests on a real Postgres container for seeding the onboarding steps' short guidance (SPEC D28):
 * every step gets its What to do bullets, callouts and full text (except the two Start here steps, which have no
 * manual text) and step 11 its read-along CRM transcript; steps 0, 1, 8, 11, 12 and 13 get one video slot each;
 * step 9 gets the deposit knowledge check; running the seed again adds nothing; an admin's edits are never overwritten;
 * and a step that already exists without guidance (as in production) is filled on the next run.
 *
 * Functions:
 * - stepId(key): the id of an onboarding step.
 */
import { asc, count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { onboardingSteps, seedDatabase, stepQuestionOptions, stepQuestions, stepVideos } from "../src";
import { startTestDatabase } from "../src/testing";

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
let firstGuided = 0;

async function stepId(key: string): Promise<string> {
  const [row] = await testDb.db.select({ id: onboardingSteps.id }).from(onboardingSteps).where(eq(onboardingSteps.key, key));
  return row!.id;
}

beforeAll(async () => {
  testDb = await startTestDatabase();
  firstGuided = (await seedDatabase(testDb.db, {})).stepsGuided;
});

afterAll(async () => {
  await testDb?.stop();
});

describe("step guidance seed", () => {
  it("gives all 14 steps their bullets, and every step after the two Start here steps its full text", async () => {
    expect(firstGuided).toBe(14);
    const rows = await testDb.db.select().from(onboardingSteps).orderBy(asc(onboardingSteps.position));
    const [startHere, aiAgent, ...manualSteps] = rows;
    expect(startHere!.key).toBe("start_here");
    expect(startHere!.todoItems).toHaveLength(5);
    expect(startHere!.fullTextMd ?? "").toBe("");
    expect(aiAgent!.key).toBe("ai_agent");
    expect(aiAgent!.todoItems).toHaveLength(3);
    expect(aiAgent!.fullTextMd ?? "").toBe("");
    for (const row of manualSteps) {
      expect(row.todoItems?.length, row.key).toBeGreaterThanOrEqual(3);
      expect(row.fullTextMd?.length, row.key).toBeGreaterThan(20);
    }
    const bond = rows.find((row) => row.key === "license_bond")!;
    expect(bond.callouts?.map((callout) => callout.kind)).toEqual(["NEVER", "WATCH"]);
  });

  it("gives each Start here step its own video slot", async () => {
    const startHere = await testDb.db.select().from(stepVideos).where(eq(stepVideos.stepId, await stepId("start_here")));
    expect(startHere.map((video) => video.title)).toEqual(["Part 1: Aj walks you through the platform"]);
    const aiAgent = await testDb.db.select().from(stepVideos).where(eq(stepVideos.stepId, await stepId("ai_agent")));
    expect(aiAgent.map((video) => video.title)).toEqual(["Part 2: Introducing Your Personal AI Agent"]);
  });

  it("adds one empty video slot to each of steps 11 to 13, and one on step 8", async () => {
    for (const [key, title] of [
      ["crm_login", "CRM sign in and training"],
      ["boatwizard_login", "BoatWizard walkthrough"],
      ["yachtcloser_login", "YachtCloser walkthrough"],
    ] as const) {
      const slots = await testDb.db.select().from(stepVideos).where(eq(stepVideos.stepId, await stepId(key))).orderBy(asc(stepVideos.position));
      expect(slots.map((video) => [video.title, video.source]), key).toEqual([[title, null]]);
    }
    const [crm] = await testDb.db.select().from(onboardingSteps).where(eq(onboardingSteps.key, "crm_login"));
    expect(crm!.config).toMatchObject({ requireVideo: true, fullTextLabel: "Read along with the video", fullTextSource: "Transcript" });
    expect(crm!.fullTextMd).toContain("## Broker outcomes: how we track your leads");
    const dbpr = await testDb.db.select().from(stepVideos).where(eq(stepVideos.stepId, await stepId("dbpr_filing")));
    expect(dbpr.map((video) => video.title)).toEqual(["How to file your DBPR application"]);
  });

  it("adds the deposit knowledge check on step 9 with one correct option", async () => {
    const questions = await testDb.db.select().from(stepQuestions).where(eq(stepQuestions.stepId, await stepId("license_bond")));
    expect(questions.map((question) => question.prompt)).toEqual(["Where must a client's deposit go?"]);
    const options = await testDb.db.select().from(stepQuestionOptions).where(eq(stepQuestionOptions.questionId, questions[0]!.id));
    expect(options).toHaveLength(4);
    expect(options.filter((option) => option.isCorrect).map((option) => option.label)).toEqual(["The brokerage escrow account, by wire"]);
  });

  it("adds nothing on a second run and keeps an admin's edits", async () => {
    await testDb.db.update(onboardingSteps).set({ todoItems: ["Edited by Shelly"] }).where(eq(onboardingSteps.key, "w9"));
    const again = await seedDatabase(testDb.db, {});
    expect(again.stepsGuided).toBe(0);
    const [w9] = await testDb.db.select().from(onboardingSteps).where(eq(onboardingSteps.key, "w9"));
    expect(w9!.todoItems).toEqual(["Edited by Shelly"]);
    const [videos] = await testDb.db.select({ value: count() }).from(stepVideos);
    const [questions] = await testDb.db.select({ value: count() }).from(stepQuestions);
    expect(videos!.value).toBe(6);
    expect(questions!.value).toBe(1);
  });

  it("fills an existing step that has no guidance yet, as on the first deploy", async () => {
    await testDb.db.update(onboardingSteps).set({ todoItems: null, callouts: null, fullTextMd: null }).where(eq(onboardingSteps.key, "bio"));
    const run = await seedDatabase(testDb.db, {});
    expect(run.stepsGuided).toBe(1);
    const [bio] = await testDb.db.select().from(onboardingSteps).where(eq(onboardingSteps.key, "bio"));
    expect(bio!.todoItems?.[0]).toBe("Write 100 to 200 words, in the first person.");
  });
});
