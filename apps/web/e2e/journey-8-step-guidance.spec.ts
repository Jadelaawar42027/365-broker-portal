/**
 * File: apps/web/e2e/journey-8-step-guidance.spec.ts
 * Purpose: The short onboarding-step layout (SPEC D28) end to end. An admin edits a step's What to do bullets and its
 * sub-header, and puts a YouTube link in step 12's (BoatWizard) video slot; the broker sees the video first, the new
 * sub-header, the bullets, the callouts and the manual's text behind "Read the full section"; step 11 (CRM training)
 * keeps its confirm box locked until its video is marked watched and shows the transcript behind "Read along with the
 * video" (SPEC D32); step 1 offers "Start chat with AI agent" to the 365 Yachts AI on WhatsApp; and on step 9 the
 * send button stays disabled until the deposit question is answered correctly, after a wrong try with its explanation.
 *
 * Functions:
 * - none
 */
import { expect, test } from "@playwright/test";
import { createSignedInBroker, DEPOSIT_ANSWER, OWNER, signIn, testFile } from "./support/helpers";

const VIDEO_HOSTS = /youtube|youtube-nocookie|ytimg|googlevideo|loom\.com|vimeo/;

test("admins edit step guidance and videos; brokers read it and pass the knowledge check", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await signIn(page, OWNER.email, OWNER.password);
  await page.goto("/admin/steps");
  await expect(page).toHaveURL(/\/admin\/steps\/start_here$/);
  const steps = page.getByRole("navigation", { name: "Onboarding steps" });
  await steps.getByRole("link", { name: /BoatWizard sign in/ }).click();
  await expect(page.getByRole("heading", { name: "Sign in to BoatWizard" })).toBeVisible();
  await expect(page.getByText("Empty. Brokers see it as “On its way”.")).toHaveCount(1);
  await page.getByLabel("YouTube, Loom or Vimeo link for BoatWizard walkthrough").fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await page.getByRole("listitem").filter({ hasText: "BoatWizard walkthrough" }).getByRole("button", { name: "Use this link" }).click();
  await expect(page.getByText("Empty. Brokers see it as “On its way”.")).toHaveCount(0);

  await steps.getByRole("link", { name: /365 email/ }).click();
  await expect(page.getByRole("heading", { name: "Log in to your 365 Yachts email" })).toBeVisible();
  const todo = page.getByLabel("What to do · one bullet per line");
  await todo.fill(`${await todo.inputValue()}\nAsk Shelly if you can't sign in.`);
  await page.getByRole("button", { name: "Save guidance" }).click();
  await expect(page.getByText("Saved. Brokers see the change now.")).toBeVisible();
  await page.getByRole("button", { name: "Edit titles" }).click();
  await page.getByLabel("Sub-header").fill("Your 365 email is where every client record lives.");
  await page.getByRole("button", { name: "Save titles" }).click();
  await expect(page.getByRole("button", { name: "Edit titles" })).toBeVisible();
  await expect(page.getByText("Your 365 email is where every client record lives.")).toBeVisible();

  const broker = await createSignedInBroker(browser, "Marco Silva");
  await broker.context.route(VIDEO_HOSTS, (route) => route.abort());
  const brokerPage = broker.page;

  await brokerPage.goto("/app/steps/boatwizard_login");
  const videos = brokerPage.getByRole("region", { name: "Videos for this step" });
  await expect(videos.locator("iframe[title='Video: BoatWizard walkthrough']")).toHaveAttribute("src", /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  await expect(videos.getByText("On its way", { exact: true })).toHaveCount(0);
  await expect(brokerPage.getByRole("heading", { name: "What to do" })).toBeVisible();
  await expect(brokerPage.getByText("Run one practice search for a boat a client might want.")).toBeVisible();
  await expect(brokerPage.getByText(/Target 100 names in the CRM by day seven/)).toBeHidden();
  await brokerPage.getByText("Read the full section").click();
  await expect(brokerPage.getByText(/Target 100 names in the CRM by day seven/)).toBeVisible();

  await brokerPage.goto("/app/steps/crm_login");
  await expect(brokerPage.getByText("Step 11 of 14 · Your tools")).toBeVisible();
  const crmConfirm = brokerPage.getByLabel(/watched the CRM training/);
  await expect(brokerPage.getByText("Watch the whole video above first. This box unlocks once you've watched it.")).toBeVisible();
  await expect(crmConfirm).toBeDisabled();
  await expect(brokerPage.getByRole("button", { name: "Mark this step done" })).toBeDisabled();
  await brokerPage.getByText("Read along with the video").click();
  await expect(brokerPage.getByRole("heading", { name: "Broker outcomes: how we track your leads" })).toBeVisible();
  await brokerPage.getByRole("button", { name: "I've watched this video" }).click();
  await expect(crmConfirm).toBeEnabled();
  await expect(brokerPage.getByText("Watched", { exact: true })).toBeVisible();

  await brokerPage.goto("/app/steps/email_signature");
  await expect(brokerPage.getByText("Ask Shelly if you can't sign in.")).toBeVisible();
  await expect(brokerPage.getByText("Your 365 email is where every client record lives.")).toBeVisible();
  await expect(brokerPage.getByText("HOUSE RULE", { exact: true }).first()).toBeVisible();

  await brokerPage.goto("/app/steps/ai_agent");
  await expect(brokerPage.getByText("Step 1 of 12 · Start here")).toBeVisible();
  const chat = brokerPage.getByRole("link", { name: /Start chat with AI agent/ });
  await expect(chat).toHaveAttribute("href", /^https:\/\/wa\.me\/19547381542\?text=Hey%20365%20Yachts%20AI%2C%20it's%20Marco%20Silva\./);

  await brokerPage.goto("/app/steps/license_bond");
  await expect(brokerPage.getByText("NEVER", { exact: true }).first()).toBeVisible();
  await expect(brokerPage.getByText("Never hold client funds personally. Every deposit goes to the brokerage escrow account by wire.")).toBeVisible();
  await brokerPage.getByLabel("Choose files to upload").setInputFiles(testFile("license-and-bond.pdf"));
  await expect(brokerPage.getByText(/Uploaded ·/)).toBeVisible();
  const send = brokerPage.getByRole("button", { name: /Send to Shelly for approval/ });
  await expect(send).toBeDisabled();

  const check = brokerPage.getByRole("region", { name: "Quick check" });
  await expect(check.getByText("Where must a client's deposit go?")).toBeVisible();
  await check.getByRole("radio", { name: "Your personal account until closing" }).check();
  await check.getByRole("button", { name: "Check my answer" }).click();
  await expect(check.getByText("Not quite. Try again.")).toBeVisible();
  await expect(check.getByText(/licensing violation that ends careers/)).toBeVisible();
  await expect(send).toBeDisabled();

  await check.getByRole("radio", { name: DEPOSIT_ANSWER }).check();
  await check.getByRole("button", { name: "Check my answer" }).click();
  await expect(check.getByText("That's right.")).toBeVisible();
  await expect(check.getByText("1 of 1 right · answer to unlock sending")).toBeVisible();
  await expect(send).toBeEnabled();
  await send.click();
  await brokerPage.waitForURL("**/app");
  await expect(brokerPage.getByText("You've sent in 1 of 14 steps")).toBeVisible();
  await broker.context.close();
});
