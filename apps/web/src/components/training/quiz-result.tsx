/**
 * File: apps/web/src/components/training/quiz-result.tsx
 * Purpose: Screen 2d, the quiz result: the score ring, passed or not against the pass mark, what to do next (start the
 * next chapter, retake, or re-read the lessons behind the missed questions), and each missed question with the broker's
 * answer, the correct answer and the explanation.
 *
 * Functions:
 * - ScoreRing({ scorePct, correctCount, totalCount, passed }): the circular score.
 * - QuizResult({ attempt, firstName }): the whole result screen.
 */
import type { QuizAttemptResponse } from "@bp/shared";
import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { ArrowRightIcon } from "@/components/ui/icons";
import { Pill } from "@/components/ui/pill";
import { StartQuizButton } from "./start-quiz-button";

function ScoreRing({ scorePct, correctCount, totalCount, passed }: { scorePct: number; correctCount: number; totalCount: number; passed: boolean }) {
  const radius = 66;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative size-[160px]" role="img" aria-label={`Score ${scorePct}%, ${correctCount} of ${totalCount} right`}>
      <svg viewBox="0 0 160 160" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="80" cy="80" r={radius} fill="none" stroke="var(--color-line)" strokeWidth="12" />
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke={passed ? "var(--color-brand)" : "var(--color-warn)"}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - scorePct / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className="text-[34px] leading-none font-extrabold tracking-tight">{scorePct}%</span>
        <span className="mt-1 text-[15px] font-semibold text-muted">
          {correctCount} of {totalCount}
        </span>
      </div>
    </div>
  );
}

export function QuizResult({ attempt, firstName }: { attempt: QuizAttemptResponse; firstName: string }) {
  const result = attempt.result!;
  const missedTitle = result.missed.length === 1 ? "The one you missed" : `The ${result.missed.length} you missed`;
  return (
    <div className="mx-auto max-w-[700px] space-y-8">
      <section aria-labelledby="result-title" className="flex flex-col items-center gap-5 rounded-2xl border border-line bg-white px-5 py-9 text-center sm:px-10">
        <ScoreRing scorePct={result.scorePct} correctCount={result.correctCount} totalCount={result.totalCount} passed={result.passed} />
        <Pill tone={result.passed ? "success" : "warning"}>
          {result.passed ? "Passed" : "Not passed yet"} · pass mark {attempt.chapter.passMark}%
        </Pill>
        <h1 id="result-title" className="text-[30px] leading-tight font-extrabold">
          {result.passed ? `Nice work, ${firstName}.` : attempt.chapter.passMark - result.scorePct <= 15 ? `Close, ${firstName}. Let's go again.` : `Not quite yet, ${firstName}. Let's go again.`}
        </h1>
        {result.passed ? (
          result.nextChapter ? (
            <>
              <p className="text-xl text-muted">Chapter {result.nextChapter.label} is now open.</p>
              <LinkButton href={`/app/training/chapters/${result.nextChapter.id}`} size="xl">
                Start chapter {result.nextChapter.label.split(" · ")[0]}
                <ArrowRightIcon />
              </LinkButton>
            </>
          ) : (
            <>
              <p className="text-xl text-muted">That&apos;s every chapter open to you so far.</p>
              <LinkButton href="/app/training" size="xl">
                Back to training
                <ArrowRightIcon />
              </LinkButton>
            </>
          )
        ) : result.canRetake ? (
          <>
            <p className="text-xl text-muted">You need {attempt.chapter.passMark}% to pass. You can take the quiz again now.</p>
            <StartQuizButton chapterId={attempt.chapter.id} size="xl" label={<>Retake the quiz <ArrowRightIcon /></>} />
          </>
        ) : (
          <>
            <p className="text-xl text-muted">Re-read the lessons below, then the retake opens. You need {attempt.chapter.passMark}% to pass.</p>
            {result.lessonsToReread.length ? (
              <ul className="w-full max-w-[460px] space-y-2 text-left">
                {result.lessonsToReread.map((lesson) => (
                  <li key={lesson.id}>
                    <Link href={`/app/training/lessons/${lesson.id}`} className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-line px-5 py-3 text-lg font-semibold hover:bg-page">
                      Lesson {lesson.position} · {lesson.title}
                      <ArrowRightIcon className="size-5 shrink-0 text-brand" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </section>

      {result.missed.length ? (
        <section aria-labelledby="missed-title" className="space-y-4">
          <h2 id="missed-title" className="text-[24px] font-extrabold">
            {missedTitle}
          </h2>
          {result.missed.map((item) => (
            <article key={item.questionId} className="space-y-3 rounded-2xl border border-line bg-white px-5 py-6 sm:px-7">
              <h3 className="text-xl leading-snug font-bold">{item.prompt}</h3>
              <p className="flex flex-col gap-1 rounded-xl bg-danger-soft px-5 py-3.5 text-lg sm:flex-row sm:items-baseline sm:gap-4">
                <span className="text-[15px] font-extrabold tracking-[0.04em] text-danger uppercase">Your answer</span>
                <span>{item.yourAnswer ?? "No answer"}</span>
              </p>
              <p className="flex flex-col gap-1 rounded-xl bg-success-soft px-5 py-3.5 text-lg sm:flex-row sm:items-baseline sm:gap-4">
                <span className="text-[15px] font-extrabold tracking-[0.04em] text-success uppercase">Correct</span>
                <span className="font-bold">{item.correctAnswer}</span>
              </p>
              <p className="text-[17px] leading-relaxed text-muted">
                {item.explanation}{" "}
                {item.lesson ? (
                  <Link href={`/app/training/lessons/${item.lesson.id}`} className="font-semibold text-brand underline underline-offset-2">
                    Review lesson {item.lesson.position}
                  </Link>
                ) : null}
              </p>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
