/**
 * File: apps/web/src/components/admin/training-panel.tsx
 * Purpose: The "Training & quizzes" panel on screen 3c: every Volume One chapter with its state, best score and tries,
 * chapters where the broker needs a hand in red, and "Allow another retake" for a failed quiz that is waiting on a
 * re-read.
 *
 * Functions:
 * - TrainingPanel({ brokerId, training }): renders the table and the retake buttons.
 * - chapterState(chapter): the line under the chapter name and its colour.
 * - AllowRetakeButton({ brokerId, chapter }): lets the broker retake that chapter's quiz now, then refreshes.
 */
"use client";

import type { BrokerTrainingResponse } from "@bp/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { apiRequest, ApiError } from "@/lib/api-client";

type Chapter = BrokerTrainingResponse["chapters"][number];

function chapterState(chapter: Chapter): { text: string; className: string } {
  if (chapter.state === "passed") return { text: "Passed", className: "font-semibold text-success" };
  if (chapter.tries > 0) {
    return chapter.needsHelp ? { text: "Not passed yet — needs help", className: "font-semibold text-danger" } : { text: "Not passed yet", className: "font-semibold text-warn" };
  }
  if (chapter.state === "in_progress") return { text: `Reading · ${chapter.lessonsCompleted} of ${chapter.lessonsTotal} lessons`, className: "text-brand font-semibold" };
  if (chapter.state === "available") return { text: "Ready to start", className: "text-brand font-semibold" };
  return { text: "Locked", className: "text-muted" };
}

function AllowRetakeButton({ brokerId, chapter }: { brokerId: string; chapter: Chapter }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function allow() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/v1/admin/training/brokers/${brokerId}/chapters/${chapter.id}/allow-retake`, { method: "POST" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <Button variant="outline" size="lg" onClick={allow} disabled={busy} aria-busy={busy}>
        Allow another retake · {chapter.code === "0" ? "Part 0" : chapter.code}
      </Button>
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
    </div>
  );
}

export function TrainingPanel({ brokerId, training }: { brokerId: string; training: BrokerTrainingResponse }) {
  const waiting = training.chapters.filter((chapter) => chapter.state !== "passed" && chapter.tries > 0 && !chapter.canRetake);
  return (
    <section aria-labelledby="training-title" className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-6 py-5">
        <h2 id="training-title" className="text-xl font-bold">
          Training &amp; quizzes
        </h2>
        <p className="text-[17px] text-muted">
          {training.open ? `${training.summary.chaptersPassed} of ${training.summary.chaptersTotal} chapters passed` : "Opens when onboarding is approved"}
        </p>
      </div>
      {training.chapters.length === 0 ? (
        <p className="px-6 py-6 text-lg text-muted">No chapters are published yet.</p>
      ) : (
        <table className="w-full text-left text-[17px]">
          <thead className="bg-[#f2f5fa] text-[15px] font-semibold text-muted">
            <tr>
              <th scope="col" className="px-6 py-3">Chapter</th>
              <th scope="col" className="px-3 py-3">Best</th>
              <th scope="col" className="px-3 py-3">Tries</th>
            </tr>
          </thead>
          <tbody>
            {training.chapters.map((chapter) => {
              const state = chapterState(chapter);
              return (
                <tr key={chapter.id} className="border-t border-line">
                  <th scope="row" className="px-6 py-3.5 font-normal">
                    <span className="block font-semibold">{chapter.label}</span>
                    <span className={`block text-[15px] ${state.className}`}>{state.text}</span>
                  </th>
                  <td className="px-3 py-3.5 font-bold tabular-nums">{chapter.bestScore === null ? "—" : `${chapter.bestScore}%`}</td>
                  <td className="px-3 py-3.5 tabular-nums text-muted">{chapter.tries || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {waiting.length ? (
        <div className="flex flex-wrap gap-3 border-t border-line px-6 py-5">
          {waiting.map((chapter) => (
            <AllowRetakeButton key={chapter.id} brokerId={brokerId} chapter={chapter} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
