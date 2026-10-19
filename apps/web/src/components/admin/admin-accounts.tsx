/**
 * File: apps/web/src/components/admin/admin-accounts.tsx
 * Purpose: The Admins tab's actions: the "+ Add an admin" button and its dialog (full name and email; the new admin is
 * emailed an invite link to create their login, and the dialog shows the same link to copy), and "Resend invite" for
 * an admin who hasn't created their login yet.
 *
 * Functions:
 * - AddAdminButton(): the button that opens the dialog.
 * - AddAdminDialog({ dialogRef }): the native <dialog> with the form, its submission and the link view.
 * - ResendAdminInvite({ adminId, name }): emails a fresh invite link and shows it to copy.
 */
"use client";

import type { CreateAdminResponse } from "@bp/shared";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type RefObject } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { CloseIcon, PlusIcon } from "@/components/ui/icons";
import { FieldLabel, inputClasses } from "@/components/ui/misc";
import { apiRequest, ApiError } from "@/lib/api-client";
import { CopyLink } from "./invite-dialog";

export function AddAdminButton() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Button size="lg" onClick={() => dialogRef.current?.showModal()}>
        <PlusIcon />
        Add an admin
      </Button>
      <AddAdminDialog dialogRef={dialogRef} />
    </>
  );
}

function AddAdminDialog({ dialogRef }: { dialogRef: RefObject<HTMLDialogElement | null> }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ name: string; email: string; inviteUrl: string } | null>(null);

  function close() {
    dialogRef.current?.close();
    setError(null);
    if (created) {
      setCreated(null);
      formRef.current?.reset();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name")).trim();
    const email = String(form.get("email")).trim();
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<CreateAdminResponse>("/v1/admin/admins", { method: "POST", body: { name, email } });
      setCreated({ name, email, inviteUrl: result.inviteUrl });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
    }
    setBusy(false);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="add-admin-title"
      className="m-auto max-h-[calc(100dvh-32px)] w-[min(560px,calc(100vw-32px))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink overscroll-contain backdrop:bg-navy/50"
    >
      <div className="flex items-start justify-between gap-4 px-7 pt-7">
        <div>
          <h2 id="add-admin-title" className="text-[26px] font-extrabold tracking-tight">
            {created ? `${created.name} is invited` : "Add an admin"}
          </h2>
          <p className="mt-1 text-base text-muted">
            {created
              ? `We emailed ${created.email} a link to create their login. You can also copy it and send it yourself.`
              : "They get an email with a link to choose their password. Admins can review steps, manage brokers and add other admins."}
          </p>
        </div>
        <button type="button" aria-label="Close" onClick={close} className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-page">
          <CloseIcon />
        </button>
      </div>
      {created ? (
        <div className="space-y-6 p-7">
          <CopyLink url={created.inviteUrl} />
          <div className="flex justify-end">
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      ) : (
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-5 p-7">
          <div>
            <FieldLabel htmlFor="admin-name">Full name</FieldLabel>
            <input id="admin-name" name="name" required minLength={2} maxLength={120} autoComplete="off" className={inputClasses()} />
          </div>
          <div>
            <FieldLabel htmlFor="admin-email">Email</FieldLabel>
            <input
              id="admin-email"
              name="email"
              type="email"
              required
              spellCheck={false}
              autoComplete="off"
              placeholder="name@365yachts.org"
              className={inputClasses()}
            />
          </div>
          {error ? <FormMessage tone="error">{error}</FormMessage> : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Sending invite…" : "Send invite"}
            </Button>
          </div>
        </form>
      )}
    </dialog>
  );
}

export function ResendAdminInvite({ adminId, name }: { adminId: string; name: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<{ inviteUrl: string }>(`/v1/admin/admins/${adminId}/resend-invite`, { method: "POST", body: {} });
      setInviteUrl(result.inviteUrl);
      dialogRef.current?.showModal();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't resend the invite.");
    }
    setBusy(false);
  }

  return (
    <span className="inline-flex flex-col items-end">
      <Button variant="outline" size="sm" onClick={resend} disabled={busy}>
        {busy ? "Sending…" : "Resend invite"}
      </Button>
      {error ? <span role="alert" className="mt-1 text-sm text-danger">{error}</span> : null}
      <dialog
        ref={dialogRef}
        aria-labelledby={`resend-${adminId}-title`}
        className="m-auto w-[min(560px,calc(100vw-32px))] rounded-2xl border border-line bg-white p-0 text-left text-ink backdrop:bg-navy/50"
      >
        <div className="space-y-6 p-7">
          <div>
            <h2 id={`resend-${adminId}-title`} className="text-[26px] font-extrabold tracking-tight">
              New invite sent to {name}
            </h2>
            <p className="mt-1 text-base text-muted">We emailed them a fresh link. The old link no longer works.</p>
          </div>
          {inviteUrl ? <CopyLink url={inviteUrl} /> : null}
          <div className="flex justify-end">
            <Button onClick={() => dialogRef.current?.close()}>Done</Button>
          </div>
        </div>
      </dialog>
    </span>
  );
}
