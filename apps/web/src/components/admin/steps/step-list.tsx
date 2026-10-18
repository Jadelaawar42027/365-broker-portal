/**
 * File: apps/web/src/components/admin/steps/step-list.tsx
 * Purpose: The left-hand list of onboarding steps in the admin step editor, numbered, with the current step
 * highlighted and a warning mark on steps that still have an empty video slot.
 *
 * Functions:
 * - StepList({ steps, currentKey }): the navigation list.
 */
import type { AdminStepListRow } from "@bp/shared";
import Link from "next/link";
import { AlertIcon } from "@/components/ui/icons";

export function StepList({ steps, currentKey }: { steps: AdminStepListRow[]; currentKey: string | null }) {
  return (
    <nav aria-label="Onboarding steps" className="rounded-2xl border border-line bg-white px-3 py-4">
      <ol className="space-y-0.5">
        {steps.map((step) => {
          const current = step.key === currentKey;
          return (
            <li key={step.key}>
              <Link
                href={`/admin/steps/${step.key}`}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-12 items-center gap-3 rounded-xl px-3.5 py-2.5 text-[17px] hover:bg-page ${current ? "bg-brand-soft font-bold" : ""}`}
              >
                <span className="w-6 shrink-0 text-right font-semibold text-muted tabular-nums">{step.position}</span>
                <span className="min-w-0 flex-1">{step.shortTitle}</span>
                {step.emptyVideoSlots > 0 ? (
                  <span title="Has an empty video slot" className="shrink-0 text-warn">
                    <AlertIcon className="size-4" />
                    <span className="sr-only">(empty video slot)</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
