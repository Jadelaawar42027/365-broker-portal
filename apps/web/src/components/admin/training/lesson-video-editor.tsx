/**
 * File: apps/web/src/components/admin/training/lesson-video-editor.tsx
 * Purpose: The video section of the lesson editor: shows the current video (embed link or uploaded file) with
 * "Remove", a field for a YouTube, Loom or Vimeo link, and an MP4 upload (up to 1 GB) with a progress bar.
 *
 * Functions:
 * - LessonVideoEditor({ lesson }): renders the current video and both ways to add one.
 * - formatBytes(bytes): 734003200 → "700 MB".
 */
"use client";

import { MAX_VIDEO_BYTES, VIDEO_MIME_TYPE, type AdminLesson } from "@bp/shared";
import { useRef, useState, type FormEvent } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { PlayIcon, UploadIcon } from "@/components/ui/icons";
import { FieldLabel, inputClasses, ProgressBar } from "@/components/ui/misc";
import { apiRequest } from "@/lib/api-client";
import { uploadLessonVideo } from "@/lib/video-upload";
import { useAction } from "./use-action";

const PROVIDER_NAMES = { upload: "Uploaded video", youtube: "YouTube", loom: "Loom", vimeo: "Vimeo" } as const;

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 * 1024 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

export function LessonVideoEditor({ lesson }: { lesson: AdminLesson }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const { busy, error, setError, run } = useAction();
  const video = lesson.video;

  async function saveEmbed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const url = String(new FormData(formElement).get("url") ?? "").trim();
    const saved = await run(() => apiRequest(`/v1/admin/training/lessons/${lesson.id}/video/embed`, { method: "PUT", body: { url } }));
    if (saved) formElement.reset();
  }

  async function upload(file: File) {
    if (file.type !== VIDEO_MIME_TYPE) return setError(`"${file.name}" isn't an MP4 video.`);
    if (file.size > MAX_VIDEO_BYTES) return setError(`"${file.name}" is ${formatBytes(file.size)}. Videos can be up to 1 GB.`);
    setProgress(0);
    await run(() => uploadLessonVideo(lesson.id, file, setProgress));
    setProgress(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <section aria-labelledby="video-title" className="space-y-4 rounded-2xl border border-line bg-white px-6 py-6">
      <h2 id="video-title" className="text-xl font-bold">
        Video
      </h2>
      {video ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-page px-4 py-3">
          <p className="flex min-w-0 items-center gap-3 text-[17px]">
            <PlayIcon className="size-5 shrink-0 text-brand" />
            <span className="min-w-0">
              <span className="block font-semibold">{PROVIDER_NAMES[video.provider]}</span>
              <span className="block truncate text-[15px] text-muted">
                {video.source === "embed" ? video.embedUrl : `${video.fileName ?? "video.mp4"}${video.sizeBytes ? ` · ${formatBytes(video.sizeBytes)}` : ""}`}
              </span>
            </span>
          </p>
          <Button variant="danger-outline" size="sm" disabled={busy} onClick={() => void run(() => apiRequest(`/v1/admin/training/lessons/${lesson.id}/video`, { method: "DELETE" }))}>
            Remove video
          </Button>
        </div>
      ) : (
        <p className="text-[17px] text-muted">{lesson.videoPlaceholder ? "This lesson is waiting for its video. Brokers see a “video on its way” slot." : "No video. Text lessons are fine without one."}</p>
      )}
      <form onSubmit={saveEmbed} className="space-y-2">
        <FieldLabel htmlFor="embed-url">{video ? "Replace with a link" : "Use a YouTube, Loom or Vimeo link"}</FieldLabel>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input id="embed-url" name="url" type="url" required inputMode="url" spellCheck={false} placeholder="https://www.loom.com/share/…" autoComplete="off" className={inputClasses()} />
          <Button type="submit" variant="outline" disabled={busy} className="shrink-0">
            Use this link
          </Button>
        </div>
      </form>
      <div className="space-y-2">
        <p className="text-[15px] font-bold">{video ? "Or replace with an upload" : "Or upload an MP4"}</p>
        <label className={`inline-flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-white px-5 text-base font-bold text-navy hover:bg-page has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-brand ${busy ? "pointer-events-none opacity-60" : ""}`}>
          <input ref={fileRef} type="file" accept={VIDEO_MIME_TYPE} disabled={busy} className="sr-only" onChange={(event) => event.target.files?.[0] && void upload(event.target.files[0])} />
          <UploadIcon />
          Choose an MP4 (up to 1 GB)
        </label>
        {progress !== null ? (
          <div className="space-y-1.5" aria-live="polite">
            <ProgressBar value={Math.round(progress * 100)} max={100} label="Video upload progress" />
            <p className="text-[15px] text-muted">Uploading… {Math.round(progress * 100)}%. Keep this tab open.</p>
          </div>
        ) : null}
      </div>
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
    </section>
  );
}
