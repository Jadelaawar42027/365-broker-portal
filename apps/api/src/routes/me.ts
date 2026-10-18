/**
 * File: apps/api/src/routes/me.ts
 * Purpose: Who is signed in (for the web app's header and redirects) and the "onboarding complete screen seen" flag,
 * so screen 1d shows exactly once (docs/SPEC.md). A broker's two commission splits come from their latest commission
 * history row (SPEC D29).
 *
 * Functions:
 * - registerMeRoutes(app): mounts GET /v1/me and POST /v1/me/welcome-seen.
 */
import { brokers, currentCommission, users } from "@bp/db";
import { errorResponseSchema, meResponseSchema, okResponseSchema } from "@bp/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { currentActor, requireBroker, requireUser } from "../plugins/auth-guard";
import { supportContact } from "../services/support";

export function registerMeRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/v1/me",
    {
      preHandler: requireUser,
      schema: {
        tags: ["broker"],
        summary: "The signed-in user, their broker record (if any) and the support contact",
        response: { 200: meResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      const [row] = await app.deps.db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          phone: users.phone,
          role: users.role,
          brokerId: brokers.id,
          level: brokers.level,
          status: brokers.status,
          joinedAt: brokers.joinedAt,
          onboardedAt: brokers.onboardedAt,
          welcomeSeenAt: brokers.welcomeSeenAt,
        })
        .from(users)
        .leftJoin(brokers, eq(brokers.userId, users.id))
        .where(eq(users.id, actor.userId));
      const user = row!;
      const commission = user.brokerId ? await currentCommission(app.deps.db, user.brokerId) : null;
      return {
        user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role },
        broker:
          user.brokerId && user.level && user.status && user.joinedAt
            ? {
                id: user.brokerId,
                level: user.level,
                status: user.status,
                joinedAt: user.joinedAt,
                onboardedAt: user.onboardedAt,
                inHouseSplit: commission?.inHousePct ?? null,
                selfGeneratedSplit: commission?.selfGeneratedPct ?? null,
                showWelcome: user.status === "active" && user.onboardedAt !== null && user.welcomeSeenAt === null,
              }
            : null,
        support: supportContact(app.deps.env),
      };
    },
  );

  r.post(
    "/v1/me/welcome-seen",
    {
      preHandler: requireBroker,
      schema: {
        tags: ["broker"],
        summary: "Record that the broker has seen the onboarding-complete screen",
        response: { 200: okResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      await app.deps.db
        .update(brokers)
        .set({ welcomeSeenAt: app.deps.now() })
        .where(and(eq(brokers.id, actor.brokerId!), isNull(brokers.welcomeSeenAt)));
      return { ok: true as const };
    },
  );
}
