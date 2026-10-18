/**
 * File: apps/web/e2e/journey-8-step-guidance.spec.ts
 * Purpose: The short onboarding-step layout (SPEC D28) end to end. An admin edits a step's What to do bullets and puts
 * a YouTube link in one of step 10's video slots; the broker sees the videos first (with "on its way" placeholders for
 * the empty slots), the bullets, the callouts and the manual's text behind "Read the full section"; and on step 8 the
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
  await expect(page).toHaveURL(/\/admin\/steps\/photo_id$/);
  const steps = page.getByRole("navigation", { name: "Onboarding steps" });
  await steps.getByRole("link", { name: /BoatWizard, YachtCloser, GoHighLevel/ }).click();
  await expect(page.getByRole("heading", { name: "Log in to BoatWizard, YachtCloser and GoHighLevel" })).toBeVisible();
  await expect(page.getByText("Empty. Brokers see it as “On its way”.")).toHaveCount(3);
  await page.getByLabel("YouTube, Loom or Vimeo link for BoatWizard walkthrough").fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await page.getByRole("listitem").filter({ hasText: "BoatWizard walkthrough" }).getByRole("button", { name: "Use this link" }).click();
  await expect(page.getByText("Empty. Brokers see it as “On its way”.")).toHaveCount(2);

  await steps.getByRole("link", { name: /365 email/ }).click();
  await expect(page.getByRole("heading", { name: "Activate your 365 email and install the brand signature" })).toBeVisible();
  const todo = page.getByLabel("What to do · one bullet per line");
  await todo.fill(`${await todo.inputValue()}\nAsk Shelly if the signature looks wrong.`);
  await page.getByRole("button", { name: "Save guidance" }).click();
  await expect(page.getByText("Saved. Brokers see the change now.")).toBeVisible();

  const broker = await createSignedInBroker(browser, "Marco Silva");
  await broker.context.route(VIDEO_HOSTS, (route) => route.abort());
  const brokerPage = broker.page;

  await brokerPage.goto("/app/steps/platform_logins");
  const videos = brokerPage.getByRole("region", { name: "Videos for this step" });
  await expect(videos.locator("iframe[title='Video: BoatWizard walkthrough']")).toHaveAttribute("src", /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  await expect(videos.getByText("On its way", { exact: true })).toHaveCount(2);
  await expect(videos.getByText("GoHighLevel CRM walkthrough")).toBeVisible();
  await expect(brokerPage.getByRole("heading", { name: "What to do" })).toBeVisible();
  await expect(brokerPage.getByText("Aim for 100 contacts in the CRM by day seven.")).toBeVisible();
  await expect(brokerPage.getByText("Load your first 100 contacts")).toBeHidden();
  await brokerPage.getByText("Read the full section").click();
  await expect(brokerPage.getByText("Load your first 100 contacts")).toBeVisible();

  await brokerPage.goto("/app/steps/email_signature");
  await expect(brokerPage.getByText("Ask Shelly if the signature looks wrong.")).toBeVisible();
  await expect(brokerPage.getByText("HOUSE RULE", { exact: true }).first()).toBeVisible();

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
  await expect(brokerPage.getByText("You've sent in 1 of 10 steps")).toBeVisible();
  await broker.context.close();
});
