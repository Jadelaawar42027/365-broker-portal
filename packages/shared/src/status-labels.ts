/**
 * File: packages/shared/src/status-labels.ts
 * Purpose: The words and colour tone of each step's status pill, shared by the broker checklist (1b) and
 * the admin onboarding record (3c) so both say the same thing (SPEC D3). Step 2's agreements wait for a
 * countersignature rather than an approval (SPEC D31).
 *
 * Functions:
 * - stepStatusLabel(input): returns { label, tone } for a step given its status, key, approval rule and whether it is the next step.
 */
import type { StepStatus } from "./constants";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export type StepStatusLabelInput = {
  status: StepStatus;
  stepKey: string;
  needsApproval: boolean;
  isNext: boolean;
};

export function stepStatusLabel(input: StepStatusLabelInput): { label: string; tone: StatusTone } {
  switch (input.status) {
    case "approved":
      if (!input.needsApproval) return { label: "Done", tone: "success" };
      if (input.stepKey === "contract_nda") return { label: "Signed", tone: "success" };
      return { label: "Approved", tone: "success" };
    case "submitted":
      if (input.stepKey === "contract_nda") return { label: "Waiting for countersignature", tone: "warning" };
      return { label: "Waiting for approval", tone: "warning" };
    case "changes_requested":
      return { label: "Needs a fix", tone: "danger" };
    case "todo":
      return input.isNext
        ? { label: "Do this next", tone: "info" }
        : { label: "Coming up", tone: "neutral" };
  }
}
