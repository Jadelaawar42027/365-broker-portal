/**
 * File: apps/web/test/video-upload.test.ts
 * Purpose: Unit tests for how a video is cut into upload parts.
 *
 * Functions:
 * - none
 */
import { describe, expect, it } from "vitest";
import { partRanges } from "../src/lib/video-upload";

const MB = 1024 * 1024;

describe("partRanges", () => {
  it("cuts a file into full parts plus a shorter last part", () => {
    expect(partRanges(40 * MB, 16 * MB)).toEqual([
      { partNumber: 1, start: 0, end: 16 * MB },
      { partNumber: 2, start: 16 * MB, end: 32 * MB },
      { partNumber: 3, start: 32 * MB, end: 40 * MB },
    ]);
  });

  it("uses one part for a small file and exact parts when the size divides evenly", () => {
    expect(partRanges(5, 16 * MB)).toEqual([{ partNumber: 1, start: 0, end: 5 }]);
    expect(partRanges(32 * MB, 16 * MB).map((part) => part.end - part.start)).toEqual([16 * MB, 16 * MB]);
  });

  it("covers 1 GB in 64 parts of 16 MB", () => {
    const parts = partRanges(1024 * MB, 16 * MB);
    expect(parts).toHaveLength(64);
    expect(parts.at(-1)!.end).toBe(1024 * MB);
  });
});
