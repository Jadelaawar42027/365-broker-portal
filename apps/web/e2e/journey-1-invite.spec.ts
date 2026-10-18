/**
 * File: apps/web/e2e/journey-1-invite.spec.ts
 * Purpose: Journey 1 from docs/SPEC.md: an admin invites a broker, the broker opens the invite link and creates their
 * account, lands on their checklist, the link stops working, and the admin sees them move from invited to onboarding.
 * Also (SPEC D29): an admin invites a broker without an email, copies the invite link, the broker gives their own email
 * when accepting, and the admin changes the commission split and sees it in the history.
 *
 * Functions:
 * - none
 */
import { expect, test } from "@playwright/test";
import { acceptInvite, BROKER_PASSWORD, fillInviteForm, inviteBroker, latestLink, OWNER, signIn, uniqueEmail } from "./support/helpers";

test("admin invites a broker who creates their account", async ({ page, browser }) => {
  const email = uniqueEmail("nina");
  await signIn(page, OWNER.email, OWNER.password);
  const profileUrl = await inviteBroker(page, "Nina Castillo", email);
  await expect(page.getByLabel("Status")).toHaveValue("invited");
  const commission = page.getByRole("region", { name: "Commission · broker / house" });
  await expect(commission).toContainText("In-house leads40 / 60");
  await expect(commission).toContainText("Self-generated deals60 / 40");

  const brokerContext = await browser.newContext();
  const broker = await brokerContext.newPage();
  await acceptInvite(broker, email);
  await expect(broker.getByRole("heading", { level: 1 })).toContainText("Nina");
  await expect(broker.getByText("YOUR NEXT STEP · STEP 0")).toBeVisible();
  await expect(broker.getByText("You've sent in 0 of 11 steps")).toBeVisible();

  const link = new URL(await latestLink(email, "invite"));
  await broker.goto(link.pathname);
  await expect(broker.getByText("This link has already been used.")).toBeVisible();
  await brokerContext.close();

  await page.goto(profileUrl);
  await expect(page.getByLabel("Status")).toHaveValue("onboarding");
});

test("admin invites a broker without an email, sends the link by hand, and changes their commission", async ({ page, browser }) => {
  const email = uniqueEmail("omar");
  await signIn(page, OWNER.email, OWNER.password);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Invite a new broker" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite a new broker" });
  await fillInviteForm(dialog, "Omar Haddad", null);
  await dialog.getByRole("button", { name: "Send invite" }).click();
  const invited = page.getByRole("dialog", { name: "Omar Haddad is invited" });
  await expect(invited.getByText("Send them this link by WhatsApp or copy it.")).toBeVisible();
  await expect(invited.getByRole("link", { name: /Send via WhatsApp/ })).toHaveAttribute("href", /^https:\/\/wa\.me\/15615550199\?text=/);
  const link = new URL(await invited.getByLabel("Invite link").inputValue());
  await invited.getByRole("link", { name: "Open their profile" }).click();
  await expect(page.getByText("No email yet")).toBeVisible();
  const profileUrl = page.url();

  const brokerContext = await browser.newContext();
  const broker = await brokerContext.newPage();
  await broker.goto(link.pathname);
  await expect(broker.getByRole("heading", { level: 1 })).toContainText("Welcome aboard");
  await broker.getByLabel("Your email (you'll sign in with it)").fill(email);
  await broker.getByLabel("Choose a password").fill(BROKER_PASSWORD);
  await expect(broker.getByLabel("Mobile number")).toHaveValue("(561) 555-0199");
  await broker.getByRole("button", { name: "Start my onboarding" }).click();
  await broker.waitForURL("**/app");
  await brokerContext.close();

  await page.goto(profileUrl);
  await expect(page.getByText(email.toLowerCase())).toBeVisible();
  const commission = page.getByRole("region", { name: "Commission · broker / house" });
  await commission.getByRole("button", { name: "Change commission" }).click();
  await commission.getByLabel("Self-generated deals", { exact: true }).selectOption("custom");
  await commission.getByLabel("Self-generated deals: custom broker percentage").fill("65");
  await expect(commission.getByText("Broker 65% · house keeps 35%")).toBeVisible();
  await commission.getByLabel("Note (optional)").fill("Top performer");
  await commission.getByRole("button", { name: "Save" }).click();
  await expect(commission).toContainText("Self-generated deals65 / 35");
  await commission.getByText(/Commission history · 2 changes/).click();
  await expect(commission.getByRole("row").filter({ hasText: "Top performer" })).toContainText("65%");
  await expect(commission.getByRole("row").filter({ hasText: "Set at invite" })).toContainText("60%");

  await page.goto("/admin/brokers");
  const row = page.getByRole("row").filter({ hasText: "Omar Haddad" });
  await expect(row).toContainText("40%");
  await expect(row).toContainText("65%");
});
