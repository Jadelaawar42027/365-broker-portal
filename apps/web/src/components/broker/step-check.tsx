/**
 * File: apps/web/src/components/broker/step-check.tsx
 * Purpose: The optional knowledge check on an onboarding step (SPEC D28): up to 3 multiple-choice questions, each
 * checked one at a time against the API. A wrong answer shows the explanation and can be tried again; a right answer
 * locks in. The step's send button stays disabled until every answer is right.
 *
 * Functions:
 * - StepCheck({ stepKey, questions, answers, onCorrect }): the list of questions.
 * - CheckQuestion({ stepKey, question, number, correctOptionId, onCorrect }): one question with its options, check button and result.
 */
"use client";

import type { StepCheckQuestionView, StepCheckResponse } from "@bp/shared";
import { useState } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { CheckIcon } from "@/components/ui/icons";
import { apiRequest, ApiError } from "@/lib/api-client";

function CheckQuestion({
  stepKey,
  question,
  number,
  correctOptionId,
  onCorrect,
}: {
  stepKey: string;
  question: StepCheckQuestionView;
  number: number;
  correctOptionId: string | null;
  onCorrect: (optionId: string) => void;
}) {
  const [chosen, setChosen] = useState<string | null>(correctOptionId);
  const [result, setResult] = useState<StepCheckResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = correctOptionId !== null;

  async function check() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      const response = await apiRequest<StepCheckResponse>(`/v1/me/steps/${stepKey}/check`, { method: "POST", body: { questionId: question.id, optionId: chosen } });
      setResult(response);
      if (response.correct) onCorrect(chosen);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't check that answer. Please try again.");
    }
    setBusy(false);
  }

  return (
    <fieldset className="space-y-3">
      <legend className="mb-3 text-lg font-bold">
        <span className="sr-only">Question {number}: </span>
        {question.prompt}
      </legend>
      {question.options.map((option) => (
        <label
          key={option.id}
          className={`flex min-h-14 cursor-pointer items-center gap-4 rounded-xl border-2 px-4 py-3 text-[17px] has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand ${chosen === option.id ? "border-brand bg-brand-soft font-semibold" : "border-line"} ${locked ? "cursor-default" : "hover:border-[#c5d3e8]"}`}
        >
          <input
            type="radio"
            name={`check-${question.id}`}
            value={option.id}
            checked={chosen === option.id}
            disabled={locked}
            onChange={() => {
              setChosen(option.id);
              setResult(null);
            }}
            className="size-5 shrink-0 accent-brand"
          />
          {option.label}
        </label>
      ))}
      {result ? (
        <div role="status" className={`rounded-xl px-5 py-3.5 text-[17px] leading-relaxed ${result.correct ? "bg-success-soft text-[#123f24]" : "bg-danger-soft text-ink"}`}>
          <p className="flex items-center gap-2 font-bold">
            {result.correct ? <CheckIcon className="size-5 text-success" /> : null}
            {result.correct ? "That's right." : "Not quite. Try again."}
          </p>
          <p className="mt-1">{result.explanation}</p>
        </div>
      ) : null}
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      {!locked ? (
        <Button variant="outline" onClick={() => void check()} disabled={!chosen || busy} aria-busy={busy}>
          {busy ? "Checking…" : "Check my answer"}
        </Button>
      ) : null}
    </fieldset>
  );
}

export function StepCheck({
  stepKey,
  questions,
  answers,
  onCorrect,
}: {
  stepKey: string;
  questions: StepCheckQuestionView[];
  answers: Record<string, string>;
  onCorrect: (questionId: string, optionId: string) => void;
}) {
  const done = questions.filter((question) => answers[question.id]).length;
  return (
    <section aria-labelledby="check-title" className="space-y-6 rounded-2xl border border-line bg-white px-6 py-6 sm:px-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="check-title" className="text-xl font-bold">
          Quick check
        </h2>
        <p className="text-[15px] font-semibold text-muted" aria-live="polite">
          {done} of {questions.length} right · answer to unlock sending
        </p>
      </div>
      {questions.map((question, index) => (
        <CheckQuestion
          key={question.id}
          stepKey={stepKey}
          question={question}
          number={index + 1}
          correctOptionId={answers[question.id] ?? null}
          onCorrect={(optionId) => onCorrect(question.id, optionId)}
        />
      ))}
    </section>
  );
}
