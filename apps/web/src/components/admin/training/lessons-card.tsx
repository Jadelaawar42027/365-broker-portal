/**
 * File: apps/web/src/components/admin/training/lessons-card.tsx
 * Purpose: The Lessons card on screen 3e: the chapter's lessons in order with their read time or video length, up and
 * down buttons to reorder them, and "+ Add lesson" which creates a lesson and opens its editor.
 *
 * Functions:
 * - LessonsCard({ chapterId, lessons }): renders the list, the reorder buttons and the add form.
 * - lessonMeta(lesson): "3 min read", "Video · 4:10", "Video · YouTube" or "Video slot empty".
 * - formatDuration(seconds): 250 → "4:10".
 */
"use client";

import type { AdminLesson } from "@bp/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { AlertIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { inputClasses } from "@/components/ui/misc";
import { apiRequest } from "@/lib/api-client";
import { useAction } from "./use-action";

const PROVIDER_NAMES = { upload: "uploaded", youtube: "YouTube", loom: "Loom", vimeo: "Vimeo" } as const;

function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function lessonMeta(lesson: AdminLesson): string {
  if (lesson.video) return lesson.video.durationSeconds ? `Video · ${formatDuration(lesson.video.durationSeconds)}` : `Video · ${PROVIDER_NAMES[lesson.video.provider]}`;
  if (lesson.videoPlaceholder) return "Video slot empty";
  return `${lesson.readMinutes} min read`;
}

export function LessonsCard({ chapterId, lessons }: { chapterId: string; lessons: AdminLesson[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const { busy, error, run } = useAction();

  function move(index: number, offset: number) {
    const order = lessons.map((lesson) => lesson.id);
    const [moved] = order.splice(index, 1);
    order.splice(index + offset, 0, moved!);
    void run(() => apiRequest(`/v1/admin/training/chapters/${chapterId}/lesson-order`, { method: "PUT", body: { lessonIds: order } }));
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get("title") ?? "").trim();
    const created = await run(() => apiRequest<{ id: string }>(`/v1/admin/training/chapters/${chapterId}/lessons`, { method: "POST", body: { title } }), { refresh: false });
    if (created) router.push(`/admin/training/${chapterId}/lessons/${created.id}`);
  }

  return (
    <section aria-labelledby="lessons-title" className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
        <h2 id="lessons-title" className="text-xl font-bold">
          Lessons
        </h2>
        <Button variant="soft" onClick={() => setAdding(true)} disabled={adding}>
          + Add lesson
        </Button>
      </div>
      {adding ? (
        <form onSubmit={add} className="flex flex-col gap-3 border-b border-line bg-page px-6 py-4 sm:flex-row">
          <label htmlFor="new-lesson-title" className="sr-only">
            New lesson title
          </label>
          <input id="new-lesson-title" name="title" required minLength={2} maxLength={120} placeholder="Lesson title" autoComplete="off" className={inputClasses()} />
          <div className="flex shrink-0 gap-2">
            <Button type="submit" disabled={busy} aria-busy={busy}>
              Create
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
      {lessons.length === 0 ? (
        <p className="px-6 py-6 text-lg text-muted">No lessons yet. Add the first one.</p>
      ) : (
        <ol>
          {lessons.map((lesson, index) => (
            <li key={lesson.id} className="flex items-center gap-2 border-b border-line py-1.5 pr-3 pl-6 last:border-b-0">
              <span className="w-6 shrink-0 font-semibold text-muted tabular-nums">{index + 1}</span>
              <Link href={`/admin/training/${chapterId}/lessons/${lesson.id}`} className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-[17px] font-semibold hover:underline">
                <span className="truncate">{lesson.title}</span>
                {lesson.adminNote ? (
                  <span title={lesson.adminNote} className="shrink-0 text-warn">
                    <AlertIcon className="size-4" />
                    <span className="sr-only">(has a note to verify)</span>
                  </span>
                ) : null}
              </Link>
              <span className="hidden shrink-0 text-[17px] text-muted sm:block">{lessonMeta(lesson)}</span>
              <span className="flex shrink-0">
                <button type="button" onClick={() => move(index, -1)} disabled={busy || index === 0} aria-label={`Move “${lesson.title}” up`} className="grid size-11 place-items-center rounded-lg text-muted hover:bg-page disabled:opacity-30">
                  <ChevronLeftIcon className="size-5 rotate-90" />
                </button>
                <button type="button" onClick={() => move(index, 1)} disabled={busy || index === lessons.length - 1} aria-label={`Move “${lesson.title}” down`} className="grid size-11 place-items-center rounded-lg text-muted hover:bg-page disabled:opacity-30">
                  <ChevronRightIcon className="size-5 rotate-90" />
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
