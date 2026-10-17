/**
 * File: apps/api/src/server.ts
 * Purpose: Process entry point for the API: loads the local .env if present, validates the environment, connects to
 * Postgres and storage, starts Fastify and shuts down cleanly on SIGINT/SIGTERM (Railway sends SIGTERM on redeploy).
 *
 * Functions:
 * - startServer(): builds the app with real dependencies, listens on API_HOST:PORT and wires the shutdown handlers; returns the running app.
 */
import { createDb } from "@bp/db";
import { createS3Storage } from "@bp/shared/node";
import { loadRootEnvFile } from "@bp/shared/node";
import { buildApp } from "./app";
import { loadApiEnv } from "./env";

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
  const app = await buildApp({ env, db: database.db, storage });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      app
        .close()
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
