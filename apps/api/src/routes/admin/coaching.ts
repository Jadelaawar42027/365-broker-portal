/**
 * File: apps/api/src/routes/admin/coaching.ts
 * Purpose: The leadership Coaching section: the team overview, one broker's coaching page, Shelly's confirm/reject of
 * AI excuses and her weekly pulse. Mounted inside the admin scope, so only admins and owners reach it. Data comes from
 * the coach service's database through the coach_portal role; every change is written to audit_log.
 *
 * Functions:
 * - requireCoach(app): returns the coach store, or fails with 503 when COACH_DATABASE_URL is not set.
 * - pickWeek(weeks, requested): the requested snapshot week if it exists, else the newest one, else null.
 * - loadPortalBrokers(db): every broker's id, name, level and status from the portal tables.
 * - registerAdminCoachingRoutes(app): mounts GET /v1/admin/coaching/overview, GET /v1/admin/coaching/brokers/:id,
 *   POST /v1/admin/coaching/excuses/decision and PUT /v1/admin/coaching/brokers/:id/pulse.
 */
import { brokers, users, type DbOrTx } from "@bp/db";
import {
  coachingBrokerResponseSchema,
  coachingOverviewResponseSchema,
  excuseDecisionBodySchema,
  pulseBodySchema,
} from "@bp/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { HttpError, notFound } from "../../errors";
import { currentActor } from "../../plugins/auth-guard";
import { writeAudit } from "../../services/audit";
import type { CoachStore } from "../../services/coaching/store";
import { buildBrokerPage, buildOverview, type PortalBroker } from "../../services/coaching/view";

const DAY = 864e5;
const weekQuery = z.object({ week: z.iso.date().optional() });

function requireCoach(app: FastifyInstance): CoachStore {
  const coach = app.deps.coach;
  if (!coach) throw new HttpError(503, "coaching_not_configured", "Coaching isn't connected yet: set COACH_DATABASE_URL on the API service.");
  return coach;
}

function pickWeek<T extends { weekStart: string }>(weeks: T[], requested: string | undefined): T | null {
  return (requested ? weeks.find((w) => w.weekStart === requested) : undefined) ?? weeks[0] ?? null;
}

async function loadPortalBrokers(db: DbOrTx): Promise<Map<string, PortalBroker>> {
  const rows = await db
    .select({ brokerId: brokers.id, name: users.name, level: brokers.level, status: brokers.status })
    .from(brokers)
    .innerJoin(users, eq(users.id, brokers.userId));
  return new Map(rows.map((r) => [r.brokerId, { brokerId: r.brokerId, name: r.name, level: r.level, status: r.status }]));
}

export function registerAdminCoachingRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/v1/admin/coaching/overview",
    { schema: { querystring: weekQuery, response: { 200: coachingOverviewResponseSchema } } },
    async (request) => {
      const coach = requireCoach(app);
      const weeks = await coach.weeks();
      const week = pickWeek(weeks, request.query.week);
      const weekEnd = week ? new Date(Date.parse(week.weekStart) + 7 * DAY) : app.deps.now();
      const [snapshots, portalBrokers, callsReviewed, excusesToConfirm] = await Promise.all([
        week ? coach.snapshots(week.weekStart) : Promise.resolve([]),
        loadPortalBrokers(app.deps.db),
        coach.callsReviewed(new Date(weekEnd.getTime() - 28 * DAY), weekEnd),
        coach.excusesToConfirm(),
      ]);
      return buildOverview({ weeks, week, snapshots, brokers: portalBrokers, callsReviewed, excusesToConfirm });
    },
  );

  r.get(
    "/v1/admin/coaching/brokers/:id",
    { schema: { params: z.object({ id: z.uuid() }), querystring: weekQuery, response: { 200: coachingBrokerResponseSchema } } },
    async (request) => {
      const coach = requireCoach(app);
      const broker = (await loadPortalBrokers(app.deps.db)).get(request.params.id);
      if (!broker) throw notFound("No broker with that id.");
      const weeks = await coach.weeks();
      const week = pickWeek(weeks, request.query.week);
      const weekEnd = week ? new Date(Date.parse(week.weekStart) + 7 * DAY) : app.deps.now();
      const [history, excuses, pulse, pulses] = await Promise.all([
        week ? coach.brokerHistory(broker.brokerId, week.weekStart, 8) : Promise.resolve([]),
        coach.excuses(broker.brokerId, new Date(weekEnd.getTime() - 28 * DAY), weekEnd),
        week ? coach.pulse(broker.brokerId, week.weekStart) : Promise.resolve(null),
        coach.pulses(broker.brokerId),
      ]);
      return buildBrokerPage({ weeks, week, broker, history, excuses, pulse, pulses, ghlLocationId: app.deps.env.GHL_LOCATION_ID });
    },
  );

  r.post(
    "/v1/admin/coaching/excuses/decision",
    { schema: { body: excuseDecisionBodySchema, response: { 200: z.object({ ok: z.literal(true) }) } } },
    async (request) => {
      const coach = requireCoach(app);
      const actor = currentActor(request);
      const brokerId = await coach.excuseBroker(request.body.momentKey);
      if (!brokerId) throw notFound("No excused miss with that key.");
      await coach.decideExcuse({ momentKey: request.body.momentKey, decision: request.body.decision, userId: actor.userId, userName: actor.name });
      await writeAudit(app.deps.db, {
        actorUserId: actor.userId,
        action: request.body.decision === "confirm" ? "coaching.excuse_confirmed" : "coaching.excuse_rejected",
        entityType: "broker",
        entityId: brokerId,
        after: { momentKey: request.body.momentKey, decision: request.body.decision },
      });
      return { ok: true as const };
    },
  );

  r.put(
    "/v1/admin/coaching/brokers/:id/pulse",
    { schema: { params: z.object({ id: z.uuid() }), body: pulseBodySchema, response: { 200: z.object({ ok: z.literal(true) }) } } },
    async (request) => {
      const coach = requireCoach(app);
      const actor = currentActor(request);
      const broker = (await loadPortalBrokers(app.deps.db)).get(request.params.id);
      if (!broker) throw notFound("No broker with that id.");
      const before = await coach.pulse(broker.brokerId, request.body.weekStart);
      await coach.savePulse({ brokerId: broker.brokerId, userId: actor.userId, userName: actor.name, ...request.body });
      await writeAudit(app.deps.db, {
        actorUserId: actor.userId,
        action: "coaching.pulse_saved",
        entityType: "broker",
        entityId: broker.brokerId,
        before: before ? { engagement: before.engagement, attitude: before.attitude, supportNeeded: before.supportNeeded } : null,
        after: { weekStart: request.body.weekStart, engagement: request.body.engagement, attitude: request.body.attitude, supportNeeded: request.body.supportNeeded },
      });
      return { ok: true as const };
    },
  );
}
