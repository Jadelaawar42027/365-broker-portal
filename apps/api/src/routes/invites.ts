/**
 * File: apps/api/src/routes/invites.ts
 * Purpose: Public routes behind the invite link (screen 1a). Opening the link shows who it is for; accepting it sets
 * the name and password (and the phone, only if the admin didn't enter one; otherwise the phone on file is kept),
 * moves a broker from invited to onboarding, uses up the link and signs the user in.
 * A broker invited without an email (SPEC D29) gives their own email when accepting; it becomes their sign-in email.
 *
 * Functions:
 * - registerInviteRoutes(app): mounts GET /v1/invites/:token and POST /v1/invites/:token/accept.
 */
import { brokers, users } from "@bp/db";
import {
  acceptInviteRequestSchema,
  acceptInviteResponseSchema,
  errorResponseSchema,
  inviteInfoResponseSchema,
  isPlaceholderEmail,
  visibleEmail,
} from "@bp/shared";
import { fromNodeHeaders } from "better-auth/node";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { badRequest, conflict } from "../errors";
import { consumeAccountToken, findUsableToken, setUserPassword } from "../services/account-tokens";
import { writeAudit } from "../services/audit";
import { firstName } from "../services/emails";

const tokenParams = z.object({ token: z.string().min(10).max(200) });

export function registerInviteRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/v1/invites/:token",
    {
      schema: {
        tags: ["auth"],
        summary: "Who an invite link is for",
        params: tokenParams,
        response: { 200: inviteInfoResponseSchema, 404: errorResponseSchema, 410: errorResponseSchema },
      },
    },
    async (request) => {
      const invite = await findUsableToken(app.deps.db, request.params.token, "invite", app.deps.now());
      return { email: visibleEmail(invite.email), name: invite.name, firstName: firstName(invite.name), role: invite.role, hasPhone: Boolean(invite.phone) };
    },
  );

  r.post(
    "/v1/invites/:token/accept",
    {
      schema: {
        tags: ["auth"],
        summary: "Create the account from an invite and sign in",
        params: tokenParams,
        body: acceptInviteRequestSchema,
        response: { 200: acceptInviteResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema, 410: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { db, auth } = app.deps;
      const now = app.deps.now();
      const invite = await findUsableToken(db, request.params.token, "invite", now);
      const needsEmail = isPlaceholderEmail(invite.email);
      if (needsEmail && !request.body.email) throw badRequest("Enter the email you'll sign in with.", "email_required");
      const signInEmail = needsEmail ? request.body.email! : invite.email;
      const phone = request.body.phone ?? invite.phone;
      if (!phone) throw badRequest("Enter your mobile number.", "phone_required");
      if (needsEmail) {
        const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, signInEmail));
        if (taken) throw conflict("Someone already uses this email. Try another, or ask us for help.", "email_taken");
      }
      await db.transaction(async (tx) => {
        await consumeAccountToken(tx, invite.tokenId, now);
        await tx
          .update(users)
          .set({ name: request.body.name, phone, emailVerified: true, ...(needsEmail ? { email: signInEmail } : {}) })
          .where(eq(users.id, invite.userId));
        await setUserPassword(tx, invite.userId, request.body.password);
        const started = await tx
          .update(brokers)
          .set({ status: "onboarding" })
          .where(and(eq(brokers.userId, invite.userId), eq(brokers.status, "invited")))
          .returning({ id: brokers.id });
        await writeAudit(tx, {
          actorUserId: invite.userId,
          action: "user.invite_accepted",
          entityType: "user",
          entityId: invite.userId,
          ...(needsEmail ? { after: { email: signInEmail } } : {}),
        });
        if (started[0]) {
          await writeAudit(tx, {
            actorUserId: invite.userId,
            action: "broker.status_changed",
            entityType: "broker",
            entityId: started[0].id,
            before: { status: "invited" },
            after: { status: "onboarding" },
          });
        }
      });
      const signIn = await auth.api.signInEmail({
        body: { email: signInEmail, password: request.body.password },
        headers: fromNodeHeaders(request.headers),
        asResponse: true,
      });
      const cookies = signIn.headers.getSetCookie();
      if (cookies.length > 0) reply.header("set-cookie", cookies);
      return { role: invite.role };
    },
  );
}
