/**
 * File: apps/web/src/components/auth/reset-form.tsx
 * Purpose: The "choose a new password" form behind a reset link (SPEC D8). Checks both entries match, then sends the
 * new password and points the person back to sign in.
 *
 * Functions:
 * - ResetForm({ token, email }): renders the form and handles submission.
 */
"use client";

import { MIN_PASSWORD_LENGTH } from "@bp/shared";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FieldLabel, inputClasses } from "@/components/ui/misc";
import { apiRequest, ApiError } from "@/lib/api-client";
import { FormMessage } from "./form-message";

export function ResetForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    if (password !== String(form.get("confirm"))) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/v1/password-reset/${encodeURIComponent(token)}`, { method: "POST", body: { password } });
      router.replace("/login?reset=done");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <input id="email" type="email" spellCheck={false} value={email} readOnly autoComplete="username" className={inputClasses()} />
      </div>
      <div>
        <FieldLabel htmlFor="password">New password</FieldLabel>
        <input id="password" name="password" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} className={inputClasses()} />
      </div>
      <div>
        <FieldLabel htmlFor="confirm">Type it again</FieldLabel>
        <input id="confirm" name="confirm" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" className={inputClasses()} />
      </div>
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      <Button type="submit" size="xl" className="w-full" disabled={busy}>
        {busy ? "Saving…" : "Save my new password"}
      </Button>
    </form>
  );
}
