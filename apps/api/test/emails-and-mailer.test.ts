/**
 * File: apps/api/test/emails-and-mailer.test.ts
 * Purpose: Unit tests for the email wording and the two mailers: Resend (HTTP call shape and error handling, with
 * fetch stubbed) and the console fallback with its optional outbox folder, plus sendSafely never throwing.
 *
 * Functions:
 * - fakeLog(): returns a logger stub that records info and error calls.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadApiEnv } from "../src/env";
import {
  adminInviteEmail,
  firstName,
  inviteEmail,
  onboardingCompleteAdminEmail,
  reminderEmail,
} from "../src/services/emails";
import { createConsoleMailer, createMailer, createResendMailer, sendSafely } from "../src/services/mailer";

const support = { name: "Shelly", whatsappNumber: "15614459241" };

function fakeLog() {
  const calls = { info: [] as unknown[][], error: [] as unknown[][] };
  return {
    calls,
    log: { info: (...args: unknown[]) => calls.info.push(args), error: (...args: unknown[]) => calls.error.push(args) } as never,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("email wording", () => {
  it("uses the first name and the WhatsApp link", () => {
    expect(firstName("  Daniel Reyes ")).toBe("Daniel");
    const email = inviteEmail({ name: "Daniel Reyes", link: "http://x/invite/t", support });
    expect(email.text).toContain("Welcome aboard, Daniel.");
    expect(email.text).toContain("https://wa.me/15614459241");
    expect(email.text).toContain("7 days");
  });

  it("falls back to replying by email without a WhatsApp number", () => {
    const email = inviteEmail({ name: "Daniel", link: "http://x", support: { name: "Shelly", whatsappNumber: null } });
    expect(email.text).toContain("Reply to this email and Shelly will help.");
  });

  it("words reminders with and without a next step", () => {
    expect(reminderEmail({ brokerName: "Dan", stepTitle: null, message: null, link: "l", support }).subject).toBe(
      "Reminder: your 365 onboarding",
    );
    expect(adminInviteEmail({ name: "Shelly M", link: "l", invitedBy: "Aj" }).text).toContain("Aj added you");
    expect(onboardingCompleteAdminEmail({ brokerName: "Dan Smith", link: "l" }).subject).toBe("Dan Smith finished onboarding");
  });
});

const required = {
  DATABASE_URL: "postgres://x",
  BETTER_AUTH_SECRET: "s".repeat(32),
  S3_BUCKET: "b",
  S3_ACCESS_KEY_ID: "k",
  S3_SECRET_ACCESS_KEY: "s",
};

describe("mailers", () => {
  const env = loadApiEnv(required);

  it("posts to Resend with the API key", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await createResendMailer("re_key", "365 <a@b.c>").send({ to: "d@e.f", subject: "Hi", text: "Body" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ authorization: "Bearer re_key" });
    expect(JSON.parse(String(init.body))).toEqual({ from: "365 <a@b.c>", to: ["d@e.f"], subject: "Hi", text: "Body" });
  });

  it("throws when Resend refuses, and sendSafely logs instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad key", { status: 401 })));
    const mailer = createResendMailer("re_key", "from");
    await expect(mailer.send({ to: "x", subject: "s", text: "t" })).rejects.toThrow(/401/);
    const { log, calls } = fakeLog();
    await expect(sendSafely(mailer, log, [{ to: "x", subject: "s", text: "t" }])).resolves.toBeUndefined();
    expect(calls.error).toHaveLength(1);
  });

  it("logs instead of sending when RESEND_API_KEY is empty", async () => {
    const { log, calls } = fakeLog();
    await createMailer(env, log).send({ to: "d@e.f", subject: "Hello", text: "Body" });
    expect(String(calls.info[0]?.[1])).toContain("not sent");
    await createConsoleMailer(log).send({ to: "x", subject: "y", text: "z" });
    expect(calls.info).toHaveLength(2);
  });

  it("saves a JSON copy of each email when EMAIL_OUTBOX_DIR is set", async () => {
    const dir = await import("node:fs/promises").then((fs) => fs.mkdtemp(`${process.env.TMPDIR ?? "/tmp"}/bp-outbox-`));
    const { log } = fakeLog();
    await createMailer({ ...env, EMAIL_OUTBOX_DIR: dir }, log).send({ to: "d@e.f", subject: "Invite", text: "http://x/invite/abc" });
    const fs = await import("node:fs/promises");
    const [file] = await fs.readdir(dir);
    expect(JSON.parse(await fs.readFile(`${dir}/${file}`, "utf8"))).toMatchObject({ to: "d@e.f", subject: "Invite", text: "http://x/invite/abc" });
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("refuses an outbox folder in production", () => {
    expect(() =>
      loadApiEnv({ ...required, NODE_ENV: "production", WEB_ORIGIN: "https://team.365yachts.org", EMAIL_OUTBOX_DIR: "/tmp/x" }),
    ).toThrow(/EMAIL_OUTBOX_DIR: is for local development and tests only/);
  });

  it("picks Resend when a key is set", () => {
    const { log } = fakeLog();
    expect(createMailer({ ...env, RESEND_API_KEY: "re_x" }, log)).toBeTruthy();
  });
});
