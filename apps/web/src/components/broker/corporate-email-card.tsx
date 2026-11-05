/**
 * File: apps/web/src/components/broker/corporate-email-card.tsx
 * Purpose: The "Your 365 email" card on step 10 (phase H2). When the Workspace account is ready it shows the address
 * and a numbered "How to log in to Gmail" list: open Gmail, the email, and the password (the starting password the
 * account was made with, or one just revealed), each with Copy; Google asks for a new password at first sign-in.
 * "Get a new temporary password" resets the Google password at that moment and shows it once (up to 3 a day). When the
 * account isn't ready it says the email is being set up and the support contact will send the login details. Until
 * Google Workspace provisioning is configured the card isn't shown at all, so brokers who already have a 365 email
 * aren't told it's being set up. A revealed password lives only in this component's memory.
 *
 * Functions:
 * - CorporateEmailCard({ accounts, supportName }): renders the card.
 * - reveal(): asks the API for a fresh temporary password and shows it.
 * - copy(field, value): copies the email or password and confirms in place.
 * - CopyField({ id, label, value, copied, onCopy }): a read-only value with its label and a Copy button.
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
  const [copied, setCopied] = useState<"email" | "password" | null>(null);
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
    const confirmed = window.confirm("This sets a new temporary password for your 365 email right now. Your current password stops working. Continue?");
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    setCopied(null);
    try {
      const result = await apiRequest<RevealPasswordResponse>("/v1/me/accounts/google/reveal-password", { method: "POST", body: {} });
      setRevealed(result);
      setRevealsLeft(result.revealsLeft);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That didn't work. Try again in a minute.");
    }
    setBusy(false);
  }

  async function copy(field: "email" | "password", value: string) {
    await navigator.clipboard.writeText(value).catch(() => null);
    setCopied(field);
  }

  const email = accounts.corporateEmail;
  const password = revealed?.password ?? accounts.startingPassword;

  return (
    <section aria-labelledby="corporate-email-title" className="rounded-2xl border border-line bg-white px-6 py-6">
      <h2 id="corporate-email-title" className="text-xl font-bold">
        Your 365 email
      </h2>
      <p className="mt-2 text-[22px] font-extrabold break-all">{email}</p>

      <h3 className="mt-6 text-lg font-bold">How to log in to Gmail</h3>
      <ol className="mt-3 space-y-5">
        <li className="space-y-2">
          <p className="text-[17px] font-semibold">1. Open Gmail</p>
          <a href={accounts.gmailUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses("primary", "lg")}>
            Open Gmail
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </li>
        <li className="space-y-2">
          <p className="text-[17px] font-semibold">2. Sign in with your 365 email</p>
          <CopyField id="gmail-login-email" label="Email" value={email} copied={copied === "email"} onCopy={() => void copy("email", email)} />
        </li>
        <li className="space-y-2">
          <p className="text-[17px] font-semibold">3. Enter your password</p>
          {password ? (
            <CopyField
              id="gmail-login-password"
              label={revealed ? "New temporary password" : "Starting password"}
              value={password}
              copied={copied === "password"}
              onCopy={() => void copy("password", password)}
            />
          ) : (
            <p className="text-[15px] leading-relaxed text-muted">Use the password you chose. Forgot it, or never had one? Get a new temporary password below.</p>
          )}
        </li>
        <li>
          <p className="text-[17px] font-semibold">4. Choose your own password</p>
          <p className="mt-1 text-[15px] leading-relaxed text-muted">Google asks you to pick a new password the first time you sign in. Use that one from then on.</p>
        </li>
      </ol>
      <p aria-live="polite" className="sr-only">
        {copied ? "Copied." : ""}
      </p>

      <div className="mt-6 space-y-3 border-t border-line pt-5">
        <p className="text-[15px] font-bold">Can't sign in?</p>
        <Button variant="outline" size="lg" disabled={busy || revealsLeft <= 0} onClick={() => void reveal()}>
          {busy ? "Getting your password…" : "Get a new temporary password"}
        </Button>
        <p className="text-[15px] text-muted">
          {revealsLeft > 0
            ? `This replaces your current password. ${revealsLeft} left today.`
            : `You've used today's 3 resets. Try again tomorrow or message ${supportName}.`}
        </p>
      </div>
      {error ? (
        <div className="mt-4">
          <FormMessage tone="error">{error}</FormMessage>
        </div>
      ) : null}
    </section>
  );
}

function CopyField({ id, label, value, copied, onCopy }: { id: string; label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[15px] font-bold">
        {label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={id}
          readOnly
          value={value}
          autoComplete="off"
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
          className="min-h-12 w-full rounded-xl border border-[#cdd5e1] bg-page px-4 font-mono text-lg tracking-wide"
        />
        <Button variant="outline" className="shrink-0" onClick={onCopy}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
