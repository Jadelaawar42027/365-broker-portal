/**
 * File: apps/web/src/app/(auth)/reset/[token]/page.tsx
 * Purpose: The page behind a password reset link (SPEC D8): checks the link, then lets the person choose a new
 * password. Used or expired links explain what to do next.
 *
 * Functions:
 * - ResetPage({ params }): loads the reset link and renders the form or the link problem.
 */
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { FormMessage } from "@/components/auth/form-message";
import { ResetForm } from "@/components/auth/reset-form";
import { publicGet } from "@/lib/server-api";
import { publicSupportContact } from "@/lib/support";

export const metadata: Metadata = { title: "Choose a new password · 365 Yachts" };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const reset = await publicGet<{ email: string }>(`/v1/password-reset/${encodeURIComponent(token)}`);
  return (
    <AuthShell
      eyebrow="BROKER PORTAL"
      heading="New password."
      intro="Choose a new password for the 365 Yachts portal. You'll be signed out everywhere else."
      showStages={false}
      support={publicSupportContact()}
      supportTopic="resetting my password"
      cardTitle={reset.data ? "Choose a new password" : "This link doesn't work"}
    >
      {reset.data ? (
        <ResetForm token={token} email={reset.data.email} />
      ) : (
        <div className="space-y-6">
          <FormMessage tone="error">{reset.message ?? "This reset link is not valid."}</FormMessage>
          <p className="text-lg text-muted">
            Ask for a new link from the{" "}
            <a href="/login" className="font-semibold text-brand underline underline-offset-2">
              sign-in page
            </a>
            .
          </p>
        </div>
      )}
    </AuthShell>
  );
}
