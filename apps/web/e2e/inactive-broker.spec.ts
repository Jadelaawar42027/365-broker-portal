/**
 * File: apps/web/e2e/inactive-broker.spec.ts
 * Purpose: The inactive-broker rule (SPEC D9): when an admin sets a broker to inactive, the broker's open session stops
 * working at once and they can't sign in again.
 *
 * Functions:
 * - none
 */
import { expect, test } from "@playwright/test";
import { BROKER_PASSWORD, createSignedInBroker, OWNER, signIn } from "./support/helpers";

test("an inactive broker is signed out and blocked", async ({ browser, page }) => {
  const broker = await createSignedInBroker(browser, "Victor Lane");
  await expect(broker.page).toHaveURL(/\/app$/);

  await signIn(page, OWNER.email, OWNER.password);
  await page.goto(broker.profileUrl);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Status").selectOption("inactive");
  await expect(page.getByLabel("Status")).toHaveValue("inactive");

  await broker.page.goto("/app");
  await expect(broker.page).toHaveURL(/\/login$/);
  await broker.page.getByLabel("Email").fill(broker.email);
  await broker.page.getByLabel("Password").fill(BROKER_PASSWORD);
  await broker.page.getByRole("button", { name: "Sign in" }).click();
  await expect(broker.page.getByText("no longer active")).toBeVisible();
  await broker.context.close();
});
