/**
 * File: apps/web/e2e/support/helpers.ts
 * Purpose: Shared steps for the end-to-end journeys: seeded accounts, signing in, reading invite and reset links from
 * the email outbox, inviting and onboarding a fresh broker through the real screens, test files to upload, and
 * completing the broker's own steps.
 *
 * Functions:
 * - uniqueEmail(prefix): a fresh address for one test run.
 * - signIn(page, email, password): signs in on /login and waits to leave the page.
 * - latestLink(to, kind): waits for the newest email to that address and returns its invite or reset link.
 * - inviteBroker(page, name, email): as a signed-in admin, invites a broker with the dialog and returns their profile URL.
 * - acceptInvite(page, email, password): opens the invite link from the outbox and creates the account.
 * - createSignedInBroker(browser, name): uses a separate admin session to invite a broker, then accepts the invite in a new context; returns that broker's page and email.
 * - testFile(name): a small PDF or PNG payload for setInputFiles.
 * - uploadStep(page, stepKey, fileName): opens a step, uploads one file and sends it.
 * - answerStep(page, stepKey, fill): opens a step, runs fill() on the page and clicks the send button.
 * - completeBrokerSteps(page): does every step a broker can do themselves (all but step 11).
 */
import { expect, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const OWNER = { email: "owner@e2e.test", password: "e2e-owner-password" };
export const SAMPLE_PASSWORD = "sample-broker-pass";
export const BROKER_PASSWORD = "e2e-broker-password";
const OUTBOX = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "test-results", "e2e-outbox");

export function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1000)}@e2e.test`;
}

export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

export async function latestLink(to: string, kind: "invite" | "reset"): Promise<string> {
  let link: string | null = null;
  await expect
    .poll(() => {
      const emails = fs.existsSync(OUTBOX)
        ? fs
            .readdirSync(OUTBOX)
            .sort()
            .map((file) => JSON.parse(fs.readFileSync(path.join(OUTBOX, file), "utf8")) as { to: string; text: string })
            .filter((email) => email.to === to.toLowerCase())
        : [];
      const match = emails.length ? new RegExp(`https?://[^\\s]+/${kind}/[A-Za-z0-9_-]+`).exec(emails[emails.length - 1]!.text) : null;
      link = match ? match[0] : null;
      return link;
    }, { message: `waiting for a ${kind} email to ${to}` })
    .not.toBeNull();
  return link!;
}

export async function inviteBroker(page: Page, name: string, email: string): Promise<string> {
  await page.goto("/admin");
  await page.getByRole("button", { name: "Invite a new broker" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite a new broker" });
  await dialog.getByLabel("Full name").fill(name);
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText(`Invite sent to ${email.toLowerCase()}`)).toBeVisible();
  return page.url().split("?")[0]!;
}

export async function acceptInvite(page: Page, email: string, password = BROKER_PASSWORD): Promise<void> {
  const link = new URL(await latestLink(email, "invite"));
  await page.goto(link.pathname);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome aboard");
  await page.getByLabel("Choose a password").fill(password);
  await page.getByLabel("Mobile number").fill("(561) 555-0199");
  await page.getByRole("button", { name: "Start my onboarding" }).click();
  await page.waitForURL("**/app");
}

export async function createSignedInBroker(browser: Browser, name: string, options: { viewport?: { width: number; height: number } } = {}) {
  const email = uniqueEmail(name.split(" ")[0]!.toLowerCase());
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signIn(admin, OWNER.email, OWNER.password);
  const profileUrl = await inviteBroker(admin, name, email);
  await adminContext.close();
  const brokerContext = await browser.newContext(options.viewport ? { viewport: options.viewport, isMobile: true, hasTouch: true } : {});
  const page = await brokerContext.newPage();
  await acceptInvite(page, email);
  return { page, email, profileUrl, context: brokerContext };
}

export function testFile(name: string) {
  const isPng = name.endsWith(".png");
  const buffer = isPng
    ? Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108020000009077053e0000000c4944415408d763f8cfc0000003010100c9fe92ef0000000049454e44ae426082", "hex")
    : Buffer.from(`%PDF-1.4\n% e2e test file ${name}\n%%EOF\n`);
  return { name, mimeType: isPng ? "image/png" : "application/pdf", buffer };
}

export async function uploadStep(page: Page, stepKey: string, fileName: string): Promise<void> {
  await page.goto(`/app/steps/${stepKey}`);
  await page.getByLabel("Choose files to upload").setInputFiles(testFile(fileName));
  await expect(page.getByText(/Uploaded ·/)).toBeVisible();
  await page.getByRole("button", { name: /Send to Shelly for approval/ }).click();
  await page.waitForURL("**/app");
}

export async function answerStep(page: Page, stepKey: string, fill: (page: Page) => Promise<void>): Promise<void> {
  await page.goto(`/app/steps/${stepKey}`);
  await fill(page);
  await page.getByRole("button", { name: /Send to Shelly for approval|Mark this step done/ }).click();
  await page.waitForURL("**/app");
}

export async function completeBrokerSteps(page: Page): Promise<void> {
  await uploadStep(page, "photo_id", "photo-id.pdf");
  await uploadStep(page, "contract_nda", "contract-signed.pdf");
  await answerStep(page, "bio", (p) => p.getByLabel("Your bio").fill("I grew up on the water in Palm Beach and have sold boats for ten years. ".repeat(6)));
  await uploadStep(page, "headshot", "headshot.png");
  await uploadStep(page, "w9", "w9.pdf");
  await answerStep(page, "license_situation", (p) => p.getByLabel(/I hold a Florida yacht & ship license/).check());
  await uploadStep(page, "dbpr_filing", "dbpr-confirmation.pdf");
  await uploadStep(page, "license_bond", "license-and-bond.pdf");
  await answerStep(page, "email_signature", (p) => p.getByLabel(/activated my 365 email/).check());
  await answerStep(page, "platform_logins", async (p) => {
    await p.getByLabel(/BoatWizard/).check();
    await p.getByLabel(/YachtCloser/).check();
    await p.getByLabel(/GoHighLevel/).check();
  });
}
