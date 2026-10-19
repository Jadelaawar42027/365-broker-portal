/**
 * File: apps/api/src/services/provisioning/integrations.ts
 * Purpose: Builds the Google and GoHighLevel clients the API uses from its environment. A system that isn't
 * configured gets no client (null), so every caller skips it and shows "Not configured". In dry-run mode both get the
 * stand-in clients from dry-run.ts, which log instead of calling anything.
 *
 * Functions:
 * - createIntegrations(env, fetchImpl, log): reads the config and returns { config, google, ghl }.
 * - isConfigured(integrations, system): true when that system has a client.
 */
import type { ProvisioningSystem } from "@bp/shared";
import { readIntegrationConfig, type IntegrationConfig, type IntegrationEnv } from "./config";
import { createDryRunGhlClient, createDryRunGoogleClient, type DryRunLog } from "./dry-run";
import { createGhlClient, type GhlClient } from "./ghl";
import { createGoogleClient, type GoogleClient } from "./google";

export type Integrations = { config: IntegrationConfig; google: GoogleClient | null; ghl: GhlClient | null };

export function createIntegrations(env: IntegrationEnv, fetchImpl: typeof fetch = fetch, log: DryRunLog = (message) => console.info(message)): Integrations {
  const config = readIntegrationConfig(env);
  if (config.dryRun && config.google.configured && config.ghl.configured) {
    return { config, google: createDryRunGoogleClient(config.google.domain, log), ghl: createDryRunGhlClient(config.ghl.locationId, log) };
  }
  return {
    config,
    google: config.google.configured ? createGoogleClient(config.google, fetchImpl) : null,
    ghl: config.ghl.configured ? createGhlClient(config.ghl, fetchImpl) : null,
  };
}

export function isConfigured(integrations: Integrations, system: ProvisioningSystem): boolean {
  return system === "google" ? integrations.google !== null : integrations.ghl !== null;
}
