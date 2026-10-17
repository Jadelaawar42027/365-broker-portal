/**
 * File: apps/web/src/components/admin/broker-controls.tsx
 * Purpose: The editable parts of a broker's profile header (3c): level and status menus, and the account actions
 * (resend invite, send a password reset link, send a reminder). Setting a broker inactive asks for confirmation,
 * records today as the leaving date and signs them out everywhere (SPEC D9).
 *
 * Functions:
 * - BrokerControls({ broker, today }): renders the menus and actions.
 * - AccountActions({ broker }): the buttons that fit the broker's current state, each confirming in place.
 * - patch(body): sends the change to the API and refreshes the page.
 */
"use client";

import type { BrokerProfileResponse } from "@bp/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { apiRequest, ApiError } from "@/lib/api-client";
import { RemindButton } from "./remind-button";

type Broker = BrokerProfileResponse["broker"];

export function BrokerControls({ broker, today }: { broker: Broker; today: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/v1/admin/brokers/${broker.id}`, { method: "PATCH", body });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't save that change.");
    }
    setBusy(false);
  }

  const selectClasses = "min-h-12 w-full rounded-xl border border-[#cdd5e1] bg-white px-4 text-[17px] font-semibold text-navy sm:w-[150px]";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <div>
          <label htmlFor="broker-level" className="mb-1.5 block text-[15px] font-semibold text-muted">
            Level
          </label>
          <select id="broker-level" value={broker.level} disabled={busy} onChange={(event) => patch({ level: event.target.value })} className={selectClasses}>
            <option value="junior">Junior</option>
            <option value="senior">Senior</option>
          </select>
        </div>
        <div>
          <label htmlFor="broker-status" className="mb-1.5 block text-[15px] font-semibold text-muted">
            Status
          </label>
          <select
            id="broker-status"
            value={broker.status}
            disabled={busy}
            onChange={(event) => {
              const status = event.target.value;
              if (status === "inactive") {
                const confirmed = window.confirm(
                  `Set ${broker.name} to inactive? They are signed out at once, can't log in, and today is recorded as their leaving date.`,
                );
                if (!confirmed) return;
                void patch({ status, ...(broker.leftAt ? {} : { leftAt: today }) });
              } else {
                void patch({ status, ...(broker.status === "inactive" ? { leftAt: null } : {}) });
              }
            }}
            className={selectClasses}
          >
            {broker.status === "invited" ? <option value="invited">Invited</option> : null}
            <option value="onboarding">Onboarding</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
    </div>
  );
}

export function AccountActions({ broker }: { broker: Broker }) {
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function run(path: string, done: string) {
    setMessage(null);
    try {
      await apiRequest(path, { method: "POST", body: {} });
      setMessage({ tone: "success", text: done });
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "That didn't work. Try again." });
    }
  }

  if (broker.status === "inactive") return null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {broker.hasLogin ? (
          <Button variant="outline" onClick={() => run(`/v1/admin/brokers/${broker.id}/reset-password`, `Reset link emailed to ${broker.email}.`)}>
            Send password reset link
          </Button>
        ) : (
          <Button variant="outline" onClick={() => run(`/v1/admin/brokers/${broker.id}/resend-invite`, `New invite emailed to ${broker.email}.`)}>
            Resend invite
          </Button>
        )}
        {broker.status === "onboarding" ? <RemindButton brokerId={broker.id} variant="button" /> : null}
      </div>
      {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
    </div>
  );
}
