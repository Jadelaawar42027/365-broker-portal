/**
 * File: apps/web/e2e/journey-4-persona.spec.ts
 * Purpose: Journey 4 from docs/SPEC.md: an admin edits a broker's persona and then finds that broker by searching
 * the brokers table for a word from it.
 *
 * Functions:
 * - none
 */
import { expect, test } from "@playwright/test";
import { OWNER, signIn } from "./support/helpers";

test("an admin edits a persona and finds the broker by a word in it", async ({ page }) => {
  const word = `kayakveteran${Date.now()}`;
  await signIn(page, OWNER.email, OWNER.password);
  await page.goto("/admin/brokers");
  await page.getByRole("link", { name: /Daniel Reyes/ }).click();
  await page.getByLabel("Persona for Daniel Reyes").fill(`# Persona: Daniel Reyes\n\n## Background\nFormer ${word}, grew up in Key West.\n`);
  await page.getByRole("tab", { name: "preview" }).click();
  await expect(page.getByText(`Former ${word}, grew up in Key West.`)).toBeVisible();
  await page.getByRole("button", { name: "Save persona" }).click();
  await expect(page.getByText("Persona saved.")).toBeVisible();
  await expect(page.getByText(/Last edited by Shelly Melcher/)).toBeVisible();

  await page.goto("/admin/brokers");
  await page.getByLabel("Search by name, email or persona").fill(word);
  await expect(page).toHaveURL(new RegExp(`search=${word}`));
  const rows = page.getByRole("row").filter({ has: page.getByRole("link") });
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Daniel Reyes");
});
