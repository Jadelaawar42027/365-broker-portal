/**
 * File: apps/web/src/components/ui/misc.tsx
 * Purpose: Small shared pieces: the progress bar, the initials avatar, the white card, and form field styles.
 *
 * Functions:
 * - ProgressBar({ value, max, tone, label, className }): a rounded bar with an accessible progressbar role.
 * - Avatar({ name, size, tone }): a round avatar with the person's initials.
 * - Card({ children, className, as }): a white rounded card with the mockups' border.
 * - inputClasses(): Tailwind classes for text inputs, selects and textareas.
 * - FieldLabel({ htmlFor, children }): a bold form label.
 */
import type { ReactNode } from "react";
import { initials } from "@/lib/format";

export function ProgressBar({
  value,
  max,
  tone = "brand",
  label,
  className = "",
}: {
  value: number;
  max: number;
  tone?: "brand" | "success" | "warn";
  label: string;
  className?: string;
}) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;
  const fill = tone === "success" ? "bg-success" : tone === "warn" ? "bg-[#b4650a]" : "bg-brand";
  const track = tone === "warn" ? "bg-warn-line" : "bg-line";
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className={`h-2.5 w-full overflow-hidden rounded-full ${track} ${className}`}>
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

export function Avatar({ name, size = "md", tone = "brand" }: { name: string; size?: "sm" | "md" | "lg"; tone?: "brand" | "soft" | "white" }) {
  const sizes = { sm: "size-11 text-base", md: "size-12 text-lg", lg: "size-24 text-3xl" };
  const tones = { brand: "bg-brand text-white", soft: "bg-brand-soft text-brand", white: "bg-white text-navy" };
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full font-bold ${sizes[size]} ${tones[tone]}`}>
      {initials(name)}
    </span>
  );
}

export function Card({ children, className = "", as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "article" }) {
  return <Tag className={`rounded-2xl border border-line bg-white ${className}`}>{children}</Tag>;
}

export function inputClasses(): string {
  return "block w-full min-h-[52px] rounded-xl border border-[#cdd5e1] bg-white px-4 text-[17px] text-ink placeholder:text-[#6b7a90] focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/25 read-only:bg-page read-only:text-muted";
}

export function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-[15px] font-bold text-ink">
      {children}
    </label>
  );
}
