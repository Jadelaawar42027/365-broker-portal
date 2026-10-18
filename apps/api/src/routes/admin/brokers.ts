/**
 * File: apps/api/src/routes/admin/brokers.ts
 * Purpose: Admin routes for managing brokers (3b, 3c): the filtered list (with training progress from the
 * broker_training_metrics view), inviting a new broker (name, E.164 phone, optional email, level and both commission
 * splits; without an email the invite link is returned for the admin to send by hand, SPEC D29), a fresh invite link
 * on demand, the full profile with files, persona and commission history, editing level/status/dates, changing the
 * commission split (a new history row; agreements not yet countersigned are voided so the broker signs again, and
 * signed ones return the Section 1.7 addendum warning, SPEC D31), the persona, resending an invite, sending a reset link and reminders.
 * Setting a broker to inactive deletes their sessions at once (SPEC D9). Every change writes audit_log.
 *
 * Functions:
 * - registerAdminBrokerRoutes(app): mounts the /v1/admin/brokers routes.
 * - pickChanges(before, body): returns only the fields whose value actually changes.
 * - toHistoryEntry(row): shapes a commission_history row for the profile.
 */
import { randomBytes } from "node:crypto";
import { addCommissionChange, contractDocuments, voidOpenContracts, brokerMetrics, brokers, brokerTrainingMetrics, commissionHistoryFor, createBroker, currentCommission, sessions, users } from "@bp/db";
import {
  brokerListQuerySchema,
  commissionChangeRequestSchema,
  commissionChangeResponseSchema,
  CONTRACT_STEP_KEY,
  SPLIT_ADDENDUM_WARNING,
  inviteLinkResponseSchema,
  isPlaceholderEmail,
  placeholderEmail,
  visibleEmail,
  brokerListResponseSchema,
  brokerProfileResponseSchema,
  createBrokerRequestSchema,
  createBrokerResponseSchema,
  errorResponseSchema,
  findNextStep,
  okResponseSchema,
  personaRequestSchema,
  remindRequestSchema,
  stepStatusLabel,
  updateBrokerRequestSchema,
  type UpdateBrokerRequest,
} from "@bp/shared";
import { and, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { badRequest, conflict } from "../../errors";
import { currentActor } from "../../plugins/auth-guard";
import { hasPasswordLogin, issueAccountToken } from "../../services/account-tokens";
import { writeAudit } from "../../services/audit";
import { countBrokersByStatus, listBrokerMetrics, loadBrokerWithUser, toBrokerListRow } from "../../services/brokers";
import { inviteEmail, passwordResetEmail, reminderEmail, resignNeededEmail } from "../../services/emails";
import { sendSafely } from "../../services/mailer";
import { loadBrokerSteps, loadFiles, toFileView, toIso } from "../../services/steps";
import { supportContact, todayFor, webLink } from "../../services/support";

const idParams = z.object({ id: z.uuid() });
const personaEditor = alias(users, "persona_editor");

function toHistoryEntry(row: Awaited<ReturnType<typeof commissionHistoryFor>>[number]) {
  return {
    id: row.id,
    inHouseSplit: row.inHousePct,
    selfGeneratedSplit: row.selfGeneratedPct,
    effectiveFrom: row.effectiveFrom,
    changedByName: row.changedByName,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

function pickChanges(before: Record<string, unknown>, body: UpdateBrokerRequest) {
  const changes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && before[key] !== value) changes[key] = value;
  }
  return changes;
}

export function registerAdminBrokerRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/v1/admin/brokers",
    {
      schema: {
        tags: ["admin"],
        summary: "All brokers with metrics; search matches name, email and persona text",
        querystring: brokerListQuerySchema,
        response: { 200: brokerListResponseSchema },
      },
    },
    async (request) => {
      const rows = await listBrokerMetrics(app.deps.db, request.query);
      const training = await app.deps.db.select().from(brokerTrainingMetrics);
      return {
        counts: await countBrokersByStatus(app.deps.db),
        brokers: rows.map((row) => {
          const metrics = training.find((item) => item.brokerId === row.brokerId);
          return {
            ...toBrokerListRow(row),
            training: metrics ? { chaptersPassed: metrics.chaptersPassed, chaptersTotal: metrics.chaptersTotal, avgBestScore: metrics.avgBestScore } : undefined,
          };
        }),
      };
    },
  );

  r.post(
    "/v1/admin/brokers",
    {
      schema: {
        tags: ["admin"],
        summary: "Create a broker and email them an invite link",
        body: createBrokerRequestSchema,
        response: { 201: createBrokerResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const actor = currentActor(request);
      const { db, env, mailer } = app.deps;
      const now = app.deps.now();
      if (request.body.email) {
        const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, request.body.email));
        if (existing) throw conflict("Someone with this email already has an account.", "email_taken");
      }
      const email = request.body.email ?? placeholderEmail(randomBytes(9).toString("hex"));
      const { brokerId, token } = await db.transaction(async (tx) => {
        const created = await createBroker(tx, {
          name: request.body.name,
          email,
          phone: request.body.phone,
          level: request.body.level,
          status: "invited",
          joinedAt: request.body.joinedAt ?? todayFor(now),
          inHouseSplit: request.body.inHouseSplit,
          selfGeneratedSplit: request.body.selfGeneratedSplit,
          commissionChangedBy: actor.userId,
          commissionNote: "Set at invite",
        });
        const issued = await issueAccountToken(tx, { userId: created.userId, purpose: "invite", createdBy: actor.userId, now });
        await writeAudit(tx, {
          actorUserId: actor.userId,
          action: "broker.created",
          entityType: "broker",
          entityId: created.brokerId,
          after: {
            status: "invited",
            level: request.body.level,
            email: request.body.email ?? null,
            phone: request.body.phone,
            inHouseSplit: request.body.inHouseSplit,
            selfGeneratedSplit: request.body.selfGeneratedSplit,
          },
        });
        return { brokerId: created.brokerId, token: issued };
      });
      const inviteUrl = webLink(env, `/invite/${token}`);
      if (request.body.email) {
        await sendSafely(mailer, request.log, [{ to: request.body.email, ...inviteEmail({ name: request.body.name, link: inviteUrl, support: supportContact(env) }) }]);
      }
      return reply.status(201).send({ brokerId, inviteUrl: request.body.email ? null : inviteUrl });
    },
  );

  r.get(
    "/v1/admin/brokers/:id",
    {
      schema: {
        tags: ["admin"],
        summary: "A broker's profile: details, metrics, persona and every step with all file versions",
        params: idParams,
        response: { 200: brokerProfileResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => {
      const { db } = app.deps;
      const { broker, user } = await loadBrokerWithUser(db, request.params.id);
      const [metrics] = await db.select().from(brokerMetrics).where(eq(brokerMetrics.brokerId, broker.id));
      const [editor] = broker.personaUpdatedBy
        ? await db.select({ name: personaEditor.name }).from(personaEditor).where(eq(personaEditor.id, broker.personaUpdatedBy))
        : [];
      const steps = await loadBrokerSteps(db, broker.id);
      const files = await loadFiles(db, steps.map((step) => step.brokerStepId));
      const nextKey = findNextStep(steps)?.key ?? null;
      const history = await commissionHistoryFor(db, broker.id);
      const commission = await currentCommission(db, broker.id);
      return {
        broker: {
          id: broker.id,
          userId: user.id,
          name: user.name,
          email: visibleEmail(user.email),
          phone: user.phone,
          level: broker.level,
          status: broker.status,
          joinedAt: broker.joinedAt,
          onboardedAt: broker.onboardedAt,
          leftAt: broker.leftAt,
          inHouseSplit: commission.inHousePct,
          selfGeneratedSplit: commission.selfGeneratedPct,
          hasLogin: await hasPasswordLogin(db, user.id),
        },
        metrics: {
          tenureDays: metrics?.tenureDays ?? 0,
          daysToOnboard: metrics?.daysToOnboard ?? null,
          stepsApproved: metrics?.stepsApproved ?? 0,
          stepsTotal: metrics?.stepsTotal ?? steps.length,
          lastActivityAt: toIso(metrics?.lastActivityAt),
        },
        persona: {
          markdown: broker.personaMd,
          updatedAt: toIso(broker.personaUpdatedAt),
          updatedByName: editor?.name ?? null,
        },
        steps: steps.map((step) => {
          const { label, tone } = stepStatusLabel({
            status: step.status,
            stepKey: step.key,
            needsApproval: step.needsApproval,
            isNext: step.key === nextKey,
          });
          return {
            brokerStepId: step.brokerStepId,
            key: step.key,
            position: step.position,
            stage: step.stage,
            title: step.title,
            shortTitle: step.shortTitle,
            kind: step.kind,
            needsApproval: step.needsApproval,
            status: step.status,
            label,
            tone,
            attempts: step.attempts,
            submittedAt: toIso(step.submittedAt),
            reviewedAt: toIso(step.reviewedAt),
            reviewerName: step.reviewerName,
            reviewNote: step.reviewNote,
            formData: step.formData,
            files: files.filter((file) => file.brokerStepId === step.brokerStepId).map(toFileView),
          };
        }),
        commissionHistory: history.map(toHistoryEntry),
      };
    },
  );

  r.patch(
    "/v1/admin/brokers/:id",
    {
      schema: {
        tags: ["admin"],
        summary: "Change level, status, joining or leaving date",
        params: idParams,
        body: updateBrokerRequestSchema,
        response: { 200: okResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      const { db } = app.deps;
      const { broker } = await loadBrokerWithUser(db, request.params.id);
      const changes = pickChanges(broker, request.body);
      if (Object.keys(changes).length === 0) return { ok: true as const };
      const joinedAt = (changes.joinedAt as string | undefined) ?? broker.joinedAt;
      const leftAt = changes.leftAt === undefined ? broker.leftAt : (changes.leftAt as string | null);
      if (leftAt && leftAt < joinedAt) throw badRequest("The leaving date can't be before the joining date.", "invalid_dates");
      if (broker.onboardedAt && broker.onboardedAt < joinedAt) {
        throw badRequest("The joining date can't be after the onboarding date.", "invalid_dates");
      }
      await db.transaction(async (tx) => {
        await tx.update(brokers).set(changes).where(eq(brokers.id, broker.id));
        let sessionsRevoked = 0;
        if (changes.status === "inactive") {
          const revoked = await tx.delete(sessions).where(eq(sessions.userId, broker.userId)).returning({ id: sessions.id });
          sessionsRevoked = revoked.length;
        }
        const before = Object.fromEntries(Object.keys(changes).map((key) => [key, broker[key as keyof typeof broker]]));
        await writeAudit(tx, {
          actorUserId: actor.userId,
          action: changes.status ? "broker.status_changed" : "broker.updated",
          entityType: "broker",
          entityId: broker.id,
          before,
          after: changes.status === "inactive" ? { ...changes, sessionsRevoked } : changes,
        });
      });
      return { ok: true as const };
    },
  );

  r.post(
    "/v1/admin/brokers/:id/commission",
    {
      schema: {
        tags: ["admin"],
        summary: "Change a broker's commission split: adds a history row; the latest row is the current split",
        params: idParams,
        body: commissionChangeRequestSchema,
        response: { 201: commissionChangeResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const actor = currentActor(request);
      const { db } = app.deps;
      const { broker, user } = await loadBrokerWithUser(db, request.params.id);
      const today = todayFor(app.deps.now());
      const effectiveFrom = request.body.effectiveFrom ?? today;
      if (effectiveFrom > today) throw badRequest("The new split can't start in the future. Enter it on the day it starts.", "future_effective_date");
      if (effectiveFrom < broker.joinedAt) throw badRequest("The new split can't start before the broker joined.", "invalid_dates");
      const outcome = await db.transaction(async (tx) => {
        const before = await currentCommission(tx, broker.id);
        await addCommissionChange(tx, {
          brokerId: broker.id,
          inHousePct: request.body.inHouseSplit,
          selfGeneratedPct: request.body.selfGeneratedSplit,
          effectiveFrom,
          changedBy: actor.userId,
          note: request.body.note || null,
        });
        await writeAudit(tx, {
          actorUserId: actor.userId,
          action: "broker.commission_changed",
          entityType: "broker",
          entityId: broker.id,
          before: { inHouseSplit: before.inHousePct, selfGeneratedSplit: before.selfGeneratedPct },
          after: { inHouseSplit: request.body.inHouseSplit, selfGeneratedSplit: request.body.selfGeneratedSplit, effectiveFrom, note: request.body.note ?? null },
        });
        const signed = await tx
          .select({ id: contractDocuments.id })
          .from(contractDocuments)
          .where(and(eq(contractDocuments.brokerId, broker.id), inArray(contractDocuments.status, ["fully_signed", "signed_outside"])))
          .limit(1);
        const voided = await voidOpenContracts(tx, { brokerId: broker.id, reason: "Your commission split changed", actorUserId: actor.userId, now: app.deps.now() });
        return { warning: signed.length ? SPLIT_ADDENDUM_WARNING : null, voided };
      });
      if (outcome.voided.brokerHadSigned) {
        await sendSafely(app.deps.mailer, request.log, [
          { to: user.email, ...resignNeededEmail({ brokerName: user.name, reason: "your commission split changed", link: webLink(app.deps.env, `/app/steps/${CONTRACT_STEP_KEY}`) }) },
        ]);
      }
      return reply.status(201).send({ ok: true as const, warning: outcome.warning, agreementsVoided: outcome.voided.voided > 0 });
    },
  );

  r.post(
    "/v1/admin/brokers/:id/invite-link",
    {
      schema: {
        tags: ["admin"],
        summary: "Make a fresh invite link to send by hand (the old one stops working)",
        params: idParams,
        response: { 200: inviteLinkResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      const { db, env } = app.deps;
      const { broker, user } = await loadBrokerWithUser(db, request.params.id);
      if (broker.status === "inactive") throw conflict("This broker is inactive.", "broker_inactive");
      if (await hasPasswordLogin(db, user.id)) throw conflict("This broker already created their account.", "already_signed_up");
      const token = await db.transaction(async (tx) => {
        const issued = await issueAccountToken(tx, { userId: user.id, purpose: "invite", createdBy: actor.userId, now: app.deps.now() });
        await writeAudit(tx, { actorUserId: actor.userId, action: "broker.invite_link_created", entityType: "broker", entityId: broker.id });
        return issued;
      });
      return { inviteUrl: webLink(env, `/invite/${token}`) };
    },
  );

  r.put(
    "/v1/admin/brokers/:id/persona",
    {
      schema: {
        tags: ["admin"],
        summary: "Replace a broker's persona (admin-only notes used for lead matching)",
        params: idParams,
        body: personaRequestSchema,
        response: { 200: okResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      const { db } = app.deps;
      const { broker } = await loadBrokerWithUser(db, request.params.id);
      const markdown = request.body.markdown.trim().length > 0 ? request.body.markdown : null;
      await db.transaction(async (tx) => {
        await tx
          .update(brokers)
          .set({ personaMd: markdown, personaUpdatedAt: app.deps.now(), personaUpdatedBy: actor.userId })
          .where(eq(brokers.id, broker.id));
        await writeAudit(tx, {
          actorUserId: actor.userId,
          action: "broker.persona_updated",
          entityType: "broker",
          entityId: broker.id,
          before: { personaMd: broker.personaMd },
          after: { personaMd: markdown },
        });
      });
      return { ok: true as const };
    },
  );

  r.post(
    "/v1/admin/brokers/:id/resend-invite",
    {
      schema: {
        tags: ["admin"],
        summary: "Email a fresh invite link (the old one stops working)",
        params: idParams,
        response: { 200: okResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      const { db, env, mailer } = app.deps;
      const { broker, user } = await loadBrokerWithUser(db, request.params.id);
      if (broker.status === "inactive") throw conflict("This broker is inactive.", "broker_inactive");
      if (await hasPasswordLogin(db, user.id)) {
        throw conflict("This broker already created their account. Send a password reset link instead.", "already_signed_up");
      }
      if (isPlaceholderEmail(user.email)) {
        throw conflict("This broker has no email yet. Copy a fresh invite link and send it to them instead.", "no_email");
      }
      const token = await db.transaction(async (tx) => {
        const issued = await issueAccountToken(tx, { userId: user.id, purpose: "invite", createdBy: actor.userId, now: app.deps.now() });
        await writeAudit(tx, { actorUserId: actor.userId, action: "broker.invite_resent", entityType: "broker", entityId: broker.id });
        return issued;
      });
      await sendSafely(mailer, request.log, [
        { to: user.email, ...inviteEmail({ name: user.name, link: webLink(env, `/invite/${token}`), support: supportContact(env) }) },
      ]);
      return { ok: true as const };
    },
  );

  r.post(
    "/v1/admin/brokers/:id/reset-password",
    {
      schema: {
        tags: ["admin"],
        summary: "Email the broker a link to choose a new password",
        params: idParams,
        response: { 200: okResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      const { db, env, mailer } = app.deps;
      const { broker, user } = await loadBrokerWithUser(db, request.params.id);
      if (broker.status === "inactive") throw conflict("This broker is inactive and can't log in.", "broker_inactive");
      if (!(await hasPasswordLogin(db, user.id))) {
        throw conflict("This broker hasn't created their account yet. Resend the invite instead.", "not_signed_up");
      }
      const token = await db.transaction(async (tx) => {
        const issued = await issueAccountToken(tx, {
          userId: user.id,
          purpose: "password_reset",
          createdBy: actor.userId,
          now: app.deps.now(),
        });
        await writeAudit(tx, { actorUserId: actor.userId, action: "user.password_reset_sent", entityType: "user", entityId: user.id });
        return issued;
      });
      await sendSafely(mailer, request.log, [
        { to: user.email, ...passwordResetEmail({ name: user.name, link: webLink(env, `/reset/${token}`), support: supportContact(env) }) },
      ]);
      return { ok: true as const };
    },
  );

  r.post(
    "/v1/admin/brokers/:id/remind",
    {
      schema: {
        tags: ["admin"],
        summary: "Email the broker a reminder about their next step",
        params: idParams,
        body: remindRequestSchema,
        response: { 200: okResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      const { db, env, mailer } = app.deps;
      const { broker, user } = await loadBrokerWithUser(db, request.params.id);
      if (broker.status !== "onboarding") throw conflict("Reminders are only for brokers who are onboarding.", "not_onboarding");
      const next = findNextStep(await loadBrokerSteps(db, broker.id));
      await writeAudit(db, {
        actorUserId: actor.userId,
        action: "broker.reminded",
        entityType: "broker",
        entityId: broker.id,
        after: { stepKey: next?.key ?? null },
      });
      await sendSafely(mailer, request.log, [
        {
          to: user.email,
          ...reminderEmail({
            brokerName: user.name,
            stepTitle: next?.title ?? null,
            message: request.body.message ?? null,
            link: webLink(env, next ? `/app/steps/${next.key}` : "/app"),
            support: supportContact(env),
          }),
        },
      ]);
      return { ok: true as const };
    },
  );
}
