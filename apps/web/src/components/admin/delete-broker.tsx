/**
 * File: apps/web/src/components/admin/delete-broker.tsx
 * Purpose: Owner-only deleting of a broker: the "Delete this broker" section at the bottom of the broker profile (3c) and
 * the "Remove" button on each row of the brokers list (3b). Both open the same dialog, which says exactly what is removed
 * for good, asks for the broker's full name to be typed, then deletes them and goes back to the brokers list. A broker who
 * only left should be set to Inactive instead, which keeps their history.
 *
 * Functions:
 * - DeleteBrokerSection({ brokerId, brokerName, hasExternalAccounts }): renders the profile section and its confirmation dialog.
 * - RemoveBrokerButton({ brokerId, brokerName, hasExternalAccounts }): the small "Remove" button for a brokers list row and its confirmation dialog.
 * - DeleteBrokerDialog({ dialogRef, brokerId, brokerName, hasExternalAccounts }): the confirmation dialog shared by both.
 * - remove(event): sends the delete with the typed name and moves on to the brokers list, or shows the error.
 */
"use client";

import type { DeleteBrokerResponse } from "@bp/shared";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { CloseIcon } from "@/components/ui/icons";
import { FieldLabel, inputClasses } from "@/components/ui/misc";
import { apiRequest, ApiError } from "@/lib/api-client";

type DeleteTarget = { brokerId: string; brokerName: string; hasExternalAccounts: boolean };

export function DeleteBrokerSection({ brokerId, brokerName, hasExternalAccounts }: DeleteTarget) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <section aria-labelledby="delete-broker-title" className="rounded-2xl border border-danger-line bg-white px-6 py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="delete-broker-title" className="text-xl font-bold">
            Delete this broker
          </h2>
          <p className="mt-1 text-[15px] text-muted">Removes {brokerName} and everything stored about them for good. If they only left, set them to Inactive instead.</p>
        </div>
        <Button variant="danger-outline" className="shrink-0" onClick={() => dialogRef.current?.showModal()}>
          Delete broker…
        </Button>
      </div>
      <DeleteBrokerDialog dialogRef={dialogRef} brokerId={brokerId} brokerName={brokerName} hasExternalAccounts={hasExternalAccounts} />
    </section>
  );
}

export function RemoveBrokerButton({ brokerId, brokerName, hasExternalAccounts }: DeleteTarget) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Button variant="danger-outline" size="sm" aria-label={`Remove ${brokerName}`} onClick={() => dialogRef.current?.showModal()}>
        Remove
      </Button>
      <DeleteBrokerDialog dialogRef={dialogRef} brokerId={brokerId} brokerName={brokerName} hasExternalAccounts={hasExternalAccounts} />
    </>
  );
}

function DeleteBrokerDialog({ dialogRef, brokerId, brokerName, hasExternalAccounts }: DeleteTarget & { dialogRef: RefObject<HTMLDialogElement | null> }) {
  const router = useRouter();
  const id = useId();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim().replace(/\s+/g, " ").toLowerCase() === brokerName.trim().replace(/\s+/g, " ").toLowerCase();

  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<DeleteBrokerResponse>(`/v1/admin/brokers/${brokerId}`, { method: "DELETE", body: { confirmName: typed } });
      const params = new URLSearchParams({ deleted: brokerName, ...(result.storageError ? { storage: "1" } : {}) });
      dialogRef.current?.close();
      setTyped("");
      setBusy(false);
      router.push(`/admin/brokers?${params.toString()}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The broker wasn't deleted. Try again.");
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${id}-title`}
      className="m-auto max-h-[calc(100dvh-32px)] w-[min(560px,calc(100vw-32px))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-left text-ink overscroll-contain backdrop:bg-navy/50"
    >
      <form onSubmit={remove} className="space-y-5 p-7">
        <div className="flex items-start justify-between gap-4">
          <h2 id={`${id}-title`} className="text-[26px] font-extrabold tracking-tight">
            Delete {brokerName} for good?
          </h2>
          <button type="button" aria-label="Close" onClick={() => dialogRef.current?.close()} className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-page">
            <CloseIcon />
          </button>
        </div>
        <div className="space-y-2 text-base leading-relaxed">
          <p>This can&apos;t be undone. It permanently removes:</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>their portal login, profile, persona and commission history</li>
            <li>every onboarding step and every uploaded file</li>
            <li>their agreements and signatures</li>
            <li>their training progress and quiz answers</li>
            <li>the activity history about them</li>
          </ul>
          {hasExternalAccounts ? (
            <p className="font-semibold text-danger">Their Google Workspace email and GoHighLevel user are not deleted. Remove those in Google Admin and GHL if you need to.</p>
          ) : null}
          <p className="text-muted">If they only left, set them to Inactive on their profile instead. That keeps their history.</p>
        </div>
        <div>
          <FieldLabel htmlFor={`${id}-name`}>Type {brokerName} to confirm</FieldLabel>
          <input id={`${id}-name`} value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" spellCheck={false} className={inputClasses()} />
        </div>
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => dialogRef.current?.close()}>
            Cancel
          </Button>
          <Button type="submit" variant="danger-outline" disabled={!matches || busy}>
            {busy ? "Deleting…" : "Delete permanently"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
