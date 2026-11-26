/**
 * File: packages/shared/test/coaching-targets.test.ts
 * Purpose: Unit tests for the fixed coaching targets: each metric's unit, the percent conversion both ways and the
 * range check on typed values.
 *
 * Functions:
 * - none
 */
import { describe, expect, it } from "vitest";
import { COACHING_METRICS, targetFromInput, targetRangeError, targetToInput, targetUnit } from "../src";

describe("coaching targets", () => {
  it("gives every metric a unit", () => {
    for (const m of COACHING_METRICS) expect(targetUnit(m)).toBeTruthy();
    expect(targetUnit("responsiveness")).toBe("minutes");
    expect(targetUnit("promises_kept")).toBe("percent");
    expect(targetUnit("closed_value")).toBe("dollars");
  });

  it("types shares as percentages and stores them as 0-1", () => {
    expect(targetToInput("on_time_touches", 0.8)).toBe(80);
    expect(targetFromInput("on_time_touches", 80)).toBe(0.8);
    expect(targetFromInput("showing_conversion", 27.5)).toBe(0.275);
    expect(targetToInput("call_quality", 65)).toBe(65);
    expect(targetFromInput("closed_value", 500000)).toBe(500000);
  });

  it("checks the range and whole numbers", () => {
    expect(targetRangeError("promises_kept", 80)).toBeNull();
    expect(targetRangeError("promises_kept", 0)).toBe("Enter a percentage from 1 to 100.");
    expect(targetRangeError("promises_kept", 101)).not.toBeNull();
    expect(targetRangeError("closes", 1.5)).toBe("Enter a whole number from 1 to 1,000.");
    expect(targetRangeError("responsiveness", 60)).toBeNull();
    expect(targetRangeError("closed_value", Number.NaN)).not.toBeNull();
  });
});
