/**
 * File: apps/web/src/app/(auth)/invite/[token]/page.tsx
 * Purpose: Screen 1a, "Welcome aboard": opened from the invite email, it greets the broker by name and lets them
 * create their account. Used, expired or unknown links get a clear message and the WhatsApp help button.
 *
 * Functions:
 * - InvitePage({ params }): loads the invite and renders the welcome screen or the link problem.
 */
import type { InviteInfoResponse } from "@bp/shared";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { FormMessage } from "@/components/auth/form-message";
import { InviteForm } from "@/components/auth/invite-form";
import { publicGet } from "@/lib/server-api";
import { publicSupportContact } from "@/lib/support";

export const metadata: Metadata = { title: "Welcome aboard · 365 Yachts" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const support = publicSupportContact();
  const invite = await publicGet<InviteInfoResponse>(`/v1/invites/${encodeURIComponent(token)}`);

  if (!invite.data) {
    return (
      <AuthShell
        eyebrow="BROKER ONBOARDING"
        heading="Welcome aboard."
        intro="Getting set up takes about a week. We give you one step at a time, so you always know exactly what to do next."
        support={support}
        supportTopic="with my invite link"
        cardTitle="This link doesn't work"
      >
        <div className="space-y-6">
          <FormMessage tone="error">{invite.message ?? "This invite link is not valid."}</FormMessage>
          <p className="text-lg text-muted">
            Already created your account?{" "}
            <a href="/login" className="font-semibold text-brand underline underline-offset-2">
              Sign in
            </a>
          </p>
        </div>
      </AuthShell>
    );
  }

  const isBroker = invite.data.role === "broker";
  return (
    <AuthShell
      eyebrow={isBroker ? "BROKER ONBOARDING" : "ADMIN ACCESS"}
      heading={`Welcome aboard, ${invite.data.firstName}.`}
      intro={
        isBroker
          ? "Getting set up takes about a week. We give you one step at a time, so you always know exactly what to do next."
          : "You've been added as an admin on the 365 Yachts broker portal. Create your account to review submissions and track every broker."
      }
      showStages={isBroker}
      support={support}
      supportTopic="creating my account"
      brokerName={invite.data.name}
      cardTitle="Create your account"
      cardSubtitle="You only do this once."
    >
      <InviteForm token={token} email={invite.data.email} name={invite.data.name} />
    </AuthShell>
  );
}
