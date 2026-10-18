/**
 * File: apps/web/src/components/broker/step-videos.tsx
 * Purpose: The videos at the top of an onboarding step (SPEC D28). Each slot shows an embedded YouTube, Loom or Vimeo
 * player or an uploaded MP4 (its 5-minute link is refreshed if it expires mid-watch); empty slots are a slim
 * "on its way" row so they don't push the step's instructions down.
 *
 * Functions:
 * - StepVideos({ stepKey, videos }): the list of video slots, one under the other.
 * - StepVideo({ stepKey, video }): one slot with a video, as a full-width player.
 * - EmptySlot({ title }): one empty slot as a single "on its way" row.
 * - UploadedStepVideo({ stepKey, video }): the native player for an uploaded MP4.
 */
"use client";

import type { StepVideoView } from "@bp/shared";
import { useRef } from "react";
import { PlayIcon } from "@/components/ui/icons";
import { apiRequest } from "@/lib/api-client";

function UploadedStepVideo({ stepKey, video }: { stepKey: string; video: StepVideoView }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const refreshing = useRef(false);

  async function refreshLink() {
    const player = videoRef.current;
    if (!player || refreshing.current) return;
    refreshing.current = true;
    const resumeAt = player.currentTime;
    try {
      const { url } = await apiRequest<{ url: string }>(`/v1/me/steps/${stepKey}/videos/${video.id}/url`);
      player.src = url;
      player.currentTime = resumeAt;
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
      onError={() => void refreshLink()}
    />
  );
}

function StepVideo({ stepKey, video }: { stepKey: string; video: StepVideoView }) {
  if (video.source === "embed" && video.embedUrl) {
    return (
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
    );
  }
  return <UploadedStepVideo stepKey={stepKey} video={video} />;
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

export function StepVideos({ stepKey, videos }: { stepKey: string; videos: StepVideoView[] }) {
  if (videos.length === 0) return null;
  const ready = videos.filter((video) => (video.source === "embed" && video.embedUrl) || (video.source === "upload" && video.playUrl));
  const waiting = videos.filter((video) => !ready.includes(video));
  return (
    <section aria-label="Videos for this step" className="space-y-5">
      {ready.map((video) => (
        <figure key={video.id} className="space-y-2.5">
          <StepVideo stepKey={stepKey} video={video} />
          <figcaption className="flex items-center gap-2 text-lg font-bold">
            <PlayIcon className="size-5 shrink-0 text-brand" />
            {video.title}
          </figcaption>
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
