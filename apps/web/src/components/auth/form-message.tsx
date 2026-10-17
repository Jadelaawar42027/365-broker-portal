/**
 * File: apps/web/src/components/auth/form-message.tsx
 * Purpose: The error or success line under a form, announced to screen readers when it appears.
 *
 * Functions:
 * - FormMessage({ tone, children }): renders a red error or green success message in a live region.
 */
import type { ReactNode } from "react";

export function FormMessage({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  const styles = tone === "error" ? "border-danger-line bg-danger-soft text-danger" : "border-[#bfe3cc] bg-success-soft text-success";
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-base font-semibold ${styles}`}>
      {children}
    </p>
  );
}
