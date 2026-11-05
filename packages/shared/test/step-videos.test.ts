/**
 * File: packages/shared/test/step-videos.test.ts
 * Purpose: Unit tests for the required-video rules (SPEC D32): a step counts as watched only when it has a video and
 * every video is watched; only YouTube and Vimeo embeds can be tracked; the YouTube embed address gets its messaging
 * switched on; and the current time is read from YouTube and Vimeo player messages, whatever shape they arrive in.
 *
 * Functions:
 * - none
 */
import { describe, expect, it } from "vitest";
import { areStepVideosWatched, canTrackEmbed, hasVideoContent, isPlayerReady, readPlayerTime, trackingEmbedUrl } from "../src/step-videos";

describe("areStepVideosWatched", () => {
  it("needs at least one video, and every video watched", () => {
    expect(areStepVideosWatched([])).toBe(false);
    expect(areStepVideosWatched([{ source: null, watched: false }])).toBe(false);
    expect(areStepVideosWatched([{ source: "embed", watched: false }])).toBe(false);
    expect(areStepVideosWatched([{ source: "embed", watched: true }, { source: "upload", watched: false }])).toBe(false);
    expect(areStepVideosWatched([{ source: "embed", watched: true }, { source: null, watched: false }])).toBe(true);
  });

  it("treats an empty slot as no video", () => {
    expect(hasVideoContent({ source: null })).toBe(false);
    expect(hasVideoContent({ source: "upload" })).toBe(true);
  });
});

describe("embed tracking", () => {
  it("tracks YouTube and Vimeo, not Loom", () => {
    expect(canTrackEmbed("youtube")).toBe(true);
    expect(canTrackEmbed("vimeo")).toBe(true);
    expect(canTrackEmbed("loom")).toBe(false);
    expect(canTrackEmbed(null)).toBe(false);
  });

  it("switches on the YouTube player's messages and leaves Vimeo as it is", () => {
    const youtube = new URL(trackingEmbedUrl("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "youtube", "https://team.365yachts.org"));
    expect(youtube.searchParams.get("enablejsapi")).toBe("1");
    expect(youtube.searchParams.get("origin")).toBe("https://team.365yachts.org");
    expect(trackingEmbedUrl("https://player.vimeo.com/video/123456789", "vimeo", "https://team.365yachts.org")).toBe("https://player.vimeo.com/video/123456789");
  });

  it("reads the time from a YouTube message sent as JSON text", () => {
    const message = JSON.stringify({ event: "infoDelivery", info: { currentTime: 42.5, duration: 300 } });
    expect(readPlayerTime("youtube", message)).toEqual({ currentTime: 42.5, duration: 300 });
    expect(readPlayerTime("youtube", JSON.stringify({ event: "infoDelivery", info: { playerState: 1 } }))).toBeNull();
    expect(readPlayerTime("youtube", "not json")).toBeNull();
  });

  it("reads the time from a Vimeo timeupdate message and spots the ready message", () => {
    expect(readPlayerTime("vimeo", { event: "timeupdate", data: { seconds: 12, percent: 0.1, duration: 120 } })).toEqual({ currentTime: 12, duration: 120 });
    expect(readPlayerTime("vimeo", { event: "play", data: { seconds: 12 } })).toBeNull();
    expect(isPlayerReady("vimeo", JSON.stringify({ event: "ready" }))).toBe(true);
    expect(isPlayerReady("youtube", { event: "ready" })).toBe(false);
  });
});
