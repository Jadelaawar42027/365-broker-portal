/**
 * File: packages/shared/src/step-videos.ts
 * Purpose: The rules for steps that must have their video watched before they can be finished (config.requireVideo,
 * the CRM training step, SPEC D32). Step videos are uploaded MP4s only (SPEC D34), and how far one has been watched comes
 * from the portal's own player. Pure functions, used by the API to refuse the submission and by the web app to keep the
 * confirm box locked.
 *
 * Functions:
 * - hasVideoContent(video): true when the slot has an uploaded video in it, not just a title.
 * - areStepVideosWatched(videos): true when the step has at least one video and the broker has watched every one.
 */
type WatchableVideo = { source: "upload" | null; watched: boolean };

export function hasVideoContent(video: Pick<WatchableVideo, "source">): boolean {
  return video.source === "upload";
}

export function areStepVideosWatched(videos: WatchableVideo[]): boolean {
  const withContent = videos.filter(hasVideoContent);
  return withContent.length > 0 && withContent.every((video) => video.watched);
}
