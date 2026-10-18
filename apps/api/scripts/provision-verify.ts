/**
 * File: apps/api/scripts/provision-verify.ts
 * Purpose: `pnpm provision:verify` checks account provisioning end to end against the REAL Google Workspace and
 * GoHighLevel with the credentials in the environment. It creates a broker named "Provisioning Check" with a unique
 * timestamped address (provisioning.check.<timestamp>@GOOGLE_DOMAIN), creates the Google and GHL users through the same
 * code the worker uses, confirms both exist, suspends both, then deletes both test users and the broker row. It prints
 * PASS or FAIL for each step. It never touches any other user: every lookup and deletion is checked against the ids this
 * run created, and the queue is never used, so other brokers' tasks are left alone. Clean-up runs even after a failure.
 *
 * Functions:
 * - report(step, ok, detail): prints one PASS / FAIL line and remembers failures.
 * - readIntegrationEnv(source): the Google and GHL variables from the environment (blank counts as missing).
 * - waitFor(check, timeoutMs): polls check() every 5 seconds until it returns true or the time runs out.
 * - main(): runs every step, cleans up and exits non-zero if any step failed.
 */
import { brokers, createBroker, createDb, users } from "@bp/db";
import { placeholderEmail } from "@bp/shared";
import { loadRootEnvFile } from "@bp/shared/node";
import { eq } from "drizzle-orm";
import { readIntegrationConfig, type IntegrationEnv } from "../src/services/provisioning/config";
import { runTaskAction } from "../src/services/provisioning/handlers";
import { createIntegrations } from "../src/services/provisioning/integrations";

let failures = 0;

function report(step: string, ok: boolean, detail = ""): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? ` — ${detail}` : ""}`);
}

function readIntegrationEnv(source: NodeJS.ProcessEnv): IntegrationEnv {
  const value = (name: keyof IntegrationEnv) => source[name]?.trim() || undefined;
  return {
    GOOGLE_SERVICE_ACCOUNT_JSON: value("GOOGLE_SERVICE_ACCOUNT_JSON"),
    GOOGLE_ADMIN_SUBJECT: value("GOOGLE_ADMIN_SUBJECT"),
    GOOGLE_DOMAIN: value("GOOGLE_DOMAIN"),
    GOOGLE_ORG_UNIT: value("GOOGLE_ORG_UNIT"),
    GHL_AGENCY_TOKEN: value("GHL_AGENCY_TOKEN"),
    GHL_COMPANY_ID: value("GHL_COMPANY_ID"),
    GHL_LOCATION_ID: value("GHL_LOCATION_ID"),
  };
}

async function waitFor(check: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) return true;
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

async function main(): Promise<void> {
  loadRootEnvFile();
  const integrationEnv = readIntegrationEnv(process.env);
  const config = readIntegrationConfig(integrationEnv);
  report("Google Workspace configured", config.google.configured, config.google.configured ? `@${config.google.domain}` : config.google.problem);
  report("GoHighLevel configured", config.ghl.configured, config.ghl.configured ? `location ${config.ghl.locationId}` : config.ghl.problem);
  const databaseUrl = process.env.DATABASE_URL;
  report("DATABASE_URL set", Boolean(databaseUrl));
  if (!config.google.configured || !config.ghl.configured || !databaseUrl) {
    console.log("\nStopped: set the missing variables first. Nothing was created.");
    process.exit(1);
  }
  const integrations = createIntegrations(integrationEnv);
  const google = integrations.google!;
  const ghl = integrations.ghl!;
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const address = `provisioning.check.${stamp}@${config.google.domain}`;
  console.log(`\nTest address: ${address}\n`);

  const { db, close } = createDb(databaseUrl, { max: 1 });
  let brokerId: string | null = null;
  let userId: string | null = null;
  let googleId: string | null = null;
  let ghlId: string | null = null;
  try {
    const googleConnection = await google.testConnection().then((message) => ({ ok: true, message }), (error: Error) => ({ ok: false, message: error.message }));
    report("Google connection", googleConnection.ok, googleConnection.message);
    const ghlConnection = await ghl.testConnection().then((message) => ({ ok: true, message }), (error: Error) => ({ ok: false, message: error.message }));
    report("GHL connection", ghlConnection.ok, ghlConnection.message);
    if (!googleConnection.ok || !ghlConnection.ok) return;

    const takenInGoogle = await google.findUser(address);
    const takenInGhl = await ghl.findUserByEmail(address);
    report("Test address is unused", !takenInGoogle && !takenInGhl);
    if (takenInGoogle || takenInGhl) return;

    const created = await db.transaction((tx) =>
      createBroker(tx, { name: "Provisioning Check", email: placeholderEmail(`provisioning-check-${stamp}`), phone: null, level: "junior", status: "invited", joinedAt: new Date().toISOString().slice(0, 10) }),
    );
    brokerId = created.brokerId;
    userId = created.userId;
    await db.update(brokers).set({ corporateEmail: address }).where(eq(brokers.id, brokerId));
    report("Broker row created", true, brokerId);

    const context = { db, integrations, now: () => new Date() };
    await runTaskAction(context, { brokerId, system: "google", action: "create" }).then(
      () => report("Google user created", true),
      (error: Error) => report("Google user created", false, error.message),
    );
    const [afterGoogle] = await db.select({ googleUserId: brokers.googleUserId }).from(brokers).where(eq(brokers.id, brokerId));
    googleId = afterGoogle?.googleUserId ?? null;
    const googleUser = await google.findUser(address);
    report("Google user exists", Boolean(googleUser && googleId && googleUser.id === googleId && googleUser.brokerId === brokerId), googleUser ? `id ${googleUser.id}` : "not found");

    await runTaskAction(context, { brokerId, system: "ghl", action: "create" }).then(
      () => report("GHL user created", true),
      (error: Error) => report("GHL user created", false, error.message),
    );
    const [afterGhl] = await db.select({ ghlUserId: brokers.ghlUserId }).from(brokers).where(eq(brokers.id, brokerId));
    ghlId = afterGhl?.ghlUserId ?? null;
    const ghlUser = await ghl.findUserByEmail(address);
    report("GHL user exists", Boolean(ghlUser && ghlId && ghlUser.id === ghlId), ghlUser ? `id ${ghlUser.id}` : "not found");

    if (googleId) {
      await runTaskAction(context, { brokerId, system: "google", action: "suspend" }).then(
        async () => report("Google user suspended", (await google.findUser(address))?.suspended === true),
        (error: Error) => report("Google user suspended", false, error.message),
      );
    }
    if (ghlId) {
      await runTaskAction(context, { brokerId, system: "ghl", action: "suspend" }).then(
        () => report("GHL user deactivated (deleted; GHL has no deactivate)", true, "GHL queues the deletion"),
        (error: Error) => report("GHL user deactivated (deleted; GHL has no deactivate)", false, error.message),
      );
      const gone = await waitFor(async () => (await ghl.findUserByEmail(address)) === null, 180_000);
      report("GHL user gone", gone, gone ? "" : "still listed after 3 minutes; GHL may still be processing the deletion");
      if (gone) ghlId = null;
    }
  } finally {
    if (googleId) {
      const current = await google.findUser(address).catch(() => null);
      if (current && current.id === googleId) {
        await google.deleteUser(googleId).then(
          () => report("Google test user deleted", true),
          (error: Error) => report("Google test user deleted", false, error.message),
        );
      }
    }
    if (ghlId) {
      const current = await ghl.findUserByEmail(address).catch(() => null);
      if (current && current.id === ghlId) {
        await ghl.deleteUser(ghlId).then(
          () => report("GHL test user deleted", true),
          (error: Error) => report("GHL test user deleted", false, error.message),
        );
      }
    }
    if (brokerId && userId) {
      await db.transaction(async (tx) => {
        await tx.delete(brokers).where(eq(brokers.id, brokerId!));
        await tx.delete(users).where(eq(users.id, userId!));
      }).then(
        () => report("Broker row deleted", true),
        (error: Error) => report("Broker row deleted", false, error.message),
      );
    }
    await close();
  }
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  if (failures > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
