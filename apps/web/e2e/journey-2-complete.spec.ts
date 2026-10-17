/**
 * File: apps/web/e2e/journey-2-complete.spec.ts
 * Purpose: Journey 2 from docs/SPEC.md: a broker completes every step (uploads, bio, choice, confirmation, checklist),
 * an admin approves each submission and the last approval makes them active, the broker sees the onboarding-complete
 * screen with their two commission splits, and the admin sees them as Active.
 *
 * Functions:
 * - none
 */
import { expect, test } from "@playwright/test";
import { completeBrokerSteps, createSignedInBroker, OWNER, signIn } from "./support/helpers";

test("a broker completes onboarding and becomes active", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const name = "Omar Haddad";
  const broker = await createSignedInBroker(browser, name);
  await completeBrokerSteps(broker.page);
  await expect(broker.page.getByText("You've sent in 10 of 10 steps and 3 are approved")).toBeVisible();

  await signIn(page, OWNER.email, OWNER.password);
  for (let round = 0; round < 7; round += 1) {
    await page.goto("/admin/reviews");
    await page.getByRole("listitem").filter({ hasText: name }).first().getByRole("link", { name: /Review/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
    const reviewUrl = page.url();
    await page.getByRole("button", { name: "Approve" }).click();
    await page.waitForURL((url) => url.href !== reviewUrl);
  }
  await page.goto("/admin/reviews");
  await expect(page.getByRole("listitem").filter({ hasText: name })).toHaveCount(0);

  await page.goto(broker.profileUrl);
  await expect(page.getByText("10 / 10 complete")).toBeVisible();
  await expect(page.getByLabel("Status")).toHaveValue("active");
  await expect(page.getByRole("button", { name: /Commission tier/ })).toHaveCount(0);

  await broker.page.goto("/app");
  await expect(broker.page).toHaveURL(/\/app\/welcome-aboard$/);
  await expect(broker.page.getByRole("heading", { name: "You're officially a 365 broker." })).toBeVisible();
  await expect(broker.page.getByText("In-house leads: 40%")).toBeVisible();
  await expect(broker.page.getByText("Self-generated deals: 60%")).toBeVisible();
  await broker.page.goto("/app");
  await expect(broker.page).toHaveURL(/\/app$/);
  await expect(broker.page.getByRole("heading", { name: "All steps approved" })).toBeVisible();

  await page.goto("/admin/brokers?status=active");
  await expect(page.getByRole("row").filter({ hasText: name })).toContainText("Active");
  await broker.context.close();
});
