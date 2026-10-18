/**
 * File: packages/shared/test/guidance.test.ts
 * Purpose: Unit tests for the short step and lesson layout rules (SPEC D28): word counting for What to do bullets,
 * the bullet and callout limits in the schemas, the allowed callout kinds, and when a step's knowledge check counts
 * as passed.
 *
 * Functions:
 * - none
 */
import { describe, expect, it } from "vitest";
import { calloutsSchema, countWords, isStepCheckPassed, todoItemsSchema, updateStepGuidanceRequestSchema } from "../src";

const QUESTIONS = [
  { id: "q1", options: [{ id: "a", isCorrect: false }, { id: "b", isCorrect: true }] },
  { id: "q2", options: [{ id: "c", isCorrect: true }, { id: "d", isCorrect: false }] },
];

describe("countWords", () => {
  it("counts words across bullets, ignoring extra spaces", () => {
    expect(countWords(["Upload it here.", "  A phone   photo is fine. "])).toBe(8);
    expect(countWords([])).toBe(0);
  });
});

describe("guidance schemas", () => {
  it("allow up to 5 What to do bullets", () => {
    expect(todoItemsSchema.safeParse(["One.", "Two.", "Three."]).success).toBe(true);
    expect(todoItemsSchema.safeParse(["a1", "b2", "c3", "d4", "e5", "f6"]).success).toBe(false);
    expect(todoItemsSchema.safeParse(["x"]).success).toBe(false);
  });

  it("allow only NEVER, WATCH and HOUSE RULE callouts", () => {
    expect(calloutsSchema.safeParse([{ kind: "NEVER", text: "Hold client funds." }]).success).toBe(true);
    expect(calloutsSchema.safeParse([{ kind: "EDGE", text: "Where we win." }]).success).toBe(false);
    expect(calloutsSchema.safeParse([{ kind: "WATCH", text: "x".repeat(241) }]).success).toBe(false);
  });

  it("need at least one field to update a step's guidance", () => {
    expect(updateStepGuidanceRequestSchema.safeParse({}).success).toBe(false);
    expect(updateStepGuidanceRequestSchema.safeParse({ fullTextMd: "" }).success).toBe(true);
  });
});

describe("isStepCheckPassed", () => {
  it("passes only when every question has its correct option", () => {
    expect(isStepCheckPassed(QUESTIONS, { q1: "b", q2: "c" })).toBe(true);
    expect(isStepCheckPassed(QUESTIONS, { q1: "b" })).toBe(false);
    expect(isStepCheckPassed(QUESTIONS, { q1: "a", q2: "c" })).toBe(false);
    expect(isStepCheckPassed(QUESTIONS, { q1: "c", q2: "b" })).toBe(false);
    expect(isStepCheckPassed(QUESTIONS, undefined)).toBe(false);
  });

  it("passes a step with no questions", () => {
    expect(isStepCheckPassed([], undefined)).toBe(true);
  });
});
