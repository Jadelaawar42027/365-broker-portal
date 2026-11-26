/**
 * File: apps/api/test/coaching-view.test.ts
 * Purpose: Unit tests for the Coaching view builders: full scores highest first, then provisional, then no score A-Z;
 * who needs a 1:1 (full scores only, highest first, every metric below target, the topic one of them); team totals (calls reviewed summed from the
 * snapshots), who needs a 1:1, all thirteen metric cells with each metric's own points (v4 snapshots), the 90-day window flag, GHL evidence links, the 8-week metric history with speed to
 * follow's detail, and the 1:1 history with Shelly's pulse.
 *
 * Functions:
 * - none
 */
import { describe, expect, it } from "vitest";
import { buildBrokerPage, buildOverview, ghlContactUrl, toWeek } from "../src/services/coaching/view";
import { snapshot } from "./helpers/coach-fake";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const brokers = new Map([
  [A, { brokerId: A, name: "Ana", level: "senior", status: "active" }],
  [B, { brokerId: B, name: "Ben", level: "junior", status: "active" }],
]);
const week = { weekStart: "2026-11-16", isoWeek: "2026-W47" };

describe("buildOverview", () => {
  const overview = buildOverview({
    weeks: [week],
    week,
    snapshots: [
      snapshot(A, week.weekStart, { score: 88, metrics: { on_time_touches: { value: 0.9, target: 0.8, status: "green", sample: 10 } }, focusAreas: [] , trend: { score: 2 } }),
      snapshot(B, week.weekStart),
      snapshot("ffffffff-0000-4000-8000-000000000000", week.weekStart),
    ],
    brokers,
    excusesToConfirm: 2,
  });

  it("lists portal brokers only, highest score first, with all thirteen metric cells", () => {
    expect(overview.brokers.map((b) => b.name)).toEqual(["Ana", "Ben"]);
    expect(Object.keys(overview.brokers[0]!.metrics)).toHaveLength(13);
    expect(overview.brokers[1]!.metrics.call_quality).toEqual({ value: null, points: null, weight: null, target: null, targetPlaceholder: false, status: "unknown", sample: 0, windowDays: null });
    expect(overview.brokers[1]!.metrics.speed_to_follow).toEqual({ value: 55, points: null, weight: null, target: 60, targetPlaceholder: false, status: "amber", sample: 4, windowDays: 90 });
  });

  it("passes each metric's own points through from v4 snapshots", () => {
    const v4 = buildOverview({
      weeks: [week],
      week,
      snapshots: [snapshot(A, week.weekStart, { metrics: { showing_conversion: { value: 0.56, points: 56, target: 0.46, status: "green", sample: 9 } } })],
      brokers,
      excusesToConfirm: 0,
    });
    expect(v4.brokers[0]!.metrics.showing_conversion).toMatchObject({ value: 0.56, points: 56, status: "green" });
  });

  it("flags who needs a 1:1 with the reason and topic", () => {
    expect(overview.needsOneOnOne).toMatchObject([
      { brokerId: B, name: "Ben", score: 72, provisional: false, trend: -3, reason: "Off target: on-time touches 60% (≥ 80%), speed to follow 55 (≥ 60)" },
    ]);
    expect(overview.needsOneOnOne[0]!.details.slipping.map((l) => l.metric)).toEqual(["speed_to_follow", "on_time_touches"]);
  });

  describe("ordering and who needs a 1:1 (week 47 shapes)", () => {
    const ids = ["c", "j", "b", "p", "m", "a"].map((x) => `00000000-0000-4000-8000-0000000000${x}${x}`);
    const people = new Map(
      ["Charlie", "James", "Ben", "Peter", "Mark", "Alex"].map((name, i) => [ids[i]!, { brokerId: ids[i]!, name, level: "senior", status: "active" }]),
    );
    const cellAt = (status: "green" | "amber" | "red", value: number, target: number, points: number, weight: number) => ({ value, target, status, sample: 9, points, weight });
    const o = buildOverview({
      weeks: [week],
      week,
      snapshots: [
        snapshot(ids[4]!, week.weekStart, { score: null, provisional: true, coverage: 0, metrics: {}, focusAreas: [], trend: {} }),
        snapshot(ids[3]!, week.weekStart, { score: 43.3, provisional: true, coverage: 0.47, metrics: { next_step_coverage: cellAt("red", 0, 0.8, 0, 8) }, trend: { score: 13 } }),
        snapshot(ids[2]!, week.weekStart, { score: 43.9, metrics: { closes: cellAt("red", 0, 2, 0, 9), showings_completed: cellAt("red", 2, 6, 33.3, 12) }, focusAreas: [{ metric: "closes", action: "Review every deal" }], trend: {} }),
        snapshot(ids[1]!, week.weekStart, { score: 52, metrics: { closes: cellAt("red", 1, 2, 50, 9), closed_value: cellAt("red", 50000, 1000000, 5, 9), responsiveness: cellAt("red", 75, 35, 47.8, 7) }, focusAreas: [{ metric: "closed_value", action: "Fill every deal value" }], trend: {} }),
        snapshot(ids[0]!, week.weekStart, {
          score: 71.7,
          metrics: { on_time_touches: cellAt("amber", 0.541, 0.571, 54.1, 10), showing_conversion: cellAt("green", 0.3, 0.275, 30, 6) },
          focusAreas: [{ metric: "on_time_touches", action: "Work the due list every morning" }, { metric: "showing_conversion", action: "Propose a showing" }],
          trend: {},
        }),
        snapshot(ids[5]!, week.weekStart, { score: null, provisional: true, coverage: 0, metrics: {}, focusAreas: [], trend: {} }),
      ],
      brokers: people,
      excusesToConfirm: 0,
      playbook: {
        on_time_touches: { topic: "Consistent follow-ups", question: "Which leads slipped through?", agree: ["Task list every morning"] },
        responsiveness: { topic: "Same-day replies", question: "What stops you answering within the hour?", agree: ["Notifications on"] },
        closes: "Review every deal",
      },
      leadNames: new Map([["lead-x", "John Smith"]]),
      ghlLocationId: "loc1",
    });

    it("table: full scores highest first, then provisional, then no score A-Z", () => {
      expect(o.brokers.map((b) => [b.name, b.score, b.provisional])).toEqual([
        ["Charlie", 71.7, false], ["James", 52, false], ["Ben", 43.9, false], ["Peter", 43.3, true], ["Alex", null, true], ["Mark", null, true],
      ]);
    });

    it("needs a 1:1: full scores only, highest first; provisional and no-score brokers are left out", () => {
      expect(o.needsOneOnOne.map((r) => r.name)).toEqual(["Charlie", "James", "Ben"]);
    });

    it("every metric below target is listed and the topic is always one of them", () => {
      const charlie = o.needsOneOnOne[0]!;
      expect(charlie.reason).toBe("Off target: on-time touches 54% (≥ 57%)");
      expect(charlie.topic).toBe("Consistent follow-ups");
      expect(charlie.details.focus).toEqual({
        topic: "Consistent follow-ups", question: "Which leads slipped through?", agree: ["Task list every morning"], source: "behaviour", setBy: null, note: null, automaticTopic: null,
      });
      const james = o.needsOneOnOne[1]!;
      expect(james.topic).toBe("Same-day replies");
      expect(james.details.slipping.map((l) => l.metric)).toEqual(["responsiveness"]);
      expect(james.details.slipping[0]!.sentence).toBe("Replies to clients take 75 minutes (target: within 35 minutes)");
      expect(james.details.results).toContain("1 close worth $50K in the last 12 months");
    });

    it("the focus never comes from results: a broker slipping only on results gets the no-gaps message", () => {
      const ben = o.needsOneOnOne[2]!;
      expect(ben.details.slipping).toEqual([]);
      expect(ben.topic).toBeNull();
      expect(ben.details.focusMessage).toBe("No behaviour gaps this week. Review results and pipeline together");
    });
  });

  it("totals the team", () => {
    expect(overview.totals).toMatchObject({ teamScore: 80, medianFollowMinutes: 40, callsReviewed: 6, excusesToConfirm: 2 });
    expect(overview.week).toEqual({ weekStart: "2026-11-16", isoWeek: "2026-W47", weekNumber: 47 });
  });
});

describe("buildBrokerPage", () => {
  const history = [snapshot(B, "2026-11-16"), snapshot(B, "2026-11-09", { isoWeek: "2026-W46", metrics: { on_time_touches: { value: 0.5, target: 0.8, status: "red", sample: 8 } } })];
  const page = buildBrokerPage({
    weeks: [week],
    week,
    broker: brokers.get(B)!,
    history,
    excuses: [],
    pulse: null,
    pulses: [{ brokerId: B, weekStart: "2026-11-09", engagement: 4, attitude: 3, supportNeeded: "More listings", reviewerName: "Shelly", updatedAt: "2026-11-10T10:00:00.000Z" }],
    ghlLocationId: "loc123",
  });

  it("links evidence leads to GoHighLevel", () => {
    expect(page.focusAreas[0]!.evidence[0]!.ghlUrl).toBe("https://app.gohighlevel.com/v2/location/loc123/contacts/detail/lead1");
    expect(ghlContactUrl(undefined, "x")).toBeNull();
  });

  it("gives each metric its history oldest first", () => {
    expect(page.metrics.find((m) => m.metric === "on_time_touches")!.history).toEqual([0.5, 0.6]);
  });

  it("passes speed to follow's 90-day flag and first-call detail through", () => {
    expect(page.metrics.find((m) => m.metric === "speed_to_follow")).toMatchObject({
      windowDays: 90,
      detail: { median_work_minutes_to_next_touch: 40, first_calls_value: 50, first_calls_sample: 2 },
    });
    expect(page.metrics.find((m) => m.metric === "on_time_touches")).toMatchObject({ windowDays: null, detail: null });
  });

  it("shows no calls-reviewed total for snapshots made before the figure existed", () => {
    const old = buildOverview({ weeks: [week], week, snapshots: [snapshot(A, week.weekStart, { context: {} })], brokers, excusesToConfirm: 0 });
    expect(old.totals.callsReviewed).toBeNull();
  });

  it("builds the 1:1 history with Shelly's pulse per week", () => {
    expect(page.history.map((h) => [h.isoWeek, h.pulse?.supportNeeded ?? null])).toEqual([["2026-W47", null], ["2026-W46", "More listings"]]);
    expect(page.topic).toBe("Follow-up after calls");
    expect(page.topicSource).toEqual({ source: "behaviour", setBy: null, note: null, automaticTopic: null });
    expect(page.history.map((h) => h.topic)).toEqual(["Follow-up after calls", "Deadlines met on time"]);
  });

  it("reads week numbers from ISO week labels", () => {
    expect(toWeek({ weekStart: "2026-12-28", isoWeek: "2026-W53" }).weekNumber).toBe(53);
  });
});
