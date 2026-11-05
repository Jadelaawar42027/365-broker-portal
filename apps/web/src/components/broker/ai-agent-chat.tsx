/**
 * File: apps/web/src/components/broker/ai-agent-chat.tsx
 * Purpose: The "Start chat with AI agent" card on the AI agent step (step 1). The button opens WhatsApp with the
 * 365 Yachts AI and a hello message ready to send, so the broker's first chat with their agent is one tap away.
 *
 * Functions:
 * - AiAgentChat({ brokerName }): renders the card with the WhatsApp link button, or null when the link can't be built.
 */
import { buildAiAgentMessage, buildAiAgentWhatsAppLink } from "@bp/shared";
import { buttonClasses } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/ui/icons";

export function AiAgentChat({ brokerName }: { brokerName: string | null }) {
  const href = buildAiAgentWhatsAppLink({ brokerName });
  if (!href) return null;
  return (
    <section aria-labelledby="ai-agent-chat-title" className="rounded-2xl border border-line bg-white px-6 py-6 sm:px-7">
      <h2 id="ai-agent-chat-title" className="text-xl font-bold">
        Say hello to your AI agent
      </h2>
      <p className="mt-2 text-lg leading-relaxed text-muted">
        WhatsApp opens with this message ready to send: “{buildAiAgentMessage({ brokerName })}”
      </p>
      <a href={href} target="_blank" rel="noopener noreferrer" className={`${buttonClasses("whatsapp", "lg")} mt-5 w-full sm:w-auto`}>
        <WhatsAppIcon className="size-6" />
        Start chat with AI agent
        <span className="sr-only">(opens WhatsApp in a new tab)</span>
      </a>
    </section>
  );
}
