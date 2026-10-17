/**
 * File: apps/web/src/app/app/training/chapters/[id]/page.tsx
 * Purpose: Opening a chapter from the training home sends the broker to the right place: the quiz in progress, the
 * last result while a retake still needs lessons re-read, the first unread lesson, or lesson 1 to review.
 *
 * Functions:
 * - ChapterPage({ params }): loads the chapter and redirects.
 * - chapterDestination(chapter): the address to send the broker to.
 */
import type { TrainingChapterResponse } from "@bp/shared";
import { notFound, redirect } from "next/navigation";
import { serverGet } from "@/lib/server-api";

function chapterDestination(chapter: TrainingChapterResponse): string {
  const { quiz, lessons } = chapter;
  if (quiz.inProgressAttemptId) return `/app/training/quiz/${quiz.inProgressAttemptId}`;
  if (quiz.availability === "reread_required" && quiz.lastAttemptId) return `/app/training/quiz/${quiz.lastAttemptId}`;
  const firstUnread = lessons.find((lesson) => !lesson.completed);
  if (firstUnread) return `/app/training/lessons/${firstUnread.id}`;
  if (!quiz.passed && quiz.lastAttemptId) return `/app/training/quiz/${quiz.lastAttemptId}`;
  const last = quiz.passed ? lessons[0] : lessons.at(-1);
  return last ? `/app/training/lessons/${last.id}` : "/app/training";
}

export default async function ChapterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await serverGet<TrainingChapterResponse>(`/v1/me/training/chapters/${encodeURIComponent(id)}`, { forbiddenRedirect: "/app/training" });
  if (!data) notFound();
  if (data.chapter.state === "locked") redirect("/app/training");
  redirect(chapterDestination(data));
}
