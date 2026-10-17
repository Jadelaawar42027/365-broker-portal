/**
 * File: packages/shared/test/status-labels.test.ts
 * Purpose: Tests for the status pill wording (SPEC D3).
 *
 * Functions:
 * - none
 */
import { describe, expect, it } from "vitest";
import { stepStatusLabel } from "../src/status-labels";

const base = { stepKey: "w9", needsApproval: true, isNext: false };

describe("stepStatusLabel", () => {
  it("says Approved, Signed or Done for approved steps", () => {
    expect(stepStatusLabel({ ...base, status: "approved" })).toEqual({ label: "Approved", tone: "success" });
    expect(stepStatusLabel({ ...base, status: "approved", stepKey: "contract_nda" }).label).toBe("Signed");
    expect(stepStatusLabel({ ...base, status: "approved", needsApproval: false }).label).toBe("Done");
  });

  it("labels waiting, sent back, next and later steps", () => {
    expect(stepStatusLabel({ ...base, status: "submitted" })).toEqual({ label: "Waiting for approval", tone: "warning" });
    expect(stepStatusLabel({ ...base, status: "changes_requested" })).toEqual({ label: "Needs a fix", tone: "danger" });
    expect(stepStatusLabel({ ...base, status: "todo", isNext: true })).toEqual({ label: "Do this next", tone: "info" });
    expect(stepStatusLabel({ ...base, status: "todo" })).toEqual({ label: "Coming up", tone: "neutral" });
  });
});
