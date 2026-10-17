/**
 * File: packages/shared/test/metrics.test.ts
 * Purpose: Tests for the metrics date maths, using the examples shown on mockups 3a-3c.
 *
 * Functions:
 * - none
 */
import { describe, expect, it } from "vitest";
import {
  addDays,
  averageDaysToOnboard,
  daysBetween,
  daysToOnboard,
  formatTenure,
  parseIsoDate,
  stuckDays,
  tenureDays,
  todayInTimeZone,
} from "../src/metrics";

describe("parseIsoDate", () => {
  it("parses ISO dates at UTC midnight", () => {
    expect(parseIsoDate("2026-10-17").toISOString()).toBe("2026-10-17T00:00:00.000Z");
  });

  it("rejects other formats and impossible dates", () => {
    expect(() => parseIsoDate("10/17/2026")).toThrow(/Expected a date/);
    expect(() => parseIsoDate("2026-02-30")).toThrow(/not a real calendar date/);
  });
});

describe("todayInTimeZone", () => {
  it("uses Florida time by default", () => {
    expect(todayInTimeZone(new Date("2026-10-18T02:30:00Z"))).toBe("2026-10-17");
    expect(todayInTimeZone(new Date("2026-10-18T02:30:00Z"), "UTC")).toBe("2026-10-18");
  });
});

describe("day counts", () => {
  it("counts days across months and DST changes", () => {
    expect(daysBetween("2026-08-18", "2026-08-27")).toBe(9);
    expect(daysBetween("2026-10-30", "2026-11-03")).toBe(4);
    expect(daysBetween("2026-10-17", "2026-10-13")).toBe(-4);
  });

  it("adds and subtracts days across month and year ends", () => {
    expect(addDays("2026-10-17", -4)).toBe("2026-10-13");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("days to onboard is null until onboarded", () => {
    expect(daysToOnboard("2026-08-18", "2026-08-27")).toBe(9);
    expect(daysToOnboard("2026-10-13", null)).toBeNull();
  });

  it("tenure stops at the leaving date", () => {
    expect(tenureDays("2026-10-13", null, "2026-10-17")).toBe(4);
    expect(tenureDays("2026-01-09", "2026-06-15", "2026-10-17")).toBe(157);
  });
});

describe("formatTenure (3b 'Time with us')", () => {
  it.each([
    ["2026-10-13", "2026-10-17", false, "4 days"],
    ["2026-10-16", "2026-10-17", false, "1 day"],
    ["2026-08-18", "2026-10-17", false, "1 month"],
    ["2026-08-17", "2026-10-17", false, "2 months"],
    ["2026-07-02", "2026-10-17", false, "3 months"],
    ["2025-03-03", "2026-10-17", false, "1 yr 7 mo"],
    ["2024-11-14", "2026-10-17", false, "1 yr 11 mo"],
    ["2025-10-17", "2026-10-17", false, "1 yr"],
    ["2026-01-09", "2026-06-15", true, "5 months (left)"],
    ["2026-10-17", "2026-10-17", false, "0 days"],
  ])("%s to %s (left: %s) -> %s", (joined, end, left, expected) => {
    expect(formatTenure(joined, end, left)).toBe(expected);
  });
});

describe("averageDaysToOnboard", () => {
  it("averages the most recently onboarded brokers and rounds", () => {
    const rows = [
      { onboardedAt: "2026-08-27", daysToOnboard: 9 },
      { onboardedAt: "2026-07-10", daysToOnboard: 8 },
      { onboardedAt: null, daysToOnboard: null },
      { onboardedAt: "2025-03-11", daysToOnboard: 30 },
    ];
    expect(averageDaysToOnboard(rows, 2)).toBe(9);
    expect(averageDaysToOnboard(rows)).toBe(16);
  });

  it("returns null when nobody has onboarded", () => {
    expect(averageDaysToOnboard([{ onboardedAt: null, daysToOnboard: null }])).toBeNull();
  });
});

describe("stuckDays", () => {
  const now = new Date("2026-10-17T12:00:00Z");

  it("flags onboarding brokers idle for 4+ days", () => {
    expect(stuckDays({ status: "onboarding", lastActivityAt: new Date("2026-10-13T11:00:00Z"), joinedAt: "2026-10-05", now })).toBe(4);
    expect(stuckDays({ status: "onboarding", lastActivityAt: new Date("2026-10-14T13:00:00Z"), joinedAt: "2026-10-05", now })).toBeNull();
  });

  it("falls back to the joining date when there is no activity yet", () => {
    expect(stuckDays({ status: "onboarding", lastActivityAt: null, joinedAt: "2026-10-05", now })).toBe(12);
  });

  it("never flags brokers who are not onboarding", () => {
    expect(stuckDays({ status: "active", lastActivityAt: null, joinedAt: "2026-01-01", now })).toBeNull();
    expect(stuckDays({ status: "invited", lastActivityAt: null, joinedAt: "2026-01-01", now })).toBeNull();
  });
});
