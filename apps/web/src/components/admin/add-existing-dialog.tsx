/**
 * File: apps/web/src/components/admin/add-existing-dialog.tsx
 * Purpose: The "Add an existing broker" button and its dialog on the Brokers page, for people who already work with
 * 365 Yachts: name, personal phone, their 365 email and sign-in email, CRM phone, level, joining date, whether they
 * are still onboarding or already onboarded (then every onboarding step is marked approved and only training is left),
 * and optional commission splits. No email is sent; the dialog shows their sign-in link with Copy and Send via WhatsApp,
 * and the same link stays on their profile until they create their account.
 *
 * Functions:
 * - AddExistingBrokerButton(): the button that opens the dialog.
 * - AddExistingDialog({ dialogRef }): the native <dialog> with the form, its submission and the link view.
 * - optionalText(form, name): a trimmed form value, or undefined when it was left blank.
 */
"use client";

import { todayInTimeZone, type CreateBrokerResponse, type ExistingBrokerProgress } from "@bp/shared";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type RefObject } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button, LinkButton } from "@/components/ui/button";
import { CloseIcon } from "@/components/ui/icons";
import { FieldLabel, inputClasses } from "@/components/ui/misc";
import { apiRequest, ApiError } from "@/lib/api-client";
import { CommissionSplitFields, readOptionalSplits } from "./commission-split-fields";
import { CopyLink } from "./invite-dialog";

const PHONE_PATTERN = "\\+[1-9][0-9 ().\\-]{7,20}";

const PROGRESS_CHOICES: { value: ExistingBrokerProgress; title: string; detail: string }[] = [
  { value: "onboarded", title: "Onboarding done", detail: "Every onboarding step is marked approved. Only training is left." },
  { value: "onboarding", title: "Still onboarding", detail: "They work through the onboarding steps after signing in." },
];

function optionalText(form: FormData, name: string): string | undefined {
  const value = String(form.get(name) ?? "").trim();
  return value === "" ? undefined : value;
}

export function AddExistingBrokerButton() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Button size="lg" variant="outline" onClick={() => dialogRef.current?.showModal()}>
        Add an existing broker
      </Button>
      <AddExistingDialog dialogRef={dialogRef} />
    </>
  );
}

function AddExistingDialog({ dialogRef }: { dialogRef: RefObject<HTMLDialogElement | null> }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ExistingBrokerProgress>("onboarded");
  const [created, setCreated] = useState<{ brokerId: string; name: string; inviteUrl: string; phone: string | null } | null>(null);
  const today = todayInTimeZone();

  function close() {
    dialogRef.current?.close();
    if (created) {
      setCreated(null);
      setProgress("onboarded");
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
      const onboardedAt = progress === "onboarded" ? optionalText(form, "onboardedAt") : undefined;
      const email = optionalText(form, "email");
      const corporateEmail = optionalText(form, "corporateEmail");
      const crmPhone = optionalText(form, "crmPhone");
      const result = await apiRequest<CreateBrokerResponse>("/v1/admin/brokers/existing", {
        method: "POST",
        body: {
          name,
          phone: String(form.get("phone") ?? "").trim(),
          ...(email ? { email } : {}),
          ...(corporateEmail ? { corporateEmail } : {}),
          ...(crmPhone ? { crmPhone } : {}),
          level: String(form.get("level")),
          joinedAt: String(form.get("joinedAt")),
          progress,
          ...(onboardedAt ? { onboardedAt } : {}),
          ...readOptionalSplits(form),
        },
      });
      if (result.inviteUrl) {
        setCreated({ brokerId: result.brokerId, name, inviteUrl: result.inviteUrl, phone: result.phone });
        router.refresh();
      } else {
        dialogRef.current?.close();
        router.push(`/admin/brokers/${result.brokerId}`);
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
      aria-labelledby="existing-title"
      className="m-auto max-h-[calc(100dvh-32px)] w-[min(600px,calc(100vw-32px))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink overscroll-contain backdrop:bg-navy/50"
    >
      <div className="flex items-start justify-between gap-4 px-7 pt-7">
        <div>
          <h2 id="existing-title" className="text-[26px] font-extrabold tracking-tight">
            {created ? `${created.name} is added` : "Add an existing broker"}
          </h2>
          <p className="mt-1 text-base text-muted">
            {created
              ? "Send them this link to create their password. It also stays on their profile until they do."
              : "For someone who already works with 365 Yachts. Nothing is emailed; you get their sign-in link to send."}
          </p>
        </div>
        <button type="button" aria-label="Close" onClick={close} className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-page">
          <CloseIcon />
        </button>
      </div>
      {created ? (
        <div className="space-y-6 p-7">
          <CopyLink url={created.inviteUrl} phone={created.phone} brokerName={created.name} />
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
            <FieldLabel htmlFor="existing-name">Full name</FieldLabel>
            <input id="existing-name" name="name" required minLength={2} autoComplete="off" className={inputClasses()} />
          </div>
          <div>
            <FieldLabel htmlFor="existing-phone">Personal phone</FieldLabel>
            <input
              id="existing-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              required
              pattern={PHONE_PATTERN}
              placeholder="+1 561 555 0123"
              autoComplete="off"
              aria-describedby="existing-phone-help"
              className={inputClasses()}
            />
            <p id="existing-phone-help" className="mt-1.5 text-[15px] text-muted">
              International form, starting with + and the country code.
            </p>
          </div>
          <div>
            <FieldLabel htmlFor="existing-corporate-email">365 Yachts email (optional)</FieldLabel>
            <input
              id="existing-corporate-email"
              name="corporateEmail"
              type="email"
              spellCheck={false}
              autoComplete="off"
              placeholder="name@365yachts.org"
              aria-describedby="existing-corporate-email-help"
              className={inputClasses()}
            />
            <p id="existing-corporate-email-help" className="mt-1.5 text-[15px] text-muted">
              Their Google Workspace and GoHighLevel accounts are found by this email, so nothing new is created.
            </p>
          </div>
          <div>
            <FieldLabel htmlFor="existing-email">Sign-in email (optional)</FieldLabel>
            <input id="existing-email" name="email" type="email" spellCheck={false} autoComplete="off" aria-describedby="existing-email-help" className={inputClasses()} />
            <p id="existing-email-help" className="mt-1.5 text-[15px] text-muted">
              Leave blank to use their 365 email. With neither, they type their own email when they open the link.
            </p>
          </div>
          <div>
            <FieldLabel htmlFor="existing-crm-phone">CRM phone (optional)</FieldLabel>
            <input id="existing-crm-phone" name="crmPhone" type="tel" inputMode="tel" pattern={PHONE_PATTERN} placeholder="+1 561 555 0199" autoComplete="off" className={inputClasses()} />
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
          <fieldset>
            <legend className="mb-2 block text-[15px] font-bold">Onboarding</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {PROGRESS_CHOICES.map((choice) => (
                <label
                  key={choice.value}
                  className="grid min-h-[52px] cursor-pointer grid-cols-[auto_1fr] items-start gap-x-3 rounded-xl border border-[#cdd5e1] px-4 py-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
                >
                  <input
                    type="radio"
                    name="progress"
                    value={choice.value}
                    checked={progress === choice.value}
                    onChange={() => setProgress(choice.value)}
                    className="mt-1 size-4 shrink-0 accent-brand"
                  />
                  <span className="text-[17px] font-semibold">{choice.title}</span>
                  <span className="col-start-2 text-[15px] text-muted">{choice.detail}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="existing-joined">Joined 365 Yachts</FieldLabel>
              <input id="existing-joined" name="joinedAt" type="date" required max={today} defaultValue={today} className={inputClasses()} />
            </div>
            {progress === "onboarded" ? (
              <div>
                <FieldLabel htmlFor="existing-onboarded">Onboarded on</FieldLabel>
                <input id="existing-onboarded" name="onboardedAt" type="date" required max={today} defaultValue={today} className={inputClasses()} />
              </div>
            ) : null}
          </div>
          <CommissionSplitFields idPrefix="existing" optional />
          {error ? <FormMessage tone="error">{error}</FormMessage> : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Adding…" : "Add broker"}
            </Button>
          </div>
        </form>
      )}
    </dialog>
  );
}
