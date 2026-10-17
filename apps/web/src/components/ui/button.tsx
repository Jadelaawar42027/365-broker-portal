/**
 * File: apps/web/src/components/ui/button.tsx
 * Purpose: Button and link-button styles shared by every screen, matching the mockups: blue primary, navy, white,
 * outline, green approve, red outline and a quiet text link. All sizes, including the compact one, keep the 44px minimum touch target.
 *
 * Functions:
 * - buttonClasses(variant, size): returns the Tailwind classes for a button of that look and size.
 * - Button(props): a real <button> with those classes (type defaults to "button").
 * - LinkButton(props): a Next.js <Link> styled as a button.
 */
import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

export type ButtonVariant = "primary" | "navy" | "white" | "outline" | "brand-outline" | "approve" | "danger-outline" | "soft" | "whatsapp";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  navy: "bg-navy text-white hover:bg-navy-soft",
  white: "bg-white text-navy hover:bg-brand-soft",
  outline: "border border-line bg-white text-navy hover:bg-page",
  "brand-outline": "border-2 border-brand bg-white text-brand hover:bg-brand-soft",
  approve: "bg-approve text-white hover:bg-success",
  "danger-outline": "border-2 border-danger bg-white text-danger hover:bg-danger-soft",
  soft: "bg-brand-soft text-brand hover:bg-[#dde8f8]",
  whatsapp: "bg-whatsapp text-white hover:bg-[#0b6633]",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-11 px-3 text-[15px] rounded-xl",
  md: "min-h-11 px-5 text-base rounded-xl",
  lg: "min-h-12 px-6 text-lg rounded-xl",
  xl: "min-h-14 px-7 text-xl rounded-xl",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return `inline-flex items-center justify-center gap-2.5 font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]}`;
}

export function Button({
  variant,
  size,
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={`${buttonClasses(variant, size)} ${className}`} {...props} />;
}

export function LinkButton({
  variant,
  size,
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={`${buttonClasses(variant, size)} ${className}`} {...props} />;
}
