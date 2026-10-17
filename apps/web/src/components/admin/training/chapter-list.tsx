/**
 * File: apps/web/src/components/admin/training/chapter-list.tsx
 * Purpose: The left column of screen 3e: Volume One and Volume Two chapters with each one's average quiz score (or its
 * Draft / Coming soon status), a flag on chapters with "verify before publishing" notes, and the open one highlighted.
 *
 * Functions:
 * - ChapterList({ chapters, currentId }): renders both volumes.
 * - ChapterLink({ chapter, current }): one chapter row.
 * - rowStatus(chapter): the right-hand text for a row.
 */
import type { AdminChapterRow } from "@bp/shared";
import Link from "next/link";
import { AlertIcon } from "@/components/ui/icons";

function rowStatus(chapter: AdminChapterRow): string {
  if (chapter.status === "draft") return "Draft";
  if (chapter.status === "coming_soon") return "Soon";
  return chapter.averageScore === null ? "Live" : `${chapter.averageScore}%`;
}

function ChapterLink({ chapter, current }: { chapter: AdminChapterRow; current: boolean }) {
  const status = rowStatus(chapter);
  return (
    <li>
      <Link
        href={`/admin/training/${chapter.id}`}
        aria-current={current ? "page" : undefined}
        className={`flex min-h-12 items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-[17px] hover:bg-page ${current ? "bg-brand-soft font-bold" : ""}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span>{chapter.label}</span>
          {chapter.flagged ? (
            <span title="Has notes to verify before publishing" className="shrink-0 text-warn">
              <AlertIcon className="size-4" />
              <span className="sr-only">(has notes to verify)</span>
            </span>
          ) : null}
        </span>
        <span className={`shrink-0 tabular-nums ${chapter.status === "live" ? (current ? "text-brand" : "text-muted") : "text-[15px] font-semibold text-muted"}`}>{status}</span>
      </Link>
    </li>
  );
}

export function ChapterList({ chapters, currentId }: { chapters: AdminChapterRow[]; currentId: string | null }) {
  const volumes = [
    { title: "Volume One", rows: chapters.filter((chapter) => chapter.volume === 1) },
    { title: "Volume Two", rows: chapters.filter((chapter) => chapter.volume === 2) },
  ];
  return (
    <nav aria-label="Chapters" className="rounded-2xl border border-line bg-white px-3 py-5">
      {volumes.map((volume) => (
        <div key={volume.title} className="mb-5 last:mb-0">
          <h2 className="mb-2 px-3.5 text-[15px] font-bold tracking-[0.06em] text-muted uppercase">{volume.title}</h2>
          {volume.rows.length ? (
            <ul className="space-y-0.5">
              {volume.rows.map((chapter) => (
                <ChapterLink key={chapter.id} chapter={chapter} current={chapter.id === currentId} />
              ))}
            </ul>
          ) : (
            <p className="px-3.5 text-base text-muted">No chapters yet.</p>
          )}
        </div>
      ))}
      <p className="mt-4 px-3.5 text-[15px] text-muted">Percent = average quiz score</p>
    </nav>
  );
}
