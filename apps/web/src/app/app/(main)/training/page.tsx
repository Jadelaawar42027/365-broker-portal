/**
 * File: apps/web/src/app/app/(main)/training/page.tsx
 * Purpose: The locked training page (SPEC D6): the Volume One chapter list greyed out, under a banner saying training
 * opens once onboarding is approved, so brokers can see what is coming.
 *
 * Functions:
 * - TrainingPage(): renders the banner and the locked chapter list.
 */
import { VOLUME_ONE_CHAPTERS } from "@bp/shared";
import type { Metadata } from "next";
import { LockIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Training · 365 Yachts" };

export default function TrainingPage() {
  return (
    <div className="mx-auto max-w-[760px] space-y-8">
      <h1 className="text-[34px] leading-tight font-extrabold tracking-tight sm:text-[38px]">Training</h1>
      <div role="status" className="flex gap-4 rounded-2xl bg-navy px-6 py-6 text-white">
        <LockIcon className="mt-1 size-6 shrink-0" />
        <p className="text-lg leading-relaxed">
          <strong className="font-bold">Training opens soon.</strong> You&apos;ll get access once your onboarding is approved.
        </p>
      </div>
      <section aria-labelledby="chapters">
        <h2 id="chapters" className="mb-4 text-[22px] font-extrabold">
          Volume One
        </h2>
        <ol className="overflow-hidden rounded-2xl border border-line bg-white">
          {VOLUME_ONE_CHAPTERS.map((chapter) => (
            <li key={chapter.code} className="flex items-center gap-4 border-b border-line px-5 py-5 last:border-b-0">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-neutral-soft text-muted">
                <LockIcon className="size-[18px]" />
              </span>
              <span className="flex-1 text-lg font-semibold text-muted">{chapter.label}</span>
              <span className="text-base text-muted">Locked</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
