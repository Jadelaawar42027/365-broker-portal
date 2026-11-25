/**
 * File: packages/shared/test/coaching.test.ts
 * Purpose: Unit tests for the Coaching helpers: value and target formatting, score bands, the "needs a 1:1" rule and
 * the suggested 1:1 topic.
 *
 * Functions:
 * - none
 */
import { describe, expect, it } from "vitest";
import {
  excuseDecisionBodySchema,
  formatCoachingTarget,
  formatCoachingValue,
  needsOneOnOneReason,
  formatWorkMinutes,
  pulseBodySchema,
  scoreBand,
  suggestedTopic,
  windowLabel,
} from "../src/api-coaching";

describe("coaching formatting", () => {
  it("formats minutes, shares and call scores", () => {
    expect(formatCoachingValue("responsiveness", 47)).toBe("47 min");
    expect(formatCoachingValue("speed_to_follow", 61.6)).toBe("62");
    expect(formatCoachingValue("responsiveness", 150)).toBe("2.5 h");
    expect(formatCoachingValue("on_time_touches", 0.817)).toBe("82%");
    expect(formatCoachingValue("call_quality", 61.4)).toBe("61");
    expect(formatCoachingValue("attendance", null)).toBe("—");
  });

  it("labels metrics measured over more than 28 days, and formats working minutes", () => {
    expect(windowLabel(90)).toBe("90-day data");
    expect(windowLabel(28)).toBeNull();
    expect(windowLabel(null)).toBeNull();
    expect(formatWorkMinutes(40)).toBe("40 min");
    expect(formatWorkMinutes(150)).toBe("2.5 h");
    expect(formatWorkMinutes(null)).toBe("—");
  });

  it("formats targets in the direction that is better", () => {
    expect(formatCoachingTarget("responsiveness", 30)).toBe("≤ 30 min");
    expect(formatCoachingTarget("speed_to_follow", 60)).toBe("≥ 60");
    expect(formatCoachingTarget("promises_kept", 0.85)).toBe("≥ 85%");
    expect(formatCoachingTarget("promises_kept", null)).toBe("—");
  });
});

describe("scoreBand", () => {
  it("labels scores, and never ranks a provisional one", () => {
    expect(scoreBand(91, false)).toEqual({ label: "On track", tone: "success" });
    expect(scoreBand(70, false)).toEqual({ label: "Needs attention", tone: "warning" });
    expect(scoreBand(52, false)).toEqual({ label: "At risk", tone: "danger" });
    expect(scoreBand(95, true)).toEqual({ label: "Provisional", tone: "neutral" });
  });
});

describe("needsOneOnOneReason", () => {
  it("flags red metrics first, then a 10-point drop, then thin data", () => {
    expect(
      needsOneOnOneReason({ provisional: false, coverage: 1, trend: -12, metrics: { on_time_touches: { status: "red", value: 0.52 } } }),
    ).toBe("Off target: on-time touches 52%");
    expect(needsOneOnOneReason({ provisional: false, coverage: 1, trend: -12, metrics: {} })).toBe("Score down 12 points on the 4-week average");
    expect(needsOneOnOneReason({ provisional: true, coverage: 0.45, trend: null, metrics: {} })).toBe("Only 45% of the score has enough data");
    expect(needsOneOnOneReason({ provisional: false, coverage: 1, trend: 2, metrics: { attendance: { status: "amber", value: 0.8 } } })).toBeNull();
  });
});

describe("suggestedTopic", () => {
  it("uses the first focus area and its playbook action", () => {
    expect(suggestedTopic([{ metric: "responsiveness", action: "Turn on mobile app notifications" }])).toBe("Reply time: Turn on mobile app notifications");
    expect(suggestedTopic([])).toBeNull();
  });
});

describe("request bodies", () => {
  it("validates excuse decisions and the pulse", () => {
    expect(excuseDecisionBodySchema.safeParse({ momentKey: "L:idle:x", decision: "maybe" }).success).toBe(false);
    expect(pulseBodySchema.safeParse({ weekStart: "2026-11-16", engagement: 6, attitude: 3, supportNeeded: "" }).success).toBe(false);
    expect(pulseBodySchema.parse({ weekStart: "2026-11-16", engagement: 4, attitude: 3, supportNeeded: "  More leads  " }).supportNeeded).toBe("More leads");
  });
});
