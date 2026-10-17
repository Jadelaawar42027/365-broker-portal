/**
 * File: apps/web/src/app/admin/training/page.tsx
 * Purpose: Entry to screen 3e: opens the first chapter, or shows the empty state with "+ New chapter" when there are
 * none yet.
 *
 * Functions:
 * - TrainingAdminPage(): loads the chapter list and redirects or renders the empty state.
 */
import type { AdminChapterRow } from "@bp/shared";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NewChapterButton } from "@/components/admin/training/new-chapter-button";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Chapters & quizzes · 365 Yachts admin" };

export default async function TrainingAdminPage() {
  const { data } = await serverGet<{ chapters: AdminChapterRow[] }>("/v1/admin/training/chapters");
  const first = data?.chapters[0];
  if (first) redirect(`/admin/training/${first.id}`);
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-[35px] leading-tight font-extrabold tracking-tight">Chapters &amp; quizzes</h1>
        <NewChapterButton />
      </div>
      <p className="rounded-2xl border border-line bg-white px-6 py-8 text-lg text-muted">
        No chapters yet. Run <code className="rounded bg-page px-1.5 py-0.5 text-base">pnpm db:seed</code> to load Volume One, or create a chapter.
      </p>
    </div>
  );
}
