/**
 * File: apps/api/src/server.ts
 * Purpose: Process entry point for the API: loads the local .env if present, validates the environment, connects to
 * Postgres and storage, logs one clear warning per account-provisioning system (Google, GoHighLevel) that isn't configured,
 * starts the provisioning worker loop (unless PROVISIONING_WORKER=off), starts Fastify and shuts down cleanly on
 * SIGINT/SIGTERM (Railway sends SIGTERM on redeploy).
 *
 * Functions:
 * - startServer(): builds the app with real dependencies and the provisioning worker, listens on API_HOST:PORT and wires the shutdown handlers; returns the running app.
 */
import { createDb } from "@bp/db";
import { createS3Storage } from "@bp/shared/node";
import { loadRootEnvFile } from "@bp/shared/node";
import { buildApp } from "./app";
import { loadApiEnv } from "./env";
import { integrationWarnings } from "./services/provisioning/config";
import { createIntegrations } from "./services/provisioning/integrations";
import { startProvisioningWorker } from "./services/provisioning/worker";

async function startServer() {
  loadRootEnvFile();
  const env = loadApiEnv();
  const database = createDb(env.DATABASE_URL);
  const storage = createS3Storage({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  });
  const integrations = createIntegrations(env);
  let worker: ReturnType<typeof startProvisioningWorker> | null = null;
  const app = await buildApp({ env, db: database.db, storage, integrations, wakeProvisioning: () => worker?.wake() });
  for (const warning of integrationWarnings(integrations.config)) app.log.warn(warning);
  if (env.PROVISIONING_WORKER === "on") {
    worker = startProvisioningWorker({
      db: database.db,
      integrations,
      now: () => new Date(),
      log: { warn: (message) => app.log.warn(message), error: (message) => app.log.error(message) },
    });
  }
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      Promise.resolve(worker?.stop())
        .then(() => app.close())
        .then(() => database.close())
        .then(
          () => process.exit(0),
          () => process.exit(1),
        );
    });
  }
  await app.listen({ host: env.API_HOST, port: env.PORT });
  return app;
}

startServer().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
