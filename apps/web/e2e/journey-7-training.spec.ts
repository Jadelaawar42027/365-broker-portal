/**
 * File: apps/web/e2e/journey-7-training.spec.ts
 * Purpose: Training journeys (phase G, SPEC D28). A newly active broker opens "How you get paid & measured" (the only
 * Volume One chapter), reads lessons in the short layout (What to do, callouts, the full section behind a panel),
 * watches an embedded video, fails the quiz, re-reads the lessons behind the missed questions, passes, and the admin
 * sees their progress. Then an admin creates a chapter with a lesson, an embed video and questions, publishes it, sees
 * the per-question stats from the broker's attempts, and the broker sees the new chapter unlock.
 *
 * Functions:
 * - none
 */
import { expect, test } from "@playwright/test";
import { BROKER_PASSWORD, createSignedInBroker, OWNER, signIn } from "./support/helpers";
import { answerKey, answerQuiz, finishLesson } from "./support/training";

const EMBED_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const VIDEO_HOSTS = /youtube|youtube-nocookie|ytimg|googlevideo|loom\.com|vimeo/;
const CHAPTER = /I · How you get paid & measured/;
const LESSONS = ["Your two commission splits", "Solo, co-broke and payday", "Handling commission income", "Runway and the lumps", "Your numbers and your CRM"];

test.describe.serial("training", () => {
  let brokerEmail = "";

  test("a broker learns How you get paid & measured, fails, re-reads and passes", async ({ page, browser }) => {
    test.setTimeout(240_000);
    const name = "Tessa Grant";
    const broker = await createSignedInBroker(browser, name);
    brokerEmail = broker.email;
    await broker.context.route(VIDEO_HOSTS, (route) => route.abort());

    await broker.page.goto("/app/training");
    await expect(broker.page.getByText("Training opens soon.")).toBeVisible();

    await signIn(page, OWNER.email, OWNER.password);
    await page.goto(broker.profileUrl);
    await page.getByLabel("Status").selectOption("active");
    await expect(page.getByLabel("Status")).toHaveValue("active");

    await page.goto("/admin/training");
    await page.getByRole("navigation", { name: "Chapters" }).getByRole("link", { name: CHAPTER }).click();
    await page.getByRole("link", { name: LESSONS[1] }).click();
    await page.getByLabel("Use a YouTube, Loom or Vimeo link").fill(EMBED_URL);
    await page.getByRole("button", { name: "Use this link" }).click();
    await expect(page.getByRole("region", { name: "Video" }).getByText("YouTube", { exact: true })).toBeVisible();

    await broker.page.goto("/app/training");
    const chapter = broker.page.getByRole("link", { name: CHAPTER });
    await expect(chapter).toContainText("Ready to start");
    for (const removed of ["Part 0 · Start Here", "01 · Week One Setup", "02 · Licensing & Compliance", "06 · Quick Start Checklist"]) {
      await expect(broker.page.getByText(removed)).toHaveCount(0);
    }
    const chapterHref = (await chapter.getAttribute("href"))!;
    await chapter.click();

    await expect(broker.page.getByRole("heading", { level: 1, name: LESSONS[0] })).toBeVisible();
    await expect(broker.page.getByRole("heading", { name: "What to do" })).toBeVisible();
    await expect(broker.page.getByText("HOUSE RULE", { exact: true }).first()).toBeVisible();
    const fullSection = broker.page.getByText("Read the full section");
    await expect(broker.page.getByRole("heading", { name: "Industry-standard tiers" })).toBeHidden();
    await fullSection.click();
    await expect(broker.page.getByRole("heading", { name: "Industry-standard tiers" })).toBeVisible();
    await finishLesson(broker.page);

    await expect(broker.page.getByRole("heading", { level: 1, name: LESSONS[1] })).toBeVisible();
    await expect(broker.page.locator(`iframe[title='Video: ${LESSONS[1]}']`)).toHaveAttribute("src", /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
    await broker.page.getByRole("button", { name: "Mark as watched" }).click();
    await expect(broker.page.getByRole("status").filter({ hasText: "Lesson finished" })).toBeVisible();
    await finishLesson(broker.page);
    for (const title of LESSONS.slice(2)) {
      await expect(broker.page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await finishLesson(broker.page);
    }
    await expect(broker.page).toHaveURL(/\/app\/training\/quiz\//);

    const key = answerKey("I");
    await answerQuiz(broker.page, key, "wrong");
    await expect(broker.page.getByRole("heading", { level: 1 })).toContainText("Not quite yet, Tessa");
    await expect(broker.page.getByText("Not passed yet · pass mark 80%")).toBeVisible();
    await expect(broker.page.getByRole("button", { name: /Retake the quiz/ })).toHaveCount(0);

    const rereadLinks = broker.page.getByRole("list").getByRole("link", { name: /^Lesson \d+ · / });
    const rereadHrefs = await rereadLinks.evaluateAll((links) => links.map((link) => link.getAttribute("href")!));
    expect(rereadHrefs.length).toBeGreaterThan(0);

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
    await expect(broker.page.getByText("That's every chapter open to you so far.")).toBeVisible();

    await broker.page.goto("/app/training");
    await expect(broker.page.getByRole("link", { name: CHAPTER })).toContainText("Passed · 100%");
    await expect(broker.page.getByText("1 of 1", { exact: true })).toBeVisible();

    await page.goto("/admin/brokers");
    const row = page.getByRole("row").filter({ hasText: name });
    await expect(row).toContainText("All 1 chapters");
    await expect(row).toContainText("100%");
    await broker.context.close();
  });

  test("an admin builds and publishes a chapter, reads the stats, and it unlocks for the broker", async ({ page, browser }) => {
    test.setTimeout(180_000);
    await signIn(page, OWNER.email, OWNER.password);
    await page.goto("/admin/training");
    await page.getByRole("button", { name: "+ New chapter" }).click();
    const dialog = page.getByRole("dialog", { name: "New chapter" });
    await dialog.getByLabel("Code").fill("01");
    await dialog.getByLabel("Title").fill("Dock Walk Basics");
    await dialog.getByLabel("One-line summary (optional)").fill("What to check on your first dock walk");
    await dialog.getByRole("button", { name: "Create chapter" }).click();
    await expect(page.getByRole("heading", { name: /01 · Dock Walk Basics/ })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Chapters" }).getByRole("link", { name: /01 · Dock Walk Basics/ })).toContainText("Draft");
    const chapterUrl = page.url();

    await page.getByRole("button", { name: "+ Add lesson" }).click();
    await page.getByLabel("New lesson title").fill("Reading the slip");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByLabel("Lesson title")).toHaveValue("Reading the slip");
    await page.getByLabel("What to do · one bullet per line").fill("Walk the dock before you show the boat.\nCheck the slip number.\nNote the dockmaster's name.");
    await expect(page.getByText("3 bullets · 16 words.")).toBeVisible();
    await page.getByRole("button", { name: "+ Add a callout" }).click();
    await page.getByLabel("Callout 1 type").selectOption("NEVER");
    await page.getByLabel("Callout 1 text").fill("Board a client's boat without the owner's permission.");
    await page.getByLabel("Lesson text").fill("Walk the dock before you show the boat.");
    await page.getByRole("button", { name: "Save lesson" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();

    await page.getByLabel("Use a YouTube, Loom or Vimeo link").fill("https://example.com/video.mp4");
    await page.getByRole("button", { name: "Use this link" }).click();
    await expect(page.getByRole("region", { name: "Video" }).getByRole("alert")).toBeVisible();
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

    await page.getByRole("button", { name: "Publish to brokers" }).click();
    await expect(page.getByRole("button", { name: "Unpublish" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Chapters" }).getByRole("link", { name: /01 · Dock Walk Basics/ })).toContainText("Live");

    await page.getByRole("navigation", { name: "Chapters" }).getByRole("link", { name: CHAPTER }).click();
    const questions = page.getByRole("region", { name: /Quiz questions/ });
    await expect(questions.getByText(/\d+% correct/).first()).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Chapters" }).getByRole("link", { name: CHAPTER })).toContainText("%");

    const brokerContext = await browser.newContext();
    const brokerPage = await brokerContext.newPage();
    await signIn(brokerPage, brokerEmail, BROKER_PASSWORD);
    await brokerPage.goto("/app/training");
    await expect(brokerPage.getByRole("link", { name: /01 · Dock Walk Basics/ })).toContainText("Ready to start");
    await brokerContext.close();
  });
});
