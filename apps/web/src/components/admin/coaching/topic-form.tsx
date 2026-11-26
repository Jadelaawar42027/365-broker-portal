/**
 * File: apps/web/src/components/admin/coaching/topic-form.tsx
 * Purpose: Lets an admin set or replace a broker's 1:1 topic for one week, with a short note (up to 280 characters), or go
 * back to the automatic topic. Closed it is a single "Change topic" button; open it is a small form. Saves to the API
 * (appended to the override log and audit-logged) and refreshes the page so the new topic shows everywhere.
 *
 * Functions:
 * - TopicForm({ brokerId, weekStart, current }): the button and the form.
 * - save(topic, note): sends the override (topic null clears it), then closes the form and refreshes.
 * - submit(event): checks the topic is filled in (moving focus back to it when empty), then saves it.
 */
"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/misc";
import { apiRequest, ApiError } from "@/lib/api-client";

const TOPIC_MAX = 120;
const NOTE_MAX = 280;

export function TopicForm({ brokerId, weekStart, current }: { brokerId: string; weekStart: string; current: { topic: string; note: string | null } | null }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState(current?.topic ?? "");
  const [note, setNote] = useState(current?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const topicRef = useRef<HTMLInputElement>(null);

  async function save(next: string | null, nextNote: string) {
    setSaving(true);
    setError(null);
    try {
      await apiRequest(`/v1/admin/coaching/brokers/${brokerId}/topic`, { method: "PUT", body: { weekStart, topic: next, note: nextNote } });
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't save the topic. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!topic.trim()) {
      setError("Enter a topic, or use the automatic one.");
      topicRef.current?.focus();
      return;
    }
    await save(topic.trim(), note.trim());
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center self-start text-base font-semibold text-brand underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
      >
        {current ? "Change or remove the topic" : "Set a different topic"}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
      <label htmlFor={`${id}-topic`} className="text-base font-semibold">
        Topic for this week
      </label>
      <input
        ref={topicRef}
        id={`${id}-topic`}
        name="topic"
        autoComplete="off"
        maxLength={TOPIC_MAX}
        value={topic}
        onChange={(event) => setTopic(event.target.value)}
        placeholder="e.g. Hand-off from setters…"
        className={inputClasses()}
      />
      <label htmlFor={`${id}-note`} className="text-base font-semibold">
        Note <span className="font-normal text-muted">(optional)</span>
      </label>
      <textarea
        id={`${id}-note`}
        name="note"
        rows={3}
        maxLength={NOTE_MAX}
        autoComplete="off"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        aria-describedby={`${id}-count`}
        placeholder="Why this topic this week…"
        className={`${inputClasses()} py-3`}
      />
      <p id={`${id}-count`} className="text-[14px] text-muted tabular-nums">
        {note.length}/{NOTE_MAX} characters
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className={buttonClasses("navy")}>
          {saving ? "Saving…" : "Save topic"}
        </button>
        {current ? (
          <button type="button" disabled={saving} onClick={() => save(null, "")} className={buttonClasses("outline")}>
            Use the automatic topic
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => (setOpen(false), setError(null))}
          className="inline-flex min-h-11 items-center px-2 text-base font-semibold text-muted underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          Cancel
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-[15px] text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}
