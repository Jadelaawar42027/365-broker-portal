/**
 * File: apps/web/src/components/broker/step-path-guide.tsx
 * Purpose: The step-by-step guide for the broker's own situation on steps whose config has "paths" (steps 7 and 8
 * follow the licensing route picked at step 6). The matching guide is shown open; the other routes sit behind
 * "Other situations" in case the broker picked the wrong one. Before the earlier step is answered, it asks the broker
 * to answer it first and shows every route collapsed.
 *
 * Functions:
 * - StepPathGuide({ step, supportName }): renders the guide card, or nothing when the step has no paths.
 * - PathDetails({ heading, bodyMd }): one collapsed route with its heading as the toggle.
 */
import type { StepDetailResponse } from "@bp/shared";
import Link from "next/link";
import { LessonBody } from "@/components/training/lesson-body";
import { ChevronRightIcon } from "@/components/ui/icons";

function PathDetails({ heading, bodyMd }: { heading: string; bodyMd: string }) {
  return (
    <details className="group rounded-2xl border border-line bg-white">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl px-5 py-4 text-lg font-bold hover:bg-page focus-visible:outline-3 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon className="size-5 shrink-0 text-brand transition-transform group-open:rotate-90" />
        {heading}
      </summary>
      <div className="space-y-5 rounded-b-2xl border-t border-line px-5 py-6">
        <LessonBody markdown={bodyMd} />
      </div>
    </details>
  );
}

export function StepPathGuide({ step, supportName }: { step: StepDetailResponse; supportName: string }) {
  const paths = step.config.paths;
  if (!paths) return null;
  const chosen = paths.options.find((option) => option.value === step.pathChoice) ?? null;
  const others = paths.options.filter((option) => option !== chosen);

  return (
    <section aria-labelledby="path-title" className="space-y-4 rounded-2xl border-2 border-brand bg-white px-5 py-6 sm:px-7 sm:py-7">
      {chosen ? (
        <>
          <p className="text-[14px] font-extrabold tracking-[0.08em] text-brand uppercase">Your step-by-step guide</p>
          <h2 id="path-title" className="text-2xl font-extrabold tracking-tight">
            {chosen.heading}
          </h2>
          <div className="space-y-5">
            <LessonBody markdown={chosen.bodyMd} />
          </div>
          <p className="text-base text-muted">
            Picked the wrong situation{step.pathFromTitle ? ` on "${step.pathFromTitle}"` : ""}? Message {supportName} and open the right guide below.
          </p>
        </>
      ) : (
        <>
          <p className="text-[14px] font-extrabold tracking-[0.08em] text-brand uppercase">Your step-by-step guide</p>
          <h2 id="path-title" className="text-2xl font-extrabold tracking-tight">
            Tell us your license situation first
          </h2>
          <p className="text-lg leading-relaxed">
            This step depends on your answer to{" "}
            <Link href={`/app/steps/${paths.fromStep}`} className="font-semibold text-brand underline underline-offset-4">
              {step.pathFromTitle ?? "the earlier step"}
            </Link>
            . Answer that first and the exact steps for you will appear here. Every route is below if you want to read ahead.
          </p>
        </>
      )}
      {others.length > 0 ? (
        <div className="space-y-3 pt-2">
          {chosen ? <h3 className="text-lg font-bold">Other situations</h3> : null}
          {others.map((option) => (
            <PathDetails key={option.value} heading={option.heading} bodyMd={option.bodyMd} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
