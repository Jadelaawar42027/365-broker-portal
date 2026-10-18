/**
 * File: apps/web/src/components/admin/steps/step-guidance-editor.tsx
 * Purpose: The guidance form in the admin step editor (SPEC D28): What to do bullets, one-line callouts, and the
 * manual's full text (Markdown with the same callouts as lessons) with a live preview of the collapsed panel.
 * Saving writes audit_log on the API side.
 *
 * Functions:
 * - StepGuidanceEditor({ step }): the form; saves all three parts together.
 */
"use client";

import type { AdminStepDetailResponse } from "@bp/shared";
import { useState, type FormEvent } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { LessonBody } from "@/components/training/lesson-body";
import { Button } from "@/components/ui/button";
import { FieldLabel, inputClasses } from "@/components/ui/misc";
import { apiRequest } from "@/lib/api-client";
import { GuidanceFields, readGuidanceFields } from "../guidance-fields";
import { useAction } from "../training/use-action";

export function StepGuidanceEditor({ step }: { step: AdminStepDetailResponse["step"] }) {
  const [fullText, setFullText] = useState(step.fullTextMd);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = readGuidanceFields(new FormData(event.currentTarget));
    const done = await run(() => apiRequest(`/v1/admin/steps/${step.key}`, { method: "PATCH", body: { ...fields, fullTextMd: fullText } }));
    setSaved(Boolean(done));
  }

  return (
    <form onSubmit={save} onChange={() => setSaved(false)} aria-labelledby="guidance-title" className="space-y-6 rounded-2xl border border-line bg-white px-6 py-6">
      <h2 id="guidance-title" className="text-xl font-bold">
        Guidance
      </h2>
      <GuidanceFields idPrefix="step" todoItems={step.todoItems} callouts={step.callouts} />
      <div className="grid gap-5 2xl:grid-cols-2">
        <div className="min-w-0">
          <FieldLabel htmlFor="step-full-text">Full section · the manual&apos;s original text</FieldLabel>
          <textarea
            id="step-full-text"
            value={fullText}
            onChange={(event) => setFullText(event.target.value)}
            rows={14}
            maxLength={40000}
            aria-describedby="step-full-text-help"
            className={`${inputClasses()} py-3 font-mono text-[15px] leading-relaxed`}
          />
          <p id="step-full-text-help" className="mt-2 text-[15px] text-muted">
            Brokers see this behind “Read the full section”. Same format as lessons: “## Heading”, “- list”, tables, and callouts starting with “&gt; [!NEVER]”.
          </p>
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-[15px] font-bold">Preview · the open panel</p>
          <div className="max-h-[520px] space-y-5 overflow-y-auto rounded-xl border border-line px-5 py-5">
            {fullText.trim() ? <LessonBody markdown={fullText} /> : <p className="text-[17px] text-muted">No full text. The panel is hidden.</p>}
          </div>
        </div>
      </div>
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      {saved ? <FormMessage tone="success">Saved. Brokers see the change now.</FormMessage> : null}
      <div className="border-t border-line pt-5">
        <Button type="submit" size="lg" disabled={busy} aria-busy={busy}>
          {busy ? "Saving…" : "Save guidance"}
        </Button>
      </div>
    </form>
  );
}
