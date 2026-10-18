/**
 * File: packages/shared/src/contact.ts
 * Purpose: Contact rules for inviting a broker (SPEC D29): the personal phone in E.164 form, and the placeholder email
 * used when a broker is invited without one. Sign-in needs an email, so the account holds a placeholder on the reserved
 * ".invalid" domain until the broker gives their own when accepting the invite; placeholders are never emailed or shown.
 *
 * Functions:
 * - placeholderEmail(nonce): a unique placeholder address for a broker invited without an email.
 * - isPlaceholderEmail(email): true for an address created by placeholderEmail.
 * - visibleEmail(email): the email to show on screens and in exports, or null for a placeholder.
 */
import { z } from "zod";

export const PLACEHOLDER_EMAIL_DOMAIN = "invite.invalid";

export const e164PhoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s().-]/g, ""))
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, "Enter the phone in international form, like +15615550123."));

export function placeholderEmail(nonce: string): string {
  return `pending-${nonce.toLowerCase()}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`));
}

export function visibleEmail(email: string | null | undefined): string | null {
  return email && !isPlaceholderEmail(email) ? email : null;
}
