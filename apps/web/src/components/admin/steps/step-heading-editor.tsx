/**
 * File: apps/web/src/components/admin/steps/step-heading-editor.tsx
 * Purpose: The card at the top of the admin step editor: the step number, title and sub-header as brokers see them,
 * and an "Edit titles" form for the title, sub-header, short title and summary. Saving writes audit_log on the API side
 * and brokers see the change straight away.
 *
 * Functions:
 * - StepHeadingEditor({ step }): the card, switching between the read view and the form.
 * - HeadingForm({ step, onDone }): the inline form; saves all four fields together.
 */
"use client";

import type { AdminStepDetailResponse } from "@bp/shared";
import { useState, type FormEvent } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { FieldLabel, inputClasses } from "@/components/ui/misc";
import { apiRequest } from "@/lib/api-client";
import { useAction } from "../training/use-action";

type Step = AdminStepDetailResponse["step"];

function HeadingForm({ step, onDone }: { step: Step; onDone: () => void }) {
  const { busy, error, run } = useAction();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) ?? "").trim();
    const saved = await run(() =>
      apiRequest(`/v1/admin/steps/${step.key}`, {
        method: "PATCH",
        body: { title: field("title"), intro: field("intro"), shortTitle: field("shortTitle"), summary: field("summary") },
      }),
    );
    if (saved) onDone();
  }

  return (
    <form onSubmit={save} className="mt-5 space-y-5 rounded-xl bg-page p-5">
      <div>
        <FieldLabel htmlFor="step-title">Title</FieldLabel>
        <input id="step-title" name="title" required minLength={2} maxLength={160} defaultValue={step.title} autoComplete="off" className={inputClasses()} />
        <p className="mt-2 text-[15px] text-muted">The big heading at the top of the step.</p>
      </div>
      <div>
        <FieldLabel htmlFor="step-intro">Sub-header</FieldLabel>
        <textarea id="step-intro" name="intro" required maxLength={600} rows={3} defaultValue={step.intro} className={`${inputClasses()} py-3 leading-relaxed`} />
        <p className="mt-2 text-[15px] text-muted">The line under the title.</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="min-w-0">
          <FieldLabel htmlFor="step-short-title">Short title</FieldLabel>
          <input id="step-short-title" name="shortTitle" required minLength={2} maxLength={80} defaultValue={step.shortTitle} autoComplete="off" className={inputClasses()} />
          <p className="mt-2 text-[15px] text-muted">Used in lists: the step list here, reviews and broker profiles.</p>
        </div>
        <div className="min-w-0">
          <FieldLabel htmlFor="step-summary">Summary</FieldLabel>
          <textarea id="step-summary" name="summary" required maxLength={300} rows={3} defaultValue={step.summary} className={`${inputClasses()} py-3 leading-relaxed`} />
          <p className="mt-2 text-[15px] text-muted">Shown on the broker&apos;s “Your next step” card.</p>
        </div>
      </div>
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? "Saving…" : "Save titles"}
        </Button>
      </div>
    </form>
  );
}

export function StepHeadingEditor({ step }: { step: Step }) {
  const [editing, setEditing] = useState(false);

  return (
    <section aria-labelledby="step-heading" className="rounded-2xl border border-line bg-white px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold tracking-[0.06em] text-brand uppercase">Step {step.position}</p>
          <h2 id="step-heading" className="mt-1 text-[28px] leading-tight font-extrabold tracking-tight">
            {step.title}
          </h2>
          <p className="mt-2 text-[17px] text-muted">{step.intro}</p>
        </div>
        {!editing ? (
          <Button variant="outline" onClick={() => setEditing(true)}>
            Edit titles
          </Button>
        ) : null}
      </div>
      {editing ? <HeadingForm step={step} onDone={() => setEditing(false)} /> : null}
      <p className="mt-3 text-[15px] text-muted">Brokers see the changes you save here straight away.</p>
    </section>
  );
}
