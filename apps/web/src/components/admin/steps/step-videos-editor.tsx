/**
 * File: apps/web/src/components/admin/steps/step-videos-editor.tsx
 * Purpose: The video slots of an onboarding step in the admin step editor (SPEC D28). Each slot has a title and is
 * empty (brokers see "video on its way") or holds an uploaded MP4 (up to 1 GB, straight to the bucket in parts); step
 * videos are MP4s only, so the portal can tell how much of each one a broker has watched (SPEC D34). Admins can add,
 * rename and remove slots, upload or replace the video, or clear it.
 *
 * Functions:
 * - StepVideosEditor({ stepKey, videos }): the list of slots and the "Add a video slot" form.
 * - VideoSlot({ video }): one slot with its title, current video and the controls to change it (clearing or removing asks first).
 * - formatBytes(bytes): "12 MB" or "1.1 GB".
 */
"use client";

import { MAX_VIDEO_BYTES, VIDEO_MIME_TYPE, type AdminStepVideo } from "@bp/shared";
import { useRef, useState, type FormEvent } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { PlayIcon, UploadIcon } from "@/components/ui/icons";
import { inputClasses, ProgressBar } from "@/components/ui/misc";
import { apiRequest } from "@/lib/api-client";
import { uploadStepVideo } from "@/lib/video-upload";
import { useAction } from "../training/use-action";

function formatBytes(bytes: number): string {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

function VideoSlot({ video }: { video: AdminStepVideo }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const { busy, error, setError, run } = useAction();
  const base = `/v1/admin/step-videos/${video.id}`;

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get("title") ?? "").trim();
    if (await run(() => apiRequest(base, { method: "PATCH", body: { title } }))) setEditingTitle(false);
  }

  async function upload(file: File) {
    if (file.type !== VIDEO_MIME_TYPE) return setError(`"${file.name}" isn't an MP4 video.`);
    if (file.size > MAX_VIDEO_BYTES) return setError(`"${file.name}" is ${formatBytes(file.size)}. Videos can be up to 1 GB.`);
    setProgress(0);
    await run(() => uploadStepVideo(video.id, file, setProgress));
    setProgress(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function clearVideo() {
    if (!window.confirm(`Clear the video from “${video.title}”? The slot stays, and brokers see it as “On its way”.`)) return;
    void run(() => apiRequest(`${base}/video`, { method: "DELETE" }));
  }

  function remove() {
    if (!window.confirm(`Remove the video slot “${video.title}”? Brokers stop seeing it.`)) return;
    void run(() => apiRequest(base, { method: "DELETE" }));
  }

  return (
    <li className="space-y-4 border-b border-line px-6 py-5 last:border-b-0">
      {editingTitle ? (
        <form onSubmit={rename} className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor={`title-${video.id}`} className="sr-only">
            Video title
          </label>
          <input id={`title-${video.id}`} name="title" required minLength={2} maxLength={120} defaultValue={video.title} autoComplete="off" className={inputClasses()} />
          <div className="flex shrink-0 gap-2">
            <Button type="submit" disabled={busy}>
              Save
            </Button>
            <Button variant="outline" onClick={() => setEditingTitle(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2.5 text-lg font-bold">
            <PlayIcon className="size-5 shrink-0 text-brand" />
            {video.title}
          </h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditingTitle(true)}>
              Rename
            </Button>
            <Button variant="danger-outline" size="sm" disabled={busy} onClick={remove}>
              Remove slot
            </Button>
          </div>
        </div>
      )}
      {video.source ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-page px-4 py-3">
          <p className="min-w-0 text-[17px]">
            <span className="block font-semibold">Uploaded video</span>
            <span className="block truncate text-[15px] text-muted">
              {video.fileName ?? "video.mp4"}
              {video.sizeBytes ? ` · ${formatBytes(video.sizeBytes)}` : ""}
            </span>
          </p>
          <Button variant="outline" size="sm" disabled={busy} onClick={clearVideo}>
            Clear video
          </Button>
        </div>
      ) : (
        <p className="rounded-xl border-2 border-dashed border-line px-4 py-3 text-[17px] text-muted">Empty. Brokers see it as “On its way”.</p>
      )}
      <label className={`inline-flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-white px-5 text-base font-bold text-navy hover:bg-page has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-brand ${busy ? "pointer-events-none opacity-60" : ""}`}>
        <input
          ref={fileRef}
          type="file"
          accept={VIDEO_MIME_TYPE}
          disabled={busy}
          aria-label={`Upload an MP4 for ${video.title}`}
          className="sr-only"
          onChange={(event) => event.target.files?.[0] && void upload(event.target.files[0])}
        />
        <UploadIcon />
        {video.source ? "Replace with another MP4 (up to 1 GB)" : "Upload an MP4 (up to 1 GB)"}
      </label>
      {progress !== null ? (
        <div className="space-y-1.5" aria-live="polite">
          <ProgressBar value={Math.round(progress * 100)} max={100} label={`Upload progress for ${video.title}`} />
          <p className="text-[15px] text-muted">Uploading… {Math.round(progress * 100)}%. Keep this tab open.</p>
        </div>
      ) : null}
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
    </li>
  );
}

export function StepVideosEditor({ stepKey, videos }: { stepKey: string; videos: AdminStepVideo[] }) {
  const [adding, setAdding] = useState(false);
  const { busy, error, run } = useAction();

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get("title") ?? "").trim();
    if (await run(() => apiRequest(`/v1/admin/steps/${stepKey}/videos`, { method: "POST", body: { title } }))) setAdding(false);
  }

  return (
    <section aria-labelledby="videos-title" className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
        <div>
          <h2 id="videos-title" className="text-xl font-bold">
            Videos
          </h2>
          <p className="text-[15px] text-muted">Shown first on the step, in this order.</p>
        </div>
        <Button variant="soft" onClick={() => setAdding(true)} disabled={adding}>
          + Add a video slot
        </Button>
      </div>
      {adding ? (
        <form onSubmit={add} className="flex flex-col gap-3 border-b border-line bg-page px-6 py-4 sm:flex-row">
          <label htmlFor="new-video-title" className="sr-only">
            New video title
          </label>
          <input id="new-video-title" name="title" required minLength={2} maxLength={120} placeholder="e.g. BoatWizard walkthrough" autoComplete="off" className={inputClasses()} />
          <div className="flex shrink-0 gap-2">
            <Button type="submit" disabled={busy}>
              Add
            </Button>
            <Button variant="outline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
      {error ? (
        <div className="px-6 pt-4">
          <FormMessage tone="error">{error}</FormMessage>
        </div>
      ) : null}
      {videos.length ? (
        <ul>
          {videos.map((video) => (
            <VideoSlot key={video.id} video={video} />
          ))}
        </ul>
      ) : (
        <p className="px-6 py-6 text-lg text-muted">No videos on this step.</p>
      )}
    </section>
  );
}
