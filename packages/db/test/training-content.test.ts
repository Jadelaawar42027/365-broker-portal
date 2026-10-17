/**
 * File: packages/db/test/training-content.test.ts
 * Purpose: Unit tests for the seeded training content: Volume One chapters have 2 to 4 lessons and 8 to 12 well-formed
 * questions tied to a lesson, every lesson parses with only known callouts, DBPR fee and bond questions carry the
 * "verify before publishing" note, the disputed co-broke example stays out of the quiz, Module 01 holds the empty
 * GoHighLevel video slot, and Volume Two parts are empty.
 *
 * Functions:
 * - calloutKinds(blocks): every callout kind used in a parsed lesson, including nested ones.
 */
import { CALLOUT_KINDS, DEFAULT_QUESTIONS_PER_ATTEMPT, parseLessonMarkdown, type LessonBlock } from "@bp/shared";
import { describe, expect, it } from "vitest";
import { TRAINING_SEED_CHAPTERS } from "../src/seed/training-content";

const VOLUME_ONE = TRAINING_SEED_CHAPTERS.filter((chapter) => chapter.volume === 1);
const VOLUME_TWO = TRAINING_SEED_CHAPTERS.filter((chapter) => chapter.volume === 2);

function calloutKinds(blocks: LessonBlock[]): string[] {
  return blocks.flatMap((block) => (block.type === "callout" ? [block.kind, ...calloutKinds(block.blocks)] : []));
}

describe("Volume One training content", () => {
  it("covers Part 0 and Modules 01 to 06 in order with unique codes", () => {
    expect(VOLUME_ONE.map((chapter) => chapter.code)).toEqual(["0", "01", "02", "03", "04", "05", "06"]);
    const codes = TRAINING_SEED_CHAPTERS.map((chapter) => chapter.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it.each(VOLUME_ONE.map((chapter) => [chapter.code, chapter] as const))("chapter %s has 2 to 4 lessons and 8 to 12 questions", (_code, chapter) => {
    expect(chapter.lessons.length).toBeGreaterThanOrEqual(2);
    expect(chapter.lessons.length).toBeLessThanOrEqual(4);
    expect(chapter.questions.length).toBeGreaterThanOrEqual(8);
    expect(chapter.questions.length).toBeLessThanOrEqual(12);
    expect(chapter.questions.length).toBeGreaterThanOrEqual(DEFAULT_QUESTIONS_PER_ATTEMPT);
  });

  it("every question has four distinct options, one valid correct answer, an explanation and a lesson", () => {
    for (const chapter of VOLUME_ONE) {
      for (const question of chapter.questions) {
        expect(question.options).toHaveLength(4);
        expect(new Set(question.options).size).toBe(4);
        expect(question.correct).toBeGreaterThanOrEqual(0);
        expect(question.correct).toBeLessThan(question.options.length);
        expect(question.explanation.trim().length).toBeGreaterThan(10);
        expect(chapter.lessons[question.lesson], `${chapter.code}: ${question.prompt}`).toBeDefined();
        expect(chapter.lessons[question.lesson]!.videoPlaceholder ?? false).toBe(false);
      }
    }
  });

  it("every lesson parses and uses only the manual's callouts", () => {
    for (const chapter of VOLUME_ONE) {
      for (const lesson of chapter.lessons) {
        if (lesson.videoPlaceholder) continue;
        const blocks = parseLessonMarkdown(lesson.bodyMd);
        expect(blocks.length, lesson.title).toBeGreaterThan(0);
        for (const kind of calloutKinds(blocks)) expect(CALLOUT_KINDS).toContain(kind);
        expect(lesson.bodyMd).not.toMatch(/^> \[!(?!WATCH\]|NEVER\]|HOUSE RULE\]|EDGE\]|FIELD NOTE\])/m);
      }
    }
  });

  it("flags DBPR fee and bond questions for checking before publishing", () => {
    const moneyQuestions = VOLUME_ONE.flatMap((chapter) => chapter.questions).filter((question) => {
      const text = [question.prompt, ...question.options, question.explanation].join(" ");
      return /\b(fees?|bond)\b/i.test(text) && /\$\d/.test(text);
    });
    expect(moneyQuestions.length).toBeGreaterThan(0);
    for (const question of moneyQuestions) expect(question.adminNote, question.prompt).toMatch(/verify before publishing/i);
  });

  it("keeps the disputed Module 03 co-broke example out of the questions", () => {
    const module03 = VOLUME_ONE.find((chapter) => chapter.code === "03")!;
    for (const question of module03.questions) {
      expect([question.prompt, ...question.options, question.explanation].join(" ")).not.toMatch(/500,000|\$12,500|\$7,500/);
    }
  });

  it("holds an empty GoHighLevel video slot in Module 01", () => {
    const module01 = VOLUME_ONE.find((chapter) => chapter.code === "01")!;
    const placeholder = module01.lessons.find((lesson) => lesson.title === "GoHighLevel CRM walkthrough");
    expect(placeholder?.videoPlaceholder).toBe(true);
  });
});

describe("Volume Two training content", () => {
  it("lists Parts II to X as empty coming-soon chapters", () => {
    expect(VOLUME_TWO.map((chapter) => chapter.code)).toEqual(["II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]);
    for (const chapter of VOLUME_TWO) {
      expect(chapter.lessons).toEqual([]);
      expect(chapter.questions).toEqual([]);
    }
  });
});
