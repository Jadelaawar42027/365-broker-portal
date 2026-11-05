/**
 * File: packages/shared/src/step-videos.ts
 * Purpose: The rules for steps that must have their video watched before they can be finished (config.requireVideo,
 * the CRM training step, SPEC D32). Pure functions, used by the API to refuse the submission and by the web app to
 * keep the confirm box locked and to follow how far a YouTube or Vimeo embed has been watched (their players report
 * the current time through window messages; Loom's doesn't, so a Loom video keeps an "I've watched this video" button).
 *
 * Functions:
 * - hasVideoContent(video): true when the slot has a video in it (an embed link or an uploaded file), not just a title.
 * - areStepVideosWatched(videos): true when the step has at least one video and the broker has watched every one.
 * - canTrackEmbed(provider): true for embed providers whose player reports watch time (YouTube, Vimeo).
 * - trackingEmbedUrl(embedUrl, provider, origin): the embed address with the player's messaging switched on.
 * - readPlayerTime(provider, data): the { currentTime, duration } a YouTube or Vimeo player message carries, or null.
 * - isPlayerReady(provider, data): true for the message a Vimeo player sends when it is ready to be told what to report.
 * - parseMessage(data): a player message as an object, whether it arrived as an object or a JSON string; null otherwise.
 */
type WatchableVideo = { source: "upload" | "embed" | null; watched: boolean };
type EmbedProvider = "youtube" | "loom" | "vimeo" | "upload" | null;

export const TRACKABLE_EMBED_PROVIDERS = ["youtube", "vimeo"] as const;
export const PLAYER_ORIGINS = ["https://www.youtube-nocookie.com", "https://www.youtube.com", "https://player.vimeo.com"] as const;

export function hasVideoContent(video: Pick<WatchableVideo, "source">): boolean {
  return video.source !== null;
}

export function areStepVideosWatched(videos: WatchableVideo[]): boolean {
  const withContent = videos.filter(hasVideoContent);
  return withContent.length > 0 && withContent.every((video) => video.watched);
}

export function canTrackEmbed(provider: EmbedProvider): boolean {
  return provider === "youtube" || provider === "vimeo";
}

export function trackingEmbedUrl(embedUrl: string, provider: EmbedProvider, origin: string): string {
  const url = new URL(embedUrl);
  if (provider === "youtube") {
    url.searchParams.set("enablejsapi", "1");
    url.searchParams.set("origin", origin);
  }
  return url.toString();
}

function parseMessage(data: unknown): Record<string, unknown> | null {
  if (typeof data === "object" && data !== null) return data as Record<string, unknown>;
  if (typeof data !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(data);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function readPlayerTime(provider: EmbedProvider, data: unknown): { currentTime: number; duration: number | null } | null {
  const message = parseMessage(data);
  if (!message) return null;
  const payload = (provider === "youtube" ? message.info : provider === "vimeo" && message.event === "timeupdate" ? message.data : null) as
    | Record<string, unknown>
    | null
    | undefined;
  if (!payload) return null;
  const currentTime = provider === "youtube" ? payload.currentTime : payload.seconds;
  if (typeof currentTime !== "number" || !Number.isFinite(currentTime)) return null;
  const duration = typeof payload.duration === "number" && payload.duration > 0 ? payload.duration : null;
  return { currentTime, duration };
}

export function isPlayerReady(provider: EmbedProvider, data: unknown): boolean {
  return provider === "vimeo" && parseMessage(data)?.event === "ready";
}
