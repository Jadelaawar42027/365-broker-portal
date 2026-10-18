/**
 * File: apps/web/src/components/admin/accounts-panel.tsx
 * Purpose: The "Accounts" panel on the broker profile (3c, phase H2): the 365 corporate email (entered by hand for an
 * existing broker until a Google account is linked), each system's status (Not configured, Not set up, Pending, Created,
 * Failed, Suspended) with the account email or id and the last error in plain words, Retry per system, "Link existing
 * account", and the CRM phone (E.164) that admins enter later.
 *
 * Functions:
 * - AccountsPanel({ brokerId, data, crmPhone, inactive }): renders the panel and runs its actions.
 * - run(path, method, body, done): calls the API, shows the result and refreshes the page.
 * - saveEmail(event): saves the corporate email typed by hand.
 * - saveCrmPhone(event): saves (or clears) the CRM phone.
 * - SystemRow({ view, busy, onRetry }): one system's status, details, error and Retry button.
 * - taskNote(view): "Next try at 3:12 PM" / "Tried 3 times" style detail for the last task.
 */
"use client";

import type { AccountActionResponse, AccountSystemView, BrokerAccountsResponse } from "@bp/shared";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { FieldLabel, inputClasses } from "@/components/ui/misc";
import { Pill } from "@/components/ui/pill";
import { apiRequest, ApiError } from "@/lib/api-client";
import { formatPhone } from "@/lib/format";
import { accountStatusTone } from "./account-status";

function taskNote(view: AccountSystemView): string | null {
  const task = view.lastTask;
  if (!task) return null;
  if (task.status === "pending" && task.nextAttemptAt) {
    const time = new Date(task.nextAttemptAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
    return task.attempts > 0 ? `Tried ${task.attempts} time${task.attempts === 1 ? "" : "s"} · next try at ${time}` : `Queued · starts at ${time}`;
  }
  if (task.status === "running") return "Working on it now";
  if (task.status === "failed") return `Stopped after ${task.attempts} attempt${task.attempts === 1 ? "" : "s"}`;
  return null;
}

function SystemRow({ view, busy, onRetry }: { view: AccountSystemView; busy: boolean; onRetry: () => void }) {
  const note = taskNote(view);
  return (
    <li className="border-b border-line px-6 py-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[17px] font-bold">{view.label}</p>
          <p className="truncate text-[15px] text-muted">
            {view.email ?? (view.accountId ? `ID ${view.accountId}` : view.status === "not_configured" ? "Add the API variables to turn this on." : "No account yet")}
            {view.email && view.accountId ? <span className="sr-only"> · ID {view.accountId}</span> : null}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Pill tone={accountStatusTone(view.status)}>{view.statusLabel}</Pill>
          {view.canRetry ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={onRetry}>
              {view.status === "failed" ? "Retry" : "Set up"}
              <span className="sr-only"> {view.label}</span>
            </Button>
          ) : null}
        </div>
      </div>
      {view.error ? <p className="mt-2 text-[15px] text-danger">{view.error}</p> : null}
      {note ? <p className="mt-1 text-[15px] text-muted">{note}</p> : null}
    </li>
  );
}

export function AccountsPanel({ brokerId, data, crmPhone, inactive }: { brokerId: string; data: BrokerAccountsResponse; crmPhone: string | null; inactive: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const googleLinked = data.systems.some((view) => view.system === "google" && view.accountId);
  const canLink = data.systems.some((view) => view.canLink);

  async function run(path: string, method: string, body: unknown, done: (result: AccountActionResponse | null) => string) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await apiRequest<AccountActionResponse | { ok: true }>(path, { method, body });
      setMessage({ tone: "success", text: done("queued" in result ? result : null) });
      router.refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "That didn't work. Try again." });
    }
    setBusy(false);
  }

  function saveEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("corporateEmail") ?? "").trim();
    void run(`/v1/admin/brokers/${brokerId}/corporate-email`, "PUT", { email }, () => `Corporate email saved. Use "Link existing account" if their accounts already exist.`);
  }

  function saveCrmPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("crmPhone") ?? "").trim();
    void run(`/v1/admin/brokers/${brokerId}`, "PATCH", { crmPhone: value || null }, () => (value ? "CRM phone saved." : "CRM phone removed."));
  }

  return (
    <section aria-labelledby="accounts-title" className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-5">
        <h2 id="accounts-title" className="text-xl font-bold">
          Accounts
        </h2>
        {canLink && !inactive ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(`/v1/admin/brokers/${brokerId}/accounts/link`, "POST", {}, (result) =>
                result && result.queued.length > 0 ? "Looking up their existing accounts. This takes a few seconds; refresh to see the result." : "Nothing to link.",
              )
            }
          >
            Link existing account
          </Button>
        ) : null}
      </div>

      <div className="space-y-4 border-b border-line px-6 py-5">
        {googleLinked ? (
          <div>
            <p className="text-[15px] font-semibold text-muted">365 email</p>
            <p className="text-[17px] font-bold break-all">{data.corporateEmail}</p>
          </div>
        ) : (
          <form onSubmit={saveEmail} className="space-y-2">
            <FieldLabel htmlFor="corporate-email">365 email</FieldLabel>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="corporate-email"
                name="corporateEmail"
                type="email"
                required
                spellCheck={false}
                autoComplete="off"
                defaultValue={data.corporateEmail ?? ""}
                placeholder={data.googleDomain ? `firstname@${data.googleDomain}` : "firstname@365yachts.org"}
                aria-describedby="corporate-email-help"
                className={inputClasses()}
              />
              <Button type="submit" variant="outline" disabled={busy} className="shrink-0">
                Save email
              </Button>
            </div>
            <p id="corporate-email-help" className="text-[15px] text-muted">
              New brokers get one automatically. For a broker who already has a 365 email, enter it here, then link their accounts.
            </p>
          </form>
        )}

        <form onSubmit={saveCrmPhone} className="space-y-2">
          <FieldLabel htmlFor="crm-phone">CRM phone</FieldLabel>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="crm-phone"
              name="crmPhone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              pattern="\+[1-9][0-9 ().\-]{7,20}"
              placeholder="+1 561 555 0123"
              defaultValue={crmPhone ?? ""}
              aria-describedby="crm-phone-help"
              className={inputClasses()}
            />
            <Button type="submit" variant="outline" disabled={busy} className="shrink-0">
              Save phone
            </Button>
          </div>
          <p id="crm-phone-help" className="text-[15px] text-muted">
            {crmPhone ? `Now ${formatPhone(crmPhone)}. ` : ""}The number leads see in GoHighLevel. International form, starting with +.
          </p>
        </form>
      </div>

      <ul>
        {data.systems.map((view) => (
          <SystemRow
            key={view.system}
            view={view}
            busy={busy}
            onRetry={() =>
              void run(`/v1/admin/brokers/${brokerId}/accounts/${view.system}/retry`, "POST", {}, () => `${view.label}: queued. Refresh in a few seconds to see the result.`)
            }
          />
        ))}
      </ul>
      {message ? (
        <div className="border-t border-line px-6 py-4">
          <FormMessage tone={message.tone}>{message.text}</FormMessage>
        </div>
      ) : null}
    </section>
  );
}
