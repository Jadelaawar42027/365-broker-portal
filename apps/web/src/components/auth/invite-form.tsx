/**
 * File: apps/web/src/components/auth/invite-form.tsx
 * Purpose: The "Create your account" form on screen 1a. Sends the password (and the mobile number, only when the admin
 * didn't already enter one) with the invite token,
 * then takes the new broker to their checklist (or an admin to the admin overview).
 *
 * Functions:
 * - InviteForm({ token, email, name, hasPhone }): renders the form and handles submission; when the invite has no email (SPEC D29), asks for the email the broker will sign in with.
 */
"use client";

import { MIN_PASSWORD_LENGTH } from "@bp/shared";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon } from "@/components/ui/icons";
import { FieldLabel, inputClasses } from "@/components/ui/misc";
import { apiRequest, ApiError } from "@/lib/api-client";
import { FormMessage } from "./form-message";

export function InviteForm({ token, email, name, hasPhone }: { token: string; email: string | null; name: string; hasPhone: boolean }) {
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
          ...(hasPhone ? {} : { phone: String(form.get("phone")) }),
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
        <FieldLabel htmlFor="email">{email ? "Email" : "Your email (you'll sign in with it)"}</FieldLabel>
        {email ? (
          <input id="email" name="email" type="email" spellCheck={false} value={email} readOnly autoComplete="username" className={inputClasses()} />
        ) : (
          <input id="email" name="email" type="email" required spellCheck={false} autoComplete="email" className={inputClasses()} />
        )}
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
      {hasPhone ? null : (
        <div>
          <FieldLabel htmlFor="phone">Mobile number</FieldLabel>
          <input id="phone" name="phone" type="tel" required autoComplete="tel" inputMode="tel" placeholder="(561) 000-0000" aria-describedby="phone-hint" className={inputClasses()} />
          <p id="phone-hint" className="mt-2 text-[15px] text-muted">
            We email you when a step is waiting, and call if something is urgent.
          </p>
        </div>
      )}
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
