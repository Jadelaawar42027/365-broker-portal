/**
 * File: apps/web/src/components/admin/remind-button.tsx
 * Purpose: The "Send reminder" link on the admin overview and profile (SPEC D16): emails the broker about their next
 * step and confirms in place.
 *
 * Functions:
 * - RemindButton({ brokerId, variant }): sends the reminder and shows "Reminder sent" or the error.
 */
"use client";

import { useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { apiRequest, ApiError } from "@/lib/api-client";

export function RemindButton({ brokerId, variant = "link" }: { brokerId: string; variant?: "link" | "button" }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setState("sending");
    setError(null);
    try {
      await apiRequest(`/v1/admin/brokers/${brokerId}/remind`, { method: "POST", body: {} });
      setState("sent");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't send the reminder.");
      setState("idle");
    }
  }

  if (state === "sent") return <span role="status" className="text-base font-semibold text-success">Reminder sent</span>;
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={send}
        disabled={state === "sending"}
        className={variant === "button" ? buttonClasses("outline") : "min-h-11 text-base font-semibold text-brand underline underline-offset-2 disabled:opacity-60"}
      >
        {state === "sending" ? "Sending…" : "Send reminder"}
      </button>
      {error ? <span role="alert" className="text-sm text-danger">{error}</span> : null}
    </span>
  );
}
