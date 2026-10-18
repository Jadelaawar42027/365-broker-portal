/**
 * File: apps/api/src/routes/admin/accounts.ts
 * Purpose: Admin routes for a broker's provisioned accounts (phase H2): the Accounts panel on the profile (3c), Retry
 * for one system, "Link existing account" (looks the corporate email up in Google and GoHighLevel and stores the ids
 * instead of creating users), and entering a corporate email by hand for an existing broker. Mounted inside the admin
 * scope, so only owners and admins reach them. Every change writes audit_log; tasks run in the provisioning worker.
 *
 * Functions:
 * - registerAdminBrokerAccountRoutes(app): mounts the /v1/admin/brokers/:id/accounts and /corporate-email routes.
 * - retryAction(view, broker): which task Retry queues for a system (the failed task's action, else create or suspend), or null.
 */
import { brokers, users } from "@bp/db";
import {
  accountActionResponseSchema,
  brokerAccountsResponseSchema,
  corporateEmailRequestSchema,
  errorResponseSchema,
  okResponseSchema,
  provisioningSystemParamsSchema,
  type AccountSystemView,
  type ProvisioningAction,
} from "@bp/shared";
import { and, eq, ne } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { badRequest, conflict } from "../../errors";
import { currentActor } from "../../plugins/auth-guard";
import { writeAudit } from "../../services/audit";
import { loadBrokerWithUser } from "../../services/brokers";
import { isConfigured } from "../../services/provisioning/integrations";
import { loadAccountViews } from "../../services/provisioning/status";
import { enqueueForSystems, enqueueTask } from "../../services/provisioning/tasks";

const idParams = z.object({ id: z.uuid() });

function retryAction(view: AccountSystemView, broker: { status: string }): ProvisioningAction | null {
  if (view.status === "failed" && view.lastTask) return view.lastTask.action;
  if (view.status === "not_set_up") return broker.status === "inactive" ? null : "create";
  return null;
}

export function registerAdminBrokerAccountRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/v1/admin/brokers/:id/accounts",
    {
      schema: {
        tags: ["admin"],
        summary: "The broker's Google Workspace and GoHighLevel accounts: status, id, last error",
        params: idParams,
        response: { 200: brokerAccountsResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => {
      const { broker } = await loadBrokerWithUser(app.deps.db, request.params.id);
      const google = app.deps.integrations.config.google;
      return {
        corporateEmail: broker.corporateEmail,
        googleDomain: google.configured ? google.domain : null,
        systems: await loadAccountViews(app.deps.db, app.deps.integrations, broker),
      };
    },
  );

  r.post(
    "/v1/admin/brokers/:id/accounts/:system/retry",
    {
      schema: {
        tags: ["admin"],
        summary: "Queue the failed task again (or create the account when none was ever set up)",
        params: provisioningSystemParamsSchema,
        response: { 200: accountActionResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      const { db, integrations } = app.deps;
      const { system } = request.params;
      const { broker } = await loadBrokerWithUser(db, request.params.id);
      if (!isConfigured(integrations, system)) throw conflict("This system isn't configured yet.", "not_configured");
      const view = (await loadAccountViews(db, integrations, broker)).find((entry) => entry.system === system)!;
      const action = retryAction(view, broker);
      if (!action) throw conflict("There's nothing to retry for this account.", "nothing_to_retry");
      const added = await db.transaction((tx) => enqueueTask(tx, { brokerId: broker.id, system, action, createdBy: actor.userId, now: app.deps.now() }));
      app.deps.wakeProvisioning();
      return added ? { queued: [system], skipped: [] } : { queued: [], skipped: [{ system, reason: "Already queued" }] };
    },
  );

  r.post(
    "/v1/admin/brokers/:id/accounts/link",
    {
      schema: {
        tags: ["admin"],
        summary: "Look the corporate email up in Google and GoHighLevel and store the ids instead of creating users",
        params: idParams,
        response: { 200: accountActionResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      const { db, integrations } = app.deps;
      const { broker } = await loadBrokerWithUser(db, request.params.id);
      if (!broker.corporateEmail) throw conflict("Enter the broker's corporate email first.", "no_corporate_email");
      const result = await db.transaction((tx) => enqueueForSystems(tx, { brokerId: broker.id, action: "link", integrations, createdBy: actor.userId, now: app.deps.now() }));
      app.deps.wakeProvisioning();
      return result;
    },
  );

  r.put(
    "/v1/admin/brokers/:id/corporate-email",
    {
      schema: {
        tags: ["admin"],
        summary: "Enter an existing broker's corporate email by hand (then use Link existing account)",
        params: idParams,
        body: corporateEmailRequestSchema,
        response: { 200: okResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      const { db, integrations } = app.deps;
      const { broker, user } = await loadBrokerWithUser(db, request.params.id);
      const email = request.body.email;
      const google = integrations.config.google;
      if (google.configured && !email.endsWith(`@${google.domain}`)) throw badRequest(`Use an address on @${google.domain}.`, "wrong_domain");
      if (broker.googleUserId && broker.corporateEmail !== email) {
        throw conflict("This broker's Google account is already linked. The corporate email can't change.", "already_linked");
      }
      const [otherUser] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, email), ne(users.id, user.id))).limit(1);
      const [otherBroker] = await db.select({ id: brokers.id }).from(brokers).where(and(eq(brokers.corporateEmail, email), ne(brokers.id, broker.id))).limit(1);
      if (otherUser || otherBroker) throw conflict("Someone else already uses this email.", "email_taken");
      if (broker.corporateEmail === email) return { ok: true as const };
      await db.transaction(async (tx) => {
        await tx.update(brokers).set({ corporateEmail: email }).where(eq(brokers.id, broker.id));
        await writeAudit(tx, {
          actorUserId: actor.userId,
          action: "broker.corporate_email_set",
          entityType: "broker",
          entityId: broker.id,
          before: { corporateEmail: broker.corporateEmail },
          after: { corporateEmail: email },
        });
      });
      return { ok: true as const };
    },
  );
}
