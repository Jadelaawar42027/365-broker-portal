/**
 * File: apps/web/test/format.test.ts
 * Purpose: Unit tests for the screen formatting helpers, all in Florida time.
 *
 * Functions:
 * - none
 */
import { describe, expect, it } from "vitest";
import { firstName, formatDate, formatLongDate, formatPhone, formatSentAt, formatShortDate, greeting, initials, ordinal, relativeTime } from "../src/lib/format";

const now = new Date("2026-10-17T14:42:00Z");

describe("names", () => {
  it("builds first names and initials", () => {
    expect(firstName("  Daniel Reyes ")).toBe("Daniel");
    expect(initials("Daniel Reyes")).toBe("DR");
    expect(initials("Andre Baptiste Jr")).toBe("AJ");
    expect(initials("cher")).toBe("C");
  });
});

describe("dates", () => {
  it("prints date-only values without shifting the day", () => {
    expect(formatDate("2026-08-18")).toBe("Aug 18, 2026");
    expect(formatShortDate("2026-01-01")).toBe("Jan 1");
  });

  it("prints the overview date and Florida-time greetings", () => {
    expect(formatLongDate(now)).toBe("Saturday, October 17");
    expect(greeting(new Date("2026-10-17T13:00:00Z"))).toBe("Good morning");
    expect(greeting(new Date("2026-10-17T19:00:00Z"))).toBe("Good afternoon");
    expect(greeting(new Date("2026-10-18T01:00:00Z"))).toBe("Good evening");
  });

  it("describes how long ago something happened", () => {
    expect(relativeTime("2026-10-17T14:41:40Z", now)).toBe("just now");
    expect(relativeTime("2026-10-17T14:41:00Z", now)).toBe("1 minute ago");
    expect(relativeTime("2026-10-17T12:30:00Z", now)).toBe("2 hours ago");
    expect(relativeTime("2026-10-16T20:00:00Z", now)).toBe("yesterday");
    expect(relativeTime("2026-10-14T15:00:00Z", now)).toBe("3 days ago");
    expect(relativeTime("2026-09-01T15:00:00Z", now)).toBe("Sep 1, 2026");
  });

  it("prints when a submission was sent", () => {
    expect(formatSentAt("2026-10-17T14:42:00Z", now)).toBe("Today, 10:42");
    expect(formatSentAt("2026-10-16T20:05:00Z", now)).toBe("Yesterday, 16:05");
    expect(formatSentAt("2026-10-13T14:00:00Z", now)).toBe("Oct 13, 10:00");
  });

  it("formats US phone numbers and leaves others alone", () => {
    expect(formatPhone("+15615550188")).toBe("(561) 555-0188");
    expect(formatPhone("561-445-9241")).toBe("(561) 445-9241");
    expect(formatPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
  });

  it("writes ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
  });
});
