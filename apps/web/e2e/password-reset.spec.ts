/**
 * File: apps/web/e2e/password-reset.spec.ts
 * Purpose: The password reset journey (SPEC D8): a broker asks for a link on the sign-in page, opens it from the email,
 * chooses a new password, and can sign in with it but no longer with the old one; the link works only once.
 *
 * Functions:
 * - none
 */
import { expect, test } from "@playwright/test";
import { BROKER_PASSWORD, createSignedInBroker, latestLink, signIn } from "./support/helpers";

test("a broker resets a forgotten password", async ({ browser, page }) => {
  const broker = await createSignedInBroker(browser, "Rosa Vidal");
  await broker.context.close();

  await page.goto("/login");
  await page.getByRole("button", { name: "Forgot your password?" }).click();
  await page.getByLabel("Email").fill(broker.email);
  await page.getByRole("button", { name: "Email me a reset link" }).click();
  await expect(page.getByText("If that email has an account")).toBeVisible();

  const link = new URL(await latestLink(broker.email, "reset"));
  await page.goto(link.pathname);
  await page.getByLabel("New password").fill("rosa-new-password-1");
  await page.getByLabel("Type it again").fill("rosa-new-password-1");
  await page.getByRole("button", { name: "Save my new password" }).click();
  await expect(page.getByText("Your new password is saved.")).toBeVisible();

  await page.getByLabel("Email").fill(broker.email);
  await page.getByLabel("Password").fill(BROKER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That email and password don't match.")).toBeVisible();

  await signIn(page, broker.email, "rosa-new-password-1");
  await expect(page).toHaveURL(/\/app$/);

  await page.goto(link.pathname);
  await expect(page.getByText("This link has already been used.")).toBeVisible();
});
