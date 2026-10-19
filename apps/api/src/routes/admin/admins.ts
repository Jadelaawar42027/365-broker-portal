/**
 * File: apps/api/src/routes/admin/admins.ts
 * Purpose: Management of admin accounts from the Admins tab (SPEC D7, widened so any admin can invite another): list
 * the admins and the owner, invite a new admin by email (the invite link is also returned so it can be copied), and
 * make a fresh invite link for an admin who hasn't created their login yet. The same invite logic backs the
 * `pnpm admin:invite` script.
 *
 * Functions:
 * - inviteAdmin(deps, input): creates the admin user, issues an invite token and writes the audit row; returns the user id and token.
 * - listAdmins(db): every admin and owner, owner first then by name, with whether each has created their login.
 * - registerAdminAccountRoutes(app): mounts GET and POST /v1/admin/admins and POST /v1/admin/admins/:id/resend-invite.
 */
import { accounts, users } from "@bp/db";
import { adminListResponseSchema, createAdminRequestSchema, createAdminResponseSchema, errorResponseSchema, inviteLinkResponseSchema } from "@bp/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppDeps } from "../../deps";
import { conflict, notFound } from "../../errors";
import { currentActor } from "../../plugins/auth-guard";
import { hasPasswordLogin, issueAccountToken } from "../../services/account-tokens";
import { writeAudit } from "../../services/audit";
import { adminInviteEmail } from "../../services/emails";
import { sendSafely } from "../../services/mailer";
import { webLink } from "../../services/support";

const idParams = z.object({ id: z.uuid() });

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

async function listAdmins(db: AppDeps["db"]) {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt })
    .from(users)
    .where(inArray(users.role, ["admin", "owner"]));
  const ids = rows.map((row) => row.id);
  const withLogin = ids.length
    ? await db
        .select({ userId: accounts.userId })
        .from(accounts)
        .where(and(inArray(accounts.userId, ids), eq(accounts.providerId, "credential")))
    : [];
  const loginIds = new Set(withLogin.map((row) => row.userId));
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role === "owner" ? ("owner" as const) : ("admin" as const),
      hasLogin: loginIds.has(row.id),
      createdAt: row.createdAt.toISOString(),
    }))
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "owner" ? -1 : 1));
}

export function registerAdminAccountRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/v1/admin/admins",
    {
      schema: {
        tags: ["admin"],
        summary: "Every admin and the owner, with whether each has created their login",
        response: { 200: adminListResponseSchema },
      },
    },
    async () => ({ admins: await listAdmins(app.deps.db) }),
  );

  r.post(
    "/v1/admin/admins",
    {
      schema: {
        tags: ["admin"],
        summary: "Invite a new admin by email; returns the invite link as well",
        body: createAdminRequestSchema,
        response: { 201: createAdminResponseSchema, 403: errorResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const actor = currentActor(request);
      const { userId, token } = await inviteAdmin(app.deps, { ...request.body, invitedByUserId: actor.userId });
      const inviteUrl = webLink(app.deps.env, `/invite/${token}`);
      await sendSafely(app.deps.mailer, request.log, [
        { to: request.body.email, ...adminInviteEmail({ name: request.body.name, link: inviteUrl, invitedBy: actor.name }) },
      ]);
      return reply.status(201).send({ userId, inviteUrl });
    },
  );

  r.post(
    "/v1/admin/admins/:id/resend-invite",
    {
      schema: {
        tags: ["admin"],
        summary: "Email a pending admin a fresh invite link and return it (the old one stops working)",
        params: idParams,
        response: { 200: inviteLinkResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      const { db, env, mailer } = app.deps;
      const [user] = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(and(eq(users.id, request.params.id), inArray(users.role, ["admin", "owner"])));
      if (!user) throw notFound("We couldn't find that admin.");
      if (await hasPasswordLogin(db, user.id)) throw conflict("This admin already created their login.", "already_signed_up");
      const token = await db.transaction(async (tx) => {
        const issued = await issueAccountToken(tx, { userId: user.id, purpose: "invite", createdBy: actor.userId, now: app.deps.now() });
        await writeAudit(tx, { actorUserId: actor.userId, action: "user.admin_invite_resent", entityType: "user", entityId: user.id });
        return issued;
      });
      const inviteUrl = webLink(env, `/invite/${token}`);
      await sendSafely(mailer, request.log, [{ to: user.email, ...adminInviteEmail({ name: user.name, link: inviteUrl, invitedBy: actor.name }) }]);
      return { inviteUrl };
    },
  );
}
