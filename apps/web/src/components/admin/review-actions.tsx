/**
 * File: apps/web/src/components/admin/review-actions.tsx
 * Purpose: The decision side of the review screen (3d): the "Check before approving" list (a reading aid, not saved,
 * SPEC D16), the green Approve button, and "Send back to Daniel" with a required note. After deciding, the admin moves
 * on to the next submission in the queue.
 *
 * Functions:
 * - ReviewActions({ brokerStepId, brokerFirstName, checklist, nextId }): renders the controls and sends the decision.
 * - decide(action, note): posts approve or send-back, then goes to the next review or back to the list.
 */
"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { CheckIcon } from "@/components/ui/icons";
import { apiRequest, ApiError } from "@/lib/api-client";

export function ReviewActions({
  brokerStepId,
  brokerFirstName,
  checklist,
  nextId,
}: {
  brokerStepId: string;
  brokerFirstName: string;
  checklist: string[];
  nextId: string | null;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"approve" | "send-back" | null>(null);

  async function decide(action: "approve" | "send-back") {
    setBusy(action);
    setError(null);
    try {
      await apiRequest(`/v1/admin/broker-steps/${brokerStepId}/${action}`, {
        method: "POST",
        body: action === "send-back" ? { note: note.trim() } : {},
      });
      router.push(nextId ? `/admin/reviews/${nextId}` : "/admin/reviews");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That didn't work. Try again.");
      setBusy(null);
    }
  }

  function handleSendBack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!note.trim()) {
      setError(`Write a note so ${brokerFirstName} knows what to fix.`);
      return;
    }
    void decide("send-back");
  }

  return (
    <div className="space-y-5">
      {checklist.length > 0 ? (
        <fieldset className="rounded-2xl border border-line bg-white px-6 pt-2 pb-5">
          <legend className="px-1 text-lg font-bold">Check before approving</legend>
          <div className="mt-2 space-y-1">
            {checklist.map((item, index) => (
              <label key={item} htmlFor={`check-${index}`} className="flex min-h-11 cursor-pointer items-center gap-3 text-[17px]">
                <input id={`check-${index}`} type="checkbox" className="size-5 accent-brand" />
                {item}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <Button variant="approve" size="xl" className="w-full" disabled={busy !== null} onClick={() => decide("approve")}>
        <CheckIcon className="size-6" />
        {busy === "approve" ? "Approving…" : "Approve"}
      </Button>

      <form onSubmit={handleSendBack} className="rounded-2xl border border-line bg-white px-6 py-5">
        <label htmlFor="send-back-note" className="block text-lg font-bold">
          Or send it back with a note
        </label>
        <textarea
          id="send-back-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={4}
          maxLength={2000}
          placeholder={`What should ${brokerFirstName} fix?`}
          className="mt-3 block w-full rounded-xl border border-[#cdd5e1] px-4 py-3 text-[17px] leading-relaxed placeholder:text-[#6b7a90] focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/25"
        />
        <Button type="submit" variant="danger-outline" size="lg" className="mt-3 w-full" disabled={busy !== null}>
          {busy === "send-back" ? "Sending back…" : `Send back to ${brokerFirstName}`}
        </Button>
      </form>

      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
    </div>
  );
}
