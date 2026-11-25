/**
 * File: apps/api/src/routes/me-coaching.ts
 * Purpose: A broker's own coaching page (architecture "phase 2", off until COACHING_BROKER_VIEW=true, after the
 * shadow period). The broker id always comes from the signed-in session, never from the URL or body, so a broker
 * can only ever see their own numbers. Pulse notes and other brokers' data are never returned here.
 *
 * Functions:
 * - registerMeCoachingRoutes(app): mounts GET /v1/me/coaching.
 */
import { brokers, users } from "@bp/db";
import { coachingBrokerResponseSchema } from "@bp/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { HttpError, notFound } from "../errors";
import { currentActor, requireBroker } from "../plugins/auth-guard";
import { buildBrokerPage } from "../services/coaching/view";

const DAY = 864e5;

export function registerMeCoachingRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/v1/me/coaching",
    { preHandler: requireBroker, schema: { response: { 200: coachingBrokerResponseSchema } } },
    async (request) => {
      if (!app.deps.env.COACHING_BROKER_VIEW) throw notFound("Coaching pages for brokers aren't switched on yet.");
      const coach = app.deps.coach;
      if (!coach) throw new HttpError(503, "coaching_not_configured", "Coaching isn't connected yet.");
      const brokerId = currentActor(request).brokerId!;
      const [row] = await app.deps.db
        .select({ brokerId: brokers.id, name: users.name, level: brokers.level, status: brokers.status })
        .from(brokers)
        .innerJoin(users, eq(users.id, brokers.userId))
        .where(eq(brokers.id, brokerId));
      if (!row) throw notFound();
      const weeks = await coach.weeks();
      const week = weeks[0] ?? null;
      const weekEnd = week ? new Date(Date.parse(week.weekStart) + 7 * DAY) : app.deps.now();
      const [history, excuses] = await Promise.all([
        week ? coach.brokerHistory(brokerId, week.weekStart, 8) : Promise.resolve([]),
        coach.excuses(brokerId, new Date(weekEnd.getTime() - 28 * DAY), weekEnd),
      ]);
      const page = buildBrokerPage({ weeks: week ? [week] : [], week, broker: row, history, excuses, pulse: null, pulses: [], ghlLocationId: app.deps.env.GHL_LOCATION_ID });
      return { ...page, pulse: null, history: page.history.map((h) => ({ ...h, pulse: null })) };
    },
  );
}
