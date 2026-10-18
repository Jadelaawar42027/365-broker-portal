/**
 * File: packages/db/src/seed/step-content.ts
 * Purpose: Seeds the short guidance for each onboarding step (SPEC D28) from step-guidance.ts: What to do bullets,
 * callouts, the manual's full text, empty video slots and the knowledge-check questions. A step is filled only while
 * it has no What to do bullets yet, so admin edits are never overwritten and running it again changes nothing.
 *
 * Functions:
 * - seedStepGuidance(tx): fills every step that has no guidance yet; returns how many steps were filled.
 * - insertCheckQuestions(tx, stepId, questions): adds a step's knowledge-check questions with their options.
 */
import { and, eq, isNull } from "drizzle-orm";
import type { Transaction } from "../client";
import { onboardingSteps, stepQuestionOptions, stepQuestions, stepVideos } from "../schema";
import { STEP_GUIDANCE, type StepGuidanceSeed } from "./step-guidance";

async function insertCheckQuestions(tx: Transaction, stepId: string, questions: NonNullable<StepGuidanceSeed["checkQuestions"]>): Promise<void> {
  for (const [index, question] of questions.entries()) {
    const [row] = await tx
      .insert(stepQuestions)
      .values({ stepId, position: index + 1, prompt: question.prompt, explanation: question.explanation })
      .returning({ id: stepQuestions.id });
    await tx.insert(stepQuestionOptions).values(
      question.options.map((label, optionIndex) => ({ questionId: row!.id, position: optionIndex, label, isCorrect: optionIndex === question.correct })),
    );
  }
}

export async function seedStepGuidance(tx: Transaction): Promise<number> {
  let filled = 0;
  for (const [key, guidance] of Object.entries(STEP_GUIDANCE)) {
    const [step] = await tx
      .update(onboardingSteps)
      .set({ todoItems: guidance.todoItems, callouts: guidance.callouts, fullTextMd: guidance.fullTextMd })
      .where(and(eq(onboardingSteps.key, key), isNull(onboardingSteps.todoItems)))
      .returning({ id: onboardingSteps.id });
    if (!step) continue;
    filled += 1;
    const slots = guidance.videoSlots ?? [];
    if (slots.length > 0) {
      await tx.insert(stepVideos).values(slots.map((title, index) => ({ stepId: step.id, position: index + 1, title })));
    }
    if (guidance.checkQuestions?.length) await insertCheckQuestions(tx, step.id, guidance.checkQuestions);
  }
  return filled;
}
