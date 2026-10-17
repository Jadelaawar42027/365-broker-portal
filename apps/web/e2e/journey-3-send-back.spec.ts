/**
 * File: apps/web/e2e/journey-3-send-back.spec.ts
 * Purpose: Journey 3 from docs/SPEC.md: an admin sends a step back with a note, the broker sees the red banner with
 * the note, fixes and resends it, and the admin approves the new version.
 *
 * Functions:
 * - none
 */
import { expect, test } from "@playwright/test";
import { createSignedInBroker, OWNER, signIn, uploadStep } from "./support/helpers";

test("a sent-back step is fixed, resent and approved", async ({ page, browser }) => {
  const name = "Priya Nair";
  const broker = await createSignedInBroker(browser, name);
  await uploadStep(broker.page, "w9", "w9-unsigned.pdf");

  await signIn(page, OWNER.email, OWNER.password);
  await page.goto("/admin/reviews");
  await page.getByRole("listitem").filter({ hasText: name }).getByRole("link", { name: /Review/ }).click();
  await page.getByRole("button", { name: `Send back to Priya` }).click();
  await expect(page.getByText("Write a note so Priya knows what to fix.")).toBeVisible();
  await page.getByLabel("Or send it back with a note").fill("Please sign and date the bottom of the form.");
  await page.getByRole("button", { name: "Send back to Priya" }).click();
  await page.waitForURL("**/admin/reviews**");

  await broker.page.goto("/app");
  const banner = broker.page.getByRole("region", { name: "W-9 needs a fix" });
  await expect(banner).toContainText("sent one step back: W-9");
  await expect(banner).toContainText("Please sign and date the bottom of the form.");
  await banner.getByRole("link", { name: "Fix and resend" }).click();
  await expect(broker.page.getByText("Please sign and date the bottom of the form.")).toBeVisible();
  await uploadStep(broker.page, "w9", "w9-signed.pdf");
  await expect(broker.page.getByRole("region", { name: "W-9 needs a fix" })).toHaveCount(0);

  await page.goto("/admin/reviews");
  await page.getByRole("listitem").filter({ hasText: name }).getByRole("link", { name: /Review/ }).click();
  const details = page.getByRole("complementary", { name: "Decision" });
  await expect(details.getByText("2nd")).toBeVisible();
  await expect(details.getByText("w9-signed.pdf")).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/admin/reviews"));

  await page.goto(broker.profileUrl);
  const filesPanel = page.getByRole("region", { name: "Files" });
  await expect(filesPanel.getByText(/w9-unsigned\.pdf/).first()).toBeVisible();
  await expect(filesPanel.getByText(/w9-signed\.pdf/).first()).toBeVisible();
  await expect(filesPanel.getByText(/version 2/)).toBeVisible();
  await broker.page.goto("/app");
  await expect(broker.page.getByRole("link", { name: /Upload your W-9/ })).toContainText("Approved");
  await broker.context.close();
});
