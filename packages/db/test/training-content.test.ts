/**
 * File: packages/db/test/training-content.test.ts
 * Purpose: Unit tests for the seeded content (SPEC D28). Training: one Volume One chapter, "How you get paid &
 * measured", whose lessons have 3 to 5 short bullets and callouts, whose 8 to 25 questions are well formed and tied to a
 * lesson, with an 80% pass mark and no disputed co-broke figures; Volume Two parts are empty. Steps: every onboarding
 * step has guidance in the short layout, every NEVER and WATCH from Modules 01 and 02 is kept, the video slots and the
 * step 8 knowledge check are in place, and no bond or fee figure appears outside the full text.
 *
 * Functions:
 * - calloutKinds(blocks): every callout kind used in a parsed lesson, including nested ones.
 */
import { CALLOUT_KINDS, countWords, MAX_STEP_CHECK_QUESTIONS, parseLessonMarkdown, type LessonBlock } from "@bp/shared";
import { describe, expect, it } from "vitest";
import { STEP_GUIDANCE } from "../src/seed/step-guidance";
import { ONBOARDING_STEP_SEEDS } from "../src/seed/steps";
import { TRAINING_SEED_CHAPTERS } from "../src/seed/training-content";

const VOLUME_ONE = TRAINING_SEED_CHAPTERS.filter((chapter) => chapter.volume === 1);
const VOLUME_TWO = TRAINING_SEED_CHAPTERS.filter((chapter) => chapter.volume === 2);

function calloutKinds(blocks: LessonBlock[]): string[] {
  return blocks.flatMap((block) => (block.type === "callout" ? [block.kind, ...calloutKinds(block.blocks)] : []));
}

describe("training content", () => {
  it("has one Volume One chapter, How you get paid & measured, at an 80% pass mark", () => {
    expect(VOLUME_ONE.map((chapter) => [chapter.code, chapter.title, chapter.passMark])).toEqual([["I", "How you get paid & measured", 80]]);
    const codes = TRAINING_SEED_CHAPTERS.map((chapter) => chapter.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("drops the onboarding chapters that moved into the steps", () => {
    const titles = TRAINING_SEED_CHAPTERS.map((chapter) => chapter.title);
    for (const removed of ["Start Here", "Week One Setup", "Licensing & Compliance", "Quick Start Checklist"]) expect(titles).not.toContain(removed);
  });

  it("gives every lesson 3 to 5 short bullets, callouts of the allowed kinds, and the manual text", () => {
    const [chapter] = VOLUME_ONE;
    expect(chapter!.lessons.length).toBeGreaterThanOrEqual(3);
    for (const lesson of chapter!.lessons) {
      expect(lesson.todoItems!.length, lesson.title).toBeGreaterThanOrEqual(3);
      expect(lesson.todoItems!.length, lesson.title).toBeLessThanOrEqual(5);
      expect(countWords(lesson.todoItems!), lesson.title).toBeLessThanOrEqual(65);
      for (const callout of lesson.callouts ?? []) expect(["NEVER", "WATCH", "HOUSE RULE"]).toContain(callout.kind);
      const blocks = parseLessonMarkdown(lesson.bodyMd);
      expect(blocks.length, lesson.title).toBeGreaterThan(0);
      for (const kind of calloutKinds(blocks)) expect(CALLOUT_KINDS).toContain(kind);
    }
  });

  it("keeps every WATCH from Modules 04 and 05 as a one-line callout", () => {
    const watches = VOLUME_ONE[0]!.lessons.flatMap((lesson) => (lesson.callouts ?? []).filter((callout) => callout.kind === "WATCH").map((callout) => callout.text));
    expect(watches.some((text) => /gross commission/i.test(text))).toBe(true);
    expect(watches.some((text) => /follow-up|next actions/i.test(text))).toBe(true);
  });

  it("has 8 to 25 well-formed questions, each tied to a lesson, with no disputed co-broke figures", () => {
    const [chapter] = VOLUME_ONE;
    expect(chapter!.questions.length).toBeGreaterThanOrEqual(8);
    expect(chapter!.questions.length).toBeLessThanOrEqual(25);
    for (const question of chapter!.questions) {
      expect(question.options).toHaveLength(4);
      expect(new Set(question.options).size).toBe(4);
      expect(question.options[question.correct]).toBeDefined();
      expect(question.explanation.trim().length).toBeGreaterThan(10);
      expect(chapter!.lessons[question.lesson], question.prompt).toBeDefined();
      expect([question.prompt, ...question.options, question.explanation].join(" ")).not.toMatch(/500,000|\$12,500|\$7,500/);
    }
    expect(new Set(chapter!.questions.map((question) => question.lesson)).size).toBe(chapter!.lessons.length);
  });

  it("lists Volume Two Parts II to X as empty coming-soon chapters", () => {
    expect(VOLUME_TWO.map((chapter) => chapter.code)).toEqual(["II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]);
    for (const chapter of VOLUME_TWO) {
      expect(chapter.lessons).toEqual([]);
      expect(chapter.questions).toEqual([]);
    }
  });
});

describe("onboarding step guidance", () => {
  it("covers every onboarding step and nothing else", () => {
    expect(Object.keys(STEP_GUIDANCE).sort()).toEqual(ONBOARDING_STEP_SEEDS.map((step) => step.key).sort());
  });

  it("keeps What to do to 3 to 5 bullets under about 60 words, with no bond or fee figures", () => {
    for (const [key, guidance] of Object.entries(STEP_GUIDANCE)) {
      expect(guidance.todoItems.length, key).toBeGreaterThanOrEqual(3);
      expect(guidance.todoItems.length, key).toBeLessThanOrEqual(5);
      expect(countWords(guidance.todoItems), key).toBeLessThanOrEqual(60);
      expect([...guidance.todoItems, ...guidance.callouts.map((callout) => callout.text)].join(" "), key).not.toMatch(/\$\d/);
      expect(parseLessonMarkdown(guidance.fullTextMd).length, key).toBeGreaterThan(0);
    }
  });

  it("keeps every NEVER and WATCH from Modules 01 and 02 as one-line callouts", () => {
    const all = Object.values(STEP_GUIDANCE).flatMap((guidance) => guidance.callouts);
    expect(all.some((callout) => callout.kind === "NEVER" && /client funds/i.test(callout.text))).toBe(true);
    expect(all.some((callout) => callout.kind === "WATCH" && /fees and bond amounts change/i.test(callout.text))).toBe(true);
    expect(STEP_GUIDANCE.dbpr_filing!.callouts.map((callout) => callout.kind)).toContain("WATCH");
    expect(STEP_GUIDANCE.license_bond!.callouts.map((callout) => callout.kind)).toEqual(["NEVER", "WATCH"]);
    for (const callout of all) expect(callout.text.length).toBeLessThanOrEqual(120);
  });

  it("adds empty video slots on step 10 and step 7", () => {
    expect(STEP_GUIDANCE.platform_logins!.videoSlots).toEqual(["GoHighLevel CRM walkthrough", "BoatWizard walkthrough", "YachtCloser walkthrough"]);
    expect(STEP_GUIDANCE.dbpr_filing!.videoSlots).toEqual(["How to file your DBPR application"]);
  });

  it("puts the deposit question on step 8 only, within the 3-question limit", () => {
    const withChecks = Object.entries(STEP_GUIDANCE).filter(([, guidance]) => guidance.checkQuestions?.length);
    expect(withChecks.map(([key]) => key)).toEqual(["license_bond"]);
    const [question] = STEP_GUIDANCE.license_bond!.checkQuestions!;
    expect(question!.prompt).toBe("Where must a client's deposit go?");
    expect(question!.options[question!.correct]).toBe("The brokerage escrow account, by wire");
    expect(STEP_GUIDANCE.license_bond!.checkQuestions!.length).toBeLessThanOrEqual(MAX_STEP_CHECK_QUESTIONS);
  });
});
