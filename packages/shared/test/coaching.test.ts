/**
 * File: packages/shared/test/coaching.test.ts
 * Purpose: Unit tests for the Coaching helpers: value and target formatting, score bands, the order brokers are
 * listed in, the "needs a 1:1" rule (every metric below target, full scores only) and the 1:1 topic (always one of the
 * listed metrics).
 *
 * Functions:
 * - none
 */
import { describe, expect, it } from "vitest";
import {
  compareCoachingRows,
  excuseDecisionBodySchema,
  formatAgainstTarget,
  offTargetMetrics,
  oneOnOneTopic,
  scoreGroup,
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
    expect(formatCoachingValue("showing_conversion", null)).toBe("—");
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
    expect(scoreBand(null, true)).toEqual({ label: "No score", tone: "neutral" });
    expect(scoreBand(null, false)).toEqual({ label: "No score", tone: "neutral" });
  });
});

describe("order brokers are listed in", () => {
  const rows = [
    { name: "Peter", score: 43.3, provisional: true },
    { name: "Mark", score: null, provisional: true },
    { name: "James", score: 52, provisional: false },
    { name: "Alex", score: null, provisional: true },
    { name: "Ben", score: 43.9, provisional: false },
    { name: "Gus", score: 60, provisional: true },
    { name: "Charlie", score: 71.7, provisional: false },
    { name: "Ann", score: 52, provisional: false },
  ];
  it("full scores highest first, then provisional highest first, then no score A-Z", () => {
    expect([...rows].sort(compareCoachingRows).map((r) => r.name)).toEqual(["Charlie", "Ann", "James", "Ben", "Gus", "Peter", "Alex", "Mark"]);
    expect(rows.map(scoreGroup)).toEqual(["provisional", "none", "full", "none", "full", "provisional", "full", "full"]);
  });
});

describe("offTargetMetrics", () => {
  it("lists every metric below target, red or amber, largest weighted point gap first", () => {
    const metrics = {
      on_time_touches: { status: "amber" as const, value: 0.541, target: 0.571, points: 54.1, weight: 10 },
      showing_conversion: { status: "green" as const, value: 0.3, target: 0.275, points: 30, weight: 6 },
      next_step_coverage: { status: "red" as const, value: 0.556, target: 0.8, points: 55.6, weight: 8 },
      hot_pipeline: { status: "amber" as const, value: 6, target: 8, points: 75, weight: 10 },
    };
    expect(offTargetMetrics(metrics)).toEqual(["on_time_touches", "next_step_coverage", "hot_pipeline"]);
  });
});

describe("formatAgainstTarget", () => {
  it("shows the target, with one decimal when rounding would hide the gap", () => {
    expect(formatAgainstTarget("on_time_touches", 0.541, 0.571)).toBe("54% (≥ 57%)");
    expect(formatAgainstTarget("speed_to_follow", 57.5, 58.2)).toBe("57.5 (≥ 58.2)");
    expect(formatAgainstTarget("call_quality", 54.7, 57.9)).toBe("55 (≥ 58)");
    expect(formatAgainstTarget("responsiveness", 75, 35)).toBe("75 min (≤ 35 min)");
    expect(formatAgainstTarget("closed_value", 185000, 1000000)).toBe("$185K (≥ $1M)");
    expect(formatAgainstTarget("pipeline_movement", 0.6, null)).toBe("60%");
  });
});

describe("needsOneOnOneReason", () => {
  const amber = { status: "amber" as const, value: 0.541, target: 0.571, points: 54.1, weight: 10 };
  it("lists every metric below target with its target; else a 10-point drop", () => {
    expect(needsOneOnOneReason({ score: 71.7, provisional: false, trend: 1, metrics: { on_time_touches: amber } })).toBe("Off target: on-time touches 54% (≥ 57%)");
    expect(
      needsOneOnOneReason({
        score: 62.5, provisional: false, trend: 0,
        metrics: {
          speed_to_follow: { status: "amber", value: 57.5, target: 58.2, points: 57.5, weight: 10 },
          call_quality: { status: "amber", value: 54.7, target: 57.9, points: 54.7, weight: 8 },
          responsiveness: { status: "green", value: 3, target: 35, points: 73.3, weight: 7 },
        },
      }),
    ).toBe("Off target: speed to follow 57.5 (≥ 58.2), call quality 55 (≥ 58)");
    expect(needsOneOnOneReason({ score: 60, provisional: false, trend: -12, metrics: {} })).toBe("Score down 12 points on the 4-week average");
    expect(needsOneOnOneReason({ score: 60, provisional: false, trend: 2, metrics: { showing_conversion: { status: "green", value: 0.8 } } })).toBeNull();
  });

  it("never applies to a provisional broker or one with no score", () => {
    expect(needsOneOnOneReason({ score: 43.3, provisional: true, trend: -20, metrics: { on_time_touches: amber } })).toBeNull();
    expect(needsOneOnOneReason({ score: null, provisional: true, trend: null, metrics: { on_time_touches: amber } })).toBeNull();
  });
});

describe("oneOnOneTopic", () => {
  const focus = [
    { metric: "on_time_touches" as const, action: "Work the due list every morning" },
    { metric: "showing_conversion" as const, action: "Propose a showing on every first call" },
  ];
  it("is the first off-target metric, with its playbook action when it is a focus area", () => {
    const metrics = {
      on_time_touches: { status: "amber" as const, value: 0.541, target: 0.571, points: 54.1, weight: 10 },
      showing_conversion: { status: "green" as const, value: 0.3, target: 0.275, points: 30, weight: 6 },
    };
    expect(oneOnOneTopic(metrics, focus)).toBe("On-time touches: Work the due list every morning");
  });
  it("never picks a metric that is not in the off-target list", () => {
    const metrics = {
      on_time_touches: { status: "green" as const, value: 0.9, target: 0.571, points: 90, weight: 10 },
      call_quality: { status: "amber" as const, value: 54.7, target: 57.9, points: 54.7, weight: 8 },
    };
    expect(oneOnOneTopic(metrics, focus)).toBe("Call quality");
  });
  it("falls back to the first focus area when nothing is below target", () => {
    expect(oneOnOneTopic({}, focus)).toBe("On-time touches: Work the due list every morning");
    expect(oneOnOneTopic({}, [])).toBeNull();
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
