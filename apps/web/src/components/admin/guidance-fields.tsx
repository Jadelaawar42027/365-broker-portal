/**
 * File: apps/web/src/components/admin/guidance-fields.tsx
 * Purpose: The form fields an admin uses to write the short layout of a step or lesson (SPEC D28): "What to do"
 * bullets (one per line, with a live count against the 5-bullet, ~60-word target) and the one-line NEVER / WATCH /
 * HOUSE RULE callouts. Used inside the step and lesson editors' forms; readGuidanceFields reads them back.
 *
 * Functions:
 * - GuidanceFields({ idPrefix, todoItems, callouts }): the bullets textarea and the callout rows.
 * - readGuidanceFields(form): the todoItems and callouts from submitted form data.
 * - splitLines(text): the non-empty lines of the bullets textarea, without any leading "-" or "•".
 */
"use client";

import { countWords, GUIDANCE_CALLOUT_KINDS, MAX_GUIDANCE_CALLOUTS, MAX_TODO_ITEMS, TODO_WORD_TARGET, type GuidanceCallout } from "@bp/shared";
import { useState } from "react";
import { CloseIcon } from "@/components/ui/icons";
import { FieldLabel, inputClasses, selectClasses } from "@/components/ui/misc";

function splitLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

export function readGuidanceFields(form: FormData): { todoItems: string[]; callouts: GuidanceCallout[] } {
  return {
    todoItems: splitLines(String(form.get("todoItems") ?? "")),
    callouts: JSON.parse(String(form.get("callouts") ?? "[]")) as GuidanceCallout[],
  };
}

export function GuidanceFields({ idPrefix, todoItems, callouts }: { idPrefix: string; todoItems: string[]; callouts: GuidanceCallout[] }) {
  const [todo, setTodo] = useState(todoItems.join("\n"));
  const [rows, setRows] = useState(() => callouts.map((callout, index) => ({ key: `c-${index}`, ...callout })));
  const lines = splitLines(todo);
  const words = countWords(lines);
  const overTarget = lines.length > MAX_TODO_ITEMS || words > TODO_WORD_TARGET;

  return (
    <div className="space-y-5">
      <div>
        <FieldLabel htmlFor={`${idPrefix}-todo`}>What to do · one bullet per line</FieldLabel>
        <textarea
          id={`${idPrefix}-todo`}
          name="todoItems"
          value={todo}
          onChange={(event) => setTodo(event.target.value)}
          rows={5}
          aria-describedby={`${idPrefix}-todo-count`}
          className={`${inputClasses()} py-3 leading-relaxed`}
        />
        <p id={`${idPrefix}-todo-count`} aria-live="polite" className={`mt-1.5 text-[15px] ${overTarget ? "font-semibold text-warn" : "text-muted"}`}>
          {lines.length} {lines.length === 1 ? "bullet" : "bullets"} · {words} words. Aim for 3 to {MAX_TODO_ITEMS} bullets, under about {TODO_WORD_TARGET} words.
        </p>
      </div>
      <fieldset className="space-y-2.5">
        <legend className="mb-2 text-[15px] font-bold">Callouts · one line each</legend>
        <input type="hidden" name="callouts" value={JSON.stringify(rows.map(({ kind, text }) => ({ kind, text: text.trim() })).filter((row) => row.text))} />
        {rows.map((row, index) => (
          <div key={row.key} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              aria-label={`Callout ${index + 1} type`}
              value={row.kind}
              onChange={(event) => setRows(rows.map((item) => (item.key === row.key ? { ...item, kind: event.target.value as GuidanceCallout["kind"] } : item)))}
              className={`${selectClasses()} sm:w-[170px]`}
            >
              {GUIDANCE_CALLOUT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
            <input
              aria-label={`Callout ${index + 1} text`}
              value={row.text}
              maxLength={240}
              onChange={(event) => setRows(rows.map((item) => (item.key === row.key ? { ...item, text: event.target.value } : item)))}
              className={inputClasses()}
            />
            <button
              type="button"
              onClick={() => setRows(rows.filter((item) => item.key !== row.key))}
              aria-label={`Remove callout ${index + 1}`}
              className="grid size-11 shrink-0 place-items-center self-end rounded-xl text-muted hover:bg-page sm:self-auto"
            >
              <CloseIcon className="size-4" />
            </button>
          </div>
        ))}
        {rows.length < MAX_GUIDANCE_CALLOUTS ? (
          <button
            type="button"
            onClick={() => setRows([...rows, { key: `c-${Date.now()}`, kind: "WATCH", text: "" }])}
            className="min-h-11 rounded-lg px-2 text-base font-semibold text-brand"
          >
            + Add a callout
          </button>
        ) : null}
      </fieldset>
    </div>
  );
}
