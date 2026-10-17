/**
 * File: packages/shared/src/whatsapp.ts
 * Purpose: Builds the "Message Shelly on WhatsApp" link and its pre-filled message (SPEC D13). Pure functions,
 * so the button shows only when a valid number is configured.
 *
 * Functions:
 * - normalizeWhatsAppNumber(value): returns the number if it is 8-15 digits only, else null.
 * - buildSupportMessage(input): writes the pre-filled message naming the broker and, if given, their step or topic.
 * - buildWhatsAppLink(input): returns https://wa.me/<number>?text=<encoded message>, or null when the number is missing or invalid.
 */
export function normalizeWhatsAppNumber(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return /^\d{8,15}$/.test(trimmed) ? trimmed : null;
}

export type SupportMessageInput = {
  contactName: string;
  brokerName?: string | null;
  step?: { position: number; title: string } | null;
  topic?: string | null;
};

export function buildSupportMessage(input: SupportMessageInput): string {
  const greeting = `Hi ${input.contactName.trim() || "there"}`;
  const intro = input.brokerName?.trim() ? `, it's ${input.brokerName.trim()}.` : ".";
  let request = " I need some help with my onboarding.";
  if (input.step) request = ` I need help with step ${input.step.position}: ${input.step.title}.`;
  else if (input.topic?.trim()) request = ` I need help ${input.topic.trim()}.`;
  return `${greeting}${intro}${request}`;
}

export function buildWhatsAppLink(input: { number: string | null | undefined; message: string }): string | null {
  const number = normalizeWhatsAppNumber(input.number);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(input.message)}`;
}
