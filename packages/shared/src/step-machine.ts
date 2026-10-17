/**
 * File: packages/shared/src/step-machine.ts
 * Purpose: The onboarding step state machine from docs/SPEC.md plus the admin override (SPEC D2). The API
 * calls it before every status change so illegal moves are rejected with one clear error everywhere.
 *
 * Functions:
 * - StepTransitionError.constructor(code, message): the error thrown for a rejected move; code is machine-readable.
 * - transitionStep(input): returns the next status for a step action, or throws StepTransitionError.
 * - canTransition(input): returns true if transitionStep would succeed, without throwing.
 */
import type { StepStatus } from "./constants";

export const STEP_ACTIONS = ["submit", "approve", "send_back", "admin_override"] as const;
export type StepAction = (typeof STEP_ACTIONS)[number];

export type StepTransitionInput = {
  from: StepStatus;
  action: StepAction;
  needsApproval: boolean;
  note?: string | null;
};

export type StepTransitionErrorCode =
  | "already_approved"
  | "waiting_for_review"
  | "not_submitted"
  | "note_required";

export class StepTransitionError extends Error {
  readonly code: StepTransitionErrorCode;

  constructor(code: StepTransitionErrorCode, message: string) {
    super(message);
    this.name = "StepTransitionError";
    this.code = code;
  }
}

export function transitionStep(input: StepTransitionInput): StepStatus {
  const { from, action, needsApproval } = input;
  switch (action) {
    case "submit":
      if (from === "approved") {
        throw new StepTransitionError("already_approved", "This step is already approved.");
      }
      if (from === "submitted") {
        throw new StepTransitionError(
          "waiting_for_review",
          "This step was already sent and is waiting for review.",
        );
      }
      return needsApproval ? "submitted" : "approved";
    case "approve":
      if (from !== "submitted") {
        throw new StepTransitionError("not_submitted", "Only a submitted step can be approved.");
      }
      return "approved";
    case "send_back":
      if (from !== "submitted") {
        throw new StepTransitionError("not_submitted", "Only a submitted step can be sent back.");
      }
      if (!input.note || input.note.trim().length === 0) {
        throw new StepTransitionError("note_required", "Add a note saying what needs fixing.");
      }
      return "changes_requested";
    case "admin_override":
      return "approved";
  }
}

export function canTransition(input: StepTransitionInput): boolean {
  try {
    transitionStep(input);
    return true;
  } catch (error) {
    if (error instanceof StepTransitionError) return false;
    throw error;
  }
}
