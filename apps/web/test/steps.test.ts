/**
 * File: apps/web/test/steps.test.ts
 * Purpose: Unit test for numbering the onboarding stages on the checklist (SPEC D30): "Start here" is stage 0 and
 * Paperwork stays stage 1.
 *
 * Functions:
 * - none
 */
import { describe, expect, it } from "vitest";
import { groupByStage } from "../src/lib/steps";

describe("groupByStage", () => {
  it("numbers stages from 0, Start here first", () => {
    const groups = groupByStage([
      { key: "start_here", stage: "start_here", stageTitle: "Start here" },
      { key: "photo_id", stage: "paperwork", stageTitle: "Paperwork" },
      { key: "bio", stage: "paperwork", stageTitle: "Paperwork" },
      { key: "dbpr_filing", stage: "florida_license", stageTitle: "Your Florida license" },
    ]);
    expect(groups.map((group) => [group.stageTitle, group.number, group.steps.length])).toEqual([
      ["Start here", 0, 1],
      ["Paperwork", 1, 2],
      ["Your Florida license", 2, 1],
    ]);
  });
});
