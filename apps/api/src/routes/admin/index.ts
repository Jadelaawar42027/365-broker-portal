/**
 * File: apps/api/src/routes/admin/index.ts
 * Purpose: Mounts every /v1/admin route inside one plugin scope whose first hook requires an admin, so no admin
 * route can be added without the permission check (CLAUDE.md Rule 3 and 6).
 *
 * Functions:
 * - registerAdminRoutes(app): registers the admin scope and all admin route groups.
 */
import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../plugins/auth-guard";
import { registerAdminAccountRoutes } from "./admins";
import { registerAdminBrokerRoutes } from "./brokers";
import { registerAdminOverviewRoutes } from "./overview";
import { registerAdminReviewRoutes } from "./reviews";
import { registerAdminTrainingRoutes } from "./training";
import { registerAdminUploadRoutes } from "./uploads";

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async (scope) => {
    scope.addHook("preHandler", requireAdmin);
    registerAdminOverviewRoutes(scope);
    registerAdminBrokerRoutes(scope);
    registerAdminReviewRoutes(scope);
    registerAdminUploadRoutes(scope);
    registerAdminAccountRoutes(scope);
    registerAdminTrainingRoutes(scope);
  });
}
