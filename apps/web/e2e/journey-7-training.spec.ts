/**
 * File: apps/web/e2e/journey-7-training.spec.ts
 * Purpose: Phase G training journeys. A newly active broker reads Part 0's lessons, watches an embedded video, fails the
 * quiz, re-reads the lessons behind the missed questions, passes, and sees Module 01 unlock; the admin sees their
 * progress. Then an admin creates a chapter with a lesson, an embed video and questions, publishes it, and sees the
 * per-question stats from the broker's attempts.
 *
 * Functions:
 * - none
 */
import { expect, test } from "@playwright/test";
import { createSignedInBroker, OWNER, signIn } from "./support/helpers";
import { answerKey, answerQuiz, finishLesson } from "./support/training";

const EMBED_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const VIDEO_HOSTS = /youtube|youtube-nocookie|ytimg|googlevideo|loom\.com|vimeo/;

test.describe.serial("training", () => {
  test("a broker learns Part 0, fails, re-reads, passes and unlocks Module 01", async ({ page, browser }) => {
    test.setTimeout(240_000);
    const name = "Tessa Grant";
    const broker = await createSignedInBroker(browser, name);
    await broker.context.route(VIDEO_HOSTS, (route) => route.abort());

    await broker.page.goto("/app/training");
    await expect(broker.page.getByText("Training opens soon.")).toBeVisible();

    await signIn(page, OWNER.email, OWNER.password);
    await page.goto(broker.profileUrl);
    await page.getByLabel("Status").selectOption("active");
    await expect(page.getByLabel("Status")).toHaveValue("active");

    await page.goto("/admin/training");
    await page.getByRole("navigation", { name: "Chapters" }).getByRole("link", { name: /Part 0 · Start Here/ }).click();
    await page.getByRole("link", { name: "What the callouts mean" }).click();
    await page.getByLabel("Use a YouTube, Loom or Vimeo link").fill(EMBED_URL);
    await page.getByRole("button", { name: "Use this link" }).click();
    await expect(page.getByRole("region", { name: "Video" }).getByText("YouTube", { exact: true })).toBeVisible();

    await broker.page.goto("/app/training");
    const part0 = broker.page.getByRole("link", { name: /Part 0 · Start Here/ });
    await expect(part0).toContainText("Ready to start");
    await expect(broker.page.getByRole("link", { name: /01 · Week One Setup/ })).toHaveCount(0);
    const chapterHref = (await part0.getAttribute("href"))!;
    await part0.click();

    await expect(broker.page.getByRole("heading", { level: 1, name: "How to use this manual" })).toBeVisible();
    await finishLesson(broker.page);
    await expect(broker.page.getByRole("heading", { level: 1, name: "What the callouts mean" })).toBeVisible();
    await expect(broker.page.locator("iframe[title='Video: What the callouts mean']")).toHaveAttribute("src", /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
    await broker.page.getByRole("button", { name: "Mark as watched" }).click();
    await expect(broker.page.getByRole("status").filter({ hasText: "Lesson finished" })).toBeVisible();
    await finishLesson(broker.page);
    await expect(broker.page.getByRole("heading", { level: 1, name: "The 365 Standard" })).toBeVisible();
    await finishLesson(broker.page);
    await expect(broker.page.getByRole("heading", { level: 1, name: "Your first 90 days" })).toBeVisible();
    await finishLesson(broker.page);
    await expect(broker.page).toHaveURL(/\/app\/training\/quiz\//);

    const key = answerKey("0");
    await answerQuiz(broker.page, key, "wrong");
    await expect(broker.page.getByRole("heading", { level: 1 })).toContainText("Not quite yet, Tessa");
    await expect(broker.page.getByText("Not passed yet · pass mark 80%")).toBeVisible();
    await expect(broker.page.getByRole("heading", { name: /you missed/ })).toBeVisible();
    await expect(broker.page.getByRole("button", { name: /Retake the quiz/ })).toHaveCount(0);

    const rereadLinks = broker.page.getByRole("list").getByRole("link", { name: /^Lesson \d+ · / });
    const rereadHrefs = await rereadLinks.evaluateAll((links) => links.map((link) => link.getAttribute("href")!));
    expect(rereadHrefs.length).toBeGreaterThan(0);

    await broker.page.goto(chapterHref);
    await expect(broker.page).toHaveURL(/\/app\/training\/quiz\//);
    await expect(broker.page.getByRole("button", { name: /Retake the quiz/ })).toHaveCount(0);

    for (const href of rereadHrefs) {
      await broker.page.goto(href);
      await finishLesson(broker.page);
    }
    await broker.page.goto(chapterHref);
    const retake = broker.page.getByRole("button", { name: /Retake the quiz/ });
    if (await retake.isVisible()) await retake.click();
    await expect(broker.page.getByText(/^Question 1 of \d+$/)).toBeVisible();

    await answerQuiz(broker.page, key, "right");
    await expect(broker.page.getByRole("heading", { level: 1 })).toContainText("Nice work, Tessa.");
    await expect(broker.page.getByText("Passed · pass mark 80%")).toBeVisible();
    await expect(broker.page.getByText("Chapter 01 · Week One Setup is now open.")).toBeVisible();
    await broker.page.getByRole("link", { name: "Start chapter 01" }).click();
    await expect(broker.page.getByRole("heading", { level: 1, name: "Your week-one documents" })).toBeVisible();

    await broker.page.goto("/app/training");
    await expect(broker.page.getByRole("link", { name: /Part 0 · Start Here/ })).toContainText("Passed · 100%");
    await expect(broker.page.getByRole("link", { name: /01 · Week One Setup/ })).toBeVisible();
    await expect(broker.page.getByText("1 of 7", { exact: true })).toBeVisible();

    await page.goto("/admin/brokers");
    const row = page.getByRole("row").filter({ hasText: name });
    await expect(row).toContainText("1 of 7 chapters");
    await expect(row).toContainText("100%");
    await broker.context.close();
  });

  test("an admin builds a chapter with an embed video and questions, publishes it, and reads the stats", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, OWNER.email, OWNER.password);
    await page.goto("/admin/training");
    await page.getByRole("button", { name: "+ New chapter" }).click();
    const dialog = page.getByRole("dialog", { name: "New chapter" });
    await dialog.getByLabel("Code").fill("07");
    await dialog.getByLabel("Title").fill("Dock Walk Basics");
    await dialog.getByLabel("One-line summary (optional)").fill("What to check on your first dock walk");
    await dialog.getByRole("button", { name: "Create chapter" }).click();
    await expect(page.getByRole("heading", { name: /07 · Dock Walk Basics/ })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Chapters" }).getByRole("link", { name: /07 · Dock Walk Basics/ })).toContainText("Draft");
    const chapterUrl = page.url();

    await page.getByRole("button", { name: "+ Add lesson" }).click();
    await page.getByLabel("New lesson title").fill("Reading the slip");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByLabel("Lesson title")).toHaveValue("Reading the slip");
    await page.getByLabel("Lesson text").fill("Walk the dock before you show the boat.");
    await page.getByRole("toolbar", { name: "Insert" }).getByRole("button", { name: "HOUSE RULE" }).click();
    await page.getByLabel("Lesson text").press("End");
    await page.getByLabel("Lesson text").pressSequentially("Never board a client's boat without the owner's permission.");
    await expect(page.getByText("Preview · what brokers see")).toBeVisible();
    await expect(page.getByText("Never board a client's boat without the owner's permission.").last()).toBeVisible();
    await page.getByRole("button", { name: "Save lesson" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();

    await page.getByLabel("Use a YouTube, Loom or Vimeo link").fill("https://example.com/video.mp4");
    await page.getByRole("button", { name: "Use this link" }).click();
    await expect(page.getByRole("region", { name: "Video" }).getByRole("alert")).toBeVisible();
    await expect(page.getByRole("region", { name: "Video" }).getByText("No video. Text lessons are fine without one.")).toBeVisible();
    await page.getByLabel("Use a YouTube, Loom or Vimeo link").fill("https://www.loom.com/share/0123456789abcdef0123456789abcdef");
    await page.getByRole("button", { name: "Use this link" }).click();
    await expect(page.getByRole("region", { name: "Video" }).getByText("Loom", { exact: true })).toBeVisible();

    await page.goto(chapterUrl);
    await expect(page.getByRole("region", { name: "Lessons" })).toContainText("Video · Loom");
    for (const [prompt, right, wrong] of [
      ["What do you do before showing the boat?", "Walk the dock", "Skip the dock"],
      ["Whose permission do you need to board?", "The owner's", "Nobody's"],
    ] as const) {
      await page.getByRole("button", { name: "+ Add question" }).click();
      await page.getByPlaceholder("The question brokers answer").fill(prompt);
      await page.getByLabel("Option 1", { exact: true }).fill(right);
      await page.getByLabel("Option 2", { exact: true }).fill(wrong);
      await page.getByLabel("Explanation (shown after the quiz when someone gets it wrong)").fill(`${right}. It's in the lesson.`);
      await page.getByLabel("From lesson").selectOption({ label: "1 · Reading the slip" });
      await page.getByRole("button", { name: "Add question", exact: true }).click();
      await expect(page.getByRole("button", { name: new RegExp(prompt.replace("?", "\\?")) })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Quiz questions · 2" })).toBeVisible();
    await expect(page.getByRole("region", { name: /Quiz questions/ }).getByText("No answers yet")).toHaveCount(2);

    await page.getByRole("button", { name: "Publish to brokers" }).click();
    await expect(page.getByRole("button", { name: "Unpublish" })).toBeVisible();
    await expect(page.getByText("Brokers see this chapter. Edits show up straight away.")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Chapters" }).getByRole("link", { name: /07 · Dock Walk Basics/ })).toContainText("Live");

    await page.getByRole("navigation", { name: "Chapters" }).getByRole("link", { name: /Part 0 · Start Here/ }).click();
    const questions = page.getByRole("region", { name: /Quiz questions/ });
    await expect(questions.getByText(/\d+% correct/).first()).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Chapters" }).getByRole("link", { name: /Part 0 · Start Here/ })).toContainText("%");
  });
});
