/**
 * File: apps/web/e2e/journey-9-existing-broker.spec.ts
 * Purpose: Adding brokers who already work with 365 Yachts: the owner adds an already-onboarded broker from the Brokers
 * page, gets their sign-in link (no email is sent), finds the same link on their profile with every onboarding step
 * approved, and the broker creates their account from it. Then the owner removes a broker straight from the Brokers
 * list after typing their name.
 *
 * Functions:
 * - addExistingBroker(page, name, corporateEmail): fills and sends the "Add an existing broker" dialog; returns the dialog shown afterwards.
 */
import { expect, test, type Page } from "@playwright/test";
import { BROKER_PASSWORD, OWNER, signIn, uniqueEmail } from "./support/helpers";

async function addExistingBroker(page: Page, name: string, corporateEmail: string) {
  await page.goto("/admin/brokers");
  await page.getByRole("button", { name: "Add an existing broker" }).click();
  const dialog = page.getByRole("dialog", { name: "Add an existing broker" });
  await dialog.getByLabel("Full name").fill(name);
  await dialog.getByLabel("Personal phone").fill("+1 561 555 0188");
  await dialog.getByLabel("365 Yachts email (optional)").fill(corporateEmail);
  await dialog.getByLabel("Senior").check();
  await expect(dialog.getByLabel(/Onboarding done/)).toBeChecked();
  await dialog.getByRole("button", { name: "Add broker" }).click();
  return page.getByRole("dialog", { name: `${name} is added` });
}

test("owner adds an already-onboarded broker, who signs in with the link from their profile", async ({ page, browser }) => {
  const email = uniqueEmail("charlie");
  await signIn(page, OWNER.email, OWNER.password);
  const added = await addExistingBroker(page, "Charlie Seitz", email);
  await expect(added.getByRole("link", { name: /Send via WhatsApp/ })).toHaveAttribute("href", /^https:\/\/wa\.me\/15615550188\?text=/);
  const linkUrl = await added.getByLabel("Invite link").inputValue();
  await added.getByRole("link", { name: "Open their profile" }).click();

  await expect(page.getByLabel("Status")).toHaveValue("active");
  await expect(page.getByLabel("Level")).toHaveValue("senior");
  await expect(page.getByText("hasn't created their account yet")).toBeVisible();
  await expect(page.getByLabel("Invite link")).toHaveValue(linkUrl);
  await page.reload();
  await expect(page.getByLabel("Invite link")).toHaveValue(linkUrl);
  await expect(page.getByText("14 / 14 complete")).toBeVisible();

  const brokerContext = await browser.newContext();
  const broker = await brokerContext.newPage();
  await broker.goto(new URL(linkUrl).pathname);
  await expect(broker.getByRole("heading", { level: 1 })).toContainText("Welcome aboard");
  await broker.getByLabel("Choose a password").fill(BROKER_PASSWORD);
  await broker.getByRole("button", { name: "Start my onboarding" }).click();
  await broker.waitForURL("**/app**");
  await brokerContext.close();

  await page.reload();
  await expect(page.getByLabel("Invite link")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send password reset link" })).toBeVisible();
});

test("owner removes a broker from the Brokers list", async ({ page }) => {
  await signIn(page, OWNER.email, OWNER.password);
  const added = await addExistingBroker(page, "Gone Broker", uniqueEmail("gone"));
  await expect(added.getByLabel("Invite link")).toBeVisible();
  await added.getByRole("button", { name: "Close" }).last().click();

  await page.goto("/admin/brokers");
  await page.getByRole("button", { name: "Remove Gone Broker" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete Gone Broker for good?" });
  await expect(confirm.getByRole("button", { name: "Delete permanently" })).toBeDisabled();
  await confirm.getByLabel("Type Gone Broker to confirm").fill("gone broker");
  await confirm.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByText("Gone Broker was deleted, with everything stored about them.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Gone Broker" })).toHaveCount(0);
});
