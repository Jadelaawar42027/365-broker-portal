/**
 * File: apps/api/src/routes/admin/admins.ts
 * Purpose: Owner-only management of admin accounts (SPEC D7): invite a new admin by email. No screen this weekend;
 * the same logic backs the `pnpm admin:invite` script.
 *
 * Functions:
 * - inviteAdmin(deps, input): creates the admin user, issues an invite token and writes the audit row; returns the user id and token.
 * - registerAdminAccountRoutes(app): mounts POST /v1/admin/admins (owner only).
 */
import { users } from "@bp/db";
import { createAdminRequestSchema, createAdminResponseSchema, errorResponseSchema } from "@bp/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { AppDeps } from "../../deps";
import { conflict } from "../../errors";
import { currentActor, requireOwner } from "../../plugins/auth-guard";
import { issueAccountToken } from "../../services/account-tokens";
import { writeAudit } from "../../services/audit";
import { adminInviteEmail } from "../../services/emails";
import { sendSafely } from "../../services/mailer";
import { webLink } from "../../services/support";

export async function inviteAdmin(
  deps: Pick<AppDeps, "db" | "now">,
  input: { name: string; email: string; invitedByUserId: string | null },
) {
  const [existing] = await deps.db.select({ id: users.id }).from(users).where(eq(users.email, input.email));
  if (existing) throw conflict("Someone with this email already has an account.", "email_taken");
  return deps.db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ name: input.name, email: input.email, role: "admin" }).returning({ id: users.id });
    const token = await issueAccountToken(tx, { userId: user!.id, purpose: "invite", createdBy: input.invitedByUserId, now: deps.now() });
    await writeAudit(tx, {
      actorUserId: input.invitedByUserId,
      action: "user.admin_invited",
      entityType: "user",
      entityId: user!.id,
      after: { email: input.email, role: "admin" },
    });
    return { userId: user!.id, token };
  });
}

export function registerAdminAccountRoutes(app: FastifyInstance): void {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/v1/admin/admins",
    {
      preHandler: requireOwner,
      schema: {
        tags: ["admin"],
        summary: "Invite a new admin (owner only)",
        body: createAdminRequestSchema,
        response: { 201: createAdminResponseSchema, 403: errorResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const actor = currentActor(request);
      const { userId, token } = await inviteAdmin(app.deps, { ...request.body, invitedByUserId: actor.userId });
      await sendSafely(app.deps.mailer, request.log, [
        {
          to: request.body.email,
          ...adminInviteEmail({ name: request.body.name, link: webLink(app.deps.env, `/invite/${token}`), invitedBy: actor.name }),
        },
      ]);
      return reply.status(201).send({ userId });
    },
  );
}
