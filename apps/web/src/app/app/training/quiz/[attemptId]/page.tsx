/**
 * File: apps/web/src/app/app/training/quiz/[attemptId]/page.tsx
 * Purpose: Screens 2c and 2d: a quiz attempt with a focused header. While in progress it shows the questions with
 * "Save and exit"; once submitted it shows the result with "Back to training".
 *
 * Functions:
 * - QuizPage({ params }): loads the attempt and renders the quiz or its result.
 */
import type { QuizAttemptResponse } from "@bp/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QuizResult } from "@/components/training/quiz-result";
import { QuizRunner } from "@/components/training/quiz-runner";
import { firstName } from "@/lib/format";
import { requireMe, serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Quiz · 365 Yachts" };

export default async function QuizPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const me = await requireMe();
  const { data: attempt } = await serverGet<QuizAttemptResponse>(`/v1/me/training/attempts/${encodeURIComponent(attemptId)}`, { forbiddenRedirect: "/app/training" });
  if (!attempt) notFound();
  const submitted = attempt.status === "submitted" && attempt.result;
  return (
    <>
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-5 py-4 lg:px-20">
          <p className="text-lg font-bold">Quiz · {attempt.chapter.label}</p>
          <Link href="/app/training" className="inline-flex min-h-11 shrink-0 items-center rounded-lg text-[17px] font-semibold text-muted hover:text-ink">
            {submitted ? "Back to training" : "Save and exit"}
          </Link>
        </div>
      </header>
      <main id="main" className="px-5 pt-8 pb-16 lg:pt-11">
        {submitted ? <QuizResult attempt={attempt} firstName={firstName(me.user.name)} /> : <QuizRunner attempt={attempt} />}
      </main>
    </>
  );
}
