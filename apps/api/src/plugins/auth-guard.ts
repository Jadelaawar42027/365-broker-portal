/**
 * File: apps/api/src/plugins/auth-guard.ts
 * Purpose: Works out who is calling (from the Better Auth session cookie) and provides the per-route permission
 * hooks. Permission checks live here in the API, never only in the UI (CLAUDE.md Rule 6). A session belonging to
 * an inactive broker is deleted and rejected (SPEC D9).
 *
 * Functions:
 * - resolveActor(app, request): loads the session, user and broker row; returns the actor or null.
 * - registerAuthGuard(app): adds request.actor and resolves it once per request on /v1 routes.
 * - requireUser(request): preHandler that rejects anonymous callers with 401.
 * - requireBroker(request): preHandler that allows only signed-in brokers.
 * - requireAdmin(request): preHandler that allows only admins and owners.
 * - currentActor(request): returns request.actor, throwing 401 if it is missing (for use after a require hook).
 */
import { brokers, sessions, users } from "@bp/db";
import { canLogIn, isAdminRole } from "@bp/shared";
import { fromNodeHeaders } from "better-auth/node";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RequestActor } from "../deps";
import { forbidden, unauthorized } from "../errors";

async function resolveActor(app: FastifyInstance, request: FastifyRequest): Promise<RequestActor | null> {
  const { auth, db } = app.deps;
  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  if (!session) return null;
  const [row] = await db
    .select({
      userId: users.id,
      role: users.role,
      name: users.name,
      email: users.email,
      brokerId: brokers.id,
      brokerStatus: brokers.status,
    })
    .from(users)
    .leftJoin(brokers, eq(brokers.userId, users.id))
    .where(eq(users.id, session.user.id));
  if (!row) return null;
  if (!canLogIn({ role: row.role, brokerStatus: row.brokerStatus })) {
    await db.delete(sessions).where(eq(sessions.userId, row.userId));
    return null;
  }
  return { ...row, sessionId: session.session.id };
}

export function registerAuthGuard(app: FastifyInstance): void {
  app.decorateRequest("actor", null);
  app.addHook("preHandler", async (request) => {
    if (request.url.startsWith("/v1/")) {
      request.actor = await resolveActor(app, request);
    }
  });
}

export async function requireUser(request: FastifyRequest): Promise<void> {
  if (!request.actor) throw unauthorized();
}

export async function requireBroker(request: FastifyRequest): Promise<void> {
  if (!request.actor) throw unauthorized();
  if (request.actor.role !== "broker" || !request.actor.brokerId) {
    throw forbidden("This page is for brokers.");
  }
}

export async function requireAdmin(request: FastifyRequest): Promise<void> {
  if (!request.actor) throw unauthorized();
  if (!isAdminRole(request.actor.role)) throw forbidden("Only admins can do this.");
}

export function currentActor(request: FastifyRequest): RequestActor {
  if (!request.actor) throw unauthorized();
  return request.actor;
}
