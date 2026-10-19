/**
 * File: apps/api/src/services/provisioning/dry-run.ts
 * Purpose: Stand-in Google Workspace and GoHighLevel clients for PROVISIONING_MODE=dry-run. They never call either
 * service: each call is logged (without passwords) and answers as if it worked, with ids starting "dry-run-". The
 * portal still picks the broker's 365 address, saves it and makes it their login, so the whole onboarding flow can be
 * tried without creating paid Workspace users.
 *
 * Functions:
 * - fakeId(system): a new id like "dry-run-google-<uuid>".
 * - createDryRunGoogleClient(domain, log): a GoogleClient that logs each call; lookups find nobody, creates succeed.
 * - createDryRunGhlClient(locationId, log): a GhlClient that logs each call; lookups find nobody, creates succeed.
 */
import { randomUUID } from "node:crypto";
import type { GhlClient } from "./ghl";
import type { GoogleClient } from "./google";

export type DryRunLog = (message: string) => void;

function fakeId(system: "google" | "ghl"): string {
  return `dry-run-${system}-${randomUUID()}`;
}

export function createDryRunGoogleClient(domain: string, log: DryRunLog): GoogleClient {
  return {
    domain,
    dryRun: true,
    async findUser(email) {
      log(`[dry-run] Google: look up ${email} (not sent; treated as free)`);
      return null;
    },
    async createUser(input) {
      const id = fakeId("google");
      log(`[dry-run] Google: would create ${input.email} for ${input.firstName} ${input.lastName} (recovery phone ${input.recoveryPhone ?? "none"}) as ${id}`);
      return { id, email: input.email.toLowerCase(), suspended: false, brokerId: input.brokerId };
    },
    async setSuspended(userId, suspended) {
      log(`[dry-run] Google: would ${suspended ? "suspend" : "unsuspend"} ${userId}`);
    },
    async resetPassword(userId) {
      log(`[dry-run] Google: would set a new temporary password for ${userId}`);
    },
    async deleteUser(userId) {
      log(`[dry-run] Google: would delete ${userId}`);
    },
    async testConnection() {
      return `Dry run: nothing is sent to Google. New brokers get a pretend @${domain} account.`;
    },
  };
}

export function createDryRunGhlClient(locationId: string, log: DryRunLog): GhlClient {
  return {
    locationId,
    dryRun: true,
    async findUserByEmail(email) {
      log(`[dry-run] GHL: look up ${email} (not sent; treated as free)`);
      return null;
    },
    async createUser(input) {
      const id = fakeId("ghl");
      log(`[dry-run] GHL: would create user ${input.email} for ${input.firstName} ${input.lastName} in location ${locationId} as ${id}`);
      return { id, email: input.email.toLowerCase() };
    },
    async deleteUser(userId) {
      log(`[dry-run] GHL: would delete ${userId}`);
    },
    async testConnection() {
      return "Dry run: nothing is sent to GoHighLevel. New brokers get a pretend GHL user.";
    },
  };
}
