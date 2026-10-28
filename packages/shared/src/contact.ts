/**
 * File: packages/shared/src/contact.ts
 * Purpose: Contact rules for inviting a broker (SPEC D29): the personal phone in E.164 form (US numbers must have
 * 10 digits after +1), the broker's own mobile number turned into E.164 from US or international input, and the placeholder email
 * used when a broker is invited without one. Sign-in needs an email, so the account holds a placeholder on the reserved
 * ".invalid" domain until the broker gives their own when accepting the invite; placeholders are never emailed or shown.
 *
 * Functions:
 * - isValidE164(value): true for a "+" number of 8 to 15 digits, where a +1 number has a valid 10-digit US/Canada number.
 * - toE164(input): a US number typed as "(561) 555-0123", "561-555-0123" or "1 561 555 0123" becomes "+15615550123"; a "+" or "00" number keeps its country code; returns null when it can't be a phone number.
 * - placeholderEmail(nonce): a unique placeholder address for a broker invited without an email.
 * - isPlaceholderEmail(email): true for an address created by placeholderEmail.
 * - visibleEmail(email): the email to show on screens and in exports, or null for a placeholder.
 * - formatPhoneForDocument(phone): a US number as "(561) 555-0123" (from E.164 or 10 digits); anything else as stored.
 */
import { z } from "zod";

export const PLACEHOLDER_EMAIL_DOMAIN = "invite.invalid";

export function isValidE164(value: string): boolean {
  if (!/^\+[1-9]\d{7,14}$/.test(value)) return false;
  if (value.startsWith("+1")) return /^\+1[2-9]\d{2}[2-9]\d{6}$/.test(value);
  return true;
}

export function toE164(input: string): string | null {
  const compact = input.trim().replace(/[\s().-]/g, "");
  const candidate = compact.startsWith("00")
    ? `+${compact.slice(2)}`
    : /^\d{10}$/.test(compact)
      ? `+1${compact}`
      : /^1\d{10}$/.test(compact)
        ? `+${compact}`
        : compact;
  return isValidE164(candidate) ? candidate : null;
}

export const e164PhoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s().-]/g, ""))
  .pipe(z.string().refine(isValidE164, "Enter the phone in international form, like +15615550123."));

export const mobilePhoneSchema = z
  .string()
  .trim()
  .max(30, "Enter a phone number like (561) 555-0123.")
  .transform((value, context) => {
    const phone = toE164(value);
    if (!phone) {
      context.addIssue({ code: "custom", message: "Enter a phone number like (561) 555-0123, or start with + and the country code." });
      return z.NEVER;
    }
    return phone;
  });

export function placeholderEmail(nonce: string): string {
  return `pending-${nonce.toLowerCase()}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`));
}

export function visibleEmail(email: string | null | undefined): string | null {
  return email && !isPlaceholderEmail(email) ? email : null;
}

export function formatPhoneForDocument(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  const us = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits.length === 10 ? digits : null;
  return us ? `(${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6)}` : phone.trim();
}
