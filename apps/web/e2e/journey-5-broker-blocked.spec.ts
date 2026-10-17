/**
 * File: apps/web/e2e/journey-5-broker-blocked.spec.ts
 * Purpose: Journey 5 from docs/SPEC.md: a broker who opens any /admin page is sent back to their own checklist, and the
 * API refuses them too.
 *
 * Functions:
 * - none
 */
import { expect, test } from "@playwright/test";
import { SAMPLE_PASSWORD, signIn } from "./support/helpers";

test("a broker cannot open the admin screens", async ({ page }) => {
  await signIn(page, "kevin.osei@example.com", SAMPLE_PASSWORD);
  for (const path of ["/admin", "/admin/brokers", "/admin/reviews"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/app(\/welcome-aboard)?$/);
  }
  const api = await page.request.get("/v1/admin/brokers");
  expect(api.status()).toBe(403);
});
