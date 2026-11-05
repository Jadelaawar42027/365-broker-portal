/**
 * File: apps/api/src/services/invite-links.ts
 * Purpose: The broker invite link admins see on a profile and copy or send by WhatsApp. It stays the same until the
 * broker creates their account, an admin makes a new one, or the broker is set inactive, so it can be shared at any time.
 * A broker who still holds an older random invite (sent before links became permanent) keeps it until an admin replaces it.
 *
 * Functions:
 * - inviteUrl(env, token): the web address of an invite token.
 * - ensureBrokerInviteUrl(db, input): returns the broker's current invite link, creating one (with an audit_log row) when they have none; null when only an older random invite is open.
 * - replaceBrokerInviteUrl(tx, input): makes a new invite link (the old one stops working), writes audit_log and returns it.
 */
import { brokers, type Database, type DbOrTx } from "@bp/db";
import { eq } from "drizzle-orm";
import type { ApiEnv } from "../env";
import { findShowableInviteToken, hasOpenInvite, issueBrokerInviteToken } from "./account-tokens";
import { writeAudit } from "./audit";
import { webLink } from "./support";

type InviteInput = { env: ApiEnv; brokerId: string; userId: string; actorUserId: string | null; now: Date };

export function inviteUrl(env: ApiEnv, token: string): string {
  return webLink(env, `/invite/${token}`);
}

export async function replaceBrokerInviteUrl(tx: DbOrTx, input: InviteInput): Promise<string> {
  const token = await issueBrokerInviteToken(tx, { userId: input.userId, createdBy: input.actorUserId, now: input.now, secret: input.env.BETTER_AUTH_SECRET });
  await writeAudit(tx, { actorUserId: input.actorUserId, action: "broker.invite_link_created", entityType: "broker", entityId: input.brokerId });
  return inviteUrl(input.env, token);
}

export async function ensureBrokerInviteUrl(db: Database, input: InviteInput): Promise<string | null> {
  const secret = input.env.BETTER_AUTH_SECRET;
  const existing = await findShowableInviteToken(db, input.userId, secret, input.now);
  if (existing) return inviteUrl(input.env, existing);
  return db.transaction(async (tx) => {
    await tx.select({ id: brokers.id }).from(brokers).where(eq(brokers.id, input.brokerId)).for("update");
    const current = await findShowableInviteToken(tx, input.userId, secret, input.now);
    if (current) return inviteUrl(input.env, current);
    if (await hasOpenInvite(tx, input.userId, input.now)) return null;
    return replaceBrokerInviteUrl(tx, input);
  });
}
