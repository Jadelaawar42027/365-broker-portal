/**
 * File: apps/api/test/provisioning-worker.int.test.ts
 * Purpose: Integration tests for account provisioning tasks on a real Postgres, with the Google and GoHighLevel clients
 * replaced by in-memory fakes: inviting a broker queues Google then GHL, the address is the first name, then firstname.lastname
 * on a clash, then firstname.lastname2 (accents and punctuation stripped), the corporate email becomes the login, retries back off and never duplicate a
 * user, a crash between creating and saving is recovered by the lookup, partial failures leave the other system done,
 * five failed attempts stop, GHL waits for Google, and nothing is queued for systems that aren't configured.
 *
 * Functions:
 * - invite(ctx, cookie, name): invites a broker through the API and returns their id.
 * - tasksFor(ctx, brokerId): the broker's provisioning tasks, oldest first.
 * - brokerRow(ctx, brokerId): the broker's account columns and login email.
 */
import { auditLog, brokers, provisioningTasks, users } from "@bp/db";
import { PROVISIONING_BASE_DELAY_MS } from "@bp/shared";
import { and, asc, eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProvisioningError } from "../src/services/provisioning/errors";
import { createTestContext, OWNER, type TestContext } from "./helpers/context";
import { createFakeGhl, createFakeGoogle, fakeIntegrations } from "./helpers/provisioning-fakes";

async function invite(ctx: TestContext, cookie: string, name: string): Promise<string> {
  const response = await ctx.call("POST", "/v1/admin/brokers", {
    cookie,
    body: { name, phone: "+15615550123", level: "junior", inHouseSplit: 40, selfGeneratedSplit: 60 },
  });
  expect(response.statusCode).toBe(201);
  return (response.json() as { brokerId: string }).brokerId;
}

async function tasksFor(ctx: TestContext, brokerId: string) {
  return ctx.db.select().from(provisioningTasks).where(eq(provisioningTasks.brokerId, brokerId)).orderBy(asc(provisioningTasks.createdAt), asc(provisioningTasks.system));
}

async function brokerRow(ctx: TestContext, brokerId: string) {
  const [row] = await ctx.db
    .select({ corporateEmail: brokers.corporateEmail, googleUserId: brokers.googleUserId, ghlUserId: brokers.ghlUserId, loginEmail: users.email })
    .from(brokers)
    .innerJoin(users, eq(users.id, brokers.userId))
    .where(eq(brokers.id, brokerId));
  return row!;
}

describe("provisioning with both systems configured", () => {
  const google = createFakeGoogle();
  const ghl = createFakeGhl();
  let ctx: TestContext;
  let owner: string;

  beforeAll(async () => {
    ctx = await createTestContext({ integrations: fakeIntegrations(google.client, ghl.client) });
    owner = await ctx.login(OWNER.email, OWNER.password);
  });
  afterAll(async () => ctx?.close());

  it("queues Google and GHL when a broker is invited, then creates both, Google first", async () => {
    const brokerId = await invite(ctx, owner, "José María O'Brien-Núñez");
    expect((await tasksFor(ctx, brokerId)).map((task) => [task.system, task.action, task.status])).toEqual([
      ["google", "create", "pending"],
      ["ghl", "create", "pending"],
    ]);
    expect(await ctx.runProvisioning()).toBe(2);
    const row = await brokerRow(ctx, brokerId);
    expect(row.corporateEmail).toBe("jose@365yachts.org");
    expect(row.loginEmail).toBe("jose@365yachts.org");
    expect(row.googleUserId).toMatch(/^g-/);
    expect(row.ghlUserId).toMatch(/^ghl-/);
    expect(google.users.get("jose@365yachts.org")).toMatchObject({ recoveryPhone: "+15615550123", brokerId });
    expect(ghl.users.get("jose@365yachts.org")).toMatchObject({ firstName: "José", lastName: "María O'Brien-Núñez", phone: "+15615550123" });
    expect((await tasksFor(ctx, brokerId)).every((task) => task.status === "done")).toBe(true);
    const audits = await ctx.db.select({ action: auditLog.action }).from(auditLog).where(and(eq(auditLog.entityId, brokerId), like(auditLog.action, "provisioning.%")));
    expect(audits.map((entry) => entry.action)).toEqual(expect.arrayContaining(["provisioning.queued", "provisioning.google.created", "provisioning.ghl.created"]));
  });

  it("uses firstname.lastname when the first name is taken, then adds 2", async () => {
    google.addExisting("jane@365yachts.org");
    const first = await invite(ctx, owner, "Jane Q. Doe");
    await ctx.runProvisioning();
    expect((await brokerRow(ctx, first)).corporateEmail).toBe("jane.doe@365yachts.org");
    const second = await invite(ctx, owner, "Jane Doe");
    await ctx.runProvisioning();
    expect((await brokerRow(ctx, second)).corporateEmail).toBe("jane.doe2@365yachts.org");
  });

  it("backs off after a retryable failure and creates the user exactly once", async () => {
    const start = new Date("2026-10-18T15:00:00Z");
    ctx.setNow(start);
    const brokerId = await invite(ctx, owner, "Retry Person");
    google.failNext(1, new ProvisioningError("google", "Google is having trouble right now. We'll try again.", { status: 503, retryable: true }));
    await ctx.runProvisioning();
    const [googleTask] = (await tasksFor(ctx, brokerId)).filter((task) => task.system === "google");
    expect(googleTask).toMatchObject({ status: "pending", attempts: 1, lastError: "Google is having trouble right now. We'll try again." });
    expect(googleTask!.nextAttemptAt.getTime()).toBe(start.getTime() + PROVISIONING_BASE_DELAY_MS);
    ctx.setNow(new Date(start.getTime() + 10_000));
    expect(await ctx.runProvisioning()).toBe(0);
    ctx.setNow(new Date(start.getTime() + PROVISIONING_BASE_DELAY_MS + 1000));
    await ctx.runProvisioning();
    ctx.setNow(new Date(start.getTime() + 5 * PROVISIONING_BASE_DELAY_MS));
    await ctx.runProvisioning();
    ctx.setNow(null);
    expect(google.calls.filter((call) => call === "create retry@365yachts.org")).toHaveLength(1);
    expect((await tasksFor(ctx, brokerId)).map((task) => task.status)).toEqual(["done", "done"]);
  });

  it("recovers from a crash between creating the Google user and saving it, without a duplicate", async () => {
    const brokerId = await invite(ctx, owner, "Crash Recovery");
    await ctx.db.update(brokers).set({ corporateEmail: "crash.recovery@365yachts.org" }).where(eq(brokers.id, brokerId));
    google.addExisting("crash.recovery@365yachts.org", brokerId);
    await ctx.runProvisioning();
    expect(google.calls).not.toContain("create crash.recovery@365yachts.org");
    expect(await brokerRow(ctx, brokerId)).toMatchObject({ corporateEmail: "crash.recovery@365yachts.org", googleUserId: expect.stringMatching(/^g-existing/) });
  });

  it("leaves Google done when GHL fails for good, with the error in plain words", async () => {
    const brokerId = await invite(ctx, owner, "Partial Failure");
    await ctx.runProvisioning({ limit: 1 });
    ghl.failNext(1, new ProvisioningError("ghl", "GHL: the token was rejected. Check GHL_AGENCY_TOKEN is a current agency Private Integration token.", { status: 401 }));
    await ctx.runProvisioning();
    const tasks = await tasksFor(ctx, brokerId);
    expect(tasks.find((task) => task.system === "google")!.status).toBe("done");
    expect(tasks.find((task) => task.system === "ghl")).toMatchObject({ status: "failed", attempts: 1, lastError: expect.stringMatching(/^GHL: the token was rejected/) });
    expect((await brokerRow(ctx, brokerId)).ghlUserId).toBeNull();
  });

  it("stops after five failed attempts", async () => {
    let clock = new Date("2026-10-19T09:00:00Z").getTime();
    ctx.setNow(new Date(clock));
    const brokerId = await invite(ctx, owner, "Five Strikes");
    google.failNext(5, new ProvisioningError("google", "Google: couldn't reach the service. We'll try again.", { retryable: true }));
    for (let round = 0; round < 6; round += 1) {
      ctx.setNow(new Date(clock));
      await ctx.runProvisioning();
      clock += 2 * 60 * 60 * 1000;
    }
    ctx.setNow(null);
    const googleTask = (await tasksFor(ctx, brokerId)).find((task) => task.system === "google")!;
    expect(googleTask).toMatchObject({ status: "failed", attempts: 5 });
    expect((await tasksFor(ctx, brokerId)).find((task) => task.system === "ghl")!.status).toBe("failed");
  });

  it("makes GHL wait while Google is still creating the address", async () => {
    const brokerId = await invite(ctx, owner, "Waiting Turn");
    await ctx.db.update(provisioningTasks).set({ nextAttemptAt: new Date(Date.now() + 60_000) }).where(and(eq(provisioningTasks.brokerId, brokerId), eq(provisioningTasks.system, "google")));
    await ctx.runProvisioning();
    const ghlTask = (await tasksFor(ctx, brokerId)).find((task) => task.system === "ghl")!;
    expect(ghlTask).toMatchObject({ status: "pending", attempts: 0, lastError: "Waiting for the 365 email to be created in Google first." });
  });

  it("never queues the same open task twice", async () => {
    const brokerId = await invite(ctx, owner, "Queue Once");
    const { enqueueTask } = await import("../src/services/provisioning/tasks");
    expect(await enqueueTask(ctx.db, { brokerId, system: "google", action: "create", createdBy: null, now: new Date() })).toBe(false);
  });
});

describe("provisioning with nothing configured", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => ctx?.close());

  it("queues nothing and runs nothing", async () => {
    const owner = await ctx.login(OWNER.email, OWNER.password);
    const brokerId = await invite(ctx, owner, "Plain Broker");
    expect(await tasksFor(ctx, brokerId)).toEqual([]);
    expect(await ctx.runProvisioning()).toBe(0);
    expect(await brokerRow(ctx, brokerId)).toMatchObject({ corporateEmail: null, googleUserId: null, ghlUserId: null });
  });
});
