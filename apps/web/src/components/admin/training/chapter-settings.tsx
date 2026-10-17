/**
 * File: apps/web/src/components/admin/training/chapter-settings.tsx
 * Purpose: The chapter card at the top of screen 3e: the chapter name with its status (Live, Draft, Coming soon), the
 * pass mark, questions per attempt and "after a fail" rule (saved as soon as they change), Publish / Unpublish, an
 * "Edit details" form for code, title, summary and schedule label, and deleting a draft.
 *
 * Functions:
 * - ChapterSettings({ chapter, activeQuestions }): renders the card.
 * - statusPill(status): the pill tone and text for a chapter status.
 * - DetailsForm({ chapter, onDone }): the inline form for code, title, summary and schedule label.
 * - passMarkOptions(current): the pass marks offered, always including the current one.
 */
"use client";

import type { AdminChapterDetailResponse, ChapterStatus } from "@bp/shared";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { FieldLabel, inputClasses, selectClasses } from "@/components/ui/misc";
import { Pill, type PillTone } from "@/components/ui/pill";
import { apiRequest } from "@/lib/api-client";
import { useAction } from "./use-action";

type Chapter = AdminChapterDetailResponse["chapter"];

function statusPill(status: ChapterStatus): { tone: PillTone; text: string } {
  if (status === "live") return { tone: "success", text: "Live" };
  if (status === "coming_soon") return { tone: "brand-soft", text: "Coming soon" };
  return { tone: "neutral", text: "Draft" };
}

function passMarkOptions(current: number): number[] {
  return [...new Set([50, 60, 70, 75, 80, 85, 90, 95, 100, current])].sort((a, b) => a - b);
}

function DetailsForm({ chapter, onDone }: { chapter: Chapter; onDone: () => void }) {
  const { busy, error, run } = useAction();
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const schedule = String(form.get("scheduleLabel") ?? "").trim();
    const saved = await run(() =>
      apiRequest(`/v1/admin/training/chapters/${chapter.id}`, {
        method: "PATCH",
        body: {
          code: String(form.get("code") ?? "").trim(),
          title: String(form.get("title") ?? "").trim(),
          summary: String(form.get("summary") ?? "").trim(),
          ...(chapter.volume === 2 ? { scheduleLabel: schedule || null } : {}),
        },
      }),
    );
    if (saved) onDone();
  }
  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-4 rounded-xl bg-page p-5">
      <div className="grid gap-4 sm:grid-cols-[120px_minmax(0,1fr)]">
        <div>
          <FieldLabel htmlFor="details-code">Code</FieldLabel>
          <input id="details-code" name="code" required maxLength={10} defaultValue={chapter.code} autoComplete="off" className={inputClasses()} />
        </div>
        <div>
          <FieldLabel htmlFor="details-title">Title</FieldLabel>
          <input id="details-title" name="title" required minLength={2} maxLength={120} defaultValue={chapter.title} autoComplete="off" className={inputClasses()} />
        </div>
      </div>
      <div>
        <FieldLabel htmlFor="details-summary">One-line summary</FieldLabel>
        <input id="details-summary" name="summary" maxLength={300} defaultValue={chapter.summary} autoComplete="off" className={inputClasses()} />
      </div>
      {chapter.volume === 2 ? (
        <div>
          <FieldLabel htmlFor="details-schedule">When to read it</FieldLabel>
          <input id="details-schedule" name="scheduleLabel" maxLength={60} defaultValue={chapter.scheduleLabel ?? ""} autoComplete="off" className={inputClasses()} />
        </div>
      ) : null}
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? "Saving…" : "Save details"}
        </Button>
      </div>
    </form>
  );
}

export function ChapterSettings({ chapter, activeQuestions }: { chapter: Chapter; activeQuestions: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const { busy, error, run } = useAction();
  const pill = statusPill(chapter.status);
  const perAttemptMax = Math.max(activeQuestions, chapter.questionsPerAttempt, 1);

  function update(body: Record<string, unknown>) {
    void run(() => apiRequest(`/v1/admin/training/chapters/${chapter.id}`, { method: "PATCH", body }));
  }

  async function remove() {
    if (!window.confirm(`Delete ${chapter.label}? Its lessons and questions are deleted too.`)) return;
    const done = await run(() => apiRequest(`/v1/admin/training/chapters/${chapter.id}`, { method: "DELETE" }), { refresh: false });
    if (done) {
      router.push("/admin/training");
      router.refresh();
    }
  }

  return (
    <section aria-labelledby="chapter-title" className="rounded-2xl border border-line bg-white px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="chapter-title" className="text-[26px] leading-tight font-extrabold tracking-tight">
            {chapter.label}
          </h2>
          {chapter.summary ? <p className="mt-1 text-[17px] text-muted">{chapter.summary}</p> : null}
        </div>
        <Pill tone={pill.tone}>{pill.text}</Pill>
      </div>

      {chapter.volume === 1 || chapter.status !== "coming_soon" ? (
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div>
            <FieldLabel htmlFor="pass-mark">Pass mark</FieldLabel>
            <select id="pass-mark" value={chapter.passMark} disabled={busy} onChange={(event) => update({ passMark: Number(event.target.value) })} className={selectClasses()}>
              {passMarkOptions(chapter.passMark).map((value) => (
                <option key={value} value={value}>
                  {value}%
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel htmlFor="per-attempt">Questions per attempt</FieldLabel>
            <select id="per-attempt" value={chapter.questionsPerAttempt} disabled={busy} onChange={(event) => update({ questionsPerAttempt: Number(event.target.value) })} className={selectClasses()}>
              {Array.from({ length: perAttemptMax }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>
                  {value} of {activeQuestions}
                  {value < activeQuestions ? " (shuffled)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel htmlFor="retake-policy">After a fail</FieldLabel>
            <select id="retake-policy" value={chapter.retakePolicy} disabled={busy} onChange={(event) => update({ retakePolicy: event.target.value })} className={selectClasses()}>
              <option value="reread">Re-read, then retake</option>
              <option value="immediate">Retake straight away</option>
            </select>
          </div>
        </div>
      ) : null}

      {editing ? <DetailsForm chapter={chapter} onDone={() => setEditing(false)} /> : null}
      {error ? (
        <div className="mt-4">
          <FormMessage tone="error">{error}</FormMessage>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-5">
        {chapter.status === "live" ? (
          <Button variant="outline" disabled={busy} onClick={() => void run(() => apiRequest(`/v1/admin/training/chapters/${chapter.id}/unpublish`, { method: "POST" }))}>
            Unpublish
          </Button>
        ) : (
          <Button disabled={busy} onClick={() => void run(() => apiRequest(`/v1/admin/training/chapters/${chapter.id}/publish`, { method: "POST" }))}>
            Publish to brokers
          </Button>
        )}
        {chapter.status === "coming_soon" ? (
          <Button variant="outline" disabled={busy} onClick={() => update({ comingSoon: false })}>
            Move to draft
          </Button>
        ) : null}
        {chapter.status === "draft" && chapter.volume === 2 ? (
          <Button variant="outline" disabled={busy} onClick={() => update({ comingSoon: true })}>
            Show as coming soon
          </Button>
        ) : null}
        {!editing ? (
          <Button variant="outline" onClick={() => setEditing(true)}>
            Edit details
          </Button>
        ) : null}
        {chapter.status !== "live" ? (
          <Button variant="danger-outline" disabled={busy} onClick={() => void remove()} className="ml-auto">
            Delete chapter
          </Button>
        ) : null}
        {chapter.status === "live" && chapter.publishedAt ? <p className="text-[15px] text-muted">Brokers see this chapter. Edits show up straight away.</p> : null}
      </div>
    </section>
  );
}
