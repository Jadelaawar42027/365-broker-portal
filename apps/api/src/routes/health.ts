/**
 * File: apps/api/src/routes/health.ts
 * Purpose: GET /health, the path Railway uses as its healthcheck. Returns 200 when the API can reach Postgres and
 * 503 when it cannot, so a deploy with a broken database connection never goes live.
 *
 * Functions:
 * - registerHealthRoutes(app): mounts GET /health.
 */
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

export function registerHealthRoutes(app: FastifyInstance): void {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/health",
    {
      schema: {
        hide: true,
        response: {
          200: z.object({ status: z.literal("ok") }),
          503: z.object({ status: z.literal("unavailable") }),
        },
      },
    },
    async (request, reply) => {
      try {
        await app.deps.db.execute(sql`SELECT 1`);
        return { status: "ok" as const };
      } catch (error) {
        request.log.error({ err: error }, "Health check could not reach the database");
        return reply.status(503).send({ status: "unavailable" as const });
      }
    },
  );
}
