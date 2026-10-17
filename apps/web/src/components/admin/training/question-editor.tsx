/**
 * File: apps/web/src/components/admin/training/question-editor.tsx
 * Purpose: Editing one quiz question on screen 3e: the question, two to six options with exactly one marked correct,
 * the explanation brokers see after the quiz, the lesson it comes from, and an admin-only note. Existing questions
 * show how often brokers get them right the first time.
 *
 * Functions:
 * - QuestionEditor({ chapterId, question, number, lessons, onClose }): the form; creates or updates the question.
 * - blankOptions(): four empty options for a new question.
 */
"use client";

import type { AdminLesson, AdminQuestion } from "@bp/shared";
import { useState, type FormEvent } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { CloseIcon } from "@/components/ui/icons";
import { FieldLabel, inputClasses, selectClasses } from "@/components/ui/misc";
import { apiRequest } from "@/lib/api-client";
import { useAction } from "./use-action";

type OptionDraft = { key: string; id?: string; label: string; isCorrect: boolean };

function blankOptions(): OptionDraft[] {
  return Array.from({ length: 4 }, (_, index) => ({ key: `new-${index}`, label: "", isCorrect: index === 0 }));
}

export function QuestionEditor({
  chapterId,
  question,
  number,
  lessons,
  onClose,
}: {
  chapterId: string;
  question: AdminQuestion | null;
  number: number;
  lessons: AdminLesson[];
  onClose: () => void;
}) {
  const [options, setOptions] = useState<OptionDraft[]>(() =>
    question ? question.options.map((option) => ({ key: option.id, id: option.id, label: option.label, isCorrect: option.isCorrect })) : blankOptions(),
  );
  const { busy, error, setError, run } = useAction();
  const prefix = question ? `q-${question.id}` : "q-new";
  const lessonNumber = question?.lessonId ? lessons.findIndex((lesson) => lesson.id === question.lessonId) + 1 : 0;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const filled = options.filter((option) => option.label.trim());
    if (filled.length < 2) return setError("Give at least two options.");
    if (filled.filter((option) => option.isCorrect).length !== 1) return setError("Mark exactly one filled-in option as correct.");
    const lessonId = String(form.get("lessonId") ?? "");
    const note = String(form.get("adminNote") ?? "").trim();
    const body = {
      prompt: String(form.get("prompt") ?? "").trim(),
      explanation: String(form.get("explanation") ?? "").trim(),
      lessonId: lessonId || null,
      adminNote: note || null,
      options: filled.map((option) => ({ ...(option.id ? { id: option.id } : {}), label: option.label.trim(), isCorrect: option.isCorrect })),
    };
    const saved = await run(() =>
      question
        ? apiRequest(`/v1/admin/training/questions/${question.id}`, { method: "PATCH", body })
        : apiRequest(`/v1/admin/training/chapters/${chapterId}/questions`, { method: "POST", body }),
    );
    if (saved) onClose();
  }

  async function remove() {
    if (!question || !window.confirm("Delete this question? If brokers have answered it, it's archived instead so the stats stay.")) return;
    const done = await run(() => apiRequest(`/v1/admin/training/questions/${question.id}`, { method: "DELETE" }));
    if (done) onClose();
  }

  return (
    <form onSubmit={save} className="space-y-5 bg-page/60 px-6 py-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[17px] font-semibold text-muted">
          {question ? `Question ${number}` : "New question"}
          {lessonNumber > 0 ? ` · from lesson ${lessonNumber}` : ""}
        </p>
        <button type="button" onClick={onClose} aria-label="Close the editor" className="grid size-11 place-items-center rounded-xl hover:bg-white">
          <CloseIcon />
        </button>
      </div>
      <div>
        <label htmlFor={`${prefix}-prompt`} className="sr-only">
          Question
        </label>
        <input id={`${prefix}-prompt`} name="prompt" required minLength={5} maxLength={500} defaultValue={question?.prompt ?? ""} placeholder="The question brokers answer" autoComplete="off" className={`${inputClasses()} text-lg font-semibold`} />
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
        {options.length < 6 ? (
          <button
            type="button"
            onClick={() => setOptions([...options, { key: `new-${Date.now()}`, label: "", isCorrect: false }])}
            className="min-h-11 rounded-lg px-2 text-base font-semibold text-brand"
          >
            + Add an option
          </button>
        ) : null}
      </fieldset>
      <div>
        <FieldLabel htmlFor={`${prefix}-explanation`}>Explanation (shown after the quiz when someone gets it wrong)</FieldLabel>
        <textarea id={`${prefix}-explanation`} name="explanation" rows={3} maxLength={1000} defaultValue={question?.explanation ?? ""} className={`${inputClasses()} py-3`} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <FieldLabel htmlFor={`${prefix}-lesson`}>From lesson</FieldLabel>
          <select id={`${prefix}-lesson`} name="lessonId" defaultValue={question?.lessonId ?? ""} className={selectClasses()}>
            <option value="">No lesson</option>
            {lessons.map((lesson, index) => (
              <option key={lesson.id} value={lesson.id}>
                {index + 1} · {lesson.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor={`${prefix}-note`}>Admin note (brokers never see it)</FieldLabel>
          <input id={`${prefix}-note`} name="adminNote" maxLength={1000} defaultValue={question?.adminNote ?? ""} placeholder="e.g. verify before publishing" autoComplete="off" className={inputClasses()} />
        </div>
      </div>
      {question && question.stats.firstTimeCorrectPct !== null ? (
        <p className="text-[17px] text-muted">{question.stats.firstTimeCorrectPct}% of brokers get this right first time · answered {question.stats.answered} times</p>
      ) : null}
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
