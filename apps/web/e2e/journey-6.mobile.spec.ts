/**
 * File: apps/web/e2e/journey-6.mobile.spec.ts
 * Purpose: Journey 6 from docs/SPEC.md: the broker half of journey 2 at phone width (390px) — accept the invite and do
 * every step on a phone, with no sideways scrolling on any screen.
 *
 * Functions:
 * - none
 */
import { expect, test } from "@playwright/test";
import { completeBrokerSteps, createSignedInBroker } from "./support/helpers";

test("a broker completes their steps on a phone", async ({ browser }) => {
  test.setTimeout(240_000);
  const broker = await createSignedInBroker(browser, "Lena Park", { viewport: { width: 390, height: 844 } });
  const page = broker.page;
  await completeBrokerSteps(page);
  await expect(page.getByText("You've sent in 10 of 11 steps")).toBeVisible();
  for (const path of ["/app", "/app/steps/w9", "/app/help", "/app/training"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  }
  await broker.context.close();
});
