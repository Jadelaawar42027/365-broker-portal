/**
 * File: packages/shared/test/step-machine.test.ts
 * Purpose: Exhaustive tests of the step state machine: every status x action x approval combination is
 * checked against the table of allowed moves from docs/SPEC.md and SPEC D2.
 *
 * Functions:
 * - expectedOutcome(from, action, needsApproval): the move the spec allows, as a status or an error code.
 */
import { describe, expect, it } from "vitest";
import { STEP_STATUSES, type StepStatus } from "../src/constants";
import {
  STEP_ACTIONS,
  StepTransitionError,
  canTransition,
  transitionStep,
  type StepAction,
} from "../src/step-machine";

function expectedOutcome(from: StepStatus, action: StepAction, needsApproval: boolean): StepStatus | string {
  if (action === "admin_override") return "approved";
  if (action === "submit") {
    if (from === "approved") return "already_approved";
    if (from === "submitted") return "waiting_for_review";
    return needsApproval ? "submitted" : "approved";
  }
  if (from !== "submitted") return "not_submitted";
  return action === "approve" ? "approved" : "changes_requested";
}

describe("transitionStep - full table", () => {
  for (const from of STEP_STATUSES) {
    for (const action of STEP_ACTIONS) {
      for (const needsApproval of [true, false]) {
        const expected = expectedOutcome(from, action, needsApproval);
        it(`${from} + ${action} (needs approval: ${needsApproval}) -> ${expected}`, () => {
          const input = { from, action, needsApproval, note: "Please fix the signature." };
          if ((STEP_STATUSES as readonly string[]).includes(expected)) {
            expect(transitionStep(input)).toBe(expected);
            expect(canTransition(input)).toBe(true);
          } else {
            expect(() => transitionStep(input)).toThrow(StepTransitionError);
            try {
              transitionStep(input);
            } catch (error) {
              expect((error as StepTransitionError).code).toBe(expected);
            }
            expect(canTransition(input)).toBe(false);
          }
        });
      }
    }
  }
});

describe("transitionStep - spec rules", () => {
  it("a broker submitting a step that needs approval sends it for review", () => {
    expect(transitionStep({ from: "todo", action: "submit", needsApproval: true })).toBe("submitted");
  });

  it("a broker confirming a step without approval completes it", () => {
    expect(transitionStep({ from: "todo", action: "submit", needsApproval: false })).toBe("approved");
  });

  it("a sent-back step can be resubmitted", () => {
    expect(transitionStep({ from: "changes_requested", action: "submit", needsApproval: true })).toBe(
      "submitted",
    );
  });

  it("sending back needs a note", () => {
    for (const note of [undefined, null, "", "   "]) {
      expect(() => transitionStep({ from: "submitted", action: "send_back", needsApproval: true, note })).toThrow(
        /Add a note/,
      );
    }
  });

  it("an approved step cannot be resubmitted by the broker", () => {
    expect(() => transitionStep({ from: "approved", action: "submit", needsApproval: true })).toThrow(
      /already approved/,
    );
  });

  it("the admin override approves from any state", () => {
    for (const from of STEP_STATUSES) {
      expect(transitionStep({ from, action: "admin_override", needsApproval: true })).toBe("approved");
    }
  });

  it("canTransition rethrows errors that are not transition errors", () => {
    const broken = { from: "todo", action: "submit", get needsApproval(): boolean { throw new TypeError("boom"); } };
    expect(() => canTransition(broken as never)).toThrow(TypeError);
  });
});
