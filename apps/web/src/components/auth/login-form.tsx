/**
 * File: apps/web/src/components/auth/login-form.tsx
 * Purpose: Sign-in form with a "Forgot your password?" switch that emails a reset link (SPEC D8). After signing in,
 * brokers go to their checklist and admins to the admin overview.
 *
 * Functions:
 * - LoginForm({ notice }): renders sign-in or forgot-password mode and handles both submissions.
 * - signIn(form): signs in through Better Auth, then routes by role.
 * - requestReset(form): asks the API to email a reset link and shows the neutral confirmation.
 */
"use client";

import type { MeResponse } from "@bp/shared";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FieldLabel, inputClasses } from "@/components/ui/misc";
import { apiRequest, ApiError } from "@/lib/api-client";
import { FormMessage } from "./form-message";

export function LoginForm({ notice }: { notice?: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "forgot">("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(notice ?? null);
  const [busy, setBusy] = useState(false);

  async function signIn(form: FormData) {
    try {
      await apiRequest("/api/auth/sign-in/email", {
        method: "POST",
        body: { email: String(form.get("email")).trim(), password: String(form.get("password")) },
      });
      const me = await apiRequest<MeResponse>("/v1/me");
      router.replace(me.user.role === "broker" ? "/app" : "/admin");
      router.refresh();
    } catch (caught) {
      const message =
        caught instanceof ApiError && caught.status === 401
          ? "That email and password don't match. Try again or reset your password."
          : caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Please try again.";
      setError(message);
      setBusy(false);
    }
  }

  async function requestReset(form: FormData) {
    try {
      await apiRequest("/v1/password-reset/request", { method: "POST", body: { email: String(form.get("email")).trim() } });
      setSuccess("If that email has an account, a link to choose a new password is on its way. It works for 24 hours.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
    }
    setBusy(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setSuccess(null);
    if (mode === "sign-in") await signIn(form);
    else await requestReset(form);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <input id="email" name="email" type="email" spellCheck={false} required autoComplete="username" className={inputClasses()} />
      </div>
      {mode === "sign-in" ? (
        <div>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <input id="password" name="password" type="password" required autoComplete="current-password" className={inputClasses()} />
        </div>
      ) : null}
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      {success ? <FormMessage tone="success">{success}</FormMessage> : null}
      <Button type="submit" size="xl" className="w-full" disabled={busy}>
        {mode === "sign-in" ? (busy ? "Signing in…" : "Sign in") : busy ? "Sending…" : "Email me a reset link"}
      </Button>
      <p className="text-center text-[15px]">
        <button
          type="button"
          className="min-h-11 font-semibold text-brand underline underline-offset-2"
          onClick={() => {
            setMode(mode === "sign-in" ? "forgot" : "sign-in");
            setError(null);
            setSuccess(null);
          }}
        >
          {mode === "sign-in" ? "Forgot your password?" : "Back to sign in"}
        </button>
      </p>
    </form>
  );
}
