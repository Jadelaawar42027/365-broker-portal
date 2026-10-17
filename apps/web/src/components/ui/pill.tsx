/**
 * File: apps/web/src/components/ui/pill.tsx
 * Purpose: The rounded status pill used on the checklist, the brokers table and the profile ("Approved", "Needs a fix",
 * "Do this next"...), coloured by the tone the API returns.
 *
 * Functions:
 * - pillClasses(tone): returns the colour classes for a tone.
 * - Pill({ tone, children, className }): renders the pill.
 */
import type { ReactNode } from "react";

export type PillTone = "success" | "warning" | "danger" | "info" | "neutral" | "brand-soft";

const TONES: Record<PillTone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger border border-danger-line",
  info: "bg-brand text-white",
  neutral: "bg-neutral-soft text-muted",
  "brand-soft": "bg-brand-soft text-brand",
};

export function pillClasses(tone: PillTone): string {
  return TONES[tone];
}

export function Pill({ tone, children, className = "" }: { tone: PillTone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-3.5 py-1.5 text-[15px] font-bold ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}
