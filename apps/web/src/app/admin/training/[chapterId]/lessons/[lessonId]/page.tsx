/**
 * File: apps/web/src/app/admin/training/[chapterId]/lessons/[lessonId]/page.tsx
 * Purpose: The lesson editor page of screen 3e: back to the chapter, the lesson's text editor with live preview, and
 * its video (embed link or MP4 upload).
 *
 * Functions:
 * - LessonAdminPage({ params }): loads the chapter, finds the lesson and renders the editors.
 */
import type { AdminChapterDetailResponse } from "@bp/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LessonEditor } from "@/components/admin/training/lesson-editor";
import { LessonVideoEditor } from "@/components/admin/training/lesson-video-editor";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Edit lesson · 365 Yachts admin" };

export default async function LessonAdminPage({ params }: { params: Promise<{ chapterId: string; lessonId: string }> }) {
  const { chapterId, lessonId } = await params;
  const { data } = await serverGet<AdminChapterDetailResponse>(`/v1/admin/training/chapters/${encodeURIComponent(chapterId)}`);
  const index = data?.lessons.findIndex((lesson) => lesson.id === lessonId) ?? -1;
  const lesson = data?.lessons[index];
  if (!data || !lesson) notFound();

  return (
    <div className="space-y-6">
      <Link href={`/admin/training/${chapterId}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-lg font-semibold text-brand">
        <ArrowLeftIcon />
        {data.chapter.label}
      </Link>
      <div>
        <p className="text-[15px] font-bold tracking-[0.06em] text-brand uppercase">
          Lesson {index + 1} of {data.lessons.length}
        </p>
        <h1 className="mt-1 text-[32px] leading-tight font-extrabold tracking-tight">{lesson.title}</h1>
      </div>
      <LessonVideoEditor lesson={lesson} />
      <LessonEditor key={lesson.id} chapterId={chapterId} chapterLive={data.chapter.status === "live"} lesson={lesson} />
    </div>
  );
}
