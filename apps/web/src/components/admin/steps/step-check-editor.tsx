/**
 * File: apps/web/src/components/admin/steps/step-check-editor.tsx
 * Purpose: The optional knowledge check of an onboarding step in the admin step editor (SPEC D28): up to 3
 * multiple-choice questions, each with one correct option and an explanation brokers see after answering. Brokers
 * must answer every question correctly before they can submit the step.
 *
 * Functions:
 * - StepCheckEditor({ stepKey, questions }): the list of questions and the "Add a question" button.
 * - StepQuestionForm({ stepKey, question, onClose }): the form to add or edit one question.
 * - blankOptions(): four empty options with the first marked correct.
 */
"use client";

import { MAX_STEP_CHECK_QUESTIONS, type AdminStepQuestion } from "@bp/shared";
import { useState, type FormEvent } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { CloseIcon } from "@/components/ui/icons";
import { FieldLabel, inputClasses } from "@/components/ui/misc";
import { apiRequest } from "@/lib/api-client";
import { useAction } from "../training/use-action";

type OptionDraft = { key: string; id?: string; label: string; isCorrect: boolean };

function blankOptions(): OptionDraft[] {
  return Array.from({ length: 4 }, (_, index) => ({ key: `new-${index}`, label: "", isCorrect: index === 0 }));
}

function StepQuestionForm({ stepKey, question, onClose }: { stepKey: string; question: AdminStepQuestion | null; onClose: () => void }) {
  const [options, setOptions] = useState<OptionDraft[]>(() =>
    question ? question.options.map((option) => ({ key: option.id, id: option.id, label: option.label, isCorrect: option.isCorrect })) : blankOptions(),
  );
  const { busy, error, setError, run } = useAction();
  const prefix = question ? `sq-${question.id}` : "sq-new";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const filled = options.filter((option) => option.label.trim());
    if (filled.length < 2) return setError("Give at least two options.");
    if (filled.filter((option) => option.isCorrect).length !== 1) return setError("Mark exactly one filled-in option as correct.");
    const body = {
      prompt: String(form.get("prompt") ?? "").trim(),
      explanation: String(form.get("explanation") ?? "").trim(),
      options: filled.map((option) => ({ ...(option.id ? { id: option.id } : {}), label: option.label.trim(), isCorrect: option.isCorrect })),
    };
    const saved = await run(() =>
      question ? apiRequest(`/v1/admin/step-questions/${question.id}`, { method: "PATCH", body }) : apiRequest(`/v1/admin/steps/${stepKey}/questions`, { method: "POST", body }),
    );
    if (saved) onClose();
  }

  async function remove() {
    if (!question || !window.confirm("Delete this question?")) return;
    if (await run(() => apiRequest(`/v1/admin/step-questions/${question.id}`, { method: "DELETE" }))) onClose();
  }

  return (
    <form onSubmit={save} className="space-y-5 bg-page/60 px-6 py-6">
      <div>
        <FieldLabel htmlFor={`${prefix}-prompt`}>Question</FieldLabel>
        <input id={`${prefix}-prompt`} name="prompt" required minLength={5} maxLength={500} defaultValue={question?.prompt ?? ""} autoComplete="off" className={`${inputClasses()} font-semibold`} />
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-[15px] font-bold">Options · pick the correct one</legend>
        {options.map((option, index) => (
          <div key={option.key} className="flex items-center gap-3">
            <input
              type="radio"
              name={`${prefix}-correct`}
              checked={option.isCorrect}
              onChange={() => setOptions(options.map((item) => ({ ...item, isCorrect: item.key === option.key })))}
              aria-label={`Option ${index + 1} is correct`}
              className="size-6 shrink-0 accent-[var(--color-success)]"
            />
            <input
              value={option.label}
              onChange={(event) => setOptions(options.map((item) => (item.key === option.key ? { ...item, label: event.target.value } : item)))}
              maxLength={200}
              aria-label={`Option ${index + 1}`}
              placeholder={`Option ${index + 1}`}
              autoComplete="off"
              className={`${inputClasses()} ${option.isCorrect ? "border-success font-semibold text-success" : ""}`}
            />
            <button
              type="button"
              onClick={() => setOptions(options.filter((item) => item.key !== option.key))}
              disabled={options.length <= 2}
              aria-label={`Remove option ${index + 1}`}
              className="grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-white disabled:opacity-30"
            >
              <CloseIcon className="size-4" />
            </button>
          </div>
        ))}
      </fieldset>
      <div>
        <FieldLabel htmlFor={`${prefix}-explanation`}>Explanation (shown after every answer)</FieldLabel>
        <textarea id={`${prefix}-explanation`} name="explanation" required rows={3} maxLength={1000} defaultValue={question?.explanation ?? ""} className={`${inputClasses()} py-3`} />
      </div>
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? "Saving…" : question ? "Save question" : "Add question"}
        </Button>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        {question ? (
          <Button variant="danger-outline" onClick={() => void remove()} disabled={busy} className="ml-auto">
            Delete
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function StepCheckEditor({ stepKey, questions }: { stepKey: string; questions: AdminStepQuestion[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const full = questions.length >= MAX_STEP_CHECK_QUESTIONS;
  return (
    <section aria-labelledby="check-editor-title" className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
        <div>
          <h2 id="check-editor-title" className="text-xl font-bold">
            Knowledge check · {questions.length} of {MAX_STEP_CHECK_QUESTIONS}
          </h2>
          <p className="text-[15px] text-muted">Optional. Brokers must answer every question correctly before they can send the step.</p>
        </div>
        <Button variant="soft" onClick={() => setOpenId("new")} disabled={full || openId === "new"}>
          + Add a question
        </Button>
      </div>
      {openId === "new" ? <StepQuestionForm stepKey={stepKey} question={null} onClose={() => setOpenId(null)} /> : null}
      {questions.length === 0 && openId !== "new" ? <p className="px-6 py-6 text-lg text-muted">No knowledge check. Brokers can send this step straight away.</p> : null}
      <ol>
        {questions.map((question, index) => (
          <li key={question.id} className="border-b border-line last:border-b-0">
            {openId === question.id ? (
              <StepQuestionForm stepKey={stepKey} question={question} onClose={() => setOpenId(null)} />
            ) : (
              <button type="button" onClick={() => setOpenId(question.id)} className="flex min-h-14 w-full items-center justify-between gap-4 px-6 py-3.5 text-left hover:bg-page">
                <span className="text-[17px] font-semibold">
                  <span className="sr-only">Edit question {index + 1}: </span>
                  {question.prompt}
                </span>
                <span className="shrink-0 text-[15px] text-muted">{question.options.find((option) => option.isCorrect)?.label}</span>
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
