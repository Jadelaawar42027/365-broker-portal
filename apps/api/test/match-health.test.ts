/**
 * File: apps/api/test/match-health.test.ts
 * Purpose: Unit tests for the broker health adapter without a database: HEALTH_SOURCE none returns null for everyone,
 * coach without COACH_DATABASE_URL returns null, coach turns snapshot rows read over the coach_portal connection into
 * scores (clamping, the follow-up share times 100, and null when a score is missing), and a failing coach query never
 * throws. Mock mode reads broker emails, so it is covered by match.int.test.ts; the real coach-api schema is covered by
 * match-health-coach.int.test.ts.
 *
 * Functions:
 * - fakeDb(execute): a stand-in database whose execute() runs the given function; any other use fails the test.
 * - unused(): the main-database stand-in for tests that must not touch it; any query fails the test.
 */
import type { Database } from "@bp/db";
import { describe, expect, it, vi } from "vitest";
import { getBrokerHealth, toFollowUpScore, toScore } from "../src/services/match/health";

function fakeDb(execute: () => Promise<unknown>): Database {
  return { execute: vi.fn(execute), select: () => { throw new Error("select should not be used"); } } as unknown as Database;
}

const unused = fakeDb(async () => {
  throw new Error("the main database should not be queried");
});

describe("getBrokerHealth", () => {
  it("returns null for every broker with HEALTH_SOURCE none", async () => {
    const health = await getBrokerHealth({ db: unused, coachDb: null, healthSource: "none" }, ["a", "b"]);
    expect([...health.entries()]).toEqual([["a", null], ["b", null]]);
  });

  it("returns null for every broker in coach mode when COACH_DATABASE_URL isn't set", async () => {
    const health = await getBrokerHealth({ db: unused, coachDb: null, healthSource: "coach" }, ["a"]);
    expect(health.get("a")).toBeNull();
  });

  it("reads the coach snapshot over the coach connection, clamps scores and nulls incomplete rows", async () => {
    const coachDb = fakeDb(async () => [
      { broker_id: "a", score: "104.6", follow_up_share: "0.55" },
      { broker_id: "b", score: 70, follow_up_share: null },
      { broker_id: "zzz", score: 50, follow_up_share: 0.5 },
    ]);
    const health = await getBrokerHealth({ db: unused, coachDb, healthSource: "coach" }, ["a", "b", "c"]);
    expect(health.get("a")).toEqual({ score: 100, followUpScore: 55 });
    expect(health.get("b")).toBeNull();
    expect(health.get("c")).toBeNull();
    expect(health.has("zzz")).toBe(false);
    expect(coachDb.execute).toHaveBeenCalledTimes(1);
  });

  it("returns null for everyone and logs when the coach query fails", async () => {
    const warn = vi.fn();
    const coachDb = fakeDb(async () => {
      throw new Error('relation "coach.weekly_snapshot" does not exist');
    });
    const health = await getBrokerHealth({ db: unused, coachDb, healthSource: "coach", log: { warn } }, ["a"]);
    expect(health.get("a")).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("skips the query when no brokers are asked for", async () => {
    const coachDb = fakeDb(async () => []);
    expect((await getBrokerHealth({ db: unused, coachDb, healthSource: "coach" }, [])).size).toBe(0);
    expect(coachDb.execute).not.toHaveBeenCalled();
  });
});

describe("toScore", () => {
  it("turns database values into 0-100 scores or null", () => {
    expect(toScore("88.4")).toBe(88);
    expect(toScore(-3)).toBe(0);
    expect(toScore(null)).toBeNull();
    expect(toScore("")).toBeNull();
    expect(toScore("n/a")).toBeNull();
  });
});

describe("toFollowUpScore", () => {
  it("turns an on-time touches share into a 0-100 follow-up score or null", () => {
    expect(toFollowUpScore("0.734")).toBe(73);
    expect(toFollowUpScore(1.2)).toBe(100);
    expect(toFollowUpScore(0)).toBe(0);
    expect(toFollowUpScore(null)).toBeNull();
    expect(toFollowUpScore("")).toBeNull();
    expect(toFollowUpScore("n/a")).toBeNull();
  });
});
