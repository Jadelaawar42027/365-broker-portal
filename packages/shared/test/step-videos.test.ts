/**
 * File: packages/shared/test/step-videos.test.ts
 * Purpose: Unit tests for the required-video rules (SPEC D32, D34): step videos are uploaded MP4s only, a slot counts
 * as having a video only when an MP4 is in it, and a step counts as watched only when it has a video and every video
 * in it is watched.
 *
 * Functions:
 * - none
 */
import { describe, expect, it } from "vitest";
import { areStepVideosWatched, hasVideoContent } from "../src/step-videos";

describe("areStepVideosWatched", () => {
  it("needs at least one video, and every video watched", () => {
    expect(areStepVideosWatched([])).toBe(false);
    expect(areStepVideosWatched([{ source: null, watched: false }])).toBe(false);
    expect(areStepVideosWatched([{ source: "upload", watched: false }])).toBe(false);
    expect(areStepVideosWatched([{ source: "upload", watched: true }, { source: "upload", watched: false }])).toBe(false);
    expect(areStepVideosWatched([{ source: "upload", watched: true }, { source: "upload", watched: true }])).toBe(true);
  });

  it("ignores empty slots, so a watched video next to an empty slot is enough", () => {
    expect(areStepVideosWatched([{ source: "upload", watched: true }, { source: null, watched: false }])).toBe(true);
  });

  it("treats an empty slot as no video", () => {
    expect(hasVideoContent({ source: null })).toBe(false);
    expect(hasVideoContent({ source: "upload" })).toBe(true);
  });
});
