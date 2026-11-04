/**
 * File: apps/web/src/components/ui/whatsapp-button.tsx
 * Purpose: The green "Message [support contact] on WhatsApp" button (SPEC D13), the 365 Yachts AI by default. It opens wa.me in a new tab with a pre-filled
 * message naming the broker and their step, and renders nothing when no WhatsApp number is configured.
 *
 * Functions:
 * - WhatsAppButton({ support, brokerName, step, topic, size, className, fullWidth }): renders the link button or null.
 */
import { buildSupportMessage, buildWhatsAppLink } from "@bp/shared";
import { buttonClasses, type ButtonSize } from "./button";
import { WhatsAppIcon } from "./icons";

export function WhatsAppButton({
  support,
  brokerName,
  step,
  topic,
  size = "md",
  className = "",
  fullWidth = false,
}: {
  support: { name: string; whatsappNumber: string | null };
  brokerName?: string | null;
  step?: { position: number; title: string } | null;
  topic?: string | null;
  size?: ButtonSize;
  className?: string;
  fullWidth?: boolean;
}) {
  const href = buildWhatsAppLink({
    number: support.whatsappNumber,
    message: buildSupportMessage({ contactName: support.name, brokerName, step, topic }),
  });
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${buttonClasses("whatsapp", size)} ${fullWidth ? "w-full" : ""} ${className}`}>
      <WhatsAppIcon className={size === "sm" ? "size-5" : "size-6"} />
      Message {support.name} on WhatsApp
      <span className="sr-only">(opens WhatsApp in a new tab)</span>
    </a>
  );
}
