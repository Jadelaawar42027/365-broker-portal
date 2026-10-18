/**
 * File: packages/shared/src/guidance.ts
 * Purpose: The short "guided" layout every onboarding step and lesson uses (SPEC D28): 3 to 5 plain "What to do"
 * bullets, one-line NEVER / WATCH / HOUSE RULE callouts, and the manual's full text behind a "Read the full section"
 * panel. Also the optional knowledge check on a step: up to 3 questions that must all be answered correctly before
 * the broker can submit.
 *
 * Functions:
 * - countWords(lines): the number of words across a list of short lines.
 * - isStepCheckPassed(questions, answers): true when every question has an answer and every answer is the correct option.
 */
import { z } from "zod";

export const GUIDANCE_CALLOUT_KINDS = ["NEVER", "WATCH", "HOUSE RULE"] as const;
export type GuidanceCalloutKind = (typeof GUIDANCE_CALLOUT_KINDS)[number];

export const MAX_TODO_ITEMS = 5;
export const TODO_WORD_TARGET = 60;
export const MAX_GUIDANCE_CALLOUTS = 8;
export const MAX_STEP_CHECK_QUESTIONS = 3;

export const guidanceCalloutSchema = z.object({
  kind: z.enum(GUIDANCE_CALLOUT_KINDS),
  text: z.string().trim().min(3).max(240),
});
export type GuidanceCallout = z.infer<typeof guidanceCalloutSchema>;

export const todoItemsSchema = z.array(z.string().trim().min(2).max(200)).max(MAX_TODO_ITEMS, `Keep "What to do" to ${MAX_TODO_ITEMS} bullets.`);
export const calloutsSchema = z.array(guidanceCalloutSchema).max(MAX_GUIDANCE_CALLOUTS);

export const guidanceViewSchema = z.object({
  todoItems: z.array(z.string()),
  callouts: z.array(guidanceCalloutSchema),
  fullTextMd: z.string(),
});
export type GuidanceView = z.infer<typeof guidanceViewSchema>;

export function countWords(lines: readonly string[]): number {
  return lines.reduce((total, line) => total + line.split(/\s+/).filter(Boolean).length, 0);
}

export function isStepCheckPassed(
  questions: readonly { id: string; options: readonly { id: string; isCorrect: boolean }[] }[],
  answers: Readonly<Record<string, string>> | undefined,
): boolean {
  return questions.every((question) => {
    const chosen = answers?.[question.id];
    return Boolean(chosen) && question.options.some((option) => option.id === chosen && option.isCorrect);
  });
}
