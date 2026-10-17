/**
 * File: apps/web/src/components/admin/training/new-chapter-button.tsx
 * Purpose: The "+ New chapter" button on screen 3e and its dialog: volume, code, title, short summary, and for Volume
 * Two an optional schedule label and "coming soon". New chapters start as drafts; the editor opens once it is created.
 *
 * Functions:
 * - NewChapterButton(): the button and the dialog with its form.
 */
"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { CloseIcon } from "@/components/ui/icons";
import { FieldLabel, inputClasses } from "@/components/ui/misc";
import { apiRequest } from "@/lib/api-client";
import { useAction } from "./use-action";

export function NewChapterButton() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [volume, setVolume] = useState(1);
  const { busy, error, run } = useAction();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const schedule = String(form.get("scheduleLabel") ?? "").trim();
    const created = await run(
      () =>
        apiRequest<{ id: string }>("/v1/admin/training/chapters", {
          method: "POST",
          body: {
            volume,
            code: String(form.get("code") ?? "").trim(),
            title: String(form.get("title") ?? "").trim(),
            summary: String(form.get("summary") ?? "").trim(),
            ...(volume === 2 ? { scheduleLabel: schedule || null, comingSoon: form.get("comingSoon") === "on" } : {}),
          },
        }),
      { refresh: false },
    );
    if (created) {
      dialogRef.current?.close();
      router.push(`/admin/training/${created.id}`);
      router.refresh();
    }
  }

  return (
    <>
      <Button size="lg" onClick={() => dialogRef.current?.showModal()}>
        + New chapter
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby="new-chapter-title"
        className="m-auto w-[min(560px,calc(100vw-32px))] rounded-2xl border border-line bg-white p-0 text-ink overscroll-contain backdrop:bg-navy/50"
      >
        <form onSubmit={handleSubmit} className="space-y-5 p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="new-chapter-title" className="text-[26px] font-extrabold tracking-tight">
                New chapter
              </h2>
              <p className="mt-1 text-base text-muted">It starts as a draft. Brokers see it only once you publish it.</p>
            </div>
            <button type="button" aria-label="Close" onClick={() => dialogRef.current?.close()} className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-page">
              <CloseIcon />
            </button>
          </div>
          <fieldset>
            <legend className="mb-2 block text-[15px] font-bold">Volume</legend>
            <div className="flex gap-2">
              {[1, 2].map((option) => (
                <label key={option} className="flex min-h-[52px] flex-1 cursor-pointer items-center gap-2 rounded-xl border border-[#cdd5e1] px-3 text-[17px] font-semibold has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                  <input type="radio" name="volume" checked={volume === option} onChange={() => setVolume(option)} className="size-4 accent-brand" />
                  {option === 1 ? "Volume One" : "Volume Two"}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-5 sm:grid-cols-[120px_minmax(0,1fr)]">
            <div>
              <FieldLabel htmlFor="chapter-code">Code</FieldLabel>
              <input id="chapter-code" name="code" required maxLength={10} placeholder={volume === 1 ? "07" : "X"} autoComplete="off" className={inputClasses()} />
            </div>
            <div>
              <FieldLabel htmlFor="chapter-title">Title</FieldLabel>
              <input id="chapter-title" name="title" required minLength={2} maxLength={120} autoComplete="off" className={inputClasses()} />
            </div>
          </div>
          <div>
            <FieldLabel htmlFor="chapter-summary">One-line summary (optional)</FieldLabel>
            <input id="chapter-summary" name="summary" maxLength={300} autoComplete="off" placeholder="What brokers learn, in a few words" className={inputClasses()} />
          </div>
          {volume === 2 ? (
            <div className="grid gap-5 sm:grid-cols-2 sm:items-end">
              <div>
                <FieldLabel htmlFor="chapter-schedule">When to read it (optional)</FieldLabel>
                <input id="chapter-schedule" name="scheduleLabel" maxLength={60} placeholder="Week 2" autoComplete="off" className={inputClasses()} />
              </div>
              <label className="flex min-h-[52px] cursor-pointer items-center gap-3 text-[17px] font-semibold">
                <input type="checkbox" name="comingSoon" defaultChecked className="size-5 accent-brand" />
                Show as “coming soon”
              </label>
            </div>
          ) : null}
          {error ? <FormMessage tone="error">{error}</FormMessage> : null}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => dialogRef.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} aria-busy={busy}>
              {busy ? "Creating…" : "Create chapter"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
