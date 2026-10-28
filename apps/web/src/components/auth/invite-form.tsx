/**
 * File: apps/web/src/components/auth/invite-form.tsx
 * Purpose: The "Create your account" form on screen 1a. Sends the password (and the mobile number, only when the admin
 * didn't already enter one) with the invite token. When Google Workspace has created the broker's 365 email it is shown
 * grayed out and can't be edited (they sign in with it); the phone the admin entered is shown the same way,
 * then takes the new broker to their checklist (or an admin to the admin overview).
 *
 * Functions:
 * - InviteForm({ token, email, corporateEmail, phone, name }): renders the form and handles submission; when the invite has no email (SPEC D29), asks for the email the broker will sign in with.
 */
"use client";

import { MIN_PASSWORD_LENGTH } from "@bp/shared";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon } from "@/components/ui/icons";
import { FieldLabel, inputClasses } from "@/components/ui/misc";
import { formatPhone } from "@/lib/format";
import { apiRequest, ApiError } from "@/lib/api-client";
import { FormMessage } from "./form-message";

export function InviteForm({
  token,
  email,
  corporateEmail,
  phone,
  name,
}: {
  token: string;
  email: string | null;
  corporateEmail: string | null;
  phone: string | null;
  name: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<{ role: string }>(`/v1/invites/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        body: {
          name,
          password: String(form.get("password")),
          ...(phone ? {} : { phone: String(form.get("phone")) }),
          ...(email ? {} : { email: String(form.get("email") ?? "").trim() }),
        },
      });
      router.replace(result.role === "broker" ? "/app" : "/admin");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate={false}>
      <div>
        <FieldLabel htmlFor="email">{corporateEmail ? "Your 365 email" : email ? "Email" : "Your email (you'll sign in with it)"}</FieldLabel>
        {corporateEmail || email ? (
          <input
            id="email"
            name="email"
            type="email"
            spellCheck={false}
            value={corporateEmail ?? email ?? ""}
            readOnly
            aria-readonly="true"
            aria-describedby={corporateEmail ? "email-hint" : undefined}
            autoComplete="username"
            className={`${inputClasses()} cursor-not-allowed`}
          />
        ) : (
          <input id="email" name="email" type="email" required spellCheck={false} autoComplete="email" className={inputClasses()} />
        )}
        {corporateEmail ? (
          <p id="email-hint" className="mt-2 text-[15px] text-muted">
            Created for you by 365 Yachts. You&apos;ll sign in to the portal with it.
          </p>
        ) : null}
      </div>
      <div>
        <FieldLabel htmlFor="password">Choose a password</FieldLabel>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          className={inputClasses()}
        />
      </div>
      <div>
        <FieldLabel htmlFor="phone">Mobile number</FieldLabel>
        {phone ? (
          <input
            id="phone"
            name="phone"
            type="tel"
            value={formatPhone(phone)}
            readOnly
            aria-readonly="true"
            aria-describedby="phone-hint"
            className={`${inputClasses()} cursor-not-allowed tabular-nums`}
          />
        ) : (
          <input id="phone" name="phone" type="tel" required maxLength={30} autoComplete="tel" inputMode="tel" placeholder="(561) 555-0123" aria-describedby="phone-hint" className={inputClasses()} />
        )}
        <p id="phone-hint" className="mt-2 text-[15px] text-muted">
          {phone ? "The number 365 Yachts has for you. Message us if it's wrong." : "A US number, or start with + and the country code. We email you when a step is waiting, and call if something is urgent."}
        </p>
      </div>
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      <Button type="submit" size="xl" className="w-full" disabled={busy}>
        {busy ? "Creating your account…" : "Start my onboarding"}
        {busy ? null : <ArrowRightIcon className="size-6" />}
      </Button>
      <p className="text-center text-[15px] text-muted">
        Already have an account?{" "}
        <a href="/login" className="font-semibold text-brand underline underline-offset-2">
          Sign in
        </a>
      </p>
    </form>
  );
}
