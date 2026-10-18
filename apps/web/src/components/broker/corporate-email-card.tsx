/**
 * File: apps/web/src/components/broker/corporate-email-card.tsx
 * Purpose: The "Your 365 email" card on step 9 (phase H2). When the Workspace account is ready it shows the address and
 * "Reveal my temporary password", which resets the Google password at that moment and shows it once, with Copy and
 * "Open Gmail" (Google asks for a new password at first sign-in). Up to 3 reveals a day. When it isn't ready it says
 * the email is being set up and the support contact will send the login details. Until Google Workspace provisioning
 * is configured the card isn't shown at all, so brokers who already have a 365 email aren't told it's being set up. The password lives only in this
 * component's memory and disappears when the page is left.
 *
 * Functions:
 * - CorporateEmailCard({ accounts, supportName }): renders the card.
 * - reveal(): asks the API for a fresh temporary password and shows it.
 * - copy(): copies the password and confirms in place.
 */
"use client";

import type { MyAccountsResponse, RevealPasswordResponse } from "@bp/shared";
import { useState } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button, buttonClasses } from "@/components/ui/button";
import { apiRequest, ApiError } from "@/lib/api-client";

export function CorporateEmailCard({ accounts, supportName }: { accounts: MyAccountsResponse; supportName: string }) {
  const [revealed, setRevealed] = useState<RevealPasswordResponse | null>(null);
  const [revealsLeft, setRevealsLeft] = useState(accounts.revealsLeft);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!accounts.googleConfigured) return null;

  if (!accounts.googleReady || !accounts.corporateEmail) {
    return (
      <section aria-labelledby="corporate-email-title" className="rounded-2xl border border-line bg-white px-6 py-6">
        <h2 id="corporate-email-title" className="text-xl font-bold">
          Your 365 email
        </h2>
        <p className="mt-2 text-lg leading-relaxed text-muted">Your 365 email is being set up. {supportName} will send your login details.</p>
      </section>
    );
  }

  async function reveal() {
    const confirmed = window.confirm("This sets a new temporary password for your 365 email right now. Any earlier temporary password stops working. Continue?");
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const result = await apiRequest<RevealPasswordResponse>("/v1/me/accounts/google/reveal-password", { method: "POST", body: {} });
      setRevealed(result);
      setRevealsLeft(result.revealsLeft);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That didn't work. Try again in a minute.");
    }
    setBusy(false);
  }

  async function copy() {
    if (!revealed) return;
    await navigator.clipboard.writeText(revealed.password).catch(() => null);
    setCopied(true);
  }

  return (
    <section aria-labelledby="corporate-email-title" className="rounded-2xl border border-line bg-white px-6 py-6">
      <h2 id="corporate-email-title" className="text-xl font-bold">
        Your 365 email
      </h2>
      <p className="mt-2 text-[22px] font-extrabold break-all">{accounts.corporateEmail}</p>
      {revealed ? (
        <div className="mt-5 space-y-3">
          <label htmlFor="temporary-password" className="block text-[15px] font-bold">
            Temporary password
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="temporary-password"
              readOnly
              value={revealed.password}
              autoComplete="off"
              spellCheck={false}
              onFocus={(event) => event.currentTarget.select()}
              className="min-h-12 w-full rounded-xl border border-[#cdd5e1] bg-page px-4 font-mono text-lg tracking-wide"
            />
            <Button variant="outline" className="shrink-0" onClick={() => void copy()}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p aria-live="polite" className="text-[15px] text-muted">
            {copied ? "Copied. " : ""}It's shown only now. Google asks you to choose your own password when you sign in.
          </p>
          <a href={accounts.gmailUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses("primary", "lg")}>
            Open Gmail
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <Button size="lg" disabled={busy || revealsLeft <= 0} onClick={() => void reveal()}>
            {busy ? "Getting your password…" : "Reveal my temporary password"}
          </Button>
          <p className="text-[15px] text-muted">
            {revealsLeft > 0
              ? `Each reveal sets a new temporary password. ${revealsLeft} left today.`
              : `You've used today's 3 reveals. Try again tomorrow or message ${supportName}.`}
          </p>
        </div>
      )}
      {error ? (
        <div className="mt-4">
          <FormMessage tone="error">{error}</FormMessage>
        </div>
      ) : null}
    </section>
  );
}
