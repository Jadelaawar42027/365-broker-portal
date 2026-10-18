/**
 * File: apps/web/src/components/admin/training/lesson-editor.tsx
 * Purpose: The lesson editor on screen 3e: title, read time, the What to do bullets and one-line callouts of the short
 * layout (SPEC D28), the lesson text (the full section) with buttons that insert the manual's
 * callouts (WATCH, NEVER, HOUSE RULE, EDGE, FIELD NOTE) and tables, a live preview exactly as brokers see it, an
 * admin-only note, the "waiting for a video" flag, saving and deleting.
 *
 * Functions:
 * - LessonEditor({ chapterId, chapterLive, lesson }): the form, toolbar, preview and actions.
 * - insertAtCursor(textarea, snippet): puts a snippet at the cursor on its own lines and returns the new text.
 */
"use client";

import { CALLOUT_KINDS, estimateReadMinutes, type AdminLesson } from "@bp/shared";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { LessonBody } from "@/components/training/lesson-body";
import { Button } from "@/components/ui/button";
import { FieldLabel, inputClasses } from "@/components/ui/misc";
import { apiRequest } from "@/lib/api-client";
import { GuidanceFields, readGuidanceFields } from "../guidance-fields";
import { useAction } from "./use-action";

const TABLE_SNIPPET = "| | Column A | Column B |\n|---|---|---|\n| Row | Value | Value |";

function insertAtCursor(textarea: HTMLTextAreaElement, snippet: string): string {
  const { value, selectionStart, selectionEnd } = textarea;
  const before = value.slice(0, selectionStart).replace(/\n*$/, "");
  const after = value.slice(selectionEnd).replace(/^\n*/, "");
  return [before, snippet, after].filter(Boolean).join("\n\n");
}

export function LessonEditor({ chapterId, chapterLive, lesson }: { chapterId: string; chapterLive: boolean; lesson: AdminLesson }) {
  const router = useRouter();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState(lesson.bodyMd);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  const estimate = estimateReadMinutes(body);

  function insert(snippet: string) {
    if (!bodyRef.current) return;
    setBody(insertAtCursor(bodyRef.current, snippet));
    setSaved(false);
    bodyRef.current.focus();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const minutes = Number(form.get("readMinutes"));
    const note = String(form.get("adminNote") ?? "").trim();
    const guidance = readGuidanceFields(form);
    const done = await run(() =>
      apiRequest(`/v1/admin/training/lessons/${lesson.id}`, {
        method: "PATCH",
        body: {
          title: String(form.get("title") ?? "").trim(),
          bodyMd: body,
          ...guidance,
          readMinutes: minutes > 0 ? minutes : estimate,
          adminNote: note || null,
          videoPlaceholder: form.get("videoPlaceholder") === "on",
        },
      }),
    );
    setSaved(Boolean(done));
  }

  async function remove() {
    if (!window.confirm(`Delete the lesson “${lesson.title}”?`)) return;
    const done = await run(() => apiRequest(`/v1/admin/training/lessons/${lesson.id}`, { method: "DELETE" }), { refresh: false });
    if (done) {
      router.push(`/admin/training/${chapterId}`);
      router.refresh();
    }
  }

  return (
    <form onSubmit={save} onChange={() => setSaved(false)} className="space-y-5 rounded-2xl border border-line bg-white px-6 py-6">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
        <div>
          <FieldLabel htmlFor="lesson-title">Lesson title</FieldLabel>
          <input id="lesson-title" name="title" required minLength={2} maxLength={120} defaultValue={lesson.title} autoComplete="off" className={inputClasses()} />
        </div>
        <div>
          <FieldLabel htmlFor="lesson-minutes">Read time (min)</FieldLabel>
          <input id="lesson-minutes" name="readMinutes" type="number" min={1} max={60} defaultValue={lesson.readMinutes} placeholder={String(estimate)} className={inputClasses()} />
        </div>
      </div>

      <GuidanceFields idPrefix="lesson" todoItems={lesson.todoItems} callouts={lesson.callouts} />

      <div className="grid gap-5 2xl:grid-cols-2">
        <div className="min-w-0">
          <FieldLabel htmlFor="lesson-body">{lesson.todoItems.length ? "Full section · the manual's original text" : "Lesson text"}</FieldLabel>
          <div role="toolbar" aria-label="Insert" className="mb-2 flex flex-wrap gap-2">
            {CALLOUT_KINDS.map((kind) => (
              <button key={kind} type="button" onClick={() => insert(`> [!${kind}]\n> `)} className="min-h-11 rounded-lg border border-line bg-white px-3 text-[14px] font-bold tracking-wide hover:bg-page">
                {kind}
              </button>
            ))}
            <button type="button" onClick={() => insert(TABLE_SNIPPET)} className="min-h-11 rounded-lg border border-line bg-white px-3 text-[14px] font-bold hover:bg-page">
              Table
            </button>
          </div>
          <textarea
            id="lesson-body"
            ref={bodyRef}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={22}
            maxLength={40000}
            spellCheck
            className={`${inputClasses()} py-3 font-mono text-[15px] leading-relaxed`}
            aria-describedby="lesson-body-help"
          />
          <p id="lesson-body-help" className="mt-2 text-[15px] text-muted">
            With What to do bullets, brokers see this behind “Read the full section”; without them, it is the whole lesson. Blank line between paragraphs. <strong>**bold**</strong>, <em>*italic*</em>, “## Heading”, “- list”. Callouts start with “&gt; [!WATCH]” and every line of them with “&gt; ”. About {estimate} min to read.
          </p>
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-[15px] font-bold">Preview · what brokers see</p>
          <div className="max-h-[720px] overflow-y-auto rounded-xl border border-line px-5 py-5">
            <h2 className="mb-5 text-[28px] leading-tight font-extrabold">{lesson.title}</h2>
            <LessonBody markdown={body} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 md:items-end">
        <div>
          <FieldLabel htmlFor="lesson-note">Admin note (brokers never see it)</FieldLabel>
          <input id="lesson-note" name="adminNote" maxLength={1000} defaultValue={lesson.adminNote ?? ""} placeholder="e.g. verify DBPR fees before publishing" autoComplete="off" className={inputClasses()} />
        </div>
        <label className="flex min-h-[52px] cursor-pointer items-center gap-3 text-[17px] font-semibold">
          <input type="checkbox" name="videoPlaceholder" defaultChecked={lesson.videoPlaceholder} className="size-5 accent-brand" />
          Waiting for a video (shows an empty video slot)
        </label>
      </div>

      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      {saved ? <FormMessage tone="success">Saved.{chapterLive ? " Brokers see the change now." : ""}</FormMessage> : null}
      <div className="flex flex-wrap gap-3 border-t border-line pt-5">
        <Button type="submit" size="lg" disabled={busy} aria-busy={busy}>
          {busy ? "Saving…" : "Save lesson"}
        </Button>
        {!chapterLive ? (
          <Button variant="danger-outline" size="lg" disabled={busy} onClick={() => void remove()} className="ml-auto">
            Delete lesson
          </Button>
        ) : (
          <p className="ml-auto self-center text-[15px] text-muted">To delete a lesson, unpublish the chapter first.</p>
        )}
      </div>
    </form>
  );
}
