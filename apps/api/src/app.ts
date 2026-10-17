/**
 * File: apps/api/src/app.ts
 * Purpose: Builds the Fastify application (plugins and routes) without starting it, so tests can call it
 * with app.inject() and server.ts can listen on a port.
 *
 * Functions:
 * - buildApp(env): creates the Fastify instance, registers GET /health and returns it.
 */
import Fastify, { type FastifyInstance } from "fastify";
import type { ApiEnv } from "./env";

export function buildApp(env: ApiEnv): FastifyInstance {
  const app = Fastify({
    logger: env.NODE_ENV === "test" ? false : { level: env.LOG_LEVEL },
  });

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
