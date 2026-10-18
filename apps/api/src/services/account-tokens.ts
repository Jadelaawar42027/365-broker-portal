/**
 * File: apps/api/src/services/account-tokens.ts
 * Purpose: Single-use links for invites and password resets (SPEC D8). Only token hashes are stored; issuing a new
 * token revokes the user's older unused tokens of the same kind; consuming is atomic so a link works exactly once.
 *
 * Functions:
 * - tokenLifetimeMs(purpose): 7 days for invites, 24 hours for resets.
 * - issueAccountToken(tx, input): revokes older tokens, stores a new hash and returns the plain token.
 * - findUsableToken(db, token, purpose, now): returns the token row with its user (name, email, phone, role), or throws 404/410 with a clear message.
 * - consumeAccountToken(tx, tokenId, now): marks the token used; throws 410 if another request used it first.
 * - setUserPassword(tx, userId, password): stores the hashed password on the user's credential account, creating it if needed.
 * - hasPasswordLogin(db, userId): true if the user already has a credential account (has signed up).
 */
import { accountTokens, accounts, users, type DbOrTx } from "@bp/db";
import { INVITE_TTL_DAYS, PASSWORD_RESET_TTL_HOURS, type TokenPurpose } from "@bp/shared";
import { createAccountToken, hashToken } from "@bp/shared/node";
import { hashPassword } from "better-auth/crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { HttpError, notFound } from "../errors";

function tokenLifetimeMs(purpose: TokenPurpose): number {
  return purpose === "invite" ? INVITE_TTL_DAYS * 24 * 60 * 60 * 1000 : PASSWORD_RESET_TTL_HOURS * 60 * 60 * 1000;
}

export async function issueAccountToken(
  tx: DbOrTx,
  input: { userId: string; purpose: TokenPurpose; createdBy: string | null; now: Date },
): Promise<string> {
  await tx
    .update(accountTokens)
    .set({ expiresAt: input.now })
    .where(
      and(
        eq(accountTokens.userId, input.userId),
        eq(accountTokens.purpose, input.purpose),
        isNull(accountTokens.usedAt),
        gt(accountTokens.expiresAt, input.now),
      ),
    );
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
    })
    .from(accountTokens)
    .innerJoin(users, eq(users.id, accountTokens.userId))
    .where(and(eq(accountTokens.tokenHash, hashToken(token)), eq(accountTokens.purpose, purpose)));
  if (!row) throw notFound("This link is not valid. Ask 365 Yachts to send you a new one.");
  if (row.usedAt) throw new HttpError(410, "link_used", "This link has already been used.");
  if (row.expiresAt.getTime() <= now.getTime()) {
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
