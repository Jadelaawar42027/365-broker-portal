/**
 * File: apps/web/src/components/broker/checklist.tsx
 * Purpose: The building blocks of the broker checklist (screen 1b): the navy "your next step" card, the red
 * "sent one step back" banner and the grouped list of steps with their status pills.
 *
 * Functions:
 * - NextStepCard({ step, complete }): the navy card pointing at the one thing to do next, or saying everything is sent or done.
 * - SentBackBanner({ item, now }): the red banner quoting the reviewer's note, with "Fix and resend".
 * - StepGroup({ number, title, steps }): one stage heading and its card of step rows.
 * - StepRow({ step }): one clickable step row with its marker, title and status pill.
 */
import type { MyStepsResponse, StepSummary } from "@bp/shared";
import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { AlertIcon, ArrowRightIcon } from "@/components/ui/icons";
import { Pill } from "@/components/ui/pill";
import { firstName, relativeTime } from "@/lib/format";
import { StepIcon } from "./step-icon";

export function NextStepCard({ step, complete }: { step: StepSummary | null; complete: boolean }) {
  if (!step) {
    return (
      <section aria-labelledby="next-step-title" className="rounded-[20px] bg-navy px-6 py-8 text-white sm:px-9 sm:py-10">
        <h2 id="next-step-title" className="text-[28px] leading-tight font-extrabold">
          {complete ? "All steps approved" : "Everything is sent"}
        </h2>
        <p className="mt-3 max-w-[40rem] text-lg leading-relaxed text-[#dfe6f1]">
          {complete
            ? "You've finished onboarding. Welcome to the team."
            : "We're checking what you sent. You'll get an email as each step is approved or needs a fix."}
        </p>
        {complete ? (
          <LinkButton href="/app/welcome-aboard" variant="white" size="lg" className="mt-6">
            See what's next
            <ArrowRightIcon />
          </LinkButton>
        ) : null}
      </section>
    );
  }
  const fixing = step.status === "changes_requested";
  return (
    <section
      aria-labelledby="next-step-title"
      className="flex flex-col gap-6 rounded-[20px] bg-navy px-6 py-7 text-white sm:px-9 sm:py-9 lg:flex-row lg:items-center lg:justify-between"
    >
      <div>
        <p className="text-[15px] font-bold tracking-[0.08em] text-[#9fb6dc]">YOUR NEXT STEP · STEP {step.position}</p>
        <h2 id="next-step-title" className="mt-3 text-[28px] leading-tight font-extrabold">
          {step.title}
        </h2>
        <p className="mt-3 max-w-[40rem] text-lg leading-relaxed text-[#dfe6f1]">{step.summary}</p>
      </div>
      <LinkButton href={`/app/steps/${step.key}`} variant="white" size="lg" className="shrink-0 self-start lg:self-center">
        {fixing ? "Fix and resend" : "Start this step"}
        <ArrowRightIcon />
      </LinkButton>
    </section>
  );
}

export function SentBackBanner({ item, now }: { item: MyStepsResponse["sentBack"][number]; now: Date }) {
  const reviewer = item.reviewerName ? firstName(item.reviewerName) : "We";
  return (
    <section
      aria-label={`${item.shortTitle} needs a fix`}
      className="flex flex-col gap-5 rounded-[20px] border border-danger-line bg-danger-soft px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6"
    >
      <div className="flex gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#f9dcdc] text-danger">
          <AlertIcon />
        </span>
        <div>
          <h2 className="text-lg font-bold text-danger">
            {reviewer} sent one step back: {item.shortTitle}
          </h2>
          {item.note ? (
            <p className="mt-1 text-base text-[#5c2a2a]">
              “{item.note}” — {reviewer}
              {item.reviewedAt ? `, ${relativeTime(item.reviewedAt, now)}` : ""}
            </p>
          ) : null}
        </div>
      </div>
      <LinkButton href={`/app/steps/${item.key}`} variant="danger-outline" className="shrink-0 self-start sm:self-center">
        Fix and resend
      </LinkButton>
    </section>
  );
}

export function StepGroup({ number, title, steps }: { number: number; title: string; steps: StepSummary[] }) {
  return (
    <section aria-labelledby={`stage-${number}`}>
      <h2 id={`stage-${number}`} className="mb-4 text-[22px] font-extrabold">
        {number} · {title}
      </h2>
      <ul className="overflow-hidden rounded-2xl border border-line bg-white">
        {steps.map((step) => (
          <StepRow key={step.key} step={step} />
        ))}
      </ul>
    </section>
  );
}

export function StepRow({ step }: { step: StepSummary }) {
  const later = step.status === "todo" && !step.isNext;
  return (
    <li className="border-b border-line last:border-b-0">
      <Link
        href={`/app/steps/${step.key}`}
        aria-current={step.isNext ? "step" : undefined}
        className={`flex flex-col items-start gap-3 px-5 py-5 transition-colors hover:bg-page sm:flex-row sm:items-center sm:gap-4 sm:py-3.5 ${step.isNext ? "bg-brand-soft/70" : ""}`}
      >
        <StepIcon status={step.status} position={step.position} isNext={step.isNext} />
        <span className={`text-lg sm:flex-1 ${later ? "text-muted" : "text-ink"} font-semibold`}>{step.title}</span>
        <Pill tone={step.tone}>{step.label}</Pill>
      </Link>
    </li>
  );
}
