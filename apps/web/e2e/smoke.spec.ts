/**
 * File: apps/web/e2e/smoke.spec.ts
 * Purpose: Smoke test: the web app sends signed-out visitors to the sign-in page, and the API started by `pnpm dev`
 * answers /health. The full user journeys arrive in phase F.
 *
 * Functions:
 * - none
 */
import { expect, test } from "@playwright/test";

test("signed-out visitors land on the sign-in page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("API started by pnpm dev answers /health", async ({ request }) => {
  const response = await request.get(process.env.E2E_API_URL ?? "http://localhost:4000/health");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ status: "ok" });
});
