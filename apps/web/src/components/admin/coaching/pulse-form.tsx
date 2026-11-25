/**
 * File: apps/web/src/components/admin/coaching/pulse-form.tsx
 * Purpose: Shelly's 30-second weekly pulse for one broker: engagement and attitude from 1 to 5 and what support they
 * need. Saves to the API (audit-logged) and confirms in place.
 *
 * Functions:
 * - PulseForm({ brokerId, weekStart, initial }): renders the form and saves it.
 * - Scale({ name, legend, value, onChange }): one 1-5 choice as real radio buttons with 44px targets.
 * - save(event): validates both scores are picked, sends the pulse and shows "Saved".
 */
"use client";

import { useState, type FormEvent } from "react";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/misc";
import { apiRequest, ApiError } from "@/lib/api-client";

function Scale({ name, legend, value, onChange }: { name: string; legend: string; value: number | null; onChange: (value: number) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-base font-semibold">{legend}</legend>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className={`grid size-11 cursor-pointer place-items-center rounded-xl border text-base font-bold tabular-nums has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-brand ${
              value === n ? "border-navy bg-navy text-white" : "border-line bg-white text-ink hover:bg-brand-soft"
            }`}
          >
            <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} className="sr-only" />
            {n}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function PulseForm({
  brokerId,
  weekStart,
  initial,
}: {
  brokerId: string;
  weekStart: string;
  initial: { engagement: number; attitude: number; supportNeeded: string } | null;
}) {
  const [engagement, setEngagement] = useState<number | null>(initial?.engagement ?? null);
  const [attitude, setAttitude] = useState<number | null>(initial?.attitude ?? null);
  const [supportNeeded, setSupportNeeded] = useState(initial?.supportNeeded ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (engagement === null || attitude === null) {
      setError("Pick a score from 1 to 5 for engagement and attitude.");
      return;
    }
    setState("saving");
    setError(null);
    try {
      await apiRequest(`/v1/admin/coaching/brokers/${brokerId}/pulse`, { method: "PUT", body: { weekStart, engagement, attitude, supportNeeded } });
      setState("saved");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't save the pulse. Please try again.");
      setState("idle");
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <Scale name="engagement" legend="Engagement" value={engagement} onChange={(n) => (setEngagement(n), setState("idle"))} />
      <Scale name="attitude" legend="Attitude" value={attitude} onChange={(n) => (setAttitude(n), setState("idle"))} />
      <label className="flex flex-col gap-2 text-base font-semibold">
        Support needed
        <textarea
          name="supportNeeded"
          rows={3}
          maxLength={2000}
          value={supportNeeded}
          onChange={(event) => (setSupportNeeded(event.target.value), setState("idle"))}
          className={`${inputClasses()} font-normal`}
          placeholder="e.g. Wants help prioritising a big pipeline"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={state === "saving"} className={buttonClasses("navy")}>
          {state === "saving" ? "Saving…" : "Save pulse"}
        </button>
        {state === "saved" ? (
          <span role="status" className="text-base font-semibold text-success">
            Saved
          </span>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-[15px] text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}
