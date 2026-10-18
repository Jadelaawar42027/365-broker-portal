/**
 * File: apps/web/src/components/admin/invite-dialog.tsx
 * Purpose: The "+ Invite a new broker" button and its dialog (SPEC D29): full name, personal phone in international
 * form, email (optional for now), level, and the two commission splits, both required. With an email the broker gets
 * the invite by email and the admin goes to the new profile; without one, the dialog shows the invite link with a Copy
 * button so the admin can send it by WhatsApp or text.
 *
 * Functions:
 * - InviteBrokerButton(): the button that opens the dialog.
 * - InviteDialog({ dialogRef }): the native <dialog> with the form, its submission and the link view.
 * - CopyLink({ url }): the invite link with a Copy button that confirms when copied.
 */
"use client";

import type { CreateBrokerResponse } from "@bp/shared";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type RefObject } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button, LinkButton } from "@/components/ui/button";
import { CloseIcon, PlusIcon } from "@/components/ui/icons";
import { FieldLabel, inputClasses } from "@/components/ui/misc";
import { apiRequest, ApiError } from "@/lib/api-client";
import { CommissionSplitFields, readSplits } from "./commission-split-fields";

export function InviteBrokerButton() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Button size="lg" onClick={() => dialogRef.current?.showModal()}>
        <PlusIcon />
        Invite a new broker
      </Button>
      <InviteDialog dialogRef={dialogRef} />
    </>
  );
}

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <label htmlFor="invite-link" className="block text-[15px] font-bold">
        Invite link
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id="invite-link" readOnly value={url} onFocus={(event) => event.currentTarget.select()} className={`${inputClasses()} font-mono text-[15px]`} />
        <Button
          variant="outline"
          className="shrink-0"
          onClick={async () => {
            await navigator.clipboard.writeText(url).catch(() => null);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
      <p aria-live="polite" className="text-[15px] text-muted">
        {copied ? "Copied. Paste it into WhatsApp or a text to the broker." : "It works for 7 days and only once. Making a new link stops this one working."}
      </p>
    </div>
  );
}

function InviteDialog({ dialogRef }: { dialogRef: RefObject<HTMLDialogElement | null> }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ brokerId: string; name: string; inviteUrl: string } | null>(null);

  function close() {
    dialogRef.current?.close();
    if (created) {
      setCreated(null);
      formRef.current?.reset();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const name = String(form.get("name")).trim();
      const email = String(form.get("email") ?? "").trim();
      const result = await apiRequest<CreateBrokerResponse>("/v1/admin/brokers", {
        method: "POST",
        body: {
          name,
          phone: String(form.get("phone") ?? "").trim(),
          ...(email ? { email } : {}),
          level: String(form.get("level")),
          ...readSplits(form),
        },
      });
      if (result.inviteUrl) {
        setCreated({ brokerId: result.brokerId, name, inviteUrl: result.inviteUrl });
        router.refresh();
      } else {
        dialogRef.current?.close();
        router.push(`/admin/brokers/${result.brokerId}?invited=1`);
        router.refresh();
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
    }
    setBusy(false);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="invite-title"
      className="m-auto max-h-[calc(100dvh-32px)] w-[min(560px,calc(100vw-32px))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink overscroll-contain backdrop:bg-navy/50"
    >
      <div className="flex items-start justify-between gap-4 px-7 pt-7">
        <div>
          <h2 id="invite-title" className="text-[26px] font-extrabold tracking-tight">
            {created ? `${created.name} is invited` : "Invite a new broker"}
          </h2>
          <p className="mt-1 text-base text-muted">
            {created ? "There's no email, so send them this link yourself." : "With an email, they get the invite link by email. Without one, you get a link to send them."}
          </p>
        </div>
        <button type="button" aria-label="Close" onClick={close} className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-page">
          <CloseIcon />
        </button>
      </div>
      {created ? (
        <div className="space-y-6 p-7">
          <CopyLink url={created.inviteUrl} />
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={close}>
              Close
            </Button>
            <LinkButton href={`/admin/brokers/${created.brokerId}`} onClick={() => dialogRef.current?.close()}>
              Open their profile
            </LinkButton>
          </div>
        </div>
      ) : (
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-5 p-7">
          <div>
            <FieldLabel htmlFor="invite-name">Full name</FieldLabel>
            <input id="invite-name" name="name" required minLength={2} autoComplete="off" className={inputClasses()} />
          </div>
          <div>
            <FieldLabel htmlFor="invite-phone">Personal phone</FieldLabel>
            <input
              id="invite-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              required
              pattern="\+[1-9][0-9 ().\-]{7,20}"
              placeholder="+1 561 555 0123"
              autoComplete="off"
              aria-describedby="invite-phone-help"
              className={inputClasses()}
            />
            <p id="invite-phone-help" className="mt-1.5 text-[15px] text-muted">
              International form, starting with + and the country code.
            </p>
          </div>
          <div>
            <FieldLabel htmlFor="invite-email">Email (optional)</FieldLabel>
            <input id="invite-email" name="email" type="email" spellCheck={false} autoComplete="off" aria-describedby="invite-email-help" className={inputClasses()} />
            <p id="invite-email-help" className="mt-1.5 text-[15px] text-muted">
              Leave it blank to send the invite link yourself. They&apos;ll enter their own email when they accept.
            </p>
          </div>
          <fieldset>
            <legend className="mb-2 block text-[15px] font-bold">Level</legend>
            <div className="flex gap-2 sm:max-w-[320px]">
              {["junior", "senior"].map((level) => (
                <label key={level} className="flex min-h-[52px] flex-1 cursor-pointer items-center gap-2 rounded-xl border border-[#cdd5e1] px-3 text-[17px] font-semibold has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                  <input type="radio" name="level" value={level} defaultChecked={level === "junior"} className="size-4 accent-brand" />
                  {level === "junior" ? "Junior" : "Senior"}
                </label>
              ))}
            </div>
          </fieldset>
          <CommissionSplitFields idPrefix="invite" />
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
