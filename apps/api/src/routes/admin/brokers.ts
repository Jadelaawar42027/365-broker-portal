/**
 * File: apps/api/src/routes/admin/brokers.ts
 * Purpose: Admin routes for managing brokers (3b, 3c): the filtered list (with training progress from the
 * broker_training_metrics view), inviting a new broker (name, E.164 phone, optional email, level and both commission
 * splits; the invite link is always returned so the admin can copy it or send it by WhatsApp, SPEC D29 and phase H2,
 * and the broker's Google Workspace and GoHighLevel accounts are queued for creation), adding a broker who already works
 * with 365 Yachts (their existing 365 email is linked instead of creating accounts, and when they are already onboarded every
 * onboarding step is marked approved so only training is left), a fresh invite link on demand, the full profile with files,
 * persona, commission history and the broker's invite link (the same link every time until they create their account),
 * editing level/status/dates, changing the
 * commission split (a new history row; agreements not yet countersigned are voided so the broker signs again, and
 * signed ones return the Section 1.7 addendum warning, SPEC D31), deleting a broker and everything about them for good
 * (owner only, the broker's full name typed to confirm), the persona, resending an invite, sending a reset link and reminders.
 * Setting a broker to inactive deletes their sessions at once (SPEC D9), ends their open invite link, cancels open account set-up and queues suspending
 * their Google account and deactivating their GHL user; reactivating queues unsuspending them (phase H2). The CRM phone
 * is edited here too. The list carries each broker's account status for the icons on 3b. Every change writes audit_log.
 *
 * Functions:
 * - registerAdminBrokerRoutes(app): mounts the /v1/admin/brokers routes.
 * - pickChanges(before, body): returns only the fields whose value actually changes.
 * - accountSystems(broker): the systems (Google, GHL) where the broker has an account to suspend or unsuspend.
 * - toHistoryEntry(row): shapes a commission_history row for the profile.
 */
import { randomBytes } from "node:crypto";
import { addCommissionChange, approveAllSteps, contractDocuments, voidOpenContracts, brokerMetrics, brokers, brokerTrainingMetrics, commissionHistoryFor, createBroker, currentCommission, sessions, users } from "@bp/db";
import {
  addExistingBrokerRequestSchema,
  brokerListQuerySchema,
  commissionChangeRequestSchema,
  commissionChangeResponseSchema,
  canManageAdmins,
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
  deleteBrokerRequestSchema,
  deleteBrokerResponseSchema,
  errorResponseSchema,
  findNextStep,
  okResponseSchema,
  personaRequestSchema,
  remindRequestSchema,
  stepStatusLabel,
  updateBrokerRequestSchema,
  type ProvisioningSystem,
  type UpdateBrokerRequest,
} from "@bp/shared";
import { and, eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { badRequest, conflict, forbidden } from "../../errors";
import { currentActor } from "../../plugins/auth-guard";
import { hasPasswordLogin, issueAccountToken, issueBrokerInviteToken, revokeOpenTokens } from "../../services/account-tokens";
import { writeAudit } from "../../services/audit";
import { deleteBrokerCompletely } from "../../services/broker-deletion";
import { ensureBrokerInviteUrl, inviteUrl as inviteUrlFor, replaceBrokerInviteUrl } from "../../services/invite-links";
import { countBrokersByStatus, listBrokerMetrics, loadBrokerWithUser, toBrokerListRow } from "../../services/brokers";
import { inviteEmail, passwordResetEmail, reminderEmail, resignNeededEmail } from "../../services/emails";
import { sendSafely } from "../../services/mailer";
import { loadAccountSummaries } from "../../services/provisioning/status";
import { cancelOpenTasks, enqueueForSystems } from "../../services/provisioning/tasks";
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

function accountSystems(broker: { googleUserId: string | null; ghlUserId: string | null }): ProvisioningSystem[] {
  const systems: ProvisioningSystem[] = [];
  if (broker.googleUserId) systems.push("google");
  if (broker.ghlUserId) systems.push("ghl");
  return systems;
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
      const accountRows = await app.deps.db
        .select({ id: brokers.id, corporateEmail: brokers.corporateEmail, googleUserId: brokers.googleUserId, ghlUserId: brokers.ghlUserId })
        .from(brokers);
      const summaries = await loadAccountSummaries(app.deps.db, app.deps.integrations, accountRows);
      return {
        counts: await countBrokersByStatus(app.deps.db),
        brokers: rows.map((row) => {
          const metrics = training.find((item) => item.brokerId === row.brokerId);
          return {
            ...toBrokerListRow(row),
            corporateEmail: accountRows.find((entry) => entry.id === row.brokerId)?.corporateEmail ?? null,
            accounts: summaries.get(row.brokerId),
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
        const issued = await issueBrokerInviteToken(tx, { userId: created.userId, createdBy: actor.userId, now, secret: env.BETTER_AUTH_SECRET });
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
        await enqueueForSystems(tx, { brokerId: created.brokerId, action: "create", integrations: app.deps.integrations, createdBy: actor.userId, now });
        return { brokerId: created.brokerId, token: issued };
      });
      app.deps.wakeProvisioning();
      const inviteUrl = inviteUrlFor(env, token);
      if (request.body.email) {
        await sendSafely(mailer, request.log, [{ to: request.body.email, ...inviteEmail({ name: request.body.name, link: inviteUrl, support: supportContact(env) }) }]);
      }
      return reply.status(201).send({ brokerId, inviteUrl, phone: request.body.phone });
    },
  );

  r.post(
    "/v1/admin/brokers/existing",
    {
      schema: {
        tags: ["admin"],
        summary: "Add a broker who already works with 365 Yachts and return their sign-in link (no email is sent)",
        body: addExistingBrokerRequestSchema,
        response: { 201: createBrokerResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const actor = currentActor(request);
      const { db, env } = app.deps;
      const now = app.deps.now();
      const today = todayFor(now);
      const body = request.body;
      const emails = [body.email, body.corporateEmail].filter((value): value is string => Boolean(value)).map((value) => value.toLowerCase());
      if (emails.length > 0) {
        const [taken] = await db
          .select({ id: users.id })
          .from(users)
          .leftJoin(brokers, eq(brokers.userId, users.id))
          .where(or(inArray(users.email, emails), inArray(brokers.corporateEmail, emails)));
        if (taken) throw conflict("Someone with this email already has an account.", "email_taken");
      }
      const onboarded = body.progress === "onboarded";
      const onboardedAt = onboarded ? (body.onboardedAt ?? (today >= body.joinedAt ? today : body.joinedAt)) : null;
      const status = onboarded ? "active" : "invited";
      const corporateEmail = body.corporateEmail?.toLowerCase() ?? null;
      const { brokerId, token } = await db.transaction(async (tx) => {
        const created = await createBroker(tx, {
          name: body.name,
          email: emails[0] ?? placeholderEmail(randomBytes(9).toString("hex")),
          phone: body.phone,
          level: body.level,
          status,
          joinedAt: body.joinedAt,
          onboardedAt,
          inHouseSplit: body.inHouseSplit ?? null,
          selfGeneratedSplit: body.selfGeneratedSplit ?? null,
          commissionChangedBy: actor.userId,
          commissionNote: body.inHouseSplit != null || body.selfGeneratedSplit != null ? "Set when added" : null,
        });
        await tx
          .update(brokers)
          .set({ corporateEmail, crmPhone: body.crmPhone ?? null, ...(onboarded ? { welcomeSeenAt: now } : {}) })
          .where(eq(brokers.id, created.brokerId));
        await writeAudit(tx, {
          actorUserId: actor.userId,
          action: "broker.created",
          entityType: "broker",
          entityId: created.brokerId,
          after: {
            source: "existing",
            status,
            level: body.level,
            email: body.email ?? null,
            corporateEmail,
            phone: body.phone,
            joinedAt: body.joinedAt,
            onboardedAt,
            inHouseSplit: body.inHouseSplit ?? null,
            selfGeneratedSplit: body.selfGeneratedSplit ?? null,
          },
        });
        if (onboarded) {
          const approved = await approveAllSteps(tx, { brokerId: created.brokerId, reviewedBy: actor.userId, note: "Onboarded before the portal", now });
          for (const step of approved) {
            await writeAudit(tx, {
              actorUserId: actor.userId,
              action: "step.approved",
              entityType: "broker_step",
              entityId: step.brokerStepId,
              before: { status: step.before },
              after: { status: "approved", stepKey: step.stepKey, brokerId: created.brokerId, note: "Onboarded before the portal" },
            });
          }
        }
        if (corporateEmail) {
          await enqueueForSystems(tx, { brokerId: created.brokerId, action: "link", integrations: app.deps.integrations, createdBy: actor.userId, now });
        } else if (!onboarded) {
          await enqueueForSystems(tx, { brokerId: created.brokerId, action: "create", integrations: app.deps.integrations, createdBy: actor.userId, now });
        }
        const issued = await issueBrokerInviteToken(tx, { userId: created.userId, createdBy: actor.userId, now, secret: env.BETTER_AUTH_SECRET });
        return { brokerId: created.brokerId, token: issued };
      });
      app.deps.wakeProvisioning();
      return reply.status(201).send({ brokerId, inviteUrl: inviteUrlFor(env, token), phone: body.phone });
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
      const actor = currentActor(request);
      const { db, env } = app.deps;
      const { broker, user } = await loadBrokerWithUser(db, request.params.id);
      const hasLogin = await hasPasswordLogin(db, user.id);
      const inviteUrl =
        hasLogin || broker.status === "inactive"
          ? null
          : await ensureBrokerInviteUrl(db, { env, brokerId: broker.id, userId: user.id, actorUserId: actor.userId, now: app.deps.now() });
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
          corporateEmail: broker.corporateEmail,
          crmPhone: broker.crmPhone,
          hasLogin,
          inviteUrl,
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
        let provisioning: Awaited<ReturnType<typeof enqueueForSystems>> | null = null;
        if (changes.status === "inactive") {
          const revoked = await tx.delete(sessions).where(eq(sessions.userId, broker.userId)).returning({ id: sessions.id });
          sessionsRevoked = revoked.length;
          await revokeOpenTokens(tx, broker.userId, "invite", app.deps.now());
          await cancelOpenTasks(tx, { brokerId: broker.id, actions: ["create", "link", "unsuspend"], reason: "Cancelled: the broker was set to inactive." });
          provisioning = await enqueueForSystems(tx, { brokerId: broker.id, action: "suspend", integrations: app.deps.integrations, createdBy: actor.userId, now: app.deps.now(), systems: accountSystems(broker) });
        } else if (changes.status && broker.status === "inactive") {
          await cancelOpenTasks(tx, { brokerId: broker.id, actions: ["suspend"], reason: "Cancelled: the broker was reactivated." });
          provisioning = await enqueueForSystems(tx, { brokerId: broker.id, action: "unsuspend", integrations: app.deps.integrations, createdBy: actor.userId, now: app.deps.now(), systems: accountSystems(broker) });
        }
        const before = Object.fromEntries(Object.keys(changes).map((key) => [key, broker[key as keyof typeof broker]]));
        await writeAudit(tx, {
          actorUserId: actor.userId,
          action: changes.status ? "broker.status_changed" : "broker.updated",
          entityType: "broker",
          entityId: broker.id,
          before,
          after: changes.status === "inactive" ? { ...changes, sessionsRevoked, provisioning } : provisioning ? { ...changes, provisioning } : changes,
        });
      });
      app.deps.wakeProvisioning();
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
        summary: "Replace the broker's invite link with a new one (the old one stops working)",
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
      const inviteUrl = await db.transaction((tx) =>
        replaceBrokerInviteUrl(tx, { env, brokerId: broker.id, userId: user.id, actorUserId: actor.userId, now: app.deps.now() }),
      );
      return { inviteUrl };
    },
  );

  r.delete(
    "/v1/admin/brokers/:id",
    {
      schema: {
        tags: ["admin"],
        summary: "Delete a broker and everything stored about them, permanently (owner only; type their full name to confirm)",
        params: idParams,
        body: deleteBrokerRequestSchema,
        response: { 200: deleteBrokerResponseSchema, 400: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      if (!canManageAdmins(actor.role)) throw forbidden("Only the owner can delete a broker.");
      const result = await deleteBrokerCompletely(
        { db: app.deps.db, storage: app.deps.storage, log: request.log },
        { brokerId: request.params.id, confirmName: request.body.confirmName, actorUserId: actor.userId },
      );
      return { ok: true as const, ...result };
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
        summary: "Email the broker their invite link (the same link shown on their profile)",
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
        throw conflict("This broker has no email yet. Copy their invite link and send it to them instead.", "no_email");
      }
      const input = { env, brokerId: broker.id, userId: user.id, actorUserId: actor.userId, now: app.deps.now() };
      const link = (await ensureBrokerInviteUrl(db, input)) ?? (await db.transaction((tx) => replaceBrokerInviteUrl(tx, input)));
      await writeAudit(db, { actorUserId: actor.userId, action: "broker.invite_resent", entityType: "broker", entityId: broker.id });
      await sendSafely(mailer, request.log, [{ to: user.email, ...inviteEmail({ name: user.name, link, support: supportContact(env) }) }]);
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
