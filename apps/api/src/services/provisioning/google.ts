/**
 * File: apps/api/src/services/provisioning/google.ts
 * Purpose: Google Workspace client for the Admin SDK Directory API. It signs in as the service account with
 * domain-wide delegation, impersonating GOOGLE_ADMIN_SUBJECT with the admin.directory.user scope (a signed RS256 JWT
 * exchanged for an access token, cached until shortly before it expires), and can look up, create, suspend,
 * unsuspend, reset the password of and delete users. Every failure becomes a ProvisioningError in plain words.
 * Passwords are sent to Google only and never logged or stored.
 *
 * Functions:
 * - base64Url(input): base64url-encodes a string or buffer (no padding), as JWTs need.
 * - createGoogleClient(config, fetchImpl): returns the client below.
 * - accessToken(): returns a cached or fresh access token for the impersonated admin.
 * - tokenError(status, text): turns a failed token exchange into the right plain-words error.
 * - request(method, path, body): calls the Directory API and returns the parsed JSON, null for 404, or throws a ProvisioningError.
 * - apiError(status, text): turns a failed Directory API call into the right plain-words error.
 * - toGoogleUser(body): shapes a Directory API user into { id, email, suspended, brokerId }.
 * - findUser(email): looks a user up by address (or alias); returns it or null.
 * - createUser(input): creates the user (temporary password, change at next login, org unit, recovery phone, portal tag) and returns it.
 * - setSuspended(userId, suspended): suspends or unsuspends a user.
 * - resetPassword(userId, password): sets a new temporary password that must be changed at next login.
 * - deleteUser(userId): deletes a user (only used by provision:verify for its own test user).
 * - testConnection(): one harmless read: looks up GOOGLE_ADMIN_SUBJECT; returns a message saying who it found.
 */
import { createSign } from "node:crypto";
import { ProvisioningError, isRetryableStatus, readErrorText, toProvisioningError } from "./errors";
import type { GoogleConfig } from "./config";

export const GOOGLE_DIRECTORY_SCOPE = "https://www.googleapis.com/auth/admin.directory.user";
const DIRECTORY_BASE = "https://admin.googleapis.com/admin/directory/v1";
export const PORTAL_EXTERNAL_ID_TYPE = "broker_portal_id";

export type GoogleUser = { id: string; email: string; suspended: boolean; brokerId: string | null };

export type GoogleCreateInput = {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  recoveryPhone: string | null;
  brokerId: string;
};

export type GoogleClient = {
  domain: string;
  dryRun?: true;
  findUser(email: string): Promise<GoogleUser | null>;
  createUser(input: GoogleCreateInput): Promise<GoogleUser>;
  setSuspended(userId: string, suspended: boolean): Promise<void>;
  resetPassword(userId: string, password: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  testConnection(): Promise<string>;
};

function base64Url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

export function createGoogleClient(config: GoogleConfig, fetchImpl: typeof fetch = fetch): GoogleClient {
  let cached: { token: string; expiresAt: number } | null = null;

  function tokenError(status: number, text: string): ProvisioningError {
    if (/unauthorized_client|not authorized for any of the scopes/i.test(text)) {
      return new ProvisioningError("google", "Google: the service account isn't authorized. Check domain-wide delegation for the admin.directory.user scope.", { status });
    }
    if (/invalid_grant|invalid email or user id/i.test(text)) {
      return new ProvisioningError("google", "Google: the sign-in was refused. Check that GOOGLE_ADMIN_SUBJECT is an existing Workspace admin and the service account key is current.", { status });
    }
    if (/invalid_client|invalid_signature|no key/i.test(text)) {
      return new ProvisioningError("google", "Google: the service account key was rejected. Create a new JSON key and update GOOGLE_SERVICE_ACCOUNT_JSON.", { status });
    }
    return new ProvisioningError("google", `Google: couldn't sign in (${status}${text ? `: ${text}` : ""}).`, { status, retryable: isRetryableStatus(status) });
  }

  async function accessToken(): Promise<string> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (cached && cached.expiresAt - 60 > nowSeconds) return cached.token;
    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = base64Url(
      JSON.stringify({ iss: config.clientEmail, sub: config.adminSubject, scope: GOOGLE_DIRECTORY_SCOPE, aud: config.tokenUri, iat: nowSeconds, exp: nowSeconds + 3600 }),
    );
    let signature: string;
    try {
      signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(config.privateKey, "base64url");
    } catch {
      throw new ProvisioningError("google", "Google: the private key in GOOGLE_SERVICE_ACCOUNT_JSON can't be read. Create a new JSON key and paste it again.");
    }
    let response: Response;
    try {
      response = await fetchImpl(config.tokenUri, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${signature}` }).toString(),
      });
    } catch (error) {
      throw toProvisioningError("google", error);
    }
    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      throw tokenError(response.status, raw.slice(0, 300));
    }
    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new ProvisioningError("google", "Google: the sign-in answer had no access token.", { retryable: true });
    cached = { token: body.access_token, expiresAt: nowSeconds + (body.expires_in ?? 3600) };
    return body.access_token;
  }

  function apiError(status: number, text: string): ProvisioningError {
    if (status === 401) return new ProvisioningError("google", "Google: the service account isn't authorized. Check domain-wide delegation.", { status });
    if (status === 403) {
      return new ProvisioningError("google", `Google: GOOGLE_ADMIN_SUBJECT isn't allowed to manage users. Use a super admin, or check the domain.${text ? ` (${text})` : ""}`, { status });
    }
    if (status === 409) return new ProvisioningError("google", "Google: that address is already taken by another account.", { status });
    if (/INVALID_OU_ID|org ?unit/i.test(text)) return new ProvisioningError("google", "Google: GOOGLE_ORG_UNIT doesn't exist in Workspace. Check the org unit path.", { status });
    if (/phone/i.test(text) && status === 400) return new ProvisioningError("google", `Google: the recovery phone was refused (${text}).`, { status });
    if (status === 429) return new ProvisioningError("google", "Google: too many requests right now. We'll try again.", { status, retryable: true });
    if (status >= 500) return new ProvisioningError("google", "Google is having trouble right now. We'll try again.", { status, retryable: true });
    return new ProvisioningError("google", `Google refused the request (${status}${text ? `: ${text}` : ""}).`, { status, retryable: isRetryableStatus(status) });
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    const token = await accessToken();
    let response: Response;
    try {
      response = await fetchImpl(`${DIRECTORY_BASE}${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw toProvisioningError("google", error);
    }
    if (response.status === 404) return null;
    if (!response.ok) throw apiError(response.status, await readErrorText(response));
    if (response.status === 204) return {} as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  function toGoogleUser(body: Record<string, unknown>): GoogleUser {
    const externalIds = Array.isArray(body.externalIds) ? (body.externalIds as { customType?: string; value?: string }[]) : [];
    const tag = externalIds.find((entry) => entry.customType === PORTAL_EXTERNAL_ID_TYPE);
    return { id: String(body.id), email: String(body.primaryEmail).toLowerCase(), suspended: body.suspended === true, brokerId: tag?.value ?? null };
  }

  return {
    domain: config.domain,
    async findUser(email) {
      const body = await request<Record<string, unknown>>("GET", `/users/${encodeURIComponent(email.toLowerCase())}?projection=basic`);
      return body ? toGoogleUser(body) : null;
    },
    async createUser(input) {
      const body = await request<Record<string, unknown>>("POST", "/users", {
        primaryEmail: input.email,
        name: { givenName: input.firstName, familyName: input.lastName || input.firstName },
        password: input.password,
        changePasswordAtNextLogin: true,
        ...(config.orgUnit ? { orgUnitPath: config.orgUnit } : {}),
        ...(input.recoveryPhone ? { recoveryPhone: input.recoveryPhone } : {}),
        externalIds: [{ type: "custom", customType: PORTAL_EXTERNAL_ID_TYPE, value: input.brokerId }],
      });
      if (!body) throw new ProvisioningError("google", "Google: the users API wasn't found. Check that the Admin SDK API is enabled.", { status: 404 });
      return toGoogleUser(body);
    },
    async setSuspended(userId, suspended) {
      const body = await request("PUT", `/users/${encodeURIComponent(userId)}`, { suspended });
      if (!body) throw new ProvisioningError("google", "Google: that account no longer exists.", { status: 404 });
    },
    async resetPassword(userId, password) {
      const body = await request("PUT", `/users/${encodeURIComponent(userId)}`, { password, changePasswordAtNextLogin: true });
      if (!body) throw new ProvisioningError("google", "Google: that account no longer exists.", { status: 404 });
    },
    async deleteUser(userId) {
      await request("DELETE", `/users/${encodeURIComponent(userId)}`);
    },
    async testConnection() {
      const admin = await this.findUser(config.adminSubject);
      if (!admin) throw new ProvisioningError("google", `Google: signed in, but ${config.adminSubject} wasn't found in Workspace.`);
      return `Connected to Google Workspace as ${admin.email} (domain ${config.domain}).`;
    },
  };
}
