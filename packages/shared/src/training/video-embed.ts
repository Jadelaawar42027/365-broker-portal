/**
 * File: packages/shared/src/training/video-embed.ts
 * Purpose: Validates lesson video links (phase G): only YouTube, Loom and Vimeo are accepted, and each link is turned
 * into the provider's privacy-friendly embed address so the lesson page can show it in an iframe.
 *
 * Functions:
 * - parseEmbedVideoUrl(input): returns { provider, id, embedUrl } for a supported YouTube, Loom or Vimeo URL, or null.
 * - youtubeId(url): the video id from youtube.com/watch, /embed, /shorts, /live or youtu.be links, or null.
 */
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"]);
const LOOM_HOSTS = new Set(["loom.com", "www.loom.com"]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);
const VIDEO_ID = /^[A-Za-z0-9_-]{6,64}$/;

function youtubeId(url: URL): string | null {
  if (url.hostname === "youtu.be") return url.pathname.slice(1).split("/")[0] ?? null;
  if (url.pathname === "/watch") return url.searchParams.get("v");
  const match = /^\/(?:embed|shorts|live)\/([^/?#]+)/.exec(url.pathname);
  return match?.[1] ?? null;
}

export function parseEmbedVideoUrl(input: string): { provider: "youtube" | "loom" | "vimeo"; id: string; embedUrl: string } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (YOUTUBE_HOSTS.has(host) || host === "youtu.be") {
    const id = youtubeId(url);
    return id && VIDEO_ID.test(id) ? { provider: "youtube", id, embedUrl: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (LOOM_HOSTS.has(host)) {
    const id = /^\/(?:share|embed)\/([^/?#]+)/.exec(url.pathname)?.[1];
    return id && VIDEO_ID.test(id) ? { provider: "loom", id, embedUrl: `https://www.loom.com/embed/${id}` } : null;
  }
  if (VIMEO_HOSTS.has(host)) {
    const id = /^\/(?:video\/)?(\d{5,12})(?:\/|$)/.exec(url.pathname)?.[1];
    return id ? { provider: "vimeo", id, embedUrl: `https://player.vimeo.com/video/${id}` } : null;
  }
  return null;
}
