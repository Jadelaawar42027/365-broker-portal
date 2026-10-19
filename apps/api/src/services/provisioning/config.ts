/**
 * File: apps/api/src/services/provisioning/config.ts
 * Purpose: Reads the Google Workspace and GoHighLevel settings from the validated API environment. A system with a
 * missing or malformed variable is "not configured" (with a reason naming what's wrong) and is skipped; the API
 * still starts. Adding the variables later turns the system on with no code change. With PROVISIONING_MODE=dry-run
 * both systems count as configured with placeholder settings (only GOOGLE_DOMAIN and GHL_LOCATION_ID are used, and are
 * optional) and nothing is sent anywhere.
 *
 * Functions:
 * - readGoogleConfig(env): the Google settings, or { configured: false, problem } naming what is missing or malformed.
 * - readGhlConfig(env): the GoHighLevel settings, or { configured: false, problem }.
 * - readDryRunConfig(env): placeholder settings for both systems in dry-run mode (domain defaults to 365yachts.org).
 * - readIntegrationConfig(env): both systems, live or dry-run depending on PROVISIONING_MODE.
 * - integrationWarnings(config): one warning line per system that isn't configured (or one saying dry-run is on), for the start-up log.
 */
import type { ApiEnv } from "../../env";

export type GoogleConfig = {
  configured: true;
  clientEmail: string;
  privateKey: string;
  tokenUri: string;
  adminSubject: string;
  domain: string;
  orgUnit: string | null;
};

export type GhlConfig = {
  configured: true;
  agencyToken: string;
  companyId: string;
  locationId: string;
};

export type NotConfigured = { configured: false; problem: string };

export type IntegrationConfig = { google: GoogleConfig | NotConfigured; ghl: GhlConfig | NotConfigured; dryRun?: boolean };

export type IntegrationEnv = Pick<
  ApiEnv,
  "GOOGLE_SERVICE_ACCOUNT_JSON" | "GOOGLE_ADMIN_SUBJECT" | "GOOGLE_DOMAIN" | "GOOGLE_ORG_UNIT" | "GHL_AGENCY_TOKEN" | "GHL_COMPANY_ID" | "GHL_LOCATION_ID"
> &
  Partial<Pick<ApiEnv, "PROVISIONING_MODE">>;

const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";

export function readGoogleConfig(env: IntegrationEnv): GoogleConfig | NotConfigured {
  const missing = (["GOOGLE_SERVICE_ACCOUNT_JSON", "GOOGLE_ADMIN_SUBJECT", "GOOGLE_DOMAIN"] as const).filter((name) => !env[name]);
  if (missing.length > 0) return { configured: false, problem: `Missing ${missing.join(", ")}.` };
  let key: Record<string, unknown>;
  try {
    key = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON!) as Record<string, unknown>;
  } catch {
    return { configured: false, problem: "GOOGLE_SERVICE_ACCOUNT_JSON isn't valid JSON. Paste the whole key file as one value." };
  }
  if (typeof key.client_email !== "string" || typeof key.private_key !== "string" || !key.private_key.includes("PRIVATE KEY")) {
    return { configured: false, problem: "GOOGLE_SERVICE_ACCOUNT_JSON has no client_email or private_key. Use the service account's JSON key file." };
  }
  const domain = env.GOOGLE_DOMAIN!.toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return { configured: false, problem: "GOOGLE_DOMAIN should be a domain like 365yachts.org." };
  if (!/^[^@\s]+@[^@\s]+$/.test(env.GOOGLE_ADMIN_SUBJECT!)) return { configured: false, problem: "GOOGLE_ADMIN_SUBJECT should be a Workspace admin's email address." };
  const orgUnit = env.GOOGLE_ORG_UNIT ?? null;
  if (orgUnit && !orgUnit.startsWith("/")) return { configured: false, problem: "GOOGLE_ORG_UNIT should be an org unit path starting with /, like /Brokers." };
  return {
    configured: true,
    clientEmail: key.client_email,
    privateKey: key.private_key.replace(/\\n/g, "\n"),
    tokenUri: typeof key.token_uri === "string" ? key.token_uri : GOOGLE_TOKEN_URI,
    adminSubject: env.GOOGLE_ADMIN_SUBJECT!.toLowerCase(),
    domain,
    orgUnit,
  };
}

export function readGhlConfig(env: IntegrationEnv): GhlConfig | NotConfigured {
  const missing = (["GHL_AGENCY_TOKEN", "GHL_COMPANY_ID", "GHL_LOCATION_ID"] as const).filter((name) => !env[name]);
  if (missing.length > 0) return { configured: false, problem: `Missing ${missing.join(", ")}.` };
  if (/\s/.test(env.GHL_AGENCY_TOKEN!)) return { configured: false, problem: "GHL_AGENCY_TOKEN contains spaces. Paste only the token, without \"Bearer\"." };
  return { configured: true, agencyToken: env.GHL_AGENCY_TOKEN!, companyId: env.GHL_COMPANY_ID!, locationId: env.GHL_LOCATION_ID! };
}

export function readDryRunConfig(env: IntegrationEnv): IntegrationConfig {
  return {
    google: {
      configured: true,
      clientEmail: "dry-run",
      privateKey: "",
      tokenUri: GOOGLE_TOKEN_URI,
      adminSubject: "dry-run",
      domain: (env.GOOGLE_DOMAIN ?? "365yachts.org").toLowerCase(),
      orgUnit: env.GOOGLE_ORG_UNIT ?? null,
    },
    ghl: { configured: true, agencyToken: "dry-run", companyId: "dry-run", locationId: env.GHL_LOCATION_ID ?? "dry-run" },
    dryRun: true,
  };
}

export function readIntegrationConfig(env: IntegrationEnv): IntegrationConfig {
  if (env.PROVISIONING_MODE === "dry-run") return readDryRunConfig(env);
  return { google: readGoogleConfig(env), ghl: readGhlConfig(env) };
}

export function integrationWarnings(config: IntegrationConfig): string[] {
  const warnings: string[] = [];
  if (config.dryRun) {
    warnings.push("Account provisioning is in DRY-RUN mode (PROVISIONING_MODE=dry-run): nothing is sent to Google Workspace or GoHighLevel, and accounts get fake dry-run ids.");
    return warnings;
  }
  if (!config.google.configured) warnings.push(`Google Workspace provisioning is not configured: ${config.google.problem} Brokers' 365 emails won't be created.`);
  if (!config.ghl.configured) warnings.push(`GoHighLevel provisioning is not configured: ${config.ghl.problem} Brokers' GHL users won't be created.`);
  return warnings;
}
