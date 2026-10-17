/**
 * File: apps/api/src/auth.ts
 * Purpose: Better Auth set-up: email + password on our own users/sessions/accounts tables, UUID ids, no
 * self sign-up (accounts come from invites), and the inactive-broker login block (SPEC D9).
 *
 * Functions:
 * - isUserAllowedToLogIn(db, userId): false if the user is a broker whose status is inactive.
 * - createAuth(input): builds the Better Auth instance for the given database and environment.
 */
import { accounts, brokers, sessions, users, verifications, type Database } from "@bp/db";
import { canLogIn, MIN_PASSWORD_LENGTH } from "@bp/shared";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import type { ApiEnv } from "./env";

export const INACTIVE_ACCOUNT_MESSAGE =
  "This account is no longer active. Contact 365 Yachts if you think this is a mistake.";

export async function isUserAllowedToLogIn(db: Database, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ role: users.role, brokerStatus: brokers.status })
    .from(users)
    .leftJoin(brokers, eq(brokers.userId, users.id))
    .where(eq(users.id, userId));
  if (!row) return false;
  return canLogIn({ role: row.role, brokerStatus: row.brokerStatus });
}

export function createAuth(input: { db: Database; env: ApiEnv }) {
  const { db, env } = input;
  return betterAuth({
    appName: "365 Yachts Broker Portal",
    baseURL: env.WEB_ORIGIN,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.WEB_ORIGIN],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: env.NODE_ENV === "production",
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: 128,
    },
    user: {
      additionalFields: {
        role: { type: "string", required: false, input: false },
        phone: { type: "string", required: false, input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: { enabled: env.NODE_ENV === "production" },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            if (!(await isUserAllowedToLogIn(db, session.userId))) {
              throw new APIError("FORBIDDEN", { message: INACTIVE_ACCOUNT_MESSAGE, code: "ACCOUNT_INACTIVE" });
            }
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
