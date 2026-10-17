/**
 * File: apps/web/src/lib/video-upload.ts
 * Purpose: Uploads a lesson video (MP4, up to 1 GB) from the browser straight to the bucket in parts: the API starts a
 * multipart upload and signs one URL per part, the browser PUTs each slice (three at a time) and collects the ETags,
 * then the API completes it. A failed upload is cancelled so no half-file is left behind.
 *
 * Functions:
 * - readVideoDuration(file): the video's length in whole seconds from its metadata, or undefined if unreadable.
 * - partRanges(size, partSize): the byte range of each part, numbered from 1.
 * - uploadLessonVideo(lessonId, file, onProgress): runs the whole upload; resolves when the video is attached.
 */
import { ApiError, apiRequest } from "./api-client";

const PARALLEL_PARTS = 3;

type StartResponse = { uploadId: string; storageKey: string; partSize: number; parts: { partNumber: number; url: string }[] };

export function readVideoDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const finish = (value: number | undefined) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.preload = "metadata";
    video.onloadedmetadata = () => finish(Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration) : undefined);
    video.onerror = () => finish(undefined);
    video.src = url;
  });
}

export function partRanges(size: number, partSize: number): { partNumber: number; start: number; end: number }[] {
  const count = Math.max(1, Math.ceil(size / partSize));
  return Array.from({ length: count }, (_, index) => ({ partNumber: index + 1, start: index * partSize, end: Math.min(size, (index + 1) * partSize) }));
}

export async function uploadLessonVideo(lessonId: string, file: File, onProgress: (fraction: number) => void): Promise<void> {
  const durationSeconds = await readVideoDuration(file);
  const start = await apiRequest<StartResponse>(`/v1/admin/training/lessons/${lessonId}/video/uploads`, {
    method: "POST",
    body: { fileName: file.name, contentType: file.type, sizeBytes: file.size, durationSeconds },
  });
  const urls = new Map(start.parts.map((part) => [part.partNumber, part.url]));
  const ranges = partRanges(file.size, start.partSize);
  const etags: { partNumber: number; etag: string }[] = [];
  let uploadedBytes = 0;
  let next = 0;

  async function worker() {
    while (next < ranges.length) {
      const range = ranges[next++]!;
      const response = await fetch(urls.get(range.partNumber)!, { method: "PUT", body: file.slice(range.start, range.end), credentials: "omit" }).catch(() => {
        throw new ApiError(0, "storage_unreachable", "The browser couldn't reach file storage. Check your connection; if it keeps failing, the bucket needs its upload settings (pnpm storage:cors).");
      });
      const etag = response.headers.get("etag");
      if (!response.ok || !etag) throw new ApiError(response.status, "upload_failed", "Part of the video didn't upload. Check your connection and try again.");
      etags.push({ partNumber: range.partNumber, etag });
      uploadedBytes += range.end - range.start;
      onProgress(uploadedBytes / file.size);
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(PARALLEL_PARTS, ranges.length) }, worker));
    await apiRequest(`/v1/admin/training/lessons/${lessonId}/video/uploads/complete`, {
      method: "POST",
      body: { uploadId: start.uploadId, storageKey: start.storageKey, fileName: file.name, durationSeconds, parts: etags.sort((a, b) => a.partNumber - b.partNumber) },
    });
  } catch (caught) {
    await apiRequest(`/v1/admin/training/lessons/${lessonId}/video/uploads/abort`, { method: "POST", body: { uploadId: start.uploadId, storageKey: start.storageKey } }).catch(() => null);
    throw caught;
  }
}
