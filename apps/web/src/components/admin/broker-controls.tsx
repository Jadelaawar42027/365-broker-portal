/**
 * File: apps/web/src/components/admin/broker-controls.tsx
 * Purpose: The editable parts of a broker's profile header (3c): level and status menus, and the account actions
 * (resend invite, send a password reset link, send a reminder). Setting a broker inactive asks for confirmation,
 * records today as the leaving date and signs them out everywhere (SPEC D9); when the broker has a Google or GHL account it
 * also says those will be suspended and deactivated (phase H2), and reactivating turns them back on.
 *
 * Functions:
 * - BrokerControls({ broker, today, hasAccounts }): renders the menus and actions; with provisioned accounts, the inactive confirmation says they will be suspended.
 * - AccountActions({ broker }): the buttons that fit the broker's current state, each confirming in place; a broker who hasn't signed up can be sent a fresh invite link by hand (always) or by email (when they have one, SPEC D29).
 * - makeInviteLink(): asks the API for a fresh invite link and shows it with Copy and Send via WhatsApp.
 * - patch(body): sends the change to the API and refreshes the page.
 */
"use client";

import type { BrokerProfileResponse } from "@bp/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { apiRequest, ApiError } from "@/lib/api-client";
import { CopyLink } from "./invite-dialog";
import { RemindButton } from "./remind-button";

type Broker = BrokerProfileResponse["broker"];

export function BrokerControls({ broker, today, hasAccounts = false }: { broker: Broker; today: string; hasAccounts?: boolean }) {
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
                  `Set ${broker.name} to inactive? They are signed out at once, can't log in, and today is recorded as their leaving date.${hasAccounts ? "\n\nThis will suspend their Google account and deactivate their GHL user." : ""}`,
                );
                if (!confirmed) return;
                void patch({ status, ...(broker.leftAt ? {} : { leftAt: today }) });
              } else {
                if (broker.status === "inactive" && hasAccounts && !window.confirm(`Reactivate ${broker.name}? Their Google account is unsuspended and a GHL user is set up again.`)) return;
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
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  async function makeInviteLink() {
    setMessage(null);
    try {
      const { inviteUrl: url } = await apiRequest<{ inviteUrl: string }>(`/v1/admin/brokers/${broker.id}/invite-link`, { method: "POST", body: {} });
      setInviteUrl(url);
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "That didn't work. Try again." });
    }
  }

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
          <>
            {broker.email ? (
              <Button variant="outline" onClick={() => run(`/v1/admin/brokers/${broker.id}/resend-invite`, `New invite emailed to ${broker.email}.`)}>
                Resend invite
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => void makeInviteLink()}>
              Make a new invite link
            </Button>
          </>
        )}
        {broker.status === "onboarding" ? <RemindButton brokerId={broker.id} variant="button" /> : null}
      </div>
      {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
      {inviteUrl ? (
        <div className="max-w-[640px] rounded-xl border border-line bg-white px-5 py-4">
          <CopyLink url={inviteUrl} phone={broker.phone} brokerName={broker.name} />
        </div>
      ) : null}
    </div>
  );
}
