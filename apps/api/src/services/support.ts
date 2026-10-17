/**
 * File: apps/api/src/services/support.ts
 * Purpose: Small helpers shared by routes: the WhatsApp support contact (SPEC D13), links into the web app, and
 * the list of admin email addresses to notify.
 *
 * Functions:
 * - supportContact(env): returns the support name and a validated WhatsApp number (or null, which hides the button).
 * - webLink(env, path): returns an absolute link into the web app.
 * - adminEmails(db): returns the email of every admin and owner.
 * - todayFor(now): returns today's ISO date in Florida time.
 */
import { users, type DbOrTx } from "@bp/db";
import { normalizeWhatsAppNumber, todayInTimeZone } from "@bp/shared";
import { inArray } from "drizzle-orm";
import type { ApiEnv } from "../env";

export function supportContact(env: ApiEnv) {
  return { name: env.SUPPORT_CONTACT_NAME, whatsappNumber: normalizeWhatsAppNumber(env.SUPPORT_WHATSAPP_NUMBER) };
}

export function webLink(env: ApiEnv, path: string): string {
  return `${env.WEB_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function adminEmails(db: DbOrTx): Promise<string[]> {
  const rows = await db.select({ email: users.email }).from(users).where(inArray(users.role, ["admin", "owner"]));
  return rows.map((row) => row.email);
}

export function todayFor(now: Date): string {
  return todayInTimeZone(now);
}
