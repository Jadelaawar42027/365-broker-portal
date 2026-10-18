/**
 * File: apps/api/src/services/provisioning/integrations.ts
 * Purpose: Builds the Google and GoHighLevel clients the API uses from its environment. A system that isn't
 * configured gets no client (null), so every caller skips it and shows "Not configured".
 *
 * Functions:
 * - createIntegrations(env, fetchImpl): reads the config and returns { config, google, ghl }.
 * - isConfigured(integrations, system): true when that system has a client.
 */
import type { ProvisioningSystem } from "@bp/shared";
import { readIntegrationConfig, type IntegrationConfig, type IntegrationEnv } from "./config";
import { createGhlClient, type GhlClient } from "./ghl";
import { createGoogleClient, type GoogleClient } from "./google";

export type Integrations = { config: IntegrationConfig; google: GoogleClient | null; ghl: GhlClient | null };

export function createIntegrations(env: IntegrationEnv, fetchImpl: typeof fetch = fetch): Integrations {
  const config = readIntegrationConfig(env);
  return {
    config,
    google: config.google.configured ? createGoogleClient(config.google, fetchImpl) : null,
    ghl: config.ghl.configured ? createGhlClient(config.ghl, fetchImpl) : null,
  };
}

export function isConfigured(integrations: Integrations, system: ProvisioningSystem): boolean {
  return system === "google" ? integrations.google !== null : integrations.ghl !== null;
}
