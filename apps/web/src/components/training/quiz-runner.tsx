/**
 * File: apps/web/src/components/training/quiz-runner.tsx
 * Purpose: Screen 2c, the quiz in progress: one question per screen with large radio options, progress segments, and
 * a link back to the lesson the question comes from. Each answer is saved as the broker moves on, so "Save and exit"
 * loses nothing. Answers are only marked right or wrong after the whole quiz is submitted (SPEC G-assumed).
 *
 * Functions:
 * - QuizRunner({ attempt }): holds the current question and the chosen answers, saves and submits them.
 * - ProgressSegments({ total, current, answered }): the row of bars above the question.
 */
"use client";

import type { QuizAttemptResponse } from "@bp/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { apiRequest, ApiError } from "@/lib/api-client";

function ProgressSegments({ total, current, answered }: { total: number; current: number; answered: Set<number> }) {
  return (
    <div className="flex gap-2" aria-hidden="true">
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className={`h-2 flex-1 rounded-full ${index === current ? "bg-navy" : answered.has(index) ? "bg-brand" : "bg-line"}`} />
      ))}
    </div>
  );
}

export function QuizRunner({ attempt }: { attempt: QuizAttemptResponse }) {
  const router = useRouter();
  const questions = attempt.questions;
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(questions.filter((question) => question.answeredOptionId).map((question) => [question.id, question.answeredOptionId!])),
  );
  const firstUnanswered = questions.findIndex((question) => !question.answeredOptionId);
  const [index, setIndex] = useState(firstUnanswered === -1 ? Math.max(questions.length - 1, 0) : firstUnanswered);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const question = questions[index];
  if (!question) return null;
  const chosen = answers[question.id] ?? null;
  const isLast = index === questions.length - 1;
  const answeredIndexes = new Set(questions.flatMap((item, itemIndex) => (answers[item.id] ? [itemIndex] : [])));
  const unansweredCount = questions.length - answeredIndexes.size;

  async function saveAndContinue() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/v1/me/training/attempts/${attempt.id}/answers`, { method: "PUT", body: { questionId: question!.id, optionId: chosen } });
      if (!isLast) {
        setIndex(index + 1);
        setBusy(false);
        return;
      }
      const missing = questions.findIndex((item) => !answers[item.id]);
      if (missing !== -1) {
        setIndex(missing);
        setBusy(false);
        return;
      }
      await apiRequest(`/v1/me/training/attempts/${attempt.id}/submit`, { method: "POST" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  const retakeText = attempt.chapter.retakePolicy === "immediate" ? "retakes allowed" : "retakes after a re-read";
  const buttonLabel = !isLast ? "Next question" : unansweredCount > 0 ? "Next unanswered question" : "Finish quiz";

  return (
    <div className="mx-auto max-w-[700px] space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[17px] font-semibold text-muted">
          <p aria-live="polite">
            Question {index + 1} of {questions.length}
          </p>
          <p>
            Pass mark {attempt.chapter.passMark}% · {retakeText}
          </p>
        </div>
        <ProgressSegments total={questions.length} current={index} answered={answeredIndexes} />
      </div>

      <form
        className="space-y-6 rounded-2xl border border-line bg-white px-5 py-7 sm:px-9 sm:py-9"
        onSubmit={(event) => {
          event.preventDefault();
          void saveAndContinue();
        }}
      >
        <fieldset className="space-y-3">
          <legend className="mb-5 text-[24px] leading-snug font-extrabold sm:text-[28px]">{question.prompt}</legend>
          {question.options.map((option) => {
            const selected = chosen === option.id;
            return (
              <label
                key={option.id}
                className={`flex min-h-16 cursor-pointer items-center gap-4 rounded-2xl border-2 px-5 py-4 text-lg transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand ${selected ? "border-brand bg-brand-soft font-semibold" : "border-line hover:border-[#c5d3e8]"}`}
              >
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  value={option.id}
                  checked={selected}
                  onChange={() => setAnswers((current) => ({ ...current, [question.id]: option.id }))}
                  className="size-6 shrink-0 accent-brand"
                />
                {option.label}
              </label>
            );
          })}
        </fieldset>
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
        <Button type="submit" size="xl" className="w-full" disabled={!chosen || busy} aria-busy={busy}>
          {busy ? "Saving…" : buttonLabel}
        </Button>
        {index > 0 ? (
          <button type="button" onClick={() => setIndex(index - 1)} className="mx-auto block min-h-11 rounded-lg px-3 text-[17px] font-semibold text-brand">
            Back to question {index}
          </button>
        ) : null}
      </form>

      {question.lesson ? (
        <p className="text-center text-[17px] text-muted">
          Not sure?{" "}
          <Link href={`/app/training/lessons/${question.lesson.id}`} className="font-semibold text-brand underline underline-offset-2">
            Re-read lesson {question.lesson.position} · {question.lesson.title}
          </Link>{" "}
          — your answers so far are saved.
        </p>
      ) : null}
    </div>
  );
}
