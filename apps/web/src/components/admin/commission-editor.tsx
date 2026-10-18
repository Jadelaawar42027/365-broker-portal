/**
 * File: apps/web/src/components/admin/commission-editor.tsx
 * Purpose: The commission panel on a broker's profile (3c, SPEC D29): the current split on in-house leads and on
 * self-generated deals (broker / house), a "Change commission" form that adds a history row (split, the date it starts
 * and an optional note; the API writes audit_log), and the full history, newest first.
 *
 * Functions:
 * - CommissionEditor({ brokerId, today, inHouseSplit, selfGeneratedSplit, history }): the panel.
 * - SplitFact({ label, value }): one label and "60 / 40" pair.
 * - historyNumber(value): "40%" or "—".
 */
"use client";

import type { CommissionHistoryEntry } from "@bp/shared";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { FieldLabel, inputClasses } from "@/components/ui/misc";
import { apiRequest, ApiError } from "@/lib/api-client";
import { formatDate, formatSplit } from "@/lib/format";
import { CommissionSplitFields, readSplits } from "./commission-split-fields";

function SplitFact({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <p className="text-[15px] text-muted">{label}</p>
      <p className={`mt-0.5 text-[22px] leading-tight font-extrabold tabular-nums ${value === null ? "text-muted" : ""}`}>{formatSplit(value)}</p>
    </div>
  );
}

function historyNumber(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

export function CommissionEditor({
  brokerId,
  today,
  inHouseSplit,
  selfGeneratedSplit,
  history,
}: {
  brokerId: string;
  today: string;
  inHouseSplit: number | null;
  selfGeneratedSplit: number | null;
  history: CommissionHistoryEntry[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const note = String(form.get("note") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/v1/admin/brokers/${brokerId}/commission`, {
        method: "POST",
        body: { ...readSplits(form), effectiveFrom: String(form.get("effectiveFrom")), ...(note ? { note } : {}) },
      });
      setEditing(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't save the commission change.");
    }
    setBusy(false);
  }

  return (
    <section aria-labelledby="commission-title" className="space-y-4 rounded-xl bg-page px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-10 gap-y-3">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
          <h2 id="commission-title" className="w-full text-[15px] font-bold tracking-[0.04em] text-muted uppercase sm:w-auto sm:self-center">
            Commission · broker / house
          </h2>
          <SplitFact label="In-house leads" value={inHouseSplit} />
          <SplitFact label="Self-generated deals" value={selfGeneratedSplit} />
        </div>
        {!editing ? (
          <Button variant="outline" onClick={() => setEditing(true)}>
            Change commission
          </Button>
        ) : null}
      </div>

      {editing ? (
        <form onSubmit={save} className="space-y-4 rounded-xl border border-line bg-white px-5 py-5">
          <CommissionSplitFields idPrefix="profile" inHouseSplit={inHouseSplit} selfGeneratedSplit={selfGeneratedSplit} />
          <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
            <div>
              <FieldLabel htmlFor="commission-from">Starts on</FieldLabel>
              <input id="commission-from" name="effectiveFrom" type="date" required max={today} defaultValue={today} className={inputClasses()} />
            </div>
            <div>
              <FieldLabel htmlFor="commission-note">Note (optional)</FieldLabel>
              <input id="commission-note" name="note" maxLength={500} placeholder="e.g. Top performer, September" autoComplete="off" className={inputClasses()} />
            </div>
          </div>
          {error ? <FormMessage tone="error">{error}</FormMessage> : null}
          <div className="flex gap-3">
            <Button type="submit" disabled={busy} aria-busy={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button variant="outline" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {history.length ? (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-[17px] font-semibold text-brand [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="transition-transform group-open:rotate-90">
              ›
            </span>
            Commission history · {history.length} {history.length === 1 ? "change" : "changes"}
          </summary>
          <div className="mt-2 overflow-x-auto rounded-xl border border-line bg-white">
            <table className="w-full text-left text-[16px]">
              <thead className="bg-brand-soft text-[15px]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-bold">Starts on</th>
                  <th scope="col" className="px-4 py-3 font-bold">In-house leads</th>
                  <th scope="col" className="px-4 py-3 font-bold">Self-generated</th>
                  <th scope="col" className="px-4 py-3 font-bold">Changed by</th>
                  <th scope="col" className="px-4 py-3 font-bold">Note</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry, index) => (
                  <tr key={entry.id} className="border-t border-line">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDate(entry.effectiveFrom)}
                      {index === 0 ? <span className="ml-2 rounded-full bg-success-soft px-2 py-0.5 text-[13px] font-bold text-success">Current</span> : null}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{historyNumber(entry.inHouseSplit)}</td>
                    <td className="px-4 py-3 tabular-nums">{historyNumber(entry.selfGeneratedSplit)}</td>
                    <td className="px-4 py-3">{entry.changedByName ?? "System"}</td>
                    <td className="px-4 py-3 text-muted">{entry.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </section>
  );
}
