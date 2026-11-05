/**
 * File: apps/api/src/routes/admin/reviews.ts
 * Purpose: Reviewing a broker's submission (3d): the detail with files and checklist and its place in the queue,
 * approve, send back with a required note, and "mark done" (the admin override, SPEC D2). Approving the last step
 * activates the broker and notifies everyone. Step 3's agreements (SPEC D31) can't be approved here while they wait
 * for a countersignature, and sending step 3 back voids its open documents so the broker signs again.
 *
 * Functions:
 * - registerAdminReviewRoutes(app): mounts GET /v1/admin/broker-steps/:id and its approve, send-back and mark-done actions.
 * - requireBrokerStep(app, id): loads a broker step by id or throws 404.
 * - emailBroker(app, log, brokerStepId, build): emails the broker of a step with a message built from their name and the step.
 */
import { brokers, contractDocuments, users, voidOpenContracts } from "@bp/db";
import {
  CONTRACT_STEP_KEY,
  errorResponseSchema,
  markDoneRequestSchema,
  reviewDetailResponseSchema,
  sendBackRequestSchema,
  STAGE_TITLES,
  stepActionResponseSchema,
} from "@bp/shared";
import { and, eq } from "drizzle-orm";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { conflict, notFound } from "../../errors";
import { currentActor } from "../../plugins/auth-guard";
import { firstName, stepApprovedEmail, stepSentBackEmail } from "../../services/emails";
import { sendSafely, type EmailMessage } from "../../services/mailer";
import {
  activateIfComplete,
  applyStepAction,
  latestVersionFiles,
  loadBrokerStepById,
  loadBrokerSteps,
  loadFiles,
  toFileView,
  toIso,
} from "../../services/steps";
import { supportContact, todayFor, webLink } from "../../services/support";
import { notifyOnboardingComplete } from "../broker-steps";
import { loadReviewQueue } from "./overview";

const idParams = z.object({ id: z.uuid() });
const actionResponses = { 200: stepActionResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema };

async function requireBrokerStep(app: FastifyInstance, id: string) {
  const row = await loadBrokerStepById(app.deps.db, id);
  if (!row) throw notFound("Submission not found.");
  return row;
}

async function emailBroker(
  app: FastifyInstance,
  log: FastifyBaseLogger,
  brokerId: string,
  build: (broker: { name: string }) => Omit<EmailMessage, "to">,
) {
  const [broker] = await app.deps.db
    .select({ name: users.name, email: users.email })
    .from(brokers)
    .innerJoin(users, eq(users.id, brokers.userId))
    .where(eq(brokers.id, brokerId));
  if (broker) await sendSafely(app.deps.mailer, log, [{ to: broker.email, ...build(broker) }]);
}

export function registerAdminReviewRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/v1/admin/broker-steps/:id",
    {
      schema: {
        tags: ["admin"],
        summary: "One submission to review, with its files, checklist and place in the review queue",
        params: idParams,
        response: { 200: reviewDetailResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => {
      const { db } = app.deps;
      const row = await requireBrokerStep(app, request.params.id);
      const [broker] = await db.select({ name: users.name }).from(users).where(eq(users.id, row.brokerUserId));
      const steps = await loadBrokerSteps(db, row.brokerId);
      const files = latestVersionFiles(await loadFiles(db, [row.brokerStepId]));
      const queue = await loadReviewQueue(db);
      const index = queue.findIndex((item) => item.brokerStepId === row.brokerStepId);
      return {
        brokerStepId: row.brokerStepId,
        status: row.status,
        position: row.position,
        totalSteps: steps.length,
        stageTitle: STAGE_TITLES[row.stage],
        step: { key: row.key, title: row.title, shortTitle: row.shortTitle, kind: row.kind },
        broker: { id: row.brokerId, name: broker!.name, firstName: firstName(broker!.name) },
        submittedAt: toIso(row.submittedAt),
        attempts: row.attempts,
        formData: row.formData,
        files: files.map(toFileView),
        reviewChecklist: row.config.reviewChecklist ?? [],
        queue: {
          index: index === -1 ? 0 : index + 1,
          total: queue.length,
          previousId: index > 0 ? queue[index - 1]!.brokerStepId : null,
          nextId: index !== -1 && index < queue.length - 1 ? queue[index + 1]!.brokerStepId : null,
        },
      };
    },
  );

  r.post(
    "/v1/admin/broker-steps/:id/approve",
    { schema: { tags: ["admin"], summary: "Approve a submitted step", params: idParams, response: actionResponses } },
    async (request) => {
      const actor = currentActor(request);
      const row = await requireBrokerStep(app, request.params.id);
      const now = app.deps.now();
      if (row.key === CONTRACT_STEP_KEY) {
        const waiting = await app.deps.db
          .select({ id: contractDocuments.id })
          .from(contractDocuments)
          .where(and(eq(contractDocuments.brokerId, row.brokerId), eq(contractDocuments.status, "broker_signed")))
          .limit(1);
        if (waiting.length) throw conflict("These agreements need a countersignature. Countersign them from the broker's profile instead.", "countersign_required");
      }
      const result = await app.deps.db.transaction(async (tx) => {
        const change = await applyStepAction(tx, { row, action: "approve", actorUserId: actor.userId, now });
        const completed = await activateIfComplete(tx, { brokerId: row.brokerId, actorUserId: actor.userId, today: todayFor(now) });
        return { status: change.to, onboardingComplete: completed };
      });
      const { env } = app.deps;
      await emailBroker(app, request.log, row.brokerId, (broker) =>
        stepApprovedEmail({ brokerName: broker.name, stepTitle: row.title, link: webLink(env, "/app"), support: supportContact(env) }),
      );
      if (result.onboardingComplete) await notifyOnboardingComplete(app, request.log, row.brokerId);
      return result;
    },
  );

  r.post(
    "/v1/admin/broker-steps/:id/send-back",
    {
      schema: {
        tags: ["admin"],
        summary: "Send a submitted step back to the broker with a note",
        params: idParams,
        body: sendBackRequestSchema,
        response: actionResponses,
      },
    },
    async (request) => {
      const actor = currentActor(request);
      const row = await requireBrokerStep(app, request.params.id);
      const change = await app.deps.db.transaction(async (tx) => {
        const sent = await applyStepAction(tx, { row, action: "send_back", actorUserId: actor.userId, now: app.deps.now(), note: request.body.note });
        if (row.key === CONTRACT_STEP_KEY) {
          await voidOpenContracts(tx, { brokerId: row.brokerId, reason: request.body.note, actorUserId: actor.userId, now: app.deps.now(), resetStep: false });
        }
        return sent;
      });
      const { env } = app.deps;
      await emailBroker(app, request.log, row.brokerId, (broker) =>
        stepSentBackEmail({
          brokerName: broker.name,
          stepTitle: row.title,
          note: request.body.note,
          reviewerName: firstName(actor.name),
          link: webLink(env, `/app/steps/${row.key}`),
          support: supportContact(env),
        }),
      );
      return { status: change.to, onboardingComplete: false };
    },
  );

  r.post(
    "/v1/admin/broker-steps/:id/mark-done",
    {
      schema: {
        tags: ["admin"],
        summary: "Mark a step done on the broker's behalf",
        params: idParams,
        body: markDoneRequestSchema,
        response: actionResponses,
      },
    },
    async (request) => {
      const actor = currentActor(request);
      const row = await requireBrokerStep(app, request.params.id);
      const now = app.deps.now();
      const result = await app.deps.db.transaction(async (tx) => {
        const change = await applyStepAction(tx, {
          row,
          action: "admin_override",
          actorUserId: actor.userId,
          now,
          note: request.body.note ?? null,
        });
        const completed = await activateIfComplete(tx, { brokerId: row.brokerId, actorUserId: actor.userId, today: todayFor(now) });
        return { status: change.to, onboardingComplete: completed };
      });
      if (result.onboardingComplete) await notifyOnboardingComplete(app, request.log, row.brokerId);
      return result;
    },
  );
}
