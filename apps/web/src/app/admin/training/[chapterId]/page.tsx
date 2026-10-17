/**
 * File: apps/web/src/app/admin/training/[chapterId]/page.tsx
 * Purpose: Screen 3e for one chapter: the chapter list on the left, and on the right the chapter's settings and
 * publish button, its lessons, and its quiz questions with per-question stats.
 *
 * Functions:
 * - ChapterAdminPage({ params }): loads the chapter list and this chapter, then renders the screen.
 */
import type { AdminChapterDetailResponse, AdminChapterRow } from "@bp/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChapterList } from "@/components/admin/training/chapter-list";
import { ChapterSettings } from "@/components/admin/training/chapter-settings";
import { LessonsCard } from "@/components/admin/training/lessons-card";
import { NewChapterButton } from "@/components/admin/training/new-chapter-button";
import { QuestionsCard } from "@/components/admin/training/questions-card";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Chapters & quizzes · 365 Yachts admin" };

export default async function ChapterAdminPage({ params }: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await params;
  const [{ data: list }, { data: detail }] = await Promise.all([
    serverGet<{ chapters: AdminChapterRow[] }>("/v1/admin/training/chapters"),
    serverGet<AdminChapterDetailResponse>(`/v1/admin/training/chapters/${encodeURIComponent(chapterId)}`),
  ]);
  if (!detail) notFound();
  const activeQuestions = detail.questions.filter((question) => question.active).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-[35px] leading-tight font-extrabold tracking-tight">Chapters &amp; quizzes</h1>
        <NewChapterButton />
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <ChapterList chapters={list?.chapters ?? []} currentId={detail.chapter.id} />
        <div className="min-w-0 space-y-5">
          <ChapterSettings key={detail.chapter.id} chapter={detail.chapter} activeQuestions={activeQuestions} />
          {detail.chapter.status === "coming_soon" ? (
            <p className="rounded-2xl border border-line bg-white px-6 py-6 text-lg text-muted">
              Brokers see this chapter as “coming soon” on their training page. Move it to draft to start adding lessons and questions.
            </p>
          ) : (
            <>
              <LessonsCard chapterId={detail.chapter.id} lessons={detail.lessons} />
              <QuestionsCard key={detail.chapter.id} chapterId={detail.chapter.id} questions={detail.questions} lessons={detail.lessons} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
