/**
 * File: apps/api/src/plugins/openapi.ts
 * Purpose: Generates the OpenAPI document from the routes' Zod schemas and serves it, with Swagger UI, at /docs
 * outside production (docs/SPEC.md).
 *
 * Functions:
 * - registerOpenApi(app, env): registers @fastify/swagger always (so the spec can be exported) and the /docs UI when not in production.
 */
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";
import { jsonSchemaTransform } from "fastify-type-provider-zod";
import type { ApiEnv } from "../env";

export async function registerOpenApi(app: FastifyInstance, env: ApiEnv): Promise<void> {
  await app.register(swagger, {
    openapi: {
      info: {
        title: "365 Yachts Broker Portal API",
        description: "Broker onboarding and admin API. Authenticate with the Better Auth session cookie.",
        version: "1.0.0",
      },
      tags: [
        { name: "auth", description: "Invites and password resets" },
        { name: "broker", description: "A broker's own onboarding" },
        { name: "admin", description: "Admin and owner only" },
        { name: "files", description: "File uploads and downloads" },
      ],
    },
    transform: jsonSchemaTransform,
  });
  if (env.NODE_ENV !== "production") {
    await app.register(swaggerUi, { routePrefix: "/docs" });
  }
}
