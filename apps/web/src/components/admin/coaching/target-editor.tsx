/**
 * File: apps/web/src/components/admin/coaching/target-editor.tsx
 * Purpose: One row of the coaching targets form: the metric, its target typed in its own unit (minutes, %, points,
 * a count or dollars) with the window it is measured over, who changed it last, and a Save button. Saves to the API,
 * which range-checks, logs the change and audit-logs it, then refreshes the page so the change log shows it.
 *
 * Functions:
 * - TargetEditor({ metric, target, updatedByName, updatedAt }): renders the row and saves it.
 * - save(event): checks the typed value, sends it and shows "Saved", or shows the error and moves focus back to the field.
 */
"use client";

import {
  COACHING_METRIC_LABELS,
  TARGET_WINDOWS,
  targetRangeError,
  targetToInput,
  targetUnit,
  type CoachingMetricId,
} from "@bp/shared";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/misc";
import { apiRequest, ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";

const PREFIX: Record<string, string> = { minutes: "≤", percent: "≥", points: "≥", count: "≥", dollars: "≥ $" };
const SUFFIX: Record<string, string> = { minutes: "min", percent: "%", points: "of 100", count: "", dollars: "" };

export function TargetEditor({ metric, target, updatedByName, updatedAt }: { metric: CoachingMetricId; target: number; updatedByName: string; updatedAt: string }) {
  const router = useRouter();
  const unit = targetUnit(metric);
  const initial = targetToInput(metric, target);
  const [value, setValue] = useState(unit === "dollars" ? new Intl.NumberFormat("en-US").format(initial) : String(initial));
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const inputId = `target-${metric}`;
  const errorId = `target-error-${metric}`;
  const measuredOver = TARGET_WINDOWS[metric];

  async function save(event: FormEvent) {
    event.preventDefault();
    const typed = Number(value.replace(/[,\s$%]/g, ""));
    const problem = value.trim() === "" ? "Enter a target." : targetRangeError(metric, typed);
    if (problem) {
      setError(problem);
      inputRef.current?.focus();
      return;
    }
    setState("saving");
    setError(null);
    try {
      await apiRequest(`/v1/admin/coaching/targets/${metric}`, { method: "PUT", body: { value: typed } });
      setState("saved");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't save the target. Please try again.");
      inputRef.current?.focus();
      setState("idle");
    }
  }

  return (
    <form onSubmit={save} className="grid gap-x-4 gap-y-2 border-b border-line py-4 last:border-b-0 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-center">
      <div>
        <label htmlFor={inputId} className="text-[17px] font-bold">
          {COACHING_METRIC_LABELS[metric]}
        </label>
        <p className="text-[14px] text-muted">
          Last changed by {updatedByName} on {formatDate(updatedAt)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="w-7 text-right text-[17px] font-semibold text-muted">
            {PREFIX[unit]}
          </span>
          <span className="w-36 shrink-0">
            <input
              ref={inputRef}
              id={inputId}
              name={metric}
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={(event) => (setValue(event.target.value), setState("idle"), setError(null))}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className={`${inputClasses()} text-right tabular-nums`}
            />
          </span>
          {SUFFIX[unit] ? <span className="text-[17px] text-muted">{SUFFIX[unit]}</span> : null}
        </span>
        {measuredOver ? <span className="text-[15px] text-muted">{measuredOver}</span> : null}
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={state === "saving"} aria-label={`Save ${COACHING_METRIC_LABELS[metric]} target`} className={buttonClasses("navy")}>
          {state === "saving" ? "Saving…" : "Save"}
        </button>
        <span role="status" className="min-w-12 text-base font-semibold text-success">
          {state === "saved" ? "Saved" : ""}
        </span>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-[15px] text-danger sm:col-span-3">
          {error}
        </p>
      ) : null}
    </form>
  );
}
