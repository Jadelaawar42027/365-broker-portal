/**
 * File: apps/api/test/provisioning-routes.int.test.ts
 * Purpose: Integration tests for the account provisioning routes (phase H2) with the Google and GoHighLevel clients
 * mocked: the Accounts panel statuses and plain-words errors, Retry, entering a corporate email and "Link existing
 * account", the CRM phone (profile, list, broker_metrics), offboarding and reactivation, the Integrations panel and
 * "Test connection", revealing a temporary password (once per click, 3 a day, audited without the password), and
 * the not-configured case. Permission tests: only owners and admins can provision, retry, link or edit the CRM phone;
 * only the broker can reveal, and only their own account.
 *
 * Functions:
 * - accountsOf(ctx, cookie, brokerId): GET the Accounts panel and return { google, ghl } views.
 * - linkedBroker(name, email): an existing signed-in broker whose corporate email is entered by hand and linked to existing accounts.
 */
import { auditLog, brokerMetrics, brokers, users } from "@bp/db";
import type { AccountSystemView, BrokerAccountsResponse } from "@bp/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProvisioningError } from "../src/services/provisioning/errors";
import { createTestContext, OWNER, PASSWORD, type TestContext } from "./helpers/context";
import { createFakeGhl, createFakeGoogle, fakeIntegrations } from "./helpers/provisioning-fakes";

async function accountsOf(ctx: TestContext, cookie: string, brokerId: string) {
  const response = await ctx.call("GET", `/v1/admin/brokers/${brokerId}/accounts`, { cookie });
  expect(response.statusCode).toBe(200);
  const body = response.json() as BrokerAccountsResponse;
  return { body, google: body.systems.find((view) => view.system === "google") as AccountSystemView, ghl: body.systems.find((view) => view.system === "ghl") as AccountSystemView };
}

describe("account provisioning routes, both systems configured", () => {
  const google = createFakeGoogle();
  const ghl = createFakeGhl();
  let ctx: TestContext;
  let owner: string;

  async function linkedBroker(name: string, email: string) {
    const created = await ctx.createBroker({ name, email, status: "active" });
    const corporate = `${name.toLowerCase().replace(" ", ".")}@365yachts.org`;
    google.addExisting(corporate);
    ghl.addExisting(corporate);
    expect((await ctx.call("PUT", `/v1/admin/brokers/${created.brokerId}/corporate-email`, { cookie: owner, body: { email: corporate } })).statusCode).toBe(200);
    expect((await ctx.call("POST", `/v1/admin/brokers/${created.brokerId}/accounts/link`, { cookie: owner, body: {} })).json()).toEqual({ queued: ["google", "ghl"], skipped: [] });
    await ctx.runProvisioning();
    return { ...created, corporate };
  }

  beforeAll(async () => {
    ctx = await createTestContext({ integrations: fakeIntegrations(google.client, ghl.client) });
    owner = await ctx.login(OWNER.email, OWNER.password);
  });
  afterAll(async () => ctx?.close());

  it("shows Pending, then Created with the account email, and the marks on the brokers table", async () => {
    const response = await ctx.call("POST", "/v1/admin/brokers", { cookie: owner, body: { name: "Lena Park", phone: "+15615550142", level: "junior", inHouseSplit: 40, selfGeneratedSplit: 60 } });
    const { brokerId } = response.json() as { brokerId: string };
    expect((await accountsOf(ctx, owner, brokerId)).google.status).toBe("pending");
    await ctx.runProvisioning();
    const { body, google: googleView, ghl: ghlView } = await accountsOf(ctx, owner, brokerId);
    expect(body.corporateEmail).toBe("lena@365yachts.org");
    expect(googleView).toMatchObject({ status: "created", statusLabel: "Created", email: "lena@365yachts.org", error: null, canRetry: false });
    expect(ghlView).toMatchObject({ status: "created", accountId: expect.stringMatching(/^ghl-/) });
    const list = (await ctx.call("GET", "/v1/admin/brokers", { cookie: owner })).json() as { brokers: { brokerId: string; accounts: unknown; corporateEmail: string }[] };
    expect(list.brokers.find((row) => row.brokerId === brokerId)).toMatchObject({ accounts: { google: "created", ghl: "created" }, corporateEmail: "lena@365yachts.org" });
  });

  it("shows Failed with the error in plain words, and Retry creates the account", async () => {
    ghl.failNext(1, new ProvisioningError("ghl", "GHL: the token isn't allowed to do this. Give the agency Private Integration the scopes users.readonly, users.write, locations.readonly.", { status: 403 }));
    const { brokerId } = (await ctx.call("POST", "/v1/admin/brokers", { cookie: owner, body: { name: "Omar Haddad", phone: "+15615550141", level: "senior", inHouseSplit: 50, selfGeneratedSplit: 70 } })).json() as { brokerId: string };
    await ctx.runProvisioning();
    const failed = (await accountsOf(ctx, owner, brokerId)).ghl;
    expect(failed).toMatchObject({ status: "failed", canRetry: true, error: expect.stringMatching(/^GHL: the token isn't allowed/) });
    expect((await ctx.call("POST", `/v1/admin/brokers/${brokerId}/accounts/ghl/retry`, { cookie: owner, body: {} })).json()).toEqual({ queued: ["ghl"], skipped: [] });
    await ctx.runProvisioning();
    expect((await accountsOf(ctx, owner, brokerId)).ghl.status).toBe("created");
    expect((await ctx.call("POST", `/v1/admin/brokers/${brokerId}/accounts/ghl/retry`, { cookie: owner, body: {} })).statusCode).toBe(409);
  });

  it("links an existing broker's accounts by corporate email instead of creating them, and makes it their login", async () => {
    const before = google.calls.length;
    const linked = await linkedBroker("Kevin Osei", "kevin.personal@example.com");
    expect(google.calls.slice(before).some((call) => call.startsWith("create"))).toBe(false);
    const { google: googleView, ghl: ghlView } = await accountsOf(ctx, owner, linked.brokerId);
    expect(googleView).toMatchObject({ status: "created", accountId: expect.stringMatching(/^g-existing/) });
    expect(ghlView).toMatchObject({ status: "created", accountId: expect.stringMatching(/^ghl-existing/) });
    const [user] = await ctx.db.select({ email: users.email }).from(users).where(eq(users.id, linked.userId));
    expect(user!.email).toBe("kevin.osei@365yachts.org");
    expect(await ctx.login("kevin.osei@365yachts.org", PASSWORD)).toContain("=");
  });

  it("reports a link that finds no account, and checks the corporate email's domain and owner", async () => {
    const created = await ctx.createBroker({ name: "Ana Ruiz", email: "ana.personal@example.com", status: "active" });
    expect((await ctx.call("POST", `/v1/admin/brokers/${created.brokerId}/accounts/link`, { cookie: owner, body: {} })).statusCode).toBe(409);
    expect((await ctx.call("PUT", `/v1/admin/brokers/${created.brokerId}/corporate-email`, { cookie: owner, body: { email: "ana@gmail.com" } })).statusCode).toBe(400);
    expect((await ctx.call("PUT", `/v1/admin/brokers/${created.brokerId}/corporate-email`, { cookie: owner, body: { email: "lena@365yachts.org" } })).statusCode).toBe(409);
    await ctx.call("PUT", `/v1/admin/brokers/${created.brokerId}/corporate-email`, { cookie: owner, body: { email: "ana.ruiz@365yachts.org" } });
    await ctx.call("POST", `/v1/admin/brokers/${created.brokerId}/accounts/link`, { cookie: owner, body: {} });
    await ctx.runProvisioning();
    const { google: googleView } = await accountsOf(ctx, owner, created.brokerId);
    expect(googleView).toMatchObject({ status: "failed", error: "Google: there's no Workspace account for ana.ruiz@365yachts.org." });
    const [audit] = await ctx.db.select().from(auditLog).where(and(eq(auditLog.entityId, created.brokerId), eq(auditLog.action, "broker.corporate_email_set")));
    expect(audit?.after).toEqual({ corporateEmail: "ana.ruiz@365yachts.org" });
  });

  it("saves the CRM phone in E.164 and shows it in the list and broker_metrics", async () => {
    const created = await ctx.createBroker({ name: "Crm Person", email: "crm@example.com", status: "active" });
    expect((await ctx.call("PATCH", `/v1/admin/brokers/${created.brokerId}`, { cookie: owner, body: { crmPhone: "5615550100" } })).statusCode).toBe(400);
    expect((await ctx.call("PATCH", `/v1/admin/brokers/${created.brokerId}`, { cookie: owner, body: { crmPhone: "+1 561 555 0100" } })).statusCode).toBe(200);
    const [metrics] = await ctx.db.select({ crmPhone: brokerMetrics.crmPhone }).from(brokerMetrics).where(eq(brokerMetrics.brokerId, created.brokerId));
    expect(metrics!.crmPhone).toBe("+15615550100");
    const list = (await ctx.call("GET", "/v1/admin/brokers", { cookie: owner })).json() as { brokers: { brokerId: string; crmPhone: string | null }[] };
    expect(list.brokers.find((row) => row.brokerId === created.brokerId)!.crmPhone).toBe("+15615550100");
    const profile = (await ctx.call("GET", `/v1/admin/brokers/${created.brokerId}`, { cookie: owner })).json() as { broker: { crmPhone: string } };
    expect(profile.broker.crmPhone).toBe("+15615550100");
  });

  it("suspends Google and removes the GHL user when a broker goes inactive, and turns them back on when reactivated", async () => {
    const linked = await linkedBroker("Sam Leaving", "sam.personal@example.com");
    const googleId = (await accountsOf(ctx, owner, linked.brokerId)).google.accountId!;
    expect((await ctx.call("PATCH", `/v1/admin/brokers/${linked.brokerId}`, { cookie: owner, body: { status: "inactive", leftAt: "2026-10-18" } })).statusCode).toBe(200);
    await ctx.runProvisioning();
    expect(google.users.get(linked.corporate)!.suspended).toBe(true);
    expect(ghl.users.has(linked.corporate)).toBe(false);
    const suspended = await accountsOf(ctx, owner, linked.brokerId);
    expect([suspended.google.status, suspended.ghl.status]).toEqual(["suspended", "suspended"]);
    expect((await ctx.call("PATCH", `/v1/admin/brokers/${linked.brokerId}`, { cookie: owner, body: { status: "active", leftAt: null } })).statusCode).toBe(200);
    await ctx.runProvisioning();
    expect(google.users.get(linked.corporate)!.suspended).toBe(false);
    expect(google.calls).toContain(`unsuspend ${googleId}`);
    expect(ghl.users.get(linked.corporate)?.id).toMatch(/^ghl-/);
    const back = await accountsOf(ctx, owner, linked.brokerId);
    expect([back.google.status, back.ghl.status]).toEqual(["created", "created"]);
  });

  it("shows the new 365 email and the admin's phone on the invite link, and signs the broker in with that email", async () => {
    const response = await ctx.call("POST", "/v1/admin/brokers", { cookie: owner, body: { name: "Ivy Invite", phone: "+15615550188", level: "junior", inHouseSplit: 40, selfGeneratedSplit: 60 } });
    const token = new URL((response.json() as { inviteUrl: string }).inviteUrl).pathname.split("/").pop()!;
    expect((await ctx.call("GET", `/v1/invites/${token}`)).json()).toMatchObject({ email: null, corporateEmail: null, phone: "+15615550188" });
    await ctx.runProvisioning();
    expect((await ctx.call("GET", `/v1/invites/${token}`)).json()).toMatchObject({ email: "ivy@365yachts.org", corporateEmail: "ivy@365yachts.org", phone: "+15615550188", hasPhone: true });
    expect((await ctx.call("POST", `/v1/invites/${token}/accept`, { body: { name: "Ivy Invite", password: PASSWORD } })).statusCode).toBe(200);
    expect(await ctx.login("ivy@365yachts.org", PASSWORD)).toContain("=");
  });

  it("lists both integrations as configured and tests the connection", async () => {
    const status = (await ctx.call("GET", "/v1/admin/integrations", { cookie: owner })).json() as { systems: { system: string; configured: boolean }[] };
    expect(status.systems.map((system) => [system.system, system.configured])).toEqual([
      ["google", true],
      ["ghl", true],
    ]);
    expect((await ctx.call("POST", "/v1/admin/integrations/google/test", { cookie: owner, body: {} })).json()).toEqual({ ok: true, message: "Connected to Google Workspace (domain 365yachts.org)." });
    google.failNext(1, new ProvisioningError("google", "Google: the service account isn't authorized. Check domain-wide delegation.", { status: 401 }));
    expect((await ctx.call("POST", "/v1/admin/integrations/google/test", { cookie: owner, body: {} })).json()).toEqual({ ok: false, message: "Google: the service account isn't authorized. Check domain-wide delegation." });
  });

  it("reveals a fresh temporary password to the broker, 3 times a day, audited without the password", async () => {
    const linked = await linkedBroker("Rita Reveal", "rita.personal@example.com");
    const cookie = await ctx.login(linked.corporate, PASSWORD);
    expect((await ctx.call("GET", "/v1/me/accounts", { cookie })).json()).toEqual({ googleConfigured: true, corporateEmail: linked.corporate, googleReady: true, revealsLeft: 3, gmailUrl: "https://mail.google.com/", startingPassword: null });
    const first = await ctx.call("POST", "/v1/me/accounts/google/reveal-password", { cookie, body: {} });
    expect(first.statusCode).toBe(200);
    expect(first.headers["cache-control"]).toBe("no-store");
    const { password, revealsLeft } = first.json() as { password: string; revealsLeft: number };
    expect(password.length).toBeGreaterThanOrEqual(16);
    expect(revealsLeft).toBe(2);
    expect(google.users.get(linked.corporate)!.passwordSets).toBe(2);
    await ctx.call("POST", "/v1/me/accounts/google/reveal-password", { cookie, body: {} });
    await ctx.call("POST", "/v1/me/accounts/google/reveal-password", { cookie, body: {} });
    expect((await ctx.call("POST", "/v1/me/accounts/google/reveal-password", { cookie, body: {} })).statusCode).toBe(429);
    const audits = await ctx.db.select().from(auditLog).where(and(eq(auditLog.entityId, linked.brokerId), eq(auditLog.action, "google.password_revealed")));
    expect(audits).toHaveLength(3);
    expect(JSON.stringify(audits)).not.toContain(password);
  });

  it("says the email is being set up while the broker has no Google account", async () => {
    const created = await ctx.createBroker({ name: "Not Ready", email: "notready@example.com", status: "onboarding" });
    expect((await ctx.call("GET", "/v1/me/accounts", { cookie: created.cookie })).json()).toMatchObject({ corporateEmail: null, googleReady: false });
    expect((await ctx.call("POST", "/v1/me/accounts/google/reveal-password", { cookie: created.cookie, body: {} })).statusCode).toBe(409);
  });

  it("lets only owners and admins provision, retry, link or edit the CRM phone, and only brokers reveal their own password", async () => {
    const broker = await ctx.createBroker({ name: "Plain Broker", email: "plain@example.com", status: "onboarding" });
    const other = await ctx.createBroker({ name: "Other Broker", email: "other@example.com", status: "onboarding" });
    const adminOnly: [string, string, unknown?][] = [
      ["GET", `/v1/admin/brokers/${other.brokerId}/accounts`],
      ["POST", `/v1/admin/brokers/${other.brokerId}/accounts/google/retry`, {}],
      ["POST", `/v1/admin/brokers/${other.brokerId}/accounts/link`, {}],
      ["PUT", `/v1/admin/brokers/${other.brokerId}/corporate-email`, { email: "other.broker@365yachts.org" }],
      ["PATCH", `/v1/admin/brokers/${other.brokerId}`, { crmPhone: "+15615550100" }],
      ["PATCH", `/v1/admin/brokers/${broker.brokerId}`, { crmPhone: "+15615550100" }],
      ["POST", "/v1/admin/brokers", { name: "Sneaky", phone: "+15615550100", level: "junior", inHouseSplit: 40, selfGeneratedSplit: 60 }],
      ["GET", "/v1/admin/integrations"],
      ["POST", "/v1/admin/integrations/google/test", {}],
    ];
    for (const [method, url, body] of adminOnly) {
      expect((await ctx.call(method, url, { cookie: broker.cookie, body })).statusCode, `${method} ${url} as broker`).toBe(403);
      expect((await ctx.call(method, url, { body })).statusCode, `${method} ${url} signed out`).toBe(401);
    }
    expect((await ctx.call("POST", "/v1/me/accounts/google/reveal-password", { cookie: owner, body: {} })).statusCode).toBe(403);
    expect((await ctx.call("POST", "/v1/me/accounts/google/reveal-password", { body: {} })).statusCode).toBe(401);
    const resets = google.calls.filter((call) => call.startsWith("reset")).length;
    expect((await ctx.call("POST", "/v1/me/accounts/google/reveal-password", { cookie: other.cookie, body: {} })).statusCode).toBe(409);
    expect(google.calls.filter((call) => call.startsWith("reset")).length).toBe(resets);
    const [row] = await ctx.db.select({ crmPhone: brokers.crmPhone }).from(brokers).where(eq(brokers.id, other.brokerId));
    expect(row!.crmPhone).toBeNull();
  });
});

describe("account provisioning routes, nothing configured", () => {
  let ctx: TestContext;
  let owner: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    owner = await ctx.login(OWNER.email, OWNER.password);
  });
  afterAll(async () => ctx?.close());

  it("shows Not configured everywhere and skips every action", async () => {
    const created = await ctx.createBroker({ name: "Quiet Broker", email: "quiet@example.com", status: "active" });
    const { google, ghl, body } = await accountsOf(ctx, owner, created.brokerId);
    expect([google.status, ghl.status]).toEqual(["not_configured", "not_configured"]);
    expect(body.googleDomain).toBeNull();
    expect((await ctx.call("POST", `/v1/admin/brokers/${created.brokerId}/accounts/google/retry`, { cookie: owner, body: {} })).statusCode).toBe(409);
    await ctx.call("PUT", `/v1/admin/brokers/${created.brokerId}/corporate-email`, { cookie: owner, body: { email: "quiet.broker@365yachts.org" } });
    expect((await ctx.call("POST", `/v1/admin/brokers/${created.brokerId}/accounts/link`, { cookie: owner, body: {} })).json()).toEqual({
      queued: [],
      skipped: [
        { system: "google", reason: "Not configured" },
        { system: "ghl", reason: "Not configured" },
      ],
    });
    const integrations = (await ctx.call("GET", "/v1/admin/integrations", { cookie: owner })).json() as { systems: { configured: boolean; problem: string }[] };
    expect(integrations.systems.map((system) => system.configured)).toEqual([false, false]);
    expect(integrations.systems[0]!.problem).toMatch(/^Missing GOOGLE_SERVICE_ACCOUNT_JSON/);
    expect((await ctx.call("POST", "/v1/admin/integrations/ghl/test", { cookie: owner, body: {} })).json()).toMatchObject({ ok: false, message: expect.stringMatching(/^Not configured/) });
    expect((await ctx.call("PATCH", `/v1/admin/brokers/${created.brokerId}`, { cookie: owner, body: { status: "inactive", leftAt: "2026-10-18" } })).statusCode).toBe(200);
    expect(await ctx.runProvisioning()).toBe(0);
    expect((await ctx.call("GET", "/v1/me/accounts", { cookie: (await ctx.createBroker({ name: "Fresh One", email: "fresh@example.com" })).cookie })).json()).toMatchObject({ googleConfigured: false, googleReady: false });
  });
});
