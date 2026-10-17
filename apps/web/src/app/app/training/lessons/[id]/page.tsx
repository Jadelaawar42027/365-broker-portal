/**
 * File: apps/web/src/app/app/training/lessons/[id]/page.tsx
 * Purpose: Screen 2b, one lesson: a focused header (All chapters, chapter name), the chapter's lesson list with the
 * quiz at the bottom, and the lesson card with its video, text, callouts and the buttons to move on.
 *
 * Functions:
 * - LessonPage({ params }): loads the lesson and renders the screen.
 * - LessonList({ lesson }): the left-hand list of the chapter's lessons and its quiz (locked until every lesson is done).
 */
import type { TrainingLessonResponse } from "@bp/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LessonBody } from "@/components/training/lesson-body";
import { LessonView } from "@/components/training/lesson-view";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, LockIcon } from "@/components/ui/icons";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Lesson · 365 Yachts" };

function LessonList({ lesson }: { lesson: TrainingLessonResponse }) {
  const allDone = lesson.lessons.every((item) => item.completed || item.id === lesson.id);
  return (
    <nav aria-label="Lessons in this chapter" className="rounded-2xl border border-line bg-white p-3">
      <ol>
        {lesson.lessons.map((item, index) => {
          const current = item.id === lesson.id;
          return (
            <li key={item.id}>
              <Link
                href={`/app/training/lessons/${item.id}`}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-12 items-center gap-3 rounded-xl px-3 py-2.5 text-[17px] ${current ? "bg-brand-soft font-bold" : item.completed ? "" : "text-muted"} hover:bg-page`}
              >
                {item.completed && !current ? (
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-success-soft text-success">
                    <CheckIcon className="size-4" />
                    <span className="sr-only">Done:</span>
                  </span>
                ) : (
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full text-[14px] font-bold ${current ? "bg-brand text-white" : "bg-neutral-soft text-muted"}`}>{index + 1}</span>
                )}
                {item.title}
              </Link>
            </li>
          );
        })}
      </ol>
      {lesson.quizQuestionCount > 0 ? (
        <p className={`mt-2 flex items-center gap-3 border-t border-line px-3 pt-4 pb-2 text-[17px] ${allDone ? "font-semibold" : "text-muted"}`}>
          <span className={`grid size-7 shrink-0 place-items-center rounded-full ${allDone ? "bg-brand-soft text-brand" : "bg-neutral-soft text-muted"}`}>
            {allDone ? <ArrowRightIcon className="size-3.5" /> : <LockIcon className="size-3.5" />}
          </span>
          Chapter quiz · {lesson.quizQuestionCount} questions
        </p>
      ) : null}
    </nav>
  );
}

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: lesson } = await serverGet<TrainingLessonResponse>(`/v1/me/training/lessons/${encodeURIComponent(id)}`, { forbiddenRedirect: "/app/training" });
  if (!lesson) notFound();
  return (
    <>
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-20">
          <Link href="/app/training" className="inline-flex min-h-11 items-center gap-2 self-start rounded-lg text-lg font-semibold text-brand">
            <ArrowLeftIcon />
            All chapters
          </Link>
          <p className="text-base font-semibold text-muted">{lesson.chapter.label}</p>
        </div>
      </header>
      <main id="main" className="mx-auto grid max-w-[1280px] gap-6 px-5 pt-8 pb-16 lg:grid-cols-[264px_minmax(0,1fr)] lg:gap-7 lg:px-[112px] lg:pt-11">
        <div className="order-2 min-w-0 lg:order-1">
          <LessonList lesson={lesson} />
        </div>
        <article className="order-1 min-w-0 space-y-6 rounded-2xl border border-line bg-white px-5 py-7 sm:px-10 sm:py-10 lg:order-2" aria-labelledby="lesson-title">
          <div>
            <p className="text-[15px] font-bold tracking-[0.06em] text-brand uppercase">
              Lesson {lesson.position} of {lesson.lessonsTotal} · {lesson.readMinutes} min {lesson.kind === "text" ? "read" : "watch"}
            </p>
            <h1 id="lesson-title" className="mt-2 text-[30px] leading-tight font-extrabold tracking-tight sm:text-[34px]">
              {lesson.title}
            </h1>
          </div>
          <LessonView lesson={lesson}>
            <LessonBody markdown={lesson.bodyMd} />
          </LessonView>
        </article>
      </main>
    </>
  );
}
