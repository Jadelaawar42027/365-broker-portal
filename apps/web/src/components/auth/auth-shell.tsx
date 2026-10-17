/**
 * File: apps/web/src/components/auth/auth-shell.tsx
 * Purpose: The split layout of screen 1a, reused by sign-in, invite and reset pages: a navy welcome panel with the
 * three onboarding stages and the WhatsApp help button, and a white card holding the form. Stacks on phones.
 *
 * Functions:
 * - AuthShell({ eyebrow, heading, intro, showStages, support, supportTopic, brokerName, cardTitle, cardSubtitle, children }): renders the page.
 */
import type { ReactNode } from "react";
import { BrandLockup } from "@/components/brand/logo";
import { WhatsAppButton } from "@/components/ui/whatsapp-button";
import { ONBOARDING_STAGES } from "@/lib/content";

export function AuthShell({
  eyebrow,
  heading,
  intro,
  showStages = true,
  support,
  supportTopic,
  brokerName,
  cardTitle,
  cardSubtitle,
  children,
}: {
  eyebrow: string;
  heading: ReactNode;
  intro: string;
  showStages?: boolean;
  support: { name: string; whatsappNumber: string | null };
  supportTopic: string;
  brokerName?: string | null;
  cardTitle: string;
  cardSubtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <section className="flex flex-col bg-navy px-8 py-11 text-white sm:px-14 lg:py-14">
        <BrandLockup tone="light" />
        <p className="mt-12 text-[15px] font-semibold tracking-[0.08em] text-[#9fb6dc]">{eyebrow}</p>
        <h1 className="mt-3 max-w-[30rem] text-[44px] leading-[1.12] font-extrabold tracking-tight">{heading}</h1>
        <p className="mt-5 max-w-[28rem] text-xl leading-relaxed text-[#dfe6f1]">{intro}</p>
        {showStages ? (
          <ol className="mt-11 space-y-6">
            {ONBOARDING_STAGES.map((stage, index) => (
              <li key={stage.title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-[#c9d3e3] text-base font-bold">{index + 1}</span>
                <span>
                  <span className="block text-lg font-bold">{stage.title}</span>
                  <span className="block text-base text-[#c9d3e3]">{stage.body}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : null}
        <div className="mt-10 lg:mt-auto lg:pt-10">
          {support.whatsappNumber ? (
            <div className="flex flex-col items-start gap-4">
              <p className="text-base text-[#dfe6f1]">Stuck at any point? {support.name} can help.</p>
              <WhatsAppButton support={support} brokerName={brokerName} topic={supportTopic} />
            </div>
          ) : null}
        </div>
      </section>
      <main id="main" className="flex items-start justify-center bg-page px-5 py-10 sm:px-8 lg:pt-[98px]">
        <div className="w-full max-w-[420px] rounded-2xl border border-line bg-white px-6 py-9 sm:px-10 sm:py-10">
          <h2 className="text-[27px] leading-tight font-extrabold tracking-tight">{cardTitle}</h2>
          {cardSubtitle ? <p className="mt-1.5 text-[17px] text-muted">{cardSubtitle}</p> : null}
          <div className="mt-7">{children}</div>
        </div>
      </main>
    </div>
  );
}
