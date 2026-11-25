/**
 * File: apps/api/test/coaching-view.test.ts
 * Purpose: Unit tests for the Coaching view builders: worst score first, team totals, who needs a 1:1, GHL evidence
 * links, the 8-week metric history and the 1:1 history with Shelly's pulse.
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
    callsReviewed: 7,
    excusesToConfirm: 2,
  });

  it("lists portal brokers only, worst score first, with all eight metric cells", () => {
    expect(overview.brokers.map((b) => b.name)).toEqual(["Ben", "Ana"]);
    expect(Object.keys(overview.brokers[0]!.metrics)).toHaveLength(8);
    expect(overview.brokers[0]!.metrics.call_quality).toEqual({ value: null, target: null, status: "unknown", sample: 0 });
  });

  it("flags who needs a 1:1 with the reason and topic", () => {
    expect(overview.needsOneOnOne).toEqual([
      { brokerId: B, name: "Ben", score: 72, provisional: false, trend: -3, reason: "Off target: on-time touches 60%", topic: "On-time touches: Go through the pipeline together" },
    ]);
  });

  it("totals the team", () => {
    expect(overview.totals).toMatchObject({ teamScore: 80, medianSpeedMinutes: 40, callsReviewed: 7, excusesToConfirm: 2 });
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

  it("builds the 1:1 history with Shelly's pulse per week", () => {
    expect(page.history.map((h) => [h.isoWeek, h.pulse?.supportNeeded ?? null])).toEqual([["2026-W47", null], ["2026-W46", "More listings"]]);
    expect(page.topic).toBe("On-time touches: Go through the pipeline together");
  });

  it("reads week numbers from ISO week labels", () => {
    expect(toWeek({ weekStart: "2026-12-28", isoWeek: "2026-W53" }).weekNumber).toBe(53);
  });
});
