/**
 * File: packages/shared/src/step-videos.ts
 * Purpose: The rule for steps that must have their video watched before they can be finished (config.requireVideo,
 * the CRM training step, SPEC D32). Pure functions, used by the API to refuse the submission and by the web app to
 * keep the confirm box locked.
 *
 * Functions:
 * - hasVideoContent(video): true when the slot has a video in it (an embed link or an uploaded file), not just a title.
 * - areStepVideosWatched(videos): true when the step has at least one video and the broker has watched every one.
 */
type WatchableVideo = { source: "upload" | "embed" | null; watched: boolean };

export function hasVideoContent(video: Pick<WatchableVideo, "source">): boolean {
  return video.source !== null;
}

export function areStepVideosWatched(videos: WatchableVideo[]): boolean {
  const withContent = videos.filter(hasVideoContent);
  return withContent.length > 0 && withContent.every((video) => video.watched);
}
