/**
 * File: packages/shared/src/whatsapp.ts
 * Purpose: Builds the WhatsApp help link and its pre-filled message (SPEC D13). Pure functions,
 * so the button shows only when a valid number is configured. By default help goes to the 365 Yachts AI on WhatsApp
 * (DEFAULT_SUPPORT_CONTACT); SUPPORT_CONTACT_NAME and SUPPORT_WHATSAPP_NUMBER override it.
 * Also builds the "Send via WhatsApp" invite link to a new broker's personal phone (phase H2), and the "Start chat with
 * AI agent" link on the AI agent step, which always goes to the 365 Yachts AI.
 *
 * Functions:
 * - normalizeWhatsAppNumber(value): returns the number if it is 8-15 digits only, else null.
 * - buildSupportMessage(input): writes the pre-filled message naming the broker and, if given, their step or topic.
 * - buildWhatsAppLink(input): returns https://wa.me/<number>?text=<encoded message>, or null when the number is missing or invalid.
 * - buildInviteMessage(input): the pre-filled WhatsApp message that sends a broker their invite link.
 * - buildAiAgentMessage(input): the hello message a new broker sends the 365 Yachts AI, with their name if known.
 * - buildAiAgentWhatsAppLink(input): a wa.me link to the 365 Yachts AI with that hello message.
 * - buildInviteWhatsAppLink(input): a wa.me link to the broker's personal phone (E.164) with the invite message, or null without a valid phone.
 */
export const DEFAULT_SUPPORT_CONTACT = { name: "365 Yachts AI", whatsappNumber: "19547381542" } as const;

export const AI_AGENT_STEP_KEY = "ai_agent";

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

export function buildInviteMessage(input: { brokerName: string; inviteUrl: string; senderName?: string | null }): string {
  const first = input.brokerName.trim().split(/\s+/)[0] || "there";
  const sender = input.senderName?.trim() ? ` It's ${input.senderName.trim()} from 365 Yachts.` : "";
  return `Hi ${first}, welcome to 365 Yachts!${sender} Create your broker portal account here: ${input.inviteUrl}`;
}

export function buildInviteWhatsAppLink(input: { phone: string | null | undefined; brokerName: string; inviteUrl: string; senderName?: string | null }): string | null {
  const digits = (input.phone ?? "").replace(/[^\d]/g, "");
  return buildWhatsAppLink({ number: digits, message: buildInviteMessage(input) });
}

export function buildAiAgentMessage(input: { brokerName?: string | null }): string {
  const name = input.brokerName?.trim();
  return `Hey ${DEFAULT_SUPPORT_CONTACT.name}${name ? `, it's ${name}` : ""}. I'm new here and doing my onboarding.`;
}

export function buildAiAgentWhatsAppLink(input: { brokerName?: string | null }): string | null {
  return buildWhatsAppLink({ number: DEFAULT_SUPPORT_CONTACT.whatsappNumber, message: buildAiAgentMessage(input) });
}
