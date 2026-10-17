/**
 * File: apps/web/src/components/admin/invite-dialog.tsx
 * Purpose: The "+ Invite a new broker" button and its dialog: name, email, mobile, level and joining date. Creating
 * the broker emails them the invite link; the admin is then taken to the new broker's profile.
 *
 * Functions:
 * - InviteBrokerButton({ today }): the button that opens the dialog.
 * - InviteDialog({ dialogRef, today }): the native <dialog> with the form and its submission.
 */
"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type RefObject } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { CloseIcon, PlusIcon } from "@/components/ui/icons";
import { FieldLabel, inputClasses } from "@/components/ui/misc";
import { apiRequest, ApiError } from "@/lib/api-client";

export function InviteBrokerButton({ today }: { today: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Button size="lg" onClick={() => dialogRef.current?.showModal()}>
        <PlusIcon />
        Invite a new broker
      </Button>
      <InviteDialog dialogRef={dialogRef} today={today} />
    </>
  );
}

function InviteDialog({ dialogRef, today }: { dialogRef: RefObject<HTMLDialogElement | null>; today: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const phone = String(form.get("phone") ?? "").trim();
      const { brokerId } = await apiRequest<{ brokerId: string }>("/v1/admin/brokers", {
        method: "POST",
        body: {
          name: String(form.get("name")).trim(),
          email: String(form.get("email")).trim(),
          ...(phone ? { phone } : {}),
          level: String(form.get("level")),
          joinedAt: String(form.get("joinedAt")),
        },
      });
      dialogRef.current?.close();
      router.push(`/admin/brokers/${brokerId}?invited=1`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
    }
    setBusy(false);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="invite-title"
      className="m-auto w-[min(520px,calc(100vw-32px))] rounded-2xl border border-line bg-white p-0 text-ink overscroll-contain backdrop:bg-navy/50"
    >
      <form onSubmit={handleSubmit} className="space-y-5 p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="invite-title" className="text-[26px] font-extrabold tracking-tight">
              Invite a new broker
            </h2>
            <p className="mt-1 text-base text-muted">They get an email with a link to create their account.</p>
          </div>
          <button type="button" aria-label="Close" onClick={() => dialogRef.current?.close()} className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-page">
            <CloseIcon />
          </button>
        </div>
        <div>
          <FieldLabel htmlFor="invite-name">Full name</FieldLabel>
          <input id="invite-name" name="name" required minLength={2} autoComplete="off" className={inputClasses()} />
        </div>
        <div>
          <FieldLabel htmlFor="invite-email">Email</FieldLabel>
          <input id="invite-email" name="email" type="email" required spellCheck={false} autoComplete="off" className={inputClasses()} />
        </div>
        <div>
          <FieldLabel htmlFor="invite-phone">Mobile number (optional)</FieldLabel>
          <input id="invite-phone" name="phone" type="tel" inputMode="tel" autoComplete="off" placeholder="(561) 000-0000" className={inputClasses()} />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-2 block text-[15px] font-bold">Level</legend>
            <div className="flex gap-2">
              {["junior", "senior"].map((level) => (
                <label key={level} className="flex min-h-[52px] flex-1 cursor-pointer items-center gap-2 rounded-xl border border-[#cdd5e1] px-3 text-[17px] font-semibold has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                  <input type="radio" name="level" value={level} defaultChecked={level === "junior"} className="size-4 accent-brand" />
                  {level === "junior" ? "Junior" : "Senior"}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <FieldLabel htmlFor="invite-joined">Joined on</FieldLabel>
            <input id="invite-joined" name="joinedAt" type="date" required defaultValue={today} className={inputClasses()} />
          </div>
        </div>
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => dialogRef.current?.close()}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Sending invite…" : "Send invite"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
