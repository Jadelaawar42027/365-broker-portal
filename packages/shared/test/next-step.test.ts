/**
 * File: packages/shared/test/next-step.test.ts
 * Purpose: Tests for the next-step rule (SPEC D1), the sent-back list, progress counts and completion.
 *
 * Functions:
 * - rows(statuses): turns a list of statuses into step rows numbered from 1.
 */
import { describe, expect, it } from "vitest";
import type { StepStatus } from "../src/constants";
import { countProgress, findNextStep, findSentBackSteps, isOnboardingComplete } from "../src/next-step";

function rows(statuses: StepStatus[]) {
  return statuses.map((status, index) => ({ position: index + 1, status }));
}

describe("findNextStep", () => {
  it("picks the lowest todo step even when an earlier step was sent back (mockup 1b)", () => {
    const steps = rows(["approved", "approved", "submitted", "changes_requested", "todo", "approved", "todo"]);
    expect(findNextStep(steps)?.position).toBe(5);
  });

  it("falls back to the lowest sent-back step when no todo step is left", () => {
    const steps = rows(["approved", "changes_requested", "submitted", "changes_requested"]);
    expect(findNextStep(steps)?.position).toBe(2);
  });

  it("ignores input order", () => {
    const steps = [
      { position: 3, status: "todo" as const },
      { position: 1, status: "approved" as const },
      { position: 2, status: "todo" as const },
    ];
    expect(findNextStep(steps)?.position).toBe(2);
  });

  it("returns null when everything is sent or approved", () => {
    expect(findNextStep(rows(["approved", "submitted"]))).toBeNull();
  });
});

describe("findSentBackSteps", () => {
  it("lists sent-back steps in order", () => {
    const steps = rows(["changes_requested", "todo", "changes_requested"]).reverse();
    expect(findSentBackSteps(steps).map((s) => s.position)).toEqual([1, 3]);
  });
});

describe("countProgress", () => {
  it("counts sent-back steps as sent, like the 1b header (5 sent, 3 approved)", () => {
    const steps = rows([
      "approved", "approved", "submitted", "changes_requested", "todo", "approved",
      "todo", "todo", "todo", "todo", "todo",
    ]);
    expect(countProgress(steps)).toEqual({ total: 11, approved: 3, sent: 5 });
  });
});

describe("isOnboardingComplete", () => {
  it("is true only when every step is approved", () => {
    expect(isOnboardingComplete(rows(["approved", "approved"]))).toBe(true);
    expect(isOnboardingComplete(rows(["approved", "submitted"]))).toBe(false);
    expect(isOnboardingComplete([])).toBe(false);
  });
});
