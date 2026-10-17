/**
 * File: apps/web/e2e/support/training.ts
 * Purpose: Shared steps for the training journeys: the seeded answer key for a chapter (read from the manual content
 * the e2e database is seeded with), answering a quiz all right or all wrong through the real quiz screen, and pressing
 * a lesson's finish button.
 *
 * Functions:
 * - answerKey(code): maps each question prompt in a seeded chapter to its correct option label.
 * - answerQuiz(page, key, mode): answers every question on the open quiz ("right" or "wrong") and finishes it.
 * - finishLesson(page): presses the lesson's "Got it", "Next lesson" or "Take the quiz" button and waits for the page to change.
 */
import { expect, type Page } from "@playwright/test";
import { TRAINING_SEED_CHAPTERS } from "../../../../packages/db/src/seed/training-content";

export function answerKey(code: string): Map<string, string> {
  const chapter = TRAINING_SEED_CHAPTERS.find((item) => item.code === code);
  if (!chapter) throw new Error(`No seeded chapter ${code}`);
  return new Map(chapter.questions.map((question) => [question.prompt, question.options[question.correct]!]));
}

export async function answerQuiz(page: Page, key: Map<string, string>, mode: "right" | "wrong"): Promise<void> {
  const counter = page.getByText(/^Question \d+ of \d+$/);
  await expect(counter).toBeVisible();
  const total = Number(/of (\d+)/.exec((await counter.textContent()) ?? "")![1]);
  for (let number = 1; number <= total; number += 1) {
    await expect(page.getByText(`Question ${number} of ${total}`)).toBeVisible();
    const prompt = ((await page.locator("form legend").textContent()) ?? "").trim();
    const correct = key.get(prompt);
    if (!correct) throw new Error(`No answer for "${prompt}"`);
    const options = page.locator("form fieldset label");
    const labels = (await options.allTextContents()).map((label) => label.trim());
    const choice = mode === "right" ? labels.indexOf(correct) : labels.findIndex((label) => label !== correct);
    expect(choice, prompt).toBeGreaterThanOrEqual(0);
    await options.nth(choice).click();
    await page.getByRole("button", { name: number === total ? "Finish quiz" : "Next question" }).click();
  }
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

export async function finishLesson(page: Page): Promise<void> {
  const before = page.url();
  await page.getByRole("button", { name: /^(Got it|Next lesson|Back to training|Take the quiz)/ }).click();
  await page.waitForURL((url) => url.href !== before);
}
