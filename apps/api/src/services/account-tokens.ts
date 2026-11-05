/**
 * File: apps/api/src/services/account-tokens.ts
 * Purpose: Single-use links for invites and password resets (SPEC D8). Only token hashes are stored; issuing a new
 * token revokes the user's older unused tokens of the same kind; consuming is atomic so a link works exactly once.
 * A broker's invite link has no time limit and its token is derived from the row id and the server secret, so the
 * admin profile can show the same link until the broker creates their account, a new link replaces it, or they go inactive.
 *
 * Functions:
 * - tokenLifetimeMs(purpose): 7 days for invites, 24 hours for resets.
 * - openTokenFilter(userId, purpose, now): the condition for a user's unused tokens of one kind that have no expiry or haven't expired.
 * - revokeOpenTokens(tx, userId, purpose, now): ends every unused, unexpired token of that kind for the user.
 * - issueAccountToken(tx, input): revokes older tokens, stores a new hash and returns the plain token.
 * - issueBrokerInviteToken(tx, input): revokes older invites and stores a derived invite token with no expiry; returns the plain token.
 * - findShowableInviteToken(db, userId, secret, now): the plain token of the user's current derived invite, or null when there is none (or only an older random one).
 * - hasOpenInvite(db, userId, now): true if the user has any unused, unexpired invite token.
 * - findUsableToken(db, token, purpose, now): returns the token row with its user (name, email, phone, role) and, for a broker, their 365 email and Google account id; or throws 404/410 with a clear message.
 * - consumeAccountToken(tx, tokenId, now): marks the token used; throws 410 if another request used it first.
 * - setUserPassword(tx, userId, password): stores the hashed password on the user's credential account, creating it if needed.
 * - hasPasswordLogin(db, userId): true if the user already has a credential account (has signed up).
 */
import { accountTokens, accounts, brokers, users, type DbOrTx } from "@bp/db";
import { INVITE_TTL_DAYS, PASSWORD_RESET_TTL_HOURS, type TokenPurpose } from "@bp/shared";
import { createAccountToken, deriveAccountToken, hashToken } from "@bp/shared/node";
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { HttpError, notFound } from "../errors";

function tokenLifetimeMs(purpose: TokenPurpose): number {
  return purpose === "invite" ? INVITE_TTL_DAYS * 24 * 60 * 60 * 1000 : PASSWORD_RESET_TTL_HOURS * 60 * 60 * 1000;
}

function openTokenFilter(userId: string, purpose: TokenPurpose, now: Date) {
  return and(
    eq(accountTokens.userId, userId),
    eq(accountTokens.purpose, purpose),
    isNull(accountTokens.usedAt),
    or(isNull(accountTokens.expiresAt), gt(accountTokens.expiresAt, now)),
  );
}

export async function revokeOpenTokens(tx: DbOrTx, userId: string, purpose: TokenPurpose, now: Date): Promise<void> {
  await tx.update(accountTokens).set({ expiresAt: now }).where(openTokenFilter(userId, purpose, now));
}

export async function issueAccountToken(
  tx: DbOrTx,
  input: { userId: string; purpose: TokenPurpose; createdBy: string | null; now: Date },
): Promise<string> {
  await revokeOpenTokens(tx, input.userId, input.purpose, input.now);
  const { token, tokenHash } = createAccountToken();
  await tx.insert(accountTokens).values({
    userId: input.userId,
    purpose: input.purpose,
    tokenHash,
    expiresAt: new Date(input.now.getTime() + tokenLifetimeMs(input.purpose)),
    createdBy: input.createdBy,
  });
  return token;
}

export async function issueBrokerInviteToken(
  tx: DbOrTx,
  input: { userId: string; createdBy: string | null; now: Date; secret: string },
): Promise<string> {
  await revokeOpenTokens(tx, input.userId, "invite", input.now);
  const id = randomUUID();
  const { token, tokenHash } = deriveAccountToken(input.secret, id);
  await tx.insert(accountTokens).values({ id, userId: input.userId, purpose: "invite", tokenHash, expiresAt: null, createdBy: input.createdBy });
  return token;
}

export async function findShowableInviteToken(db: DbOrTx, userId: string, secret: string, now: Date): Promise<string | null> {
  const [latest] = await db
    .select({ id: accountTokens.id, tokenHash: accountTokens.tokenHash })
    .from(accountTokens)
    .where(openTokenFilter(userId, "invite", now))
    .orderBy(desc(accountTokens.createdAt))
    .limit(1);
  if (!latest) return null;
  const derived = deriveAccountToken(secret, latest.id);
  return derived.tokenHash === latest.tokenHash ? derived.token : null;
}

export async function hasOpenInvite(db: DbOrTx, userId: string, now: Date): Promise<boolean> {
  const rows = await db.select({ id: accountTokens.id }).from(accountTokens).where(openTokenFilter(userId, "invite", now)).limit(1);
  return rows.length > 0;
}

export async function findUsableToken(db: DbOrTx, token: string, purpose: TokenPurpose, now: Date) {
  const [row] = await db
    .select({
      tokenId: accountTokens.id,
      usedAt: accountTokens.usedAt,
      expiresAt: accountTokens.expiresAt,
      userId: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      corporateEmail: brokers.corporateEmail,
      googleUserId: brokers.googleUserId,
    })
    .from(accountTokens)
    .innerJoin(users, eq(users.id, accountTokens.userId))
    .leftJoin(brokers, eq(brokers.userId, users.id))
    .where(and(eq(accountTokens.tokenHash, hashToken(token)), eq(accountTokens.purpose, purpose)));
  if (!row) throw notFound("This link is not valid. Ask 365 Yachts to send you a new one.");
  if (row.usedAt) throw new HttpError(410, "link_used", "This link has already been used.");
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) {
    throw new HttpError(410, "link_expired", "This link has expired. Ask 365 Yachts to send you a new one.");
  }
  return row;
}

export async function consumeAccountToken(tx: DbOrTx, tokenId: string, now: Date): Promise<void> {
  const used = await tx
    .update(accountTokens)
    .set({ usedAt: now })
    .where(and(eq(accountTokens.id, tokenId), isNull(accountTokens.usedAt)))
    .returning({ id: accountTokens.id });
  if (used.length === 0) throw new HttpError(410, "link_used", "This link has already been used.");
}

export async function setUserPassword(tx: DbOrTx, userId: string, password: string): Promise<void> {
  const hashed = await hashPassword(password);
  const updated = await tx
    .update(accounts)
    .set({ password: hashed })
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
    .returning({ id: accounts.id });
  if (updated.length === 0) {
    await tx.insert(accounts).values({ userId, accountId: userId, providerId: "credential", password: hashed });
  }
}

export async function hasPasswordLogin(db: DbOrTx, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
    .limit(1);
  return rows.length > 0;
}
