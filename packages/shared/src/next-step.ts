/**
 * File: packages/shared/src/next-step.ts
 * Purpose: Works out where a broker stands in onboarding from their step rows: the "next step" card
 * (SPEC D1), the sent-back steps for the red banner, progress counts and whether onboarding is complete.
 *
 * Functions:
 * - sortByPosition(steps): returns a copy of steps ordered by position.
 * - findNextStep(steps): returns the lowest todo step, else the lowest changes_requested step, else null.
 * - findSentBackSteps(steps): returns every changes_requested step in position order.
 * - countProgress(steps): returns total, approved and sent (submitted or approved) counts.
 * - isOnboardingComplete(steps): returns true when there is at least one step and every step is approved.
 */
import type { StepStatus } from "./constants";

export type StepProgressRow = { position: number; status: StepStatus };

function sortByPosition<T extends StepProgressRow>(steps: readonly T[]): T[] {
  return [...steps].sort((a, b) => a.position - b.position);
}

export function findNextStep<T extends StepProgressRow>(steps: readonly T[]): T | null {
  const ordered = sortByPosition(steps);
  return (
    ordered.find((step) => step.status === "todo") ??
    ordered.find((step) => step.status === "changes_requested") ??
    null
  );
}

export function findSentBackSteps<T extends StepProgressRow>(steps: readonly T[]): T[] {
  return sortByPosition(steps).filter((step) => step.status === "changes_requested");
}

export function countProgress(steps: readonly StepProgressRow[]) {
  const approved = steps.filter((step) => step.status === "approved").length;
  const submitted = steps.filter((step) => step.status === "submitted").length;
  return { total: steps.length, approved, sent: approved + submitted };
}

export function isOnboardingComplete(steps: readonly StepProgressRow[]): boolean {
  return steps.length > 0 && steps.every((step) => step.status === "approved");
}
