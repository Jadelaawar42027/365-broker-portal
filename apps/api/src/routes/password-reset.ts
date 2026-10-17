/**
 * File: apps/api/src/routes/password-reset.ts
 * Purpose: Public "forgot password" routes (SPEC D8). Requesting a link always answers the same way so it never
 * reveals which emails exist; completing a reset sets the new password, uses up the link and signs the user out everywhere.
 *
 * Functions:
 * - registerPasswordResetRoutes(app): mounts POST /v1/password-reset/request, GET /v1/password-reset/:token and POST /v1/password-reset/:token.
 */
import { brokers, sessions, users } from "@bp/db";
import {
  canLogIn,
  errorResponseSchema,
  okResponseSchema,
  passwordResetCompleteRequestSchema,
  passwordResetInfoResponseSchema,
  passwordResetRequestSchema,
} from "@bp/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  consumeAccountToken,
  findUsableToken,
  hasPasswordLogin,
  issueAccountToken,
  setUserPassword,
} from "../services/account-tokens";
import { writeAudit } from "../services/audit";
import { passwordResetEmail } from "../services/emails";
import { sendSafely } from "../services/mailer";
import { supportContact, webLink } from "../services/support";

const tokenParams = z.object({ token: z.string().min(10).max(200) });

export function registerPasswordResetRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    "/v1/password-reset/request",
    {
      schema: {
        tags: ["auth"],
        summary: "Email a password reset link (same answer whether or not the email exists)",
        body: passwordResetRequestSchema,
        response: { 202: okResponseSchema },
      },
    },
    async (request, reply) => {
      const { db, env, mailer } = app.deps;
      const [user] = await db
        .select({ id: users.id, name: users.name, email: users.email, role: users.role, brokerStatus: brokers.status })
        .from(users)
        .leftJoin(brokers, eq(brokers.userId, users.id))
        .where(eq(users.email, request.body.email));
      if (user && canLogIn(user) && (await hasPasswordLogin(db, user.id))) {
        const token = await db.transaction(async (tx) => {
          const issued = await issueAccountToken(tx, {
            userId: user.id,
            purpose: "password_reset",
            createdBy: null,
            now: app.deps.now(),
          });
          await writeAudit(tx, { actorUserId: null, action: "user.password_reset_requested", entityType: "user", entityId: user.id });
          return issued;
        });
        await sendSafely(mailer, request.log, [
          { to: user.email, ...passwordResetEmail({ name: user.name, link: webLink(env, `/reset/${token}`), support: supportContact(env) }) },
        ]);
      }
      return reply.status(202).send({ ok: true as const });
    },
  );

  r.get(
    "/v1/password-reset/:token",
    {
      schema: {
        tags: ["auth"],
        summary: "Check a password reset link",
        params: tokenParams,
        response: { 200: passwordResetInfoResponseSchema, 404: errorResponseSchema, 410: errorResponseSchema },
      },
    },
    async (request) => {
      const reset = await findUsableToken(app.deps.db, request.params.token, "password_reset", app.deps.now());
      return { email: reset.email };
    },
  );

  r.post(
    "/v1/password-reset/:token",
    {
      schema: {
        tags: ["auth"],
        summary: "Set a new password and sign out of every session",
        params: tokenParams,
        body: passwordResetCompleteRequestSchema,
        response: { 200: okResponseSchema, 404: errorResponseSchema, 410: errorResponseSchema },
      },
    },
    async (request) => {
      const { db } = app.deps;
      const now = app.deps.now();
      const reset = await findUsableToken(db, request.params.token, "password_reset", now);
      await db.transaction(async (tx) => {
        await consumeAccountToken(tx, reset.tokenId, now);
        await setUserPassword(tx, reset.userId, request.body.password);
        const revoked = await tx.delete(sessions).where(eq(sessions.userId, reset.userId)).returning({ id: sessions.id });
        await writeAudit(tx, {
          actorUserId: reset.userId,
          action: "user.password_reset",
          entityType: "user",
          entityId: reset.userId,
          after: { sessionsRevoked: revoked.length },
        });
      });
      return { ok: true as const };
    },
  );
}
