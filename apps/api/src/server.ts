/**
 * File: apps/api/src/server.ts
 * Purpose: Process entry point for the API: loads the local .env if present, validates the environment,
 * starts Fastify and shuts it down cleanly on SIGINT/SIGTERM (Railway sends SIGTERM on redeploy).
 *
 * Functions:
 * - startServer(): builds the app, listens on API_HOST:PORT and wires the shutdown handlers; returns the running app.
 */
import { loadRootEnvFile } from "@bp/shared/node";
import { buildApp } from "./app";
import { loadApiEnv } from "./env";

async function startServer() {
  loadRootEnvFile();
  const env = loadApiEnv();
  const app = buildApp(env);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      app.close().then(
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
