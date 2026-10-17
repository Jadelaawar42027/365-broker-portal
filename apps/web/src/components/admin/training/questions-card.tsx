/**
 * File: apps/web/src/components/admin/training/questions-card.tsx
 * Purpose: The "Quiz questions" card on screen 3e: every active question with how often brokers get it right (amber
 * when under 70%), one open in the editor at a time, "+ Add question", and archived questions kept for their stats.
 *
 * Functions:
 * - QuestionsCard({ chapterId, questions, lessons }): renders the list and the editor.
 * - QuestionStat({ question }): the "91% correct" text or the amber pill for a hard question.
 */
"use client";

import type { AdminLesson, AdminQuestion } from "@bp/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertIcon } from "@/components/ui/icons";
import { Pill } from "@/components/ui/pill";
import { QuestionEditor } from "./question-editor";

const HARD_QUESTION_PCT = 70;

function QuestionStat({ question }: { question: AdminQuestion }) {
  if (question.stats.correctPct === null) return <span className="shrink-0 text-[15px] text-muted">No answers yet</span>;
  if (question.stats.correctPct < HARD_QUESTION_PCT) return <Pill tone="warning">{question.stats.correctPct}% correct</Pill>;
  return <span className="shrink-0 text-[17px] text-muted tabular-nums">{question.stats.correctPct}% correct</span>;
}

export function QuestionsCard({ chapterId, questions, lessons }: { chapterId: string; questions: AdminQuestion[]; lessons: AdminLesson[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const active = questions.filter((question) => question.active);
  const archived = questions.filter((question) => !question.active);

  return (
    <section aria-labelledby="questions-title" className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
        <h2 id="questions-title" className="text-xl font-bold">
          Quiz questions · {active.length}
        </h2>
        <Button variant="soft" onClick={() => setOpenId("new")} disabled={openId === "new"}>
          + Add question
        </Button>
      </div>
      {openId === "new" ? <QuestionEditor chapterId={chapterId} question={null} number={active.length + 1} lessons={lessons} onClose={() => setOpenId(null)} /> : null}
      {active.length === 0 && openId !== "new" ? <p className="px-6 py-6 text-lg text-muted">No questions yet. Brokers need at least one to take the quiz.</p> : null}
      <ol>
        {active.map((question, index) => (
          <li key={question.id} className="border-b border-line last:border-b-0">
            {openId === question.id ? (
              <QuestionEditor chapterId={chapterId} question={question} number={index + 1} lessons={lessons} onClose={() => setOpenId(null)} />
            ) : (
              <button type="button" onClick={() => setOpenId(question.id)} className="flex min-h-14 w-full items-center justify-between gap-4 px-6 py-3.5 text-left hover:bg-page">
                <span className="flex min-w-0 items-center gap-2 text-[17px] font-semibold">
                  <span className="sr-only">Edit question {index + 1}: </span>
                  {question.prompt}
                  {question.adminNote ? (
                    <span title={question.adminNote} className="shrink-0 text-warn">
                      <AlertIcon className="size-4" />
                      <span className="sr-only">(has a note to verify)</span>
                    </span>
                  ) : null}
                </span>
                <QuestionStat question={question} />
              </button>
            )}
          </li>
        ))}
      </ol>
      {archived.length ? (
        <details className="border-t border-line px-6 py-4">
          <summary className="min-h-11 cursor-pointer content-center text-[17px] font-semibold text-muted">Archived questions · {archived.length}</summary>
          <ul className="mt-2 space-y-2">
            {archived.map((question) => (
              <li key={question.id} className="flex items-center justify-between gap-4 text-[17px] text-muted">
                <span>{question.prompt}</span>
                <span className="shrink-0 tabular-nums">{question.stats.correctPct === null ? "—" : `${question.stats.correctPct}% correct`}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
