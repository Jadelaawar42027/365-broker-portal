/**
 * File: apps/api/src/services/provisioning/ghl.ts
 * Purpose: GoHighLevel client for API v2 (https://services.leadconnectorhq.com, header Version: 2021-07-28), built to
 * the official OpenAPI files in github.com/gohighlevel/api-v2-docs (apps/users.json, apps/locations.json; see
 * docs/DEPLOY.md). It uses an agency Private Integration token: filter-by-email only accepts agency access. Users are
 * looked up by email, created in GHL_LOCATION_ID with role "user" (type "account"), and removed with DELETE, the only
 * way the API offers to take a user's access away. Every failure becomes a ProvisioningError in plain words.
 *
 * Functions:
 * - createGhlClient(config, fetchImpl): returns the client below.
 * - request(method, path, body): calls the API with the token and Version header; returns the parsed JSON, null for 404, or throws.
 * - apiError(status, text): turns a failed call into the right plain-words error.
 * - findUserByEmail(email): POST /users/search/filter-by-email for one address (not deleted); returns { id, email } or null.
 * - createUser(input): POST /users/ in the location with role user; returns { id, email }.
 * - deleteUser(userId): DELETE /users/{userId} (GHL queues it; it takes effect within minutes). A missing user counts as done.
 * - testConnection(): one harmless read: GET /locations/{GHL_LOCATION_ID}; returns a message naming the location.
 */
import { ProvisioningError, isRetryableStatus, readErrorText, toProvisioningError } from "./errors";
import type { GhlConfig } from "./config";

export const GHL_API_BASE = "https://services.leadconnectorhq.com";
export const GHL_API_VERSION = "2021-07-28";
export const GHL_REQUIRED_SCOPES = ["users.readonly", "users.write", "locations.readonly"] as const;

export type GhlUser = { id: string; email: string };

export type GhlCreateInput = { email: string; firstName: string; lastName: string; phone: string | null; password: string };

export type GhlClient = {
  locationId: string;
  findUserByEmail(email: string): Promise<GhlUser | null>;
  createUser(input: GhlCreateInput): Promise<GhlUser>;
  deleteUser(userId: string): Promise<void>;
  testConnection(): Promise<string>;
};

export function createGhlClient(config: GhlConfig, fetchImpl: typeof fetch = fetch): GhlClient {
  function apiError(status: number, text: string): ProvisioningError {
    if (status === 401) return new ProvisioningError("ghl", "GHL: the token was rejected. Check GHL_AGENCY_TOKEN is a current agency Private Integration token.", { status });
    if (status === 403) {
      return new ProvisioningError("ghl", `GHL: the token isn't allowed to do this. Give the agency Private Integration the scopes ${GHL_REQUIRED_SCOPES.join(", ")}.`, { status });
    }
    if (status === 429) return new ProvisioningError("ghl", "GHL: too many requests right now. We'll try again.", { status, retryable: true });
    if (status >= 500) return new ProvisioningError("ghl", "GHL is having trouble right now. We'll try again.", { status, retryable: true });
    if (/already exist|duplicate/i.test(text)) return new ProvisioningError("ghl", "GHL: a user with this email already exists. Use \"Link existing account\".", { status });
    return new ProvisioningError("ghl", `GHL refused the request (${status}${text ? `: ${text}` : ""}).`, { status, retryable: isRetryableStatus(status) });
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    let response: Response;
    try {
      response = await fetchImpl(`${GHL_API_BASE}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${config.agencyToken}`,
          version: GHL_API_VERSION,
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw toProvisioningError("ghl", error);
    }
    if (response.status === 404) return null;
    if (!response.ok) throw apiError(response.status, await readErrorText(response));
    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  return {
    locationId: config.locationId,
    async findUserByEmail(email) {
      const target = email.toLowerCase();
      const body = await request<{ users?: { id?: string; email?: string }[] }>("POST", "/users/search/filter-by-email", {
        companyId: config.companyId,
        emails: target,
        deleted: false,
        skip: "0",
        limit: "10",
      });
      const match = (body?.users ?? []).find((user) => user.id && user.email?.toLowerCase() === target);
      return match ? { id: match.id!, email: target } : null;
    },
    async createUser(input) {
      const body = await request<{ id?: string; email?: string }>("POST", "/users/", {
        companyId: config.companyId,
        firstName: input.firstName,
        lastName: input.lastName || input.firstName,
        email: input.email,
        password: input.password,
        ...(input.phone ? { phone: input.phone } : {}),
        type: "account",
        role: "user",
        locationIds: [config.locationId],
      });
      if (!body?.id) throw new ProvisioningError("ghl", "GHL: the user was not created (no id came back). We'll try again.", { retryable: true });
      return { id: body.id, email: input.email.toLowerCase() };
    },
    async deleteUser(userId) {
      await request("DELETE", `/users/${encodeURIComponent(userId)}`);
    },
    async testConnection() {
      const body = await request<{ location?: { name?: string; id?: string } }>("GET", `/locations/${encodeURIComponent(config.locationId)}`);
      if (!body) throw new ProvisioningError("ghl", "GHL: GHL_LOCATION_ID wasn't found. Check the sub-account's location id.", { status: 404 });
      return `Connected to GoHighLevel location "${body.location?.name ?? config.locationId}".`;
    },
  };
}
