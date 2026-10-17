/**
 * File: apps/web/e2e/smoke.spec.ts
 * Purpose: Phase A smoke test: the web app serves the home page and the API started by `pnpm dev` answers /health.
 *
 * Functions:
 * - none
 */
import { expect, test } from "@playwright/test";

test("home page renders the portal name", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "365 Yachts Broker Portal" })).toBeVisible();
});

test("API started by pnpm dev answers /health", async ({ request }) => {
  const response = await request.get(process.env.E2E_API_URL ?? "http://localhost:4000/health");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ status: "ok" });
});
