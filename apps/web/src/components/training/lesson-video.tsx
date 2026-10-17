/**
 * File: apps/web/src/components/training/lesson-video.tsx
 * Purpose: The lesson's video. Embedded YouTube, Loom or Vimeo videos play in an iframe from the provider's own player
 * address. Uploaded videos play from a 5-minute private link that is refreshed when it expires, and report the furthest
 * second watched every few seconds so the lesson completes at 90% (SPEC G-assumed lesson completion).
 *
 * Functions:
 * - LessonVideo({ lessonId, title, video, watchedSeconds, onCompleted }): picks the embed or the uploaded-video player.
 * - UploadedVideo({ lessonId, title, playUrl, watchedSeconds, onCompleted }): the HTML5 player with watch tracking.
 * - VideoPlaceholder(): the "video coming soon" slot shown when a lesson's video has not been added yet.
 */
"use client";

import type { TrainingLessonResponse } from "@bp/shared";
import { useCallback, useEffect, useRef } from "react";
import { PlayIcon } from "@/components/ui/icons";
import { apiRequest } from "@/lib/api-client";

const HEARTBEAT_MS = 10_000;
const MAX_NATURAL_JUMP_SECONDS = 3;

type LessonVideoView = NonNullable<TrainingLessonResponse["video"]>;

function UploadedVideo({
  lessonId,
  title,
  playUrl,
  watchedSeconds,
  onCompleted,
}: {
  lessonId: string;
  title: string;
  playUrl: string;
  watchedSeconds: number;
  onCompleted: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const furthest = useRef(watchedSeconds);
  const lastPosition = useRef(0);
  const lastSent = useRef(watchedSeconds);
  const refreshing = useRef(false);

  const sendProgress = useCallback(async () => {
    const video = videoRef.current;
    const seconds = Math.floor(furthest.current);
    if (!video || seconds <= lastSent.current) return;
    lastSent.current = seconds;
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration) : undefined;
    try {
      const result = await apiRequest<{ completed: boolean }>(`/v1/me/training/lessons/${lessonId}/progress`, {
        method: "POST",
        body: { watchedSeconds: seconds, durationSeconds: duration },
      });
      if (result.completed) onCompleted();
    } catch {
      lastSent.current = Math.min(lastSent.current, seconds - 1);
    }
  }, [lessonId, onCompleted]);

  useEffect(() => {
    const timer = window.setInterval(() => void sendProgress(), HEARTBEAT_MS);
    return () => {
      window.clearInterval(timer);
      void sendProgress();
    };
  }, [sendProgress]);

  function handleTimeUpdate() {
    const position = videoRef.current?.currentTime ?? 0;
    const jump = position - lastPosition.current;
    if (jump > 0 && jump <= MAX_NATURAL_JUMP_SECONDS) furthest.current = Math.max(furthest.current, position);
    lastPosition.current = position;
  }

  async function handleError() {
    const video = videoRef.current;
    if (!video || refreshing.current) return;
    refreshing.current = true;
    const resumeAt = video.currentTime;
    try {
      const { url } = await apiRequest<{ url: string }>(`/v1/me/training/lessons/${lessonId}/video-url`);
      video.src = url;
      video.currentTime = resumeAt;
      lastPosition.current = resumeAt;
    } finally {
      refreshing.current = false;
    }
  }

  return (
    <video
      ref={videoRef}
      src={playUrl}
      controls
      playsInline
      preload="metadata"
      aria-label={`Video: ${title}`}
      className="aspect-video w-full rounded-2xl bg-navy"
      onTimeUpdate={handleTimeUpdate}
      onSeeked={() => {
        lastPosition.current = videoRef.current?.currentTime ?? 0;
      }}
      onPause={() => void sendProgress()}
      onEnded={() => {
        furthest.current = Math.max(furthest.current, videoRef.current?.duration ?? 0);
        void sendProgress();
      }}
      onError={() => void handleError()}
    />
  );
}

export function VideoPlaceholder() {
  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-line bg-page px-6 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-neutral-soft text-muted">
        <PlayIcon className="size-6" />
      </span>
      <p className="text-lg font-semibold text-muted">The video for this lesson is on its way.</p>
    </div>
  );
}

export function LessonVideo({
  lessonId,
  title,
  video,
  watchedSeconds,
  onCompleted,
}: {
  lessonId: string;
  title: string;
  video: LessonVideoView;
  watchedSeconds: number;
  onCompleted: () => void;
}) {
  if (video.source === "embed" && video.embedUrl) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-2xl bg-navy">
        <iframe
          src={video.embedUrl}
          title={`Video: ${title}`}
          className="size-full"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }
  if (video.playUrl) {
    return <UploadedVideo lessonId={lessonId} title={title} playUrl={video.playUrl} watchedSeconds={watchedSeconds} onCompleted={onCompleted} />;
  }
  return <VideoPlaceholder />;
}
