/**
 * File: apps/web/src/app/app/(main)/help/page.tsx
 * Purpose: The Help page (SPEC D13, D16): mainly a "Message [support contact] on WhatsApp" button with a message naming the broker
 * and their next step, plus where to find each kind of help.
 *
 * Functions:
 * - HelpPage(): loads the broker's next step and renders the page.
 */
import type { MyStepsResponse } from "@bp/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { WhatsAppButton } from "@/components/ui/whatsapp-button";
import { requireMe, serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Help · 365 Yachts" };

export default async function HelpPage() {
  const me = await requireMe();
  const { data } = await serverGet<MyStepsResponse>("/v1/me/steps");
  const next = data?.steps.find((step) => step.key === data.nextStepKey) ?? null;
  const name = me.support.name;

  return (
    <div className="mx-auto max-w-[760px] space-y-8">
      <div>
        <h1 className="text-[34px] leading-tight font-extrabold tracking-tight sm:text-[38px]">Help</h1>
        <p className="mt-3 text-xl leading-relaxed text-muted">
          Stuck on a step or not sure what something means? Message {name} on WhatsApp.
        </p>
      </div>
      <section className="rounded-2xl border border-line bg-white px-6 py-8">
        {me.support.whatsappNumber ? (
          <>
            <WhatsAppButton
              support={me.support}
              brokerName={me.user.name}
              step={next ? { position: next.position, title: next.title } : null}
              size="xl"
              fullWidth
            />
            <p className="mt-4 text-base text-muted">
              WhatsApp opens with a message ready to send{next ? `, saying you need help with step ${next.position}` : ""}. You can change it before sending.
            </p>
          </>
        ) : (
          <p className="text-lg">Reply to any email from 365 Yachts and {name} will help.</p>
        )}
      </section>
      <section aria-labelledby="where" className="space-y-3">
        <h2 id="where" className="text-[22px] font-extrabold">
          Where to look first
        </h2>
        <ul className="space-y-3 text-lg leading-relaxed">
          <li>
            Every step has a <strong className="font-bold">How to do it</strong> list. Open your{" "}
            <Link href="/app" className="font-semibold text-brand underline underline-offset-2">
              checklist
            </Link>{" "}
            and pick the step.
          </li>
          <li>If a step was sent back, the red box on your checklist says exactly what to fix.</li>
          <li>Forgot your password? Sign out and use “Forgot your password?” on the sign-in page.</li>
        </ul>
      </section>
    </div>
  );
}
