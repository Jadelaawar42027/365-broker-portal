/**
 * File: apps/web/src/app/(auth)/login/page.tsx
 * Purpose: The sign-in page, in the same split layout as screen 1a. People who are already signed in are sent on to
 * their home screen; ?reset=done shows a confirmation after a password reset.
 *
 * Functions:
 * - LoginPage({ searchParams }): renders the page or redirects a signed-in visitor.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { optionalMe } from "@/lib/server-api";
import { publicSupportContact } from "@/lib/support";

export const metadata: Metadata = { title: "Sign in · 365 Yachts" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const me = await optionalMe();
  if (me) redirect(me.user.role === "broker" ? "/app" : "/admin");
  const { reset } = await searchParams;
  return (
    <AuthShell
      eyebrow="BROKER PORTAL"
      heading="Welcome back."
      intro="Sign in to pick up your onboarding exactly where you left off."
      support={publicSupportContact()}
      supportTopic="signing in"
      cardTitle="Sign in"
      cardSubtitle="Use the email your invite was sent to."
    >
      <LoginForm notice={reset === "done" ? "Your new password is saved. Sign in with it now." : null} />
    </AuthShell>
  );
}
