/**
 * File: apps/web/src/components/broker/step-videos.tsx
 * Purpose: The videos at the top of an onboarding step (SPEC D28). Each slot shows an embedded YouTube, Loom or Vimeo
 * player or an uploaded MP4 (its 5-minute link is refreshed if it expires mid-watch); empty slots are a slim
 * "on its way" row so they don't push the step's instructions down. On a step that must have its video watched
 * (SPEC D32), uploaded, YouTube and Vimeo videos report the furthest second watched every 10 seconds (skipping ahead
 * doesn't count) and are marked watched at 90%; a Loom video, whose player can't report watch time, gets an "I've
 * watched this video" button. Either way the page refreshes so the confirm box unlocks.
 *
 * Functions:
 * - useWatchProgress({ stepKey, video, enabled, maxJumpSeconds }): follows the player's position and sends the furthest second watched; returns { track(position, duration), flush() }.
 * - StepVideos({ stepKey, videos, trackWatching }): the list of video slots, one under the other.
 * - StepVideo({ stepKey, video, trackWatching }): one slot with a video, as a full-width player.
 * - EmbedStepVideo({ stepKey, video, trackWatching }): the YouTube, Loom or Vimeo iframe; on a tracked step it listens to YouTube and Vimeo player messages, or shows the Loom button.
 * - EmptySlot({ title }): one empty slot as a single "on its way" row.
 * - UploadedStepVideo({ stepKey, video, trackWatching }): the native player for an uploaded MP4, sending watch progress when tracked.
 * - MarkWatchedButton({ stepKey, video }): the "I've watched this video" button for a Loom video on a tracked step.
 * - WatchedNote({ watched }): the "Watched" tick or the "Watch the whole video to unlock this step" hint under a tracked video.
 */
"use client";

import { canTrackEmbed, isPlayerReady, PLAYER_ORIGINS, readPlayerTime, trackingEmbedUrl, type StepVideoView } from "@bp/shared";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckIcon, PlayIcon } from "@/components/ui/icons";
import { apiRequest, ApiError } from "@/lib/api-client";

const HEARTBEAT_MS = 10_000;
const MAX_NATURAL_JUMP_SECONDS = 3;
const MAX_EMBED_JUMP_SECONDS = 5;
const PLAYER_HANDSHAKE_MS = 1_000;
const PLAYER_HANDSHAKE_TRIES = 15;

function useWatchProgress({ stepKey, video, enabled, maxJumpSeconds }: { stepKey: string; video: StepVideoView; enabled: boolean; maxJumpSeconds: number }) {
  const router = useRouter();
  const furthest = useRef(video.watchedSeconds);
  const lastPosition = useRef<number | null>(null);
  const lastSent = useRef(video.watchedSeconds);
  const duration = useRef<number | null>(null);
  const watched = useRef(video.watched);

  const flush = useCallback(async () => {
    const seconds = Math.floor(furthest.current);
    if (!enabled || watched.current || seconds <= lastSent.current) return;
    lastSent.current = seconds;
    try {
      const result = await apiRequest<{ watched: boolean }>(`/v1/me/steps/${stepKey}/videos/${video.id}/progress`, {
        method: "POST",
        body: { watchedSeconds: seconds, durationSeconds: duration.current ? Math.round(duration.current) : undefined },
      });
      if (result.watched) {
        watched.current = true;
        router.refresh();
      }
    } catch {
      lastSent.current = Math.min(lastSent.current, seconds - 1);
    }
  }, [enabled, router, stepKey, video.id]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => void flush(), HEARTBEAT_MS);
    return () => {
      window.clearInterval(timer);
      void flush();
    };
  }, [enabled, flush]);

  const track = useCallback(
    (position: number, total: number | null) => {
      if (total && total > 0) duration.current = total;
      const previous = lastPosition.current;
      if (previous !== null) {
        const jump = position - previous;
        if (jump > 0 && jump <= maxJumpSeconds) furthest.current = Math.max(furthest.current, position);
      }
      lastPosition.current = position;
      if (duration.current && furthest.current >= duration.current - maxJumpSeconds && position >= duration.current - maxJumpSeconds) void flush();
    },
    [flush, maxJumpSeconds],
  );

  const seeked = useCallback((position: number) => {
    lastPosition.current = position;
  }, []);

  return { track, seeked, flush };
}

function UploadedStepVideo({ stepKey, video, trackWatching }: { stepKey: string; video: StepVideoView; trackWatching: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const refreshing = useRef(false);
  const progress = useWatchProgress({ stepKey, video, enabled: trackWatching && !video.watched, maxJumpSeconds: MAX_NATURAL_JUMP_SECONDS });

  function playerDuration(): number | null {
    const total = videoRef.current?.duration;
    return total && Number.isFinite(total) && total > 0 ? total : null;
  }

  async function refreshLink() {
    const player = videoRef.current;
    if (!player || refreshing.current) return;
    refreshing.current = true;
    const resumeAt = player.currentTime;
    try {
      const { url } = await apiRequest<{ url: string }>(`/v1/me/steps/${stepKey}/videos/${video.id}/url`);
      player.src = url;
      player.currentTime = resumeAt;
      progress.seeked(resumeAt);
    } finally {
      refreshing.current = false;
    }
  }

  return (
    <video
      ref={videoRef}
      src={video.playUrl ?? undefined}
      controls
      playsInline
      preload="metadata"
      aria-label={`Video: ${video.title}`}
      className="aspect-video w-full rounded-2xl bg-navy"
      onTimeUpdate={() => progress.track(videoRef.current?.currentTime ?? 0, playerDuration())}
      onSeeked={() => progress.seeked(videoRef.current?.currentTime ?? 0)}
      onPause={() => void progress.flush()}
      onEnded={() => void progress.flush()}
      onError={() => void refreshLink()}
    />
  );
}

function EmbedStepVideo({ stepKey, video, trackWatching }: { stepKey: string; video: StepVideoView; trackWatching: boolean }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const tracked = trackWatching && !video.watched && canTrackEmbed(video.provider);
  const [src, setSrc] = useState(tracked ? null : video.embedUrl);
  const heard = useRef(false);
  const progress = useWatchProgress({ stepKey, video, enabled: tracked, maxJumpSeconds: MAX_EMBED_JUMP_SECONDS });
  const { track } = progress;

  useEffect(() => {
    if (!tracked || !video.embedUrl) return;
    setSrc(trackingEmbedUrl(video.embedUrl, video.provider, window.location.origin));
  }, [tracked, video.embedUrl, video.provider]);

  useEffect(() => {
    if (!tracked) return;
    function subscribe() {
      const player = iframeRef.current?.contentWindow;
      if (!player) return;
      if (video.provider === "youtube") player.postMessage(JSON.stringify({ event: "listening", id: video.id, channel: "widget" }), "*");
      else player.postMessage(JSON.stringify({ method: "addEventListener", value: "timeupdate" }), "*");
    }
    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow || !(PLAYER_ORIGINS as readonly string[]).includes(event.origin)) return;
      if (isPlayerReady(video.provider, event.data)) subscribe();
      const time = readPlayerTime(video.provider, event.data);
      if (!time) return;
      heard.current = true;
      track(time.currentTime, time.duration);
    }
    window.addEventListener("message", onMessage);
    let tries = 0;
    const handshake = window.setInterval(() => {
      tries += 1;
      if (heard.current || tries > PLAYER_HANDSHAKE_TRIES) window.clearInterval(handshake);
      else subscribe();
    }, PLAYER_HANDSHAKE_MS);
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(handshake);
    };
  }, [track, tracked, video.id, video.provider]);

  return (
    <>
      <div className="aspect-video w-full overflow-hidden rounded-2xl bg-navy">
        {src ? (
          <iframe
            ref={iframeRef}
            src={src}
            title={`Video: ${video.title}`}
            className="size-full"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            loading={tracked ? "eager" : "lazy"}
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : null}
      </div>
      {trackWatching && !video.watched && !canTrackEmbed(video.provider) ? <MarkWatchedButton stepKey={stepKey} video={video} /> : null}
    </>
  );
}

function MarkWatchedButton({ stepKey, video }: { stepKey: string; video: StepVideoView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markWatched() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/v1/me/steps/${stepKey}/videos/${video.id}/watched`, { method: "POST" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button variant="brand-outline" size="lg" disabled={busy} aria-busy={busy} onClick={() => void markWatched()}>
        <CheckIcon className="size-5" />
        {busy ? "Saving…" : "I've watched this video"}
      </Button>
      {error ? (
        <p role="alert" className="text-base text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function WatchedNote({ watched }: { watched: boolean }) {
  return watched ? (
    <p className="flex items-center gap-2 text-base font-semibold text-success">
      <CheckIcon className="size-5" />
      Watched
    </p>
  ) : (
    <p className="text-base text-muted">Watch the whole video to unlock this step.</p>
  );
}

function StepVideo({ stepKey, video, trackWatching }: { stepKey: string; video: StepVideoView; trackWatching: boolean }) {
  if (video.source === "embed" && video.embedUrl) return <EmbedStepVideo stepKey={stepKey} video={video} trackWatching={trackWatching} />;
  return <UploadedStepVideo stepKey={stepKey} video={video} trackWatching={trackWatching} />;
}

function EmptySlot({ title }: { title: string }) {
  return (
    <li className="flex min-h-14 items-center gap-3 rounded-xl border-2 border-dashed border-line bg-page px-4 py-3 text-[17px]">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-neutral-soft text-muted">
        <PlayIcon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 font-semibold">{title}</span>
      <span className="shrink-0 text-[15px] text-muted">On its way</span>
    </li>
  );
}

export function StepVideos({ stepKey, videos, trackWatching = false }: { stepKey: string; videos: StepVideoView[]; trackWatching?: boolean }) {
  if (videos.length === 0) return null;
  const ready = videos.filter((video) => (video.source === "embed" && video.embedUrl) || (video.source === "upload" && video.playUrl));
  const waiting = videos.filter((video) => !ready.includes(video));
  return (
    <section aria-label="Videos for this step" className="space-y-5">
      {ready.map((video) => (
        <figure key={video.id} className="space-y-2.5">
          <StepVideo stepKey={stepKey} video={video} trackWatching={trackWatching} />
          <figcaption className="flex items-center gap-2 text-lg font-bold">
            <PlayIcon className="size-5 shrink-0 text-brand" />
            {video.title}
          </figcaption>
          {trackWatching ? <WatchedNote watched={video.watched} /> : null}
        </figure>
      ))}
      {waiting.length ? (
        <ul className="space-y-2" aria-label="Videos on their way">
          {waiting.map((video) => (
            <EmptySlot key={video.id} title={video.title} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
