/**
 * File: apps/web/src/lib/support.ts
 * Purpose: The WhatsApp support contact for pages shown before sign-in (invite, login, reset), read from the web
 * server's own SUPPORT_CONTACT_NAME and SUPPORT_WHATSAPP_NUMBER (SPEC D13). Signed-in pages use /v1/me instead.
 *
 * Functions:
 * - publicSupportContact(): returns { name, whatsappNumber } with an invalid or missing number as null.
 */
import { normalizeWhatsAppNumber } from "@bp/shared";

export function publicSupportContact() {
  return {
    name: process.env.SUPPORT_CONTACT_NAME?.trim() || "Shelly",
    whatsappNumber: normalizeWhatsAppNumber(process.env.SUPPORT_WHATSAPP_NUMBER),
  };
}
