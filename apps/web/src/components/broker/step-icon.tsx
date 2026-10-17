/**
 * File: apps/web/src/components/broker/step-icon.tsx
 * Purpose: The round marker at the start of each checklist row (1b) and onboarding record row (3c): a green tick
 * when done, an amber clock when waiting, a red "!" when sent back, a blue ringed number for the next step and a
 * grey number for later steps.
 *
 * Functions:
 * - StepIcon({ status, position, isNext }): renders the marker.
 */
import type { StepStatus } from "@bp/shared";
import { AlertIcon, CheckIcon, ClockIcon } from "@/components/ui/icons";

export function StepIcon({ status, position, isNext }: { status: StepStatus; position: number; isNext: boolean }) {
  const base = "grid size-11 shrink-0 place-items-center rounded-full";
  if (status === "approved") return <span className={`${base} bg-success-soft text-success`}><CheckIcon /></span>;
  if (status === "submitted") return <span className={`${base} bg-warn-soft text-warn`}><ClockIcon /></span>;
  if (status === "changes_requested") return <span className={`${base} bg-danger-soft text-danger`}><AlertIcon /></span>;
  if (isNext) return <span className={`${base} border-2 border-brand bg-white text-base font-bold text-brand`}>{position}</span>;
  return <span className={`${base} bg-neutral-soft text-base font-bold text-muted`}>{position}</span>;
}
