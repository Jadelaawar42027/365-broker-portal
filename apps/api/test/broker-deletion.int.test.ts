/**
 * File: apps/api/test/broker-deletion.int.test.ts
 * Purpose: Integration tests for permanently deleting a broker: only the owner can do it, the broker's full name must be
 * typed to confirm, and afterwards nothing about them is left (user, login and sessions, broker row, steps, file records,
 * stored files, commission history, audit rows), apart from one "broker.deleted" audit row with counts only. Other
 * brokers are untouched.
 *
 * Functions:
 * - createAdmin(email): adds a signed-in admin (not the owner) and returns their cookie.
 */
import { accounts, auditLog, brokerSteps, brokers, commissionHistory, files, sessions, users } from "@bp/db";
import { hashPassword } from "better-auth/crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, OWNER, PASSWORD, type TestContext } from "./helpers/context";

let ctx: TestContext;
let owner: string;

async function createAdmin(email: string): Promise<string> {
  const [user] = await ctx.db.insert(users).values({ name: "Shelly Admin", email, role: "admin" }).returning({ id: users.id });
  await ctx.db.insert(accounts).values({ userId: user!.id, accountId: user!.id, providerId: "credential", password: await hashPassword(PASSWORD) });
  return ctx.login(email, PASSWORD);
}

beforeAll(async () => {
  ctx = await createTestContext();
  owner = await ctx.login(OWNER.email, OWNER.password);
});
afterAll(async () => ctx?.close());

describe("deleting a broker permanently", () => {
  it("is refused for admins who aren't the owner, and for brokers", async () => {
    const target = await ctx.createBroker({ name: "Kept Broker", email: "kept@example.com" });
    const admin = await createAdmin("shelly.admin@example.com");
    const asAdmin = await ctx.call("DELETE", `/v1/admin/brokers/${target.brokerId}`, { cookie: admin, body: { confirmName: "Kept Broker" } });
    expect(asAdmin.statusCode).toBe(403);
    expect(asAdmin.json().message).toBe("Only the owner can delete a broker.");
    expect((await ctx.call("DELETE", `/v1/admin/brokers/${target.brokerId}`, { cookie: target.cookie, body: { confirmName: "Kept Broker" } })).statusCode).toBe(403);
    expect(await ctx.db.select({ id: brokers.id }).from(brokers).where(eq(brokers.id, target.brokerId))).toHaveLength(1);
  });

  it("needs the broker's full name typed to confirm", async () => {
    const target = await ctx.createBroker({ name: "Typo Check", email: "typo@example.com" });
    const response = await ctx.call("DELETE", `/v1/admin/brokers/${target.brokerId}`, { cookie: owner, body: { confirmName: "Typo" } });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("name_mismatch");
    expect(await ctx.db.select({ id: brokers.id }).from(brokers).where(eq(brokers.id, target.brokerId))).toHaveLength(1);
  });

  it("removes the broker, their login, steps, files, history and audit rows, leaving one deletion record", async () => {
    const bystander = await ctx.createBroker({ name: "Bystander", email: "bystander@example.com" });
    const target = await ctx.createBroker({ name: "Gone Broker", email: "gone@example.com", personaMd: "Private notes" });
    const storageKey = await ctx.upload(target.cookie, "/v1/me/steps/w9/upload-url", {
      fileName: "w9.pdf",
      contentType: "application/pdf",
      bytes: new TextEncoder().encode("%PDF-1.4 tax id"),
    });
    expect((await ctx.call("POST", "/v1/me/steps/w9/submit", { cookie: target.cookie, body: { files: [{ storageKey, fileName: "w9.pdf" }] } })).statusCode).toBe(200);
    await ctx.call("POST", `/v1/admin/brokers/${target.brokerId}/commission`, { cookie: owner, body: { inHouseSplit: 40, selfGeneratedSplit: 60 } });
    await ctx.call("POST", `/v1/admin/broker-steps/${await ctx.stepId(target.brokerId, "w9")}/approve`, { cookie: owner });
    const stepIds = (await ctx.db.select({ id: brokerSteps.id }).from(brokerSteps).where(eq(brokerSteps.brokerId, target.brokerId))).map((row) => row.id);
    expect(await ctx.storage.headObject(storageKey)).not.toBeNull();

    const response = await ctx.call("DELETE", `/v1/admin/brokers/${target.brokerId}`, { cookie: owner, body: { confirmName: "  gone   broker " } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, stepsDeleted: stepIds.length, fileRecordsDeleted: 1, storedFilesDeleted: 1, storageError: null });
    expect(response.json().auditRowsDeleted).toBeGreaterThan(0);

    expect(await ctx.db.select().from(brokers).where(eq(brokers.id, target.brokerId))).toEqual([]);
    expect(await ctx.db.select().from(users).where(eq(users.id, target.userId))).toEqual([]);
    expect(await ctx.db.select().from(sessions).where(eq(sessions.userId, target.userId))).toEqual([]);
    expect(await ctx.db.select().from(accounts).where(eq(accounts.userId, target.userId))).toEqual([]);
    expect(await ctx.db.select().from(brokerSteps).where(eq(brokerSteps.brokerId, target.brokerId))).toEqual([]);
    expect(await ctx.db.select().from(files).where(inArray(files.brokerStepId, stepIds))).toEqual([]);
    expect(await ctx.db.select().from(commissionHistory).where(eq(commissionHistory.brokerId, target.brokerId))).toEqual([]);
    expect(await ctx.storage.headObject(storageKey)).toBeNull();
    const remaining = await ctx.db.select().from(auditLog).where(inArray(auditLog.entityId, [target.brokerId, target.userId, ...stepIds]));
    expect(remaining.map((row) => row.action)).toEqual(["broker.deleted"]);
    expect(JSON.stringify(remaining)).not.toMatch(/gone@example\.com|Gone Broker|Private notes/);

    expect((await ctx.call("GET", "/v1/me", { cookie: target.cookie })).statusCode).toBe(401);
    expect((await ctx.call("POST", "/api/auth/sign-in/email", { body: { email: "gone@example.com", password: PASSWORD } })).statusCode).not.toBe(200);
    expect((await ctx.call("DELETE", `/v1/admin/brokers/${target.brokerId}`, { cookie: owner, body: { confirmName: "Gone Broker" } })).statusCode).toBe(404);
    expect((await ctx.call("GET", `/v1/admin/brokers/${bystander.brokerId}`, { cookie: owner })).statusCode).toBe(200);
  });
});
