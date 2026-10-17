/**
 * File: apps/web/src/components/admin/commission-editor.tsx
 * Purpose: The commission strip on a broker's profile (3c): their split on in-house leads and on self-generated deals
 * (broker / house), with an Edit button that opens the two inputs in place and saves them (the API writes audit_log).
 *
 * Functions:
 * - CommissionEditor({ brokerId, inHouseSplit, selfGeneratedSplit }): shows both splits and edits them.
 * - SplitFact({ label, value }): one label and "60 / 40" pair.
 */
"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { apiRequest, ApiError } from "@/lib/api-client";
import { formatSplit } from "@/lib/format";
import { CommissionSplitFields, readSplits } from "./commission-split-fields";

function SplitFact({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <p className="text-[15px] text-muted">{label}</p>
      <p className={`mt-0.5 text-[22px] leading-tight font-extrabold tabular-nums ${value === null ? "text-muted" : ""}`}>{formatSplit(value)}</p>
    </div>
  );
}

export function CommissionEditor({ brokerId, inHouseSplit, selfGeneratedSplit }: { brokerId: string; inHouseSplit: number | null; selfGeneratedSplit: number | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/v1/admin/brokers/${brokerId}`, { method: "PATCH", body: readSplits(new FormData(event.currentTarget)) });
      setEditing(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't save the commission splits.");
    }
    setBusy(false);
  }

  return (
    <section aria-labelledby="commission-title" className="rounded-xl bg-page px-5 py-4">
      {editing ? (
        <form onSubmit={save} className="space-y-4">
          <h2 id="commission-title" className="sr-only">
            Commission
          </h2>
          <CommissionSplitFields idPrefix="profile" inHouseSplit={inHouseSplit} selfGeneratedSplit={selfGeneratedSplit} />
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
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-x-10 gap-y-3">
          <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
            <h2 id="commission-title" className="w-full text-[15px] font-bold tracking-[0.04em] text-muted uppercase sm:w-auto sm:self-center">
              Commission · broker / house
            </h2>
            <SplitFact label="In-house leads" value={inHouseSplit} />
            <SplitFact label="Self-generated deals" value={selfGeneratedSplit} />
          </div>
          <Button variant="outline" onClick={() => setEditing(true)}>
            Edit commission
          </Button>
        </div>
      )}
    </section>
  );
}
