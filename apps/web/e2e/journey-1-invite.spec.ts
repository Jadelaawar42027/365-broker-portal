/**
 * File: apps/web/e2e/journey-1-invite.spec.ts
 * Purpose: Journey 1 from docs/SPEC.md: an admin invites a broker, the broker opens the invite link and creates their
 * account, lands on their checklist, the link stops working, and the admin sees them move from invited to onboarding.
 *
 * Functions:
 * - none
 */
import { expect, test } from "@playwright/test";
import { acceptInvite, inviteBroker, latestLink, OWNER, signIn, uniqueEmail } from "./support/helpers";

test("admin invites a broker who creates their account", async ({ page, browser }) => {
  const email = uniqueEmail("nina");
  await signIn(page, OWNER.email, OWNER.password);
  const profileUrl = await inviteBroker(page, "Nina Castillo", email);
  await expect(page.getByLabel("Status")).toHaveValue("invited");

  const brokerContext = await browser.newContext();
  const broker = await brokerContext.newPage();
  await acceptInvite(broker, email);
  await expect(broker.getByRole("heading", { level: 1 })).toContainText("Nina");
  await expect(broker.getByText("YOUR NEXT STEP · STEP 1")).toBeVisible();
  await expect(broker.getByText("You've sent in 0 of 11 steps")).toBeVisible();

  const link = new URL(await latestLink(email, "invite"));
  await broker.goto(link.pathname);
  await expect(broker.getByText("This link has already been used.")).toBeVisible();
  await brokerContext.close();

  await page.goto(profileUrl);
  await expect(page.getByLabel("Status")).toHaveValue("onboarding");
});
