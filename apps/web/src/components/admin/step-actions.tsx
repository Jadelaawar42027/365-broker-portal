/**
 * File: apps/web/src/components/admin/step-actions.tsx
 * Purpose: The admin actions on one row of a broker's onboarding record (3c): open the submission for review, upload
 * paperwork on the broker's behalf (stored like a broker upload, marked approved), or mark the step done (SPEC D2) —
 * which asks for the agreed commission tier on step 11.
 *
 * Functions:
 * - StepActions({ brokerId, step }): the buttons that fit the step's state, plus their dialogs (upload only for open steps or approved steps with no file, e.g. imported brokers).
 * - UploadDialog({ dialogRef, brokerId, step }): picks files, uploads them and records them as approved.
 * - MarkDoneDialog({ dialogRef, step }): confirms marking the step done, with the tier or an optional note.
 */
"use client";

import type { AdminStepRow, UploadTargetResponse } from "@bp/shared";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type RefObject } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button, LinkButton } from "@/components/ui/button";
import { FieldLabel, inputClasses } from "@/components/ui/misc";
import { apiRequest, ApiError, uploadToTarget } from "@/lib/api-client";

const UPLOAD_TYPES = ["application/pdf", "image/jpeg", "image/png"];

export function StepActions({ brokerId, step }: { brokerId: string; step: AdminStepRow }) {
  const uploadRef = useRef<HTMLDialogElement>(null);
  const doneRef = useRef<HTMLDialogElement>(null);
  const small = "min-h-11 rounded-lg px-2.5 text-[15px] font-semibold text-brand hover:bg-brand-soft";
  const canUpload = step.kind === "upload" && (step.status !== "approved" || step.files.length === 0);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {step.status === "submitted" ? (
        <LinkButton href={`/admin/reviews/${step.brokerStepId}`} variant="soft" className="min-h-10! px-3! text-[15px]!">
          Review<span className="sr-only"> {step.shortTitle}</span>
        </LinkButton>
      ) : null}
      {canUpload ? (
        <button type="button" className={small} onClick={() => uploadRef.current?.showModal()}>
          Upload<span className="sr-only"> a file for {step.shortTitle}</span>
        </button>
      ) : null}
      {step.status !== "approved" ? (
        <button type="button" className={small} onClick={() => doneRef.current?.showModal()}>
          Mark done<span className="sr-only">: {step.shortTitle}</span>
        </button>
      ) : null}
      {canUpload ? <UploadDialog dialogRef={uploadRef} brokerId={brokerId} step={step} /> : null}
      {step.status !== "approved" ? <MarkDoneDialog dialogRef={doneRef} step={step} /> : null}
    </div>
  );
}

function UploadDialog({ dialogRef, brokerId, step }: { dialogRef: RefObject<HTMLDialogElement | null>; brokerId: string; step: AdminStepRow }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("files") as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    if (picked.length === 0) {
      setError("Choose at least one file.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const files = [];
      for (const file of picked.slice(0, 5)) {
        const target = await apiRequest<UploadTargetResponse>(`/v1/admin/brokers/${brokerId}/steps/${step.key}/upload-url`, {
          method: "POST",
          body: { fileName: file.name, contentType: file.type, sizeBytes: file.size },
        });
        await uploadToTarget(target.upload, file);
        files.push({ storageKey: target.storageKey, fileName: file.name });
      }
      await apiRequest(`/v1/admin/brokers/${brokerId}/steps/${step.key}/upload-complete`, { method: "POST", body: { files } });
      dialogRef.current?.close();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The upload didn't finish. Try again.");
    }
    setBusy(false);
  }

  return (
    <dialog ref={dialogRef} aria-labelledby={`upload-${step.key}`} className="m-auto w-[min(480px,calc(100vw-32px))] rounded-2xl border border-line bg-white p-0 text-ink overscroll-contain backdrop:bg-navy/50">
      <form onSubmit={handleSubmit} className="space-y-5 p-7">
        <h2 id={`upload-${step.key}`} className="text-[24px] font-extrabold">
          Upload: {step.shortTitle}
        </h2>
        <p className="text-base text-muted">The file is stored with the broker&apos;s paperwork, recorded as uploaded by you, and the step is marked approved.</p>
        <div>
          <FieldLabel htmlFor={`files-${step.key}`}>Files (PDF, JPG or PNG, up to 10 MB each)</FieldLabel>
          <input id={`files-${step.key}`} name="files" type="file" multiple accept={UPLOAD_TYPES.join(",")} className="block w-full text-base file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-navy file:px-4 file:font-semibold file:text-white" />
        </div>
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => dialogRef.current?.close()}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Uploading…" : "Upload and approve"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

function MarkDoneDialog({ dialogRef, step }: { dialogRef: RefObject<HTMLDialogElement | null>; step: AdminStepRow }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needsTier = step.key === "commission_tier";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const tier = String(form.get("tier") ?? "").trim();
    const note = String(form.get("note") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/v1/admin/broker-steps/${step.brokerStepId}/mark-done`, {
        method: "POST",
        body: { ...(needsTier ? { commissionTier: tier } : {}), ...(note ? { note } : {}) },
      });
      dialogRef.current?.close();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't mark this step done.");
    }
    setBusy(false);
  }

  return (
    <dialog ref={dialogRef} aria-labelledby={`done-${step.key}`} className="m-auto w-[min(480px,calc(100vw-32px))] rounded-2xl border border-line bg-white p-0 text-ink overscroll-contain backdrop:bg-navy/50">
      <form onSubmit={handleSubmit} className="space-y-5 p-7">
        <h2 id={`done-${step.key}`} className="text-[24px] font-extrabold">
          Mark done: {step.shortTitle}
        </h2>
        <p className="text-base text-muted">The step is recorded as approved by you. If it&apos;s the last one, the broker becomes active.</p>
        {needsTier ? (
          <div>
            <FieldLabel htmlFor="tier">Commission tier agreed in the 1-on-1</FieldLabel>
            <input id="tier" name="tier" required placeholder="e.g. 60/40" autoComplete="off" className={inputClasses()} />
          </div>
        ) : null}
        <div>
          <FieldLabel htmlFor={`note-${step.key}`}>Note (optional)</FieldLabel>
          <input id={`note-${step.key}`} name="note" autoComplete="off" className={inputClasses()} />
        </div>
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => dialogRef.current?.close()}>
            Cancel
          </Button>
          <Button type="submit" variant="approve" disabled={busy}>
            {busy ? "Saving…" : "Mark done"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
