/**
 * File: apps/api/src/routes/admin/integrations.ts
 * Purpose: The admin Integrations panel on the overview (phase H2): whether Google Workspace and GoHighLevel are
 * configured (and if not, what's missing), how many tasks are open or failed, and "Test connection", which makes one
 * harmless read call (Google: look up GOOGLE_ADMIN_SUBJECT; GHL: read the location), or in dry-run mode just says
 * nothing is sent. Mounted in the admin scope.
 *
 * Functions:
 * - registerAdminIntegrationRoutes(app): mounts GET /v1/admin/integrations and POST /v1/admin/integrations/:system/test.
 */
import { provisioningTasks } from "@bp/db";
import {
  integrationsResponseSchema,
  integrationTestResponseSchema,
  PROVISIONING_SYSTEM_LABELS,
  PROVISIONING_SYSTEMS,
} from "@bp/shared";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { writeAudit } from "../../services/audit";
import { currentActor } from "../../plugins/auth-guard";
import { toProvisioningError } from "../../services/provisioning/errors";

export function registerAdminIntegrationRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/v1/admin/integrations",
    { schema: { tags: ["admin"], summary: "Google Workspace and GoHighLevel: configured or not, open and failed tasks", response: { 200: integrationsResponseSchema } } },
    async () => {
      const { config } = app.deps.integrations;
      const counts = await app.deps.db
        .select({
          system: provisioningTasks.system,
          open: sql<number>`count(*) FILTER (WHERE ${provisioningTasks.status} IN ('pending', 'running'))::int`,
          failed: sql<number>`count(*) FILTER (WHERE ${provisioningTasks.status} = 'failed')::int`,
        })
        .from(provisioningTasks)
        .groupBy(provisioningTasks.system);
      return {
        systems: PROVISIONING_SYSTEMS.map((system) => {
          const entry = config[system];
          const count = counts.find((row) => row.system === system);
          let details: string | null = null;
          if (config.google.configured && system === "google") details = `@${config.google.domain}${config.google.orgUnit ? ` · org unit ${config.google.orgUnit}` : ""}`;
          if (config.ghl.configured && system === "ghl") details = `Location ${config.ghl.locationId}`;
          return {
            system,
            label: PROVISIONING_SYSTEM_LABELS[system],
            configured: entry.configured,
            dryRun: config.dryRun === true,
            problem: entry.configured ? null : entry.problem,
            details,
            openTasks: count?.open ?? 0,
            failedTasks: count?.failed ?? 0,
          };
        }),
      };
    },
  );

  r.post(
    "/v1/admin/integrations/:system/test",
    {
      schema: {
        tags: ["admin"],
        summary: "Make one harmless read call to check the credentials",
        params: z.object({ system: z.enum(PROVISIONING_SYSTEMS) }),
        response: { 200: integrationTestResponseSchema },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      const { system } = request.params;
      const client = system === "google" ? app.deps.integrations.google : app.deps.integrations.ghl;
      const config = app.deps.integrations.config[system];
      if (!client) return { ok: false, message: `Not configured. ${config.configured ? "" : config.problem}`.trim() };
      let result: { ok: boolean; message: string };
      try {
        result = { ok: true, message: await client.testConnection() };
      } catch (error) {
        result = { ok: false, message: toProvisioningError(system, error).message };
      }
      await writeAudit(app.deps.db, { actorUserId: actor.userId, action: "integration.tested", entityType: "user", entityId: actor.userId, after: { system, ok: result.ok } });
      return result;
    },
  );
}
