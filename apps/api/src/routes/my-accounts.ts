/**
 * File: apps/api/src/routes/my-accounts.ts
 * Purpose: The broker's own 365 email on step 9 (phase H2): whether the Workspace account is ready, and "Reveal my
 * temporary password", which resets the Google password at that moment (change at next login) and returns it once.
 * Only the signed-in broker can reveal, only for their own account, at most 3 times per Florida day; each reveal writes
 * audit_log without the password. Responses are never cached and the password is never stored or logged.
 *
 * Functions:
 * - registerMyAccountRoutes(app): mounts GET /v1/me/accounts and POST /v1/me/accounts/google/reveal-password.
 * - loadMyGoogleState(app, brokerId): the broker's corporate email, whether Google is ready, and reveals left today.
 * - revealsToday(app, brokerId): how many reveals the broker made today (Florida time).
 */
import { auditLog, brokers } from "@bp/db";
import {
  errorResponseSchema,
  generateTemporaryPassword,
  myAccountsResponseSchema,
  PASSWORD_REVEALS_PER_DAY,
  revealPasswordResponseSchema,
} from "@bp/shared";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { HttpError, conflict } from "../errors";
import { currentActor, requireBroker } from "../plugins/auth-guard";
import { writeAudit } from "../services/audit";
import { toProvisioningError } from "../services/provisioning/errors";
import { loadAccountViews } from "../services/provisioning/status";
import { todayFor } from "../services/support";

const REVEAL_ACTION = "google.password_revealed";
const GMAIL_URL = "https://mail.google.com/";

async function revealsToday(app: FastifyInstance, brokerId: string): Promise<number> {
  const today = todayFor(app.deps.now());
  const [row] = await app.deps.db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityId, brokerId),
        eq(auditLog.action, REVEAL_ACTION),
        sql`(${auditLog.createdAt} AT TIME ZONE 'America/New_York')::date = ${today}::date`,
      ),
    );
  return row?.count ?? 0;
}

async function loadMyGoogleState(app: FastifyInstance, brokerId: string) {
  const [broker] = await app.deps.db.select().from(brokers).where(eq(brokers.id, brokerId));
  if (!broker) throw new HttpError(404, "not_found", "Broker not found.");
  const google = (await loadAccountViews(app.deps.db, app.deps.integrations, broker)).find((view) => view.system === "google")!;
  const ready = Boolean(app.deps.integrations.google && broker.googleUserId && broker.corporateEmail && google.status === "created" && broker.status !== "inactive");
  const used = await revealsToday(app, brokerId);
  return { broker, ready, revealsLeft: Math.max(0, PASSWORD_REVEALS_PER_DAY - used) };
}

export function registerMyAccountRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/v1/me/accounts",
    {
      preHandler: requireBroker,
      schema: { tags: ["broker"], summary: "My 365 email and whether my temporary password can be revealed", response: { 200: myAccountsResponseSchema } },
    },
    async (request, reply) => {
      const actor = currentActor(request);
      const state = await loadMyGoogleState(app, actor.brokerId!);
      reply.header("cache-control", "no-store");
      return {
        googleConfigured: Boolean(app.deps.integrations.google),
        corporateEmail: state.ready ? state.broker.corporateEmail : null,
        googleReady: state.ready,
        revealsLeft: state.revealsLeft,
        gmailUrl: GMAIL_URL,
      };
    },
  );

  r.post(
    "/v1/me/accounts/google/reveal-password",
    {
      preHandler: requireBroker,
      schema: {
        tags: ["broker"],
        summary: "Reset my Google password now and show the temporary one once (3 times a day at most)",
        response: { 200: revealPasswordResponseSchema, 409: errorResponseSchema, 429: errorResponseSchema, 502: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const actor = currentActor(request);
      const google = app.deps.integrations.google;
      const state = await loadMyGoogleState(app, actor.brokerId!);
      if (!google || !state.ready) throw conflict("Your 365 email is still being set up.", "google_not_ready");
      if (state.revealsLeft <= 0) throw new HttpError(429, "too_many_reveals", "You've revealed a password 3 times today. Try again tomorrow, or message the office.");
      const password = generateTemporaryPassword();
      try {
        await google.resetPassword(state.broker.googleUserId!, password);
      } catch (error) {
        request.log.warn({ brokerId: state.broker.id }, "Google password reset for reveal failed");
        throw new HttpError(502, "google_failed", toProvisioningError("google", error).retryable ? "Google didn't answer. Try again in a minute." : "Google refused the reset. Message the office.");
      }
      await writeAudit(app.deps.db, {
        actorUserId: actor.userId,
        action: REVEAL_ACTION,
        entityType: "broker",
        entityId: state.broker.id,
        after: { googleUserId: state.broker.googleUserId, changePasswordAtNextLogin: true },
      });
      reply.header("cache-control", "no-store");
      return { email: state.broker.corporateEmail!, password, revealsLeft: state.revealsLeft - 1 };
    },
  );
}
