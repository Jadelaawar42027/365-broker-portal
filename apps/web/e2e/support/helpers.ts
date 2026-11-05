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
 * - fillInviteForm(dialog, name, email): fills the invite dialog: name, phone, optional email, junior, in-house leads 40%, self-generated deals 60%.
 * - inviteBroker(page, name, email): as a signed-in admin, invites a broker with an email and returns their profile URL.
 * - acceptInvite(page, email, password): opens the invite link from the outbox and creates the account.
 * - createSignedInBroker(browser, name): uses a separate admin session to make sure step 11 has its training video and invite a broker, then accepts the invite in a new context; returns that broker's page and email.
 * - ensureCrmTrainingVideo(admin): as a signed-in admin, uploads a small MP4 to step 11's empty video slot through the API (step videos are MP4s only, SPEC D34).
 * - testVideo(name): a small file labelled video/mp4 for upload tests (headless Chromium can't play H.264, so nothing plays it).
 * - markStepVideoWatched(page, stepKey): as the signed-in broker, reports the step's first video as watched to the end, the way the player does, and reloads the page.
 * - testFile(name): a small PDF, or a plain 600 x 600 PNG (the headshot minimum), for setInputFiles.
 * - pngOfSize(width, height): builds a valid single-colour PNG of that size.
 * - pngChunk(type, data): one PNG chunk with its length and CRC.
 * - passQuickCheck(page, answer): answers a step's knowledge check correctly and waits for "That's right."
 * - uploadStep(page, stepKey, fileName, checkAnswer): opens a step, uploads one file, passes its knowledge check if one is given, and sends it.
 * - answerStep(page, stepKey, fill): opens a step, runs fill() on the page and clicks the send button.
 * - signAgreements(page): opens and reads both agreements on step 3, checks the details, signs by typed name and waits for the signed state.
 * - setUpCompanySignature(page): as the signed-in company signer, stores an authorized signature so new agreements are countersigned automatically.
 * - completeBrokerSteps(page): does all 14 steps a broker does themselves (ticking steps 0 and 1, signing the agreements, passing step 9's deposit check, watching the step 11 video).
 */
import { expect, type Browser, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
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

export async function fillInviteForm(dialog: Locator, name: string, email: string | null): Promise<void> {
  await dialog.getByLabel("Full name").fill(name);
  await dialog.getByLabel("Personal phone").fill("+1 561 555 0199");
  if (email) await dialog.getByLabel("Email (optional)").fill(email);
  await dialog.getByLabel("In-house leads").selectOption("40");
  await dialog.getByLabel("Self-generated deals").selectOption("60");
  await expect(dialog.getByText("Broker 40% · house keeps 60%")).toBeVisible();
  await expect(dialog.getByText("Broker 60% · house keeps 40%")).toBeVisible();
}

export async function inviteBroker(page: Page, name: string, email: string): Promise<string> {
  await page.goto("/admin");
  await page.getByRole("button", { name: "Invite a new broker" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite a new broker" });
  await fillInviteForm(dialog, name, email);
  await dialog.getByRole("button", { name: "Send invite" }).click();
  const invited = page.getByRole("dialog", { name: `${name} is invited` });
  await expect(invited.getByText(`We emailed the link to ${email}`)).toBeVisible();
  await invited.getByRole("link", { name: "Open their profile" }).click();
  await expect(page.getByText(`Invite sent to ${email.toLowerCase()}`)).toBeVisible();
  return page.url().split("?")[0]!;
}

export async function acceptInvite(page: Page, email: string, password = BROKER_PASSWORD): Promise<void> {
  const link = new URL(await latestLink(email, "invite"));
  await page.goto(link.pathname);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome aboard");
  await page.getByLabel("Choose a password").fill(password);
  await expect(page.getByLabel("Mobile number")).toHaveValue("(561) 555-0199");
  await expect(page.getByLabel("Mobile number")).toHaveAttribute("readonly", "");
  await page.getByRole("button", { name: "Start my onboarding" }).click();
  await page.waitForURL("**/app");
}

export const CRM_TRAINING_SECONDS = 60;

export function testVideo(name: string) {
  return { name, mimeType: "video/mp4", buffer: Buffer.concat([Buffer.from("\x00\x00\x00\x18ftypmp42"), Buffer.alloc(4096, 1)]) };
}

export async function ensureCrmTrainingVideo(admin: Page): Promise<void> {
  const response = await admin.request.get("/v1/admin/steps/crm_login");
  expect(response.status()).toBe(200);
  const { videos } = (await response.json()) as { videos: { id: string; source: string | null }[] };
  const slot = videos[0]!;
  if (slot.source !== null) return;
  const video = testVideo("crm-training.mp4");
  const started = await admin.request.post(`/v1/admin/step-videos/${slot.id}/uploads`, {
    data: { fileName: video.name, contentType: video.mimeType, sizeBytes: video.buffer.byteLength },
  });
  expect(started.status()).toBe(200);
  const { uploadId, storageKey, parts } = (await started.json()) as { uploadId: string; storageKey: string; parts: { partNumber: number; url: string }[] };
  const put = await admin.request.put(parts[0]!.url, { data: video.buffer, headers: { "content-type": video.mimeType } });
  expect(put.ok()).toBe(true);
  const completed = await admin.request.post(`/v1/admin/step-videos/${slot.id}/uploads/complete`, {
    data: { uploadId, storageKey, fileName: video.name, durationSeconds: CRM_TRAINING_SECONDS, parts: [{ partNumber: 1, etag: put.headers()["etag"]! }] },
  });
  expect(completed.status()).toBe(200);
}

export async function markStepVideoWatched(page: Page, stepKey: string): Promise<void> {
  const step = await page.request.get(`/v1/me/steps/${stepKey}`);
  expect(step.status()).toBe(200);
  const { videos } = (await step.json()) as { videos: { id: string }[] };
  const progress = await page.request.post(`/v1/me/steps/${stepKey}/videos/${videos[0]!.id}/progress`, { data: { watchedSeconds: CRM_TRAINING_SECONDS } });
  expect(await progress.json()).toMatchObject({ watched: true });
  await page.reload();
}

export async function createSignedInBroker(browser: Browser, name: string, options: { viewport?: { width: number; height: number } } = {}) {
  const email = uniqueEmail(name.split(" ")[0]!.toLowerCase());
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signIn(admin, OWNER.email, OWNER.password);
  await ensureCrmTrainingVideo(admin);
  const profileUrl = await inviteBroker(admin, name, email);
  await adminContext.close();
  const brokerContext = await browser.newContext(options.viewport ? { viewport: options.viewport, isMobile: true, hasTouch: true } : {});
  const page = await brokerContext.newPage();
  await acceptInvite(page, email);
  return { page, email, profileUrl, context: brokerContext };
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([length, body, crc]);
}

function pngOfSize(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 200)]);
  const pixels = zlib.deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", header),
    pngChunk("IDAT", pixels),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function testFile(name: string) {
  const isPng = name.endsWith(".png");
  const buffer = isPng ? pngOfSize(600, 600) : Buffer.from(`%PDF-1.4\n% e2e test file ${name}\n%%EOF\n`);
  return { name, mimeType: isPng ? "image/png" : "application/pdf", buffer };
}

export const DEPOSIT_ANSWER = "The brokerage escrow account, by wire";

export async function passQuickCheck(page: Page, answer: string): Promise<void> {
  const check = page.getByRole("region", { name: "Quick check" });
  await check.getByRole("radio", { name: answer }).check();
  await check.getByRole("button", { name: "Check my answer" }).click();
  await expect(check.getByText("That's right.")).toBeVisible();
}

const SIGNATURE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

export async function uploadStep(page: Page, stepKey: string, fileName: string, checkAnswer?: string): Promise<void> {
  await page.goto(`/app/steps/${stepKey}`);
  await page.getByLabel("Choose files to upload").setInputFiles(testFile(fileName));
  await expect(page.getByText(/Uploaded ·/)).toBeVisible();
  if (checkAnswer) await passQuickCheck(page, checkAnswer);
  await page.getByRole("button", { name: /Send to Shelly for approval/ }).click();
  await page.waitForURL("**/app");
}

export async function answerStep(page: Page, stepKey: string, fill: (page: Page) => Promise<void>): Promise<void> {
  await page.goto(`/app/steps/${stepKey}`);
  await fill(page);
  await page.getByRole("button", { name: /Send to Shelly for approval|Mark this step done/ }).click();
  await page.waitForURL("**/app");
}

export async function signAgreements(page: Page): Promise<void> {
  await page.goto("/app/steps/contract_nda");
  for (let opened = 0; opened < 2; opened += 1) {
    await page.getByRole("button", { name: "Open and read" }).first().click();
    await expect(page.getByText("Opened", { exact: true })).toHaveCount(opened + 1, { timeout: 30_000 });
    await page.getByRole("button", { name: "Hide the document" }).click();
  }
  await page.getByLabel("Mailing address").fill("100 Ocean Boulevard, Palm Beach, FL 33480");
  await page.getByLabel(/My phone is/).check();
  await page.getByLabel(/My email is/).check();
  await page.getByRole("tab", { name: "Type" }).click();
  await page.getByLabel(/I agree to sign electronically/).check();
  await page.getByRole("button", { name: "Sign both agreements" }).click();
  await expect(page.getByText(/Signed\. Waiting for 365 Yachts to countersign\.|We emailed you the signed copies/)).toBeVisible({ timeout: 30_000 });
}

export async function setUpCompanySignature(page: Page): Promise<void> {
  const response = await page.request.put("/v1/admin/company-signature", {
    data: { pngDataUrl: `data:image/png;base64,${SIGNATURE_PNG}`, authorize: true },
  });
  expect(response.status()).toBe(200);
}

export async function completeBrokerSteps(page: Page): Promise<void> {
  await answerStep(page, "start_here", (p) => p.getByLabel("I've watched the walkthrough").check());
  await answerStep(page, "ai_agent", (p) => p.getByLabel("I've watched the AI agent video").check());
  await uploadStep(page, "photo_id", "photo-id.pdf");
  await signAgreements(page);
  await answerStep(page, "bio", (p) => p.getByLabel("Your bio").fill("I grew up on the water in Palm Beach and have sold boats for ten years. ".repeat(7)));
  await uploadStep(page, "headshot", "headshot.png");
  await uploadStep(page, "w9", "w9.pdf");
  await answerStep(page, "license_situation", (p) => p.getByLabel(/I already have a Florida yacht & ship license/).check());
  await uploadStep(page, "dbpr_filing", "dbpr-confirmation.pdf");
  await uploadStep(page, "license_bond", "license-and-bond.pdf", DEPOSIT_ANSWER);
  await answerStep(page, "email_signature", (p) => p.getByLabel(/logged in to my 365 Yachts email/).check());
  await answerStep(page, "crm_login", async (p) => {
    await markStepVideoWatched(p, "crm_login");
    const confirm = p.getByLabel(/watched the CRM training/);
    await expect(confirm).toBeEnabled();
    await confirm.check();
  });
  await answerStep(page, "boatwizard_login", (p) => p.getByLabel(/signed in to BoatWizard/).check());
  await answerStep(page, "yachtcloser_login", (p) => p.getByLabel(/signed in to YachtCloser/).check());
}
