/**
 * File: apps/web/src/components/broker/step-videos.tsx
 * Purpose: The videos at the top of an onboarding step (SPEC D28). Each slot shows an embedded YouTube, Loom or Vimeo
 * player or an uploaded MP4 (its 5-minute link is refreshed if it expires mid-watch); empty slots are a slim
 * "on its way" row so they don't push the step's instructions down. On a step that must have its video watched
 * (SPEC D32), an uploaded video reports the furthest second watched (skipping ahead doesn't count) and is marked watched
 * at 90%; an embedded video gets an "I've watched this video" button. Either way the page refreshes so the confirm box
 * unlocks.
 *
 * Functions:
 * - StepVideos({ stepKey, videos, trackWatching }): the list of video slots, one under the other.
 * - StepVideo({ stepKey, video, trackWatching }): one slot with a video, as a full-width player, plus its watched state when tracked.
 * - EmptySlot({ title }): one empty slot as a single "on its way" row.
 * - UploadedStepVideo({ stepKey, video, trackWatching }): the native player for an uploaded MP4, sending watch progress when tracked.
 * - MarkWatchedButton({ stepKey, video }): the "I've watched this video" button for an embedded video on a tracked step.
 * - WatchedNote({ watched }): the "Watched" tick or the "Watch to the end to unlock this step" hint under a tracked video.
 */
"use client";

import type { StepVideoView } from "@bp/shared";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckIcon, PlayIcon } from "@/components/ui/icons";
import { apiRequest, ApiError } from "@/lib/api-client";

const HEARTBEAT_MS = 10_000;
const MAX_NATURAL_JUMP_SECONDS = 3;

function UploadedStepVideo({ stepKey, video, trackWatching }: { stepKey: string; video: StepVideoView; trackWatching: boolean }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const refreshing = useRef(false);
  const furthest = useRef(video.watchedSeconds);
  const lastPosition = useRef(0);
  const lastSent = useRef(video.watchedSeconds);
  const watched = useRef(video.watched);

  const sendProgress = useCallback(async () => {
    const player = videoRef.current;
    const seconds = Math.floor(furthest.current);
    if (!trackWatching || watched.current || !player || seconds <= lastSent.current) return;
    lastSent.current = seconds;
    const duration = Number.isFinite(player.duration) && player.duration > 0 ? Math.round(player.duration) : undefined;
    try {
      const result = await apiRequest<{ watched: boolean }>(`/v1/me/steps/${stepKey}/videos/${video.id}/progress`, {
        method: "POST",
        body: { watchedSeconds: seconds, durationSeconds: duration },
      });
      if (result.watched) {
        watched.current = true;
        router.refresh();
      }
    } catch {
      lastSent.current = Math.min(lastSent.current, seconds - 1);
    }
  }, [router, stepKey, trackWatching, video.id]);

  useEffect(() => {
    if (!trackWatching) return;
    const timer = window.setInterval(() => void sendProgress(), HEARTBEAT_MS);
    return () => {
      window.clearInterval(timer);
      void sendProgress();
    };
  }, [sendProgress, trackWatching]);

  function handleTimeUpdate() {
    const position = videoRef.current?.currentTime ?? 0;
    const jump = position - lastPosition.current;
    if (jump > 0 && jump <= MAX_NATURAL_JUMP_SECONDS) furthest.current = Math.max(furthest.current, position);
    lastPosition.current = position;
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
      lastPosition.current = resumeAt;
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
      onTimeUpdate={handleTimeUpdate}
      onSeeked={() => {
        lastPosition.current = videoRef.current?.currentTime ?? 0;
      }}
      onPause={() => void sendProgress()}
      onEnded={() => {
        if (furthest.current >= (videoRef.current?.duration ?? 0) - MAX_NATURAL_JUMP_SECONDS) furthest.current = videoRef.current?.duration ?? furthest.current;
        void sendProgress();
      }}
      onError={() => void refreshLink()}
    />
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
  if (video.source === "embed" && video.embedUrl) {
    return (
      <>
        <div className="aspect-video w-full overflow-hidden rounded-2xl bg-navy">
          <iframe
            src={video.embedUrl}
            title={`Video: ${video.title}`}
            className="size-full"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        {trackWatching && !video.watched ? <MarkWatchedButton stepKey={stepKey} video={video} /> : null}
      </>
    );
  }
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
