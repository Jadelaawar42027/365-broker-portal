/**
 * File: apps/api/test/provisioning-clients.test.ts
 * Purpose: Unit tests for the Google Workspace and GoHighLevel clients and the integration config, with fetch mocked:
 * the requests match the providers' documented APIs (token exchange, Directory API paths and bodies, GHL Version header
 * and bodies), lookups return null on 404 or no match, failures become plain-words errors with the right retryability,
 * and missing or malformed variables leave a system "not configured".
 *
 * Functions:
 * - fakeFetch(handler): a fetch stand-in that records every call and answers with handler(url, init).
 * - json(status, body): a JSON Response.
 * - googleConfig(): a configured Google config with a freshly generated RSA key.
 * - testEnv(extra): a valid API environment plus the given variables.
 */
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadApiEnv } from "../src/env";
import { integrationWarnings, readGhlConfig, readGoogleConfig, readIntegrationConfig, type GhlConfig, type GoogleConfig } from "../src/services/provisioning/config";
import { ProvisioningError } from "../src/services/provisioning/errors";
import { createGhlClient, GHL_API_VERSION } from "../src/services/provisioning/ghl";
import { createGoogleClient, GOOGLE_DIRECTORY_SCOPE } from "../src/services/provisioning/google";

type Call = { url: string; method: string; headers: Record<string, string>; body: string | undefined };

function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, method: init.method ?? "GET", headers: (init.headers ?? {}) as Record<string, string>, body: init.body as string | undefined });
    return handler(url, init);
  }) as typeof fetch;
  return { impl, calls };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

function googleConfig(): GoogleConfig {
  return {
    configured: true,
    clientEmail: "portal@project.iam.gserviceaccount.com",
    privateKey: PEM,
    tokenUri: "https://oauth2.googleapis.com/token",
    adminSubject: "admin@365yachts.org",
    domain: "365yachts.org",
    orgUnit: "/Brokers",
  };
}

const GHL: GhlConfig = { configured: true, agencyToken: "pit-agency-token", companyId: "company-1", locationId: "location-1" };

function testEnv(extra: Record<string, string> = {}) {
  return loadApiEnv({
    NODE_ENV: "test",
    DATABASE_URL: "postgres://localhost/test",
    BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
    S3_BUCKET: "bucket",
    S3_ACCESS_KEY_ID: "key",
    S3_SECRET_ACCESS_KEY: "secret",
    ...extra,
  });
}

describe("integration config", () => {
  it("reports both systems as not configured when nothing is set, with one warning each", () => {
    const config = readIntegrationConfig(testEnv());
    expect(config.google).toEqual({ configured: false, problem: "Missing GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_ADMIN_SUBJECT, GOOGLE_DOMAIN." });
    expect(config.ghl).toEqual({ configured: false, problem: "Missing GHL_AGENCY_TOKEN, GHL_COMPANY_ID, GHL_LOCATION_ID." });
    expect(integrationWarnings(config)).toHaveLength(2);
  });

  it("names a malformed service account key instead of failing to start", () => {
    const google = readGoogleConfig(testEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: "{not json", GOOGLE_ADMIN_SUBJECT: "admin@365yachts.org", GOOGLE_DOMAIN: "365yachts.org" }));
    expect(google.configured).toBe(false);
    expect(google.configured ? "" : google.problem).toMatch(/isn't valid JSON/);
    const noKey = readGoogleConfig(testEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: "{}", GOOGLE_ADMIN_SUBJECT: "admin@365yachts.org", GOOGLE_DOMAIN: "365yachts.org" }));
    expect(noKey.configured ? "" : noKey.problem).toMatch(/no client_email or private_key/);
  });

  it("reads a complete Google configuration, turning escaped newlines in the key into real ones", () => {
    const key = JSON.stringify({ client_email: "sa@x.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n" });
    const google = readGoogleConfig(testEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: key, GOOGLE_ADMIN_SUBJECT: "Admin@365yachts.org", GOOGLE_DOMAIN: "365Yachts.org", GOOGLE_ORG_UNIT: "/Brokers" }));
    expect(google).toMatchObject({ configured: true, adminSubject: "admin@365yachts.org", domain: "365yachts.org", orgUnit: "/Brokers" });
    expect(google.configured && google.privateKey.includes("\n")).toBe(true);
    const badOu = readGoogleConfig(testEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: key, GOOGLE_ADMIN_SUBJECT: "admin@365yachts.org", GOOGLE_DOMAIN: "365yachts.org", GOOGLE_ORG_UNIT: "Brokers" }));
    expect(badOu.configured).toBe(false);
  });

  it("reads a complete GHL configuration and refuses a token pasted with Bearer", () => {
    expect(readGhlConfig(testEnv({ GHL_AGENCY_TOKEN: "pit-1", GHL_COMPANY_ID: "c", GHL_LOCATION_ID: "l" }))).toEqual({ configured: true, agencyToken: "pit-1", companyId: "c", locationId: "l" });
    expect(readGhlConfig(testEnv({ GHL_AGENCY_TOKEN: "Bearer pit-1", GHL_COMPANY_ID: "c", GHL_LOCATION_ID: "l" })).configured).toBe(false);
  });
});

describe("Google client", () => {
  it("signs a JWT for the admin subject and scope, then reuses the token", async () => {
    const { impl, calls } = fakeFetch((url) => (url.includes("oauth2") ? json(200, { access_token: "tok", expires_in: 3600 }) : json(404, { error: { message: "Resource Not Found: userKey" } })));
    const client = createGoogleClient(googleConfig(), impl);
    expect(await client.findUser("Jane.Doe@365yachts.org")).toBeNull();
    expect(await client.findUser("other@365yachts.org")).toBeNull();
    const tokenCalls = calls.filter((call) => call.url.includes("oauth2"));
    expect(tokenCalls).toHaveLength(1);
    const assertion = new URLSearchParams(tokenCalls[0]!.body).get("assertion")!;
    const claims = JSON.parse(Buffer.from(assertion.split(".")[1]!, "base64url").toString()) as Record<string, unknown>;
    expect(claims).toMatchObject({ iss: "portal@project.iam.gserviceaccount.com", sub: "admin@365yachts.org", scope: GOOGLE_DIRECTORY_SCOPE });
    expect(calls[1]!.url).toBe("https://admin.googleapis.com/admin/directory/v1/users/jane.doe%40365yachts.org?projection=basic");
    expect(calls[1]!.headers.authorization).toBe("Bearer tok");
  });

  it("creates a user with a temporary password, change at next login, org unit, recovery phone and the portal tag", async () => {
    const { impl, calls } = fakeFetch((url, init) =>
      url.includes("oauth2") ? json(200, { access_token: "tok" }) : json(200, { id: "g-1", primaryEmail: "jane.doe@365yachts.org", suspended: false, ...JSON.parse(String(init.body)) }),
    );
    const user = await createGoogleClient(googleConfig(), impl).createUser({ email: "jane.doe@365yachts.org", firstName: "Jane", lastName: "Doe", password: "Temp-Password-123!", recoveryPhone: "+15615550123", brokerId: "b-1" });
    expect(user).toEqual({ id: "g-1", email: "jane.doe@365yachts.org", suspended: false, brokerId: "b-1" });
    const body = JSON.parse(calls[1]!.body!) as Record<string, unknown>;
    expect(calls[1]!.method).toBe("POST");
    expect(body).toMatchObject({
      primaryEmail: "jane.doe@365yachts.org",
      name: { givenName: "Jane", familyName: "Doe" },
      changePasswordAtNextLogin: true,
      orgUnitPath: "/Brokers",
      recoveryPhone: "+15615550123",
    });
  });

  it("explains a missing domain-wide delegation in plain words and does not retry it", async () => {
    const { impl } = fakeFetch(() => json(401, { error: "unauthorized_client", error_description: "Client is unauthorized to retrieve access tokens using this method, or client not authorized for any of the scopes requested." }));
    const failure = await createGoogleClient(googleConfig(), impl).findUser("a@365yachts.org").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ProvisioningError);
    expect((failure as ProvisioningError).message).toBe("Google: the service account isn't authorized. Check domain-wide delegation for the admin.directory.user scope.");
    expect((failure as ProvisioningError).retryable).toBe(false);
  });

  it("marks server errors and network failures as worth retrying", async () => {
    const server = fakeFetch((url) => (url.includes("oauth2") ? json(200, { access_token: "tok" }) : json(503, { error: { message: "Backend Error" } })));
    const serverError = (await createGoogleClient(googleConfig(), server.impl).findUser("a@365yachts.org").catch((error: unknown) => error)) as ProvisioningError;
    expect(serverError.retryable).toBe(true);
    const offline = fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    const network = (await createGoogleClient(googleConfig(), offline.impl).findUser("a@365yachts.org").catch((error: unknown) => error)) as ProvisioningError;
    expect(network.retryable).toBe(true);
    expect(network.message).toMatch(/^Google: couldn't reach/);
  });

  it("suspends, unsuspends and resets passwords with PUT on the user", async () => {
    const { impl, calls } = fakeFetch((url) => (url.includes("oauth2") ? json(200, { access_token: "tok" }) : json(200, { id: "g-1" })));
    const client = createGoogleClient(googleConfig(), impl);
    await client.setSuspended("g-1", true);
    await client.resetPassword("g-1", "New-Temp-Password-1!");
    const puts = calls.filter((call) => call.method === "PUT");
    expect(puts.map((call) => JSON.parse(call.body!))).toEqual([{ suspended: true }, { password: "New-Temp-Password-1!", changePasswordAtNextLogin: true }]);
  });
});

describe("GoHighLevel client", () => {
  it("looks users up by email with the agency token and API version, matching the address exactly", async () => {
    const { impl, calls } = fakeFetch(() => json(200, { users: [{ id: "u-1", email: "Jane.Doe@365yachts.org" }], count: 1 }));
    const client = createGhlClient(GHL, impl);
    expect(await client.findUserByEmail("jane.doe@365yachts.org")).toEqual({ id: "u-1", email: "jane.doe@365yachts.org" });
    expect(calls[0]!.url).toBe("https://services.leadconnectorhq.com/users/search/filter-by-email");
    expect(calls[0]!.headers).toMatchObject({ authorization: "Bearer pit-agency-token", version: GHL_API_VERSION });
    expect(JSON.parse(calls[0]!.body!)).toMatchObject({ companyId: "company-1", emails: "jane.doe@365yachts.org", deleted: false });
  });

  it("returns null when no user has that exact address", async () => {
    const { impl } = fakeFetch(() => json(200, { users: [{ id: "u-2", email: "jane.doe2@365yachts.org" }] }));
    expect(await createGhlClient(GHL, impl).findUserByEmail("jane.doe@365yachts.org")).toBeNull();
  });

  it("creates the user in the location with role user and the personal phone", async () => {
    const { impl, calls } = fakeFetch(() => json(201, { id: "u-9", email: "jane.doe@365yachts.org" }));
    const user = await createGhlClient(GHL, impl).createUser({ email: "jane.doe@365yachts.org", firstName: "Jane", lastName: "Doe", phone: "+15615550123", password: "Temp-Password-123!" });
    expect(user).toEqual({ id: "u-9", email: "jane.doe@365yachts.org" });
    expect(calls[0]!.url).toBe("https://services.leadconnectorhq.com/users/");
    expect(JSON.parse(calls[0]!.body!)).toMatchObject({ companyId: "company-1", firstName: "Jane", lastName: "Doe", email: "jane.doe@365yachts.org", phone: "+15615550123", type: "account", role: "user", locationIds: ["location-1"] });
  });

  it("explains a rejected token and a missing scope in plain words", async () => {
    const unauthorized = (await createGhlClient(GHL, fakeFetch(() => json(401, { message: "Invalid JWT" })).impl).findUserByEmail("a@b.org").catch((error: unknown) => error)) as ProvisioningError;
    expect(unauthorized.message).toMatch(/^GHL: the token was rejected/);
    const forbidden = (await createGhlClient(GHL, fakeFetch(() => json(403, { message: "The token is not authorized for this scope." })).impl).deleteUser("u-1").catch((error: unknown) => error)) as ProvisioningError;
    expect(forbidden.message).toMatch(/users\.readonly, users\.write, locations\.readonly/);
    expect(forbidden.retryable).toBe(false);
  });

  it("tests the connection by reading the location", async () => {
    const { impl, calls } = fakeFetch(() => json(200, { location: { id: "location-1", name: "365 Yachts" } }));
    expect(await createGhlClient(GHL, impl).testConnection()).toBe('Connected to GoHighLevel location "365 Yachts".');
    expect(calls[0]!.url).toBe("https://services.leadconnectorhq.com/locations/location-1");
    expect(calls[0]!.method).toBe("GET");
  });
});
