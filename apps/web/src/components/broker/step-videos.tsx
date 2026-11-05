/**
 * File: apps/web/src/components/broker/step-videos.tsx
 * Purpose: The videos at the top of an onboarding step (SPEC D28). Each slot plays an uploaded MP4 (its 5-minute link
 * is refreshed if it expires mid-watch, at most once a minute so a video that can't play doesn't keep asking); step
 * videos are MP4s only (SPEC D34). Empty slots are a slim "on its way" row
 * so they don't push the step's instructions down. On a step that must have its video watched (SPEC D32), the player
 * reports the furthest second watched every 10 seconds (skipping ahead doesn't count), the video is marked watched at
 * 90%, and the page refreshes so the confirm box unlocks.
 *
 * Functions:
 * - useWatchProgress({ stepKey, video, enabled, maxJumpSeconds }): follows the player's position and sends the furthest second watched; returns { track(position, duration), seeked(position), flush() }.
 * - StepVideos({ stepKey, videos, trackWatching }): the list of video slots, one under the other.
 * - EmptySlot({ title }): one empty slot as a single "on its way" row.
 * - UploadedStepVideo({ stepKey, video, trackWatching }): the native player for an uploaded MP4, sending watch progress when tracked.
 * - WatchedNote({ watched }): the "Watched" tick or the "Watch the whole video to unlock this step" hint under a tracked video.
 */
"use client";

import type { StepVideoView } from "@bp/shared";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { CheckIcon, PlayIcon } from "@/components/ui/icons";
import { apiRequest } from "@/lib/api-client";

const HEARTBEAT_MS = 10_000;
const MAX_NATURAL_JUMP_SECONDS = 3;
const MIN_LINK_REFRESH_MS = 60_000;

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
  const lastRefresh = useRef(0);
  const progress = useWatchProgress({ stepKey, video, enabled: trackWatching && !video.watched, maxJumpSeconds: MAX_NATURAL_JUMP_SECONDS });

  function playerDuration(): number | null {
    const total = videoRef.current?.duration;
    return total && Number.isFinite(total) && total > 0 ? total : null;
  }

  async function refreshLink() {
    const player = videoRef.current;
    if (!player || refreshing.current || Date.now() - lastRefresh.current < MIN_LINK_REFRESH_MS) return;
    refreshing.current = true;
    lastRefresh.current = Date.now();
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
  const ready = videos.filter((video) => video.source === "upload" && video.playUrl);
  const waiting = videos.filter((video) => !ready.includes(video));
  return (
    <section aria-label="Videos for this step" className="space-y-5">
      {ready.map((video) => (
        <figure key={video.id} className="space-y-2.5">
          <UploadedStepVideo stepKey={stepKey} video={video} trackWatching={trackWatching} />
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
