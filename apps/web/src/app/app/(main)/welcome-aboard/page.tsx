/**
 * File: apps/web/src/app/app/(main)/welcome-aboard/page.tsx
 * Purpose: Screen 1d, "You're officially a 365 broker": shown once when every step is approved, with the broker's
 * level, commission tier and onboarding date, a disabled "Training coming soon" button (SPEC D6) and the first-90-days
 * plan from the manual. Brokers who aren't active yet are sent back to their checklist.
 *
 * Functions:
 * - WelcomeAboardPage(): renders the screen and records that it was seen.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MarkWelcomeSeen } from "@/components/broker/mark-welcome-seen";
import { CheckIcon, LockIcon } from "@/components/ui/icons";
import { FIRST_90_DAYS } from "@/lib/content";
import { formatDate } from "@/lib/format";
import { requireMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "Welcome aboard · 365 Yachts" };

export default async function WelcomeAboardPage() {
  const me = await requireMe();
  const broker = me.broker;
  if (!broker || broker.status !== "active") redirect("/app");
  const level = broker.level === "senior" ? "Senior broker" : "Junior broker";
  const facts = [
    `Level: ${level}`,
    `Commission tier: ${broker.commissionTier ?? "to be confirmed"}`,
    ...(broker.onboardedAt ? [`Onboarded: ${formatDate(broker.onboardedAt)}`] : []),
  ];

  return (
    <div className="mx-auto max-w-[896px]">
      <MarkWelcomeSeen pending={broker.showWelcome} />
      <section className="rounded-[28px] bg-navy px-6 py-12 text-center text-white sm:px-12 sm:py-14">
        <span className="mx-auto grid size-[72px] place-items-center rounded-full bg-white text-success">
          <CheckIcon className="size-9" />
        </span>
        <h1 className="mt-7 text-[40px] leading-[1.1] font-extrabold tracking-tight sm:text-[48px]">You&apos;re officially a 365 broker.</h1>
        <p className="mx-auto mt-5 max-w-[36rem] text-xl leading-relaxed text-[#dfe6f1]">
          All your onboarding steps are approved. Training opens soon — we&apos;ll email you when Part 0 is ready.
        </p>
        <ul className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:justify-center" aria-label="Your details">
          {facts.map((fact) => (
            <li key={fact} className="rounded-full bg-navy-soft px-5 py-2.5 text-[17px] font-bold">
              {fact}
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled
          className="mt-9 inline-flex min-h-12 cursor-not-allowed items-center gap-2.5 rounded-xl border-2 border-white/40 bg-white/10 px-6 text-lg font-bold text-[#e6ecf5]"
        >
          <LockIcon />
          Training coming soon
        </button>
      </section>

      <section aria-labelledby="ninety-days" className="mt-12">
        <h2 id="ninety-days" className="text-[28px] font-extrabold tracking-tight">
          Your first 90 days
        </h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FIRST_90_DAYS.map((item, index) => (
            <li
              key={item.title}
              className={`rounded-2xl border px-5 py-6 ${index === FIRST_90_DAYS.length - 1 ? "border-[#cddcf3] bg-brand-soft" : "border-line bg-white"}`}
            >
              <p className="text-base font-bold tracking-wide text-brand">{item.days.toUpperCase()}</p>
              <h3 className="mt-2 text-xl font-bold">{item.title}</h3>
              <p className="mt-2 text-lg leading-snug text-muted">{item.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
