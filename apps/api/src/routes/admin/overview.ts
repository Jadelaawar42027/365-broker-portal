/**
 * File: apps/api/src/routes/admin/overview.ts
 * Purpose: The numbers and lists behind the admin overview (3a), the review queue, and the raw broker_metrics feed.
 *
 * Functions:
 * - loadReviewQueue(db): returns every submitted step waiting for review, oldest first.
 * - registerAdminOverviewRoutes(app): mounts GET /v1/admin/overview, GET /v1/admin/reviews and GET /v1/admin/metrics.
 */
import { brokerSteps, brokers, onboardingSteps, users, type DbOrTx } from "@bp/db";
import {
  averageDaysToOnboard,
  findNextStep,
  metricsResponseSchema,
  overviewResponseSchema,
  reviewListResponseSchema,
  stuckDays,
  type ReviewListItem,
} from "@bp/shared";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { listBrokerMetrics, toBrokerListRow } from "../../services/brokers";
import { toIso } from "../../services/steps";
import { todayFor } from "../../services/support";

export async function loadReviewQueue(db: DbOrTx): Promise<ReviewListItem[]> {
  const rows = await db
    .select({
      brokerStepId: brokerSteps.id,
      brokerId: brokers.id,
      brokerName: users.name,
      stepKey: onboardingSteps.key,
      stepShortTitle: onboardingSteps.shortTitle,
      position: onboardingSteps.position,
      submittedAt: brokerSteps.submittedAt,
      attempts: brokerSteps.attempts,
    })
    .from(brokerSteps)
    .innerJoin(onboardingSteps, eq(onboardingSteps.id, brokerSteps.stepId))
    .innerJoin(brokers, eq(brokers.id, brokerSteps.brokerId))
    .innerJoin(users, eq(users.id, brokers.userId))
    .where(and(eq(brokerSteps.status, "submitted"), eq(onboardingSteps.active, true), ne(brokers.status, "inactive")))
    .orderBy(asc(brokerSteps.submittedAt), asc(brokerSteps.id));
  return rows.map((row) => ({ ...row, submittedAt: toIso(row.submittedAt) }));
}

export function registerAdminOverviewRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/v1/admin/overview",
    { schema: { tags: ["admin"], summary: "Admin overview numbers and lists (3a)", response: { 200: overviewResponseSchema } } },
    async () => {
      const { db } = app.deps;
      const now = app.deps.now();
      const metrics = await listBrokerMetrics(db);
      const reviews = await loadReviewQueue(db);
      const onboarding = metrics.filter((row) => row.status === "onboarding");
      const active = metrics.filter((row) => row.status === "active");

      const stepRows = onboarding.length
        ? await db
            .select({
              brokerId: brokerSteps.brokerId,
              key: onboardingSteps.key,
              shortTitle: onboardingSteps.shortTitle,
              position: onboardingSteps.position,
              status: brokerSteps.status,
            })
            .from(brokerSteps)
            .innerJoin(onboardingSteps, eq(onboardingSteps.id, brokerSteps.stepId))
            .where(and(inArray(brokerSteps.brokerId, onboarding.map((row) => row.brokerId)), eq(onboardingSteps.active, true)))
        : [];

      const inProgress = onboarding
        .map((row) => {
          const steps = stepRows.filter((step) => step.brokerId === row.brokerId);
          const waitingOnUs = steps.some((step) => step.status === "submitted");
          const next = findNextStep(steps) ?? steps.find((step) => step.status === "submitted") ?? null;
          return {
            brokerId: row.brokerId,
            name: row.name,
            approved: row.stepsApproved,
            total: row.stepsTotal,
            nextStep: next ? { key: next.key, shortTitle: next.shortTitle, status: next.status } : null,
            waitingOnUs,
            stuckDays: waitingOnUs
              ? null
              : stuckDays({ status: row.status, lastActivityAt: row.lastActivityAt, joinedAt: row.joinedAt, now }),
            joinedAt: row.joinedAt,
          };
        })
        .sort((a, b) => Number(a.stuckDays !== null) - Number(b.stuckDays !== null) || b.joinedAt.localeCompare(a.joinedAt))
        .map(({ joinedAt: _joinedAt, ...rest }) => rest);

      return {
        today: todayFor(now),
        counts: {
          active: active.length,
          junior: active.filter((row) => row.level === "junior").length,
          senior: active.filter((row) => row.level === "senior").length,
          onboarding: onboarding.length,
          stuck: inProgress.filter((row) => row.stuckDays !== null).length,
          waitingReview: reviews.length,
        },
        averageDaysToOnboard: averageDaysToOnboard(metrics),
        reviews,
        inProgress,
      };
    },
  );

  r.get(
    "/v1/admin/reviews",
    { schema: { tags: ["admin"], summary: "Submissions waiting for review, oldest first", response: { 200: reviewListResponseSchema } } },
    async () => ({ reviews: await loadReviewQueue(app.deps.db) }),
  );

  r.get(
    "/v1/admin/metrics",
    {
      schema: { tags: ["admin"], summary: "Every row of the broker_metrics view", response: { 200: metricsResponseSchema } },
    },
    async () => ({ brokers: (await listBrokerMetrics(app.deps.db)).map(toBrokerListRow) }),
  );
}
