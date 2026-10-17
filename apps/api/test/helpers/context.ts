/**
 * File: apps/api/test/helpers/context.ts
 * Purpose: Builds a complete API for one integration test file: a fresh migrated Postgres container, the shared S3
 * container, an in-memory mailer and a controllable clock, plus helpers to sign in, create brokers, upload files and
 * read the emails that were sent.
 *
 * Functions:
 * - createTestContext(options): starts everything and returns the context object.
 * - call(method, url, options): sends a request through app.inject with the portal's Origin header; returns the response.
 * - login(email, password): signs in through Better Auth and returns the session cookie.
 * - createBroker(input): creates a broker (and, unless invited, a password login) directly in the database; returns ids, email and a signed-in cookie.
 * - stepId(brokerId, key): returns the broker_steps id for one of a broker's steps.
 * - setStepStatus(brokerId, keys, status): sets steps' status directly in the database (test set-up only).
 * - upload(cookie, path, file): asks the API for an upload target at path, uploads the bytes there and returns the storage key.
 * - emailsTo(address): returns every email sent to an address so far.
 * - linkToken(email, kind): pulls the invite or reset token out of an email's link.
 * - setNow(date): moves the API's clock.
 * - close(): closes the app and stops the Postgres container.
 */
import { accounts, brokerSteps, createBroker as createBrokerRows, onboardingSteps, seedDatabase } from "@bp/db";
import { startTestDatabase } from "@bp/db/testing";
import type { BrokerLevel, BrokerStatus, StepStatus } from "@bp/shared";
import { createS3Storage } from "@bp/shared/node";
import { hashPassword } from "better-auth/crypto";
import { and, eq, inArray } from "drizzle-orm";
import { inject } from "vitest";
import { buildApp } from "../../src/app";
import { loadApiEnv } from "../../src/env";
import type { EmailMessage, Mailer } from "../../src/services/mailer";

export const WEB_ORIGIN = "http://localhost:3000";
export const OWNER = { name: "Aj Owner", email: "owner@example.com", password: "owner-password-123" };
export const PASSWORD = "broker-password-123";

type CallOptions = { cookie?: string; body?: unknown; headers?: Record<string, string>; rawBody?: Buffer };

export async function createTestContext(options: { uploadMode?: "direct" | "proxy"; supportNumber?: string } = {}) {
  const database = await startTestDatabase();
  await seedDatabase(database.db, { owner: OWNER });
  const s3 = inject("s3");
  const env = loadApiEnv({
    NODE_ENV: "test",
    DATABASE_URL: database.url,
    WEB_ORIGIN,
    BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
    S3_ENDPOINT: s3.endpoint,
    S3_BUCKET: s3.bucket,
    S3_ACCESS_KEY_ID: s3.accessKeyId,
    S3_SECRET_ACCESS_KEY: s3.secretAccessKey,
    S3_FORCE_PATH_STYLE: "true",
    STORAGE_UPLOAD_MODE: options.uploadMode ?? "direct",
    SUPPORT_CONTACT_NAME: "Shelly",
    SUPPORT_WHATSAPP_NUMBER: options.supportNumber ?? "15614459241",
  });
  const storage = createS3Storage({
    endpoint: s3.endpoint,
    region: "us-east-1",
    bucket: s3.bucket,
    accessKeyId: s3.accessKeyId,
    secretAccessKey: s3.secretAccessKey,
    forcePathStyle: true,
  });
  const sent: EmailMessage[] = [];
  const mailer: Mailer = { send: async (message) => void sent.push(message) };
  let nowValue: Date | null = null;
  const app = await buildApp({ env, db: database.db, storage, mailer, now: () => nowValue ?? new Date() });

  async function call(method: string, url: string, callOptions: CallOptions = {}) {
    const headers: Record<string, string> = { origin: WEB_ORIGIN, ...callOptions.headers };
    if (callOptions.cookie) headers.cookie = callOptions.cookie;
    return app.inject({
      method: method as "GET",
      url,
      headers,
      ...(callOptions.rawBody ? { payload: callOptions.rawBody } : callOptions.body !== undefined ? { payload: callOptions.body as object } : {}),
    });
  }

  async function login(email: string, password: string): Promise<string> {
    const response = await call("POST", "/api/auth/sign-in/email", { body: { email, password } });
    if (response.statusCode !== 200) throw new Error(`Login failed for ${email}: ${response.statusCode} ${response.body}`);
    const cookies = ([] as string[]).concat(response.headers["set-cookie"] ?? []);
    return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
  }

  async function createBroker(input: {
    name?: string;
    email: string;
    level?: BrokerLevel;
    status?: BrokerStatus;
    joinedAt?: string;
    personaMd?: string;
  }) {
    const status = input.status ?? "onboarding";
    const ids = await database.db.transaction(async (tx) => {
      const created = await createBrokerRows(tx, {
        name: input.name ?? "Test Broker",
        email: input.email,
        level: input.level ?? "junior",
        status,
        joinedAt: input.joinedAt ?? "2026-10-01",
        personaMd: input.personaMd ?? null,
      });
      if (status !== "invited") {
        await tx.insert(accounts).values({
          userId: created.userId,
          accountId: created.userId,
          providerId: "credential",
          password: await hashPassword(PASSWORD),
        });
      }
      return created;
    });
    const cookie = status === "invited" || status === "inactive" ? "" : await login(input.email, PASSWORD);
    return { ...ids, email: input.email, cookie };
  }

  async function stepId(brokerId: string, key: string): Promise<string> {
    const [row] = await database.db
      .select({ id: brokerSteps.id })
      .from(brokerSteps)
      .innerJoin(onboardingSteps, eq(onboardingSteps.id, brokerSteps.stepId))
      .where(and(eq(brokerSteps.brokerId, brokerId), eq(onboardingSteps.key, key)));
    return row!.id;
  }

  async function setStepStatus(brokerId: string, keys: string[], status: StepStatus) {
    const steps = await database.db
      .select({ id: onboardingSteps.id })
      .from(onboardingSteps)
      .where(inArray(onboardingSteps.key, keys));
    await database.db
      .update(brokerSteps)
      .set({ status, submittedAt: new Date() })
      .where(and(eq(brokerSteps.brokerId, brokerId), inArray(brokerSteps.stepId, steps.map((step) => step.id))));
  }

  async function upload(cookie: string, path: string, file: { fileName: string; contentType: string; bytes: Uint8Array }) {
    const target = await call("POST", path, {
      cookie,
      body: { fileName: file.fileName, contentType: file.contentType, sizeBytes: file.bytes.byteLength },
    });
    if (target.statusCode !== 200) throw new Error(`upload-url failed: ${target.statusCode} ${target.body}`);
    const { storageKey, upload: destination } = target.json() as {
      storageKey: string;
      upload: { url: string; headers: Record<string, string> };
    };
    if (destination.url.startsWith("/")) {
      const put = await call("PUT", destination.url, { cookie, headers: destination.headers, rawBody: Buffer.from(file.bytes) });
      if (put.statusCode !== 200) throw new Error(`proxy upload failed: ${put.statusCode} ${put.body}`);
    } else {
      const put = await fetch(destination.url, { method: "PUT", headers: destination.headers, body: file.bytes });
      if (!put.ok) throw new Error(`direct upload failed: ${put.status} ${await put.text()}`);
    }
    return storageKey;
  }

  function emailsTo(address: string): EmailMessage[] {
    return sent.filter((message) => message.to === address);
  }

  function linkToken(email: EmailMessage, kind: "invite" | "reset"): string {
    const match = new RegExp(`${WEB_ORIGIN}/${kind}/([A-Za-z0-9_-]+)`).exec(email.text);
    if (!match) throw new Error(`No ${kind} link in email: ${email.text}`);
    return match[1]!;
  }

  return {
    app,
    db: database.db,
    sql: database.sql,
    storage,
    sent,
    call,
    login,
    createBroker,
    stepId,
    setStepStatus,
    upload,
    emailsTo,
    linkToken,
    setNow: (date: Date | null) => {
      nowValue = date;
    },
    close: async () => {
      await app.close();
      await database.stop();
    },
  };
}

export type TestContext = Awaited<ReturnType<typeof createTestContext>>;
