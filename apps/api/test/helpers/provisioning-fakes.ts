/**
 * File: apps/api/test/helpers/provisioning-fakes.ts
 * Purpose: In-memory stand-ins for the Google Workspace and GoHighLevel clients, for integration tests only. They keep
 * their users in maps, record every call, and can be told to fail the next calls (retryable or not) so tests can drive
 * retries, partial failures and idempotency without the real services.
 *
 * Functions:
 * - createFakeGoogle(domain): a fake GoogleClient plus its users, calls and failNext(count, error). Users have
 *   firstPasswordPending (true until a test sets it false), which stillOnFirstPassword reports without recording a call.
 * - createFakeGhl(): a fake GhlClient plus its users, calls and failNext(count, error).
 * - fakeIntegrations(google, ghl): an Integrations object with the given fakes (null = not configured).
 * - maybeFail(state): throws the queued failure, if any, counting it down.
 */
import { ProvisioningError } from "../../src/services/provisioning/errors";
import type { GhlClient, GhlUser } from "../../src/services/provisioning/ghl";
import type { GoogleClient, GoogleUser } from "../../src/services/provisioning/google";
import type { Integrations } from "../../src/services/provisioning/integrations";

type FailState = { remaining: number; error: ProvisioningError | null };

function maybeFail(state: FailState): void {
  if (state.remaining > 0 && state.error) {
    state.remaining -= 1;
    throw state.error;
  }
}

export function createFakeGoogle(domain = "365yachts.org") {
  const users = new Map<string, GoogleUser & { passwordSets: number; recoveryPhone: string | null; firstPasswordPending: boolean }>();
  const calls: string[] = [];
  const fail: FailState = { remaining: 0, error: null };
  let nextId = 1;
  const client: GoogleClient = {
    domain,
    async findUser(email) {
      calls.push(`find ${email}`);
      maybeFail(fail);
      const user = users.get(email.toLowerCase());
      return user ? { id: user.id, email: user.email, suspended: user.suspended, brokerId: user.brokerId } : null;
    },
    async createUser(input) {
      calls.push(`create ${input.email}`);
      maybeFail(fail);
      if (users.has(input.email)) throw new ProvisioningError("google", "Google: that address is already taken by another account.", { status: 409 });
      const user = { id: `g-${nextId++}`, email: input.email, suspended: false, brokerId: input.brokerId, passwordSets: 1, recoveryPhone: input.recoveryPhone, firstPasswordPending: true };
      users.set(input.email, user);
      return { id: user.id, email: user.email, suspended: false, brokerId: user.brokerId };
    },
    async setSuspended(userId, suspended) {
      calls.push(`${suspended ? "suspend" : "unsuspend"} ${userId}`);
      maybeFail(fail);
      const user = [...users.values()].find((entry) => entry.id === userId);
      if (!user) throw new ProvisioningError("google", "Google: that account no longer exists.", { status: 404 });
      user.suspended = suspended;
    },
    async resetPassword(userId) {
      calls.push(`reset ${userId}`);
      maybeFail(fail);
      const user = [...users.values()].find((entry) => entry.id === userId);
      if (!user) throw new ProvisioningError("google", "Google: that account no longer exists.", { status: 404 });
      user.passwordSets += 1;
    },
    async stillOnFirstPassword(userId) {
      return [...users.values()].find((entry) => entry.id === userId)?.firstPasswordPending ?? false;
    },
    async deleteUser(userId) {
      calls.push(`delete ${userId}`);
      for (const [email, user] of users) if (user.id === userId) users.delete(email);
    },
    async testConnection() {
      calls.push("test");
      maybeFail(fail);
      return `Connected to Google Workspace (domain ${domain}).`;
    },
  };
  return {
    client,
    users,
    calls,
    addExisting(email: string, brokerId: string | null = null) {
      const user = { id: `g-existing-${nextId++}`, email, suspended: false, brokerId, passwordSets: 1, recoveryPhone: null, firstPasswordPending: false };
      users.set(email, user);
      return user;
    },
    failNext(count: number, error: ProvisioningError) {
      fail.remaining = count;
      fail.error = error;
    },
  };
}

export function createFakeGhl() {
  const users = new Map<string, GhlUser & { phone: string | null; firstName: string; lastName: string }>();
  const calls: string[] = [];
  const fail: FailState = { remaining: 0, error: null };
  let nextId = 1;
  const client: GhlClient = {
    locationId: "location-1",
    async findUserByEmail(email) {
      calls.push(`find ${email}`);
      maybeFail(fail);
      const user = users.get(email.toLowerCase());
      return user ? { id: user.id, email: user.email } : null;
    },
    async createUser(input) {
      calls.push(`create ${input.email}`);
      maybeFail(fail);
      const user = { id: `ghl-${nextId++}`, email: input.email, phone: input.phone, firstName: input.firstName, lastName: input.lastName };
      users.set(input.email, user);
      return { id: user.id, email: user.email };
    },
    async deleteUser(userId) {
      calls.push(`delete ${userId}`);
      maybeFail(fail);
      for (const [email, user] of users) if (user.id === userId) users.delete(email);
    },
    async testConnection() {
      calls.push("test");
      maybeFail(fail);
      return 'Connected to GoHighLevel location "365 Yachts".';
    },
  };
  return {
    client,
    users,
    calls,
    addExisting(email: string) {
      const user = { id: `ghl-existing-${nextId++}`, email, phone: null, firstName: "", lastName: "" };
      users.set(email, user);
      return user;
    },
    failNext(count: number, error: ProvisioningError) {
      fail.remaining = count;
      fail.error = error;
    },
  };
}

export function fakeIntegrations(google: GoogleClient | null, ghl: GhlClient | null): Integrations {
  return {
    config: {
      google: google
        ? { configured: true, clientEmail: "sa@test.iam.gserviceaccount.com", privateKey: "", tokenUri: "", adminSubject: "admin@365yachts.org", domain: google.domain, orgUnit: null }
        : { configured: false, problem: "Missing GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_ADMIN_SUBJECT, GOOGLE_DOMAIN." },
      ghl: ghl
        ? { configured: true, agencyToken: "token", companyId: "company-1", locationId: ghl.locationId }
        : { configured: false, problem: "Missing GHL_AGENCY_TOKEN, GHL_COMPANY_ID, GHL_LOCATION_ID." },
    },
    google,
    ghl,
  };
}
