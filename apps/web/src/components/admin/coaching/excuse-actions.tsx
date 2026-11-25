/**
 * File: apps/web/src/components/admin/coaching/excuse-actions.tsx
 * Purpose: Shelly's "Confirm excuse" / "Count as missed" buttons on an AI-excused miss. Every decision is saved by the
 * API (audit-logged) and the page reloads so the scores and the list show the new state.
 *
 * Functions:
 * - ExcuseActions({ momentKey, decision, needsConfirmation }): renders "Count as missed", plus "Confirm excuse" when the
 *   excuse needs confirming (broker note only) or was counted as missed, so every decision can be changed.
 * - decide(next): sends the decision (the clicked button reads "Saving…" meanwhile) and refreshes the page.
 */
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { apiRequest, ApiError } from "@/lib/api-client";

export function ExcuseActions({
  momentKey,
  decision,
  needsConfirmation,
}: {
  momentKey: string;
  decision: "confirm" | "reject" | null;
  needsConfirmation: boolean;
}) {
  const showConfirm = needsConfirmation || decision !== null;
  const router = useRouter();
  const [busy, setBusy] = useState<"confirm" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(next: "confirm" | "reject") {
    setBusy(next);
    setError(null);
    try {
      await apiRequest("/v1/admin/coaching/excuses/decision", { method: "POST", body: { momentKey, decision: next } });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't save that. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {showConfirm ? (
          <button
            type="button"
            disabled={busy !== null || decision === "confirm"}
            onClick={() => decide("confirm")}
            className={buttonClasses(decision === "confirm" ? "soft" : "navy", "sm")}
          >
            {busy === "confirm" ? "Saving…" : decision === "confirm" ? "Excuse confirmed" : "Confirm excuse"}
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy !== null || decision === "reject"}
          onClick={() => decide("reject")}
          className={buttonClasses(decision === "reject" ? "soft" : "outline", "sm")}
        >
          {busy === "reject" ? "Saving…" : decision === "reject" ? "Counted as missed" : "Count as missed"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-[15px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
