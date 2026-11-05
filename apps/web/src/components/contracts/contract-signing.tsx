/**
 * File: apps/web/src/components/contracts/contract-signing.tsx
 * Purpose: Step 3 for the broker (SPEC D31): "Broker Agreement" and "NDA" cards, each with a live preview of the
 * document filled with their details; a short form (mailing address, Florida license number, confirm phone and email);
 * the e-sign consent; one signature pad for both documents. Sign is enabled only when both documents have been opened.
 * Afterwards it shows the signed copies to download, or that they're waiting for the countersignature, plus any
 * earlier (voided) versions.
 *
 * Functions:
 * - ContractSigning({ data }): the whole step 3 area.
 * - DocumentCard({ document, previewUrl, opened, onOpened }): one document card with its preview toggle.
 * - SignedDocuments({ documents, title }): the list of documents with their download buttons.
 * - DownloadVersion({ documentId, version, label, admin }): a button that fetches a 5-minute link (from the broker or admin route) and opens it.
 * - useDebounced(value, delay): the value, updated only after it stops changing for delay milliseconds.
 */
"use client";

import { CONTRACT_TITLES, type ContractDocumentView, type MyContractsResponse } from "@bp/shared";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { CheckIcon, DownloadIcon } from "@/components/ui/icons";
import { FieldLabel, inputClasses } from "@/components/ui/misc";
import { Pill } from "@/components/ui/pill";
import { apiRequest, ApiError } from "@/lib/api-client";
import { PdfViewer } from "./pdf-viewer";
import { SignaturePad } from "./signature-pad";

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function DownloadVersion({ documentId, version, label, admin = false }: { documentId: string; version: string; label: string; admin?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const { url } = await apiRequest<{ url: string }>(`/v1/${admin ? "admin" : "me"}/contracts/${documentId}/download-url?version=${version}`);
            window.location.assign(url);
          } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "The download didn't start. Try again.");
          }
          setBusy(false);
        }}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-base font-semibold text-brand underline-offset-2 hover:underline disabled:opacity-60"
      >
        <DownloadIcon className="size-4" />
        {label}
      </button>
      {error ? <span className="text-[15px] text-danger">{error}</span> : null}
    </span>
  );
}

function SignedDocuments({ documents, title }: { documents: ContractDocumentView[]; title: string }) {
  if (!documents.length) return null;
  return (
    <section aria-label={title} className="space-y-3">
      <h3 className="text-lg font-bold">{title}</h3>
      <ul className="space-y-3">
        {documents.map((document) => (
          <li key={document.id} className="rounded-xl border border-line bg-white px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold">{CONTRACT_TITLES[document.key].short}</p>
              <Pill tone={document.status === "voided" ? "neutral" : document.status === "broker_signed" ? "warning" : "success"}>{document.statusLabel}</Pill>
            </div>
            {document.voidReason ? <p className="mt-1 text-[15px] text-muted">Voided: {document.voidReason}</p> : null}
            <div className="mt-2 flex flex-wrap gap-x-4">
              {document.versions.map((version) => (
                <DownloadVersion key={version.kind} documentId={document.id} version={version.kind} label={version.label} />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DocumentCard({ document, previewUrl, opened, onOpened }: { document: ContractDocumentView; previewUrl: string; opened: boolean; onOpened: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="rounded-2xl border border-line bg-white px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xl font-bold">{CONTRACT_TITLES[document.key].short}</h3>
          <p className="mt-0.5 text-[15px] text-muted">{document.title}</p>
        </div>
        {opened ? (
          <Pill tone="success">
            <CheckIcon className="size-4" />
            Opened
          </Pill>
        ) : (
          <Pill tone="neutral">Not opened yet</Pill>
        )}
      </div>
      <Button variant={open ? "outline" : "brand-outline"} className="mt-4" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {open ? "Hide the document" : opened ? "Read it again" : "Open and read"}
      </Button>
      {open ? (
        <div className="mt-4">
          <PdfViewer url={previewUrl} title={CONTRACT_TITLES[document.key].short} onLoaded={onOpened} />
        </div>
      ) : null}
    </article>
  );
}

export function ContractSigning({ data }: { data: MyContractsResponse }) {
  const router = useRouter();
  const [address, setAddress] = useState(data.details.mailingAddress ?? "");
  const [license, setLicense] = useState(data.details.floridaLicenseNo ?? "");
  const [phoneOk, setPhoneOk] = useState(false);
  const [emailOk, setEmailOk] = useState(false);
  const [consent, setConsent] = useState(false);
  const [signature, setSignature] = useState<{ png: string; method: "drawn" | "typed" } | null>(null);
  const [opened, setOpened] = useState<Record<string, boolean>>(() => Object.fromEntries(data.current.map((document) => [document.key, document.viewed])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewAddress = useDebounced(address, 800);
  const previewLicense = useDebounced(license, 800);
  const onSignature = useCallback((value: { png: string; method: "drawn" | "typed" } | null) => setSignature(value), []);

  if (!data.ready) {
    return <FormMessage tone="error">Your agreements aren&apos;t ready yet. Please check back soon or message Shelly.</FormMessage>;
  }

  const signable = data.current.length === 2 && data.current.every((document) => document.status === "pending");
  const waiting = data.current.length > 0 && data.current.every((document) => document.status === "broker_signed");
  const done = data.current.length > 0 && data.current.every((document) => document.status === "fully_signed" || document.status === "signed_outside");
  const splitsMissing = data.details.inHouseSplit === null || data.details.selfGeneratedSplit === null;
  const bothOpened = data.current.every((document) => opened[document.key]);
  const ready = signable && bothOpened && !splitsMissing && address.trim().length >= 8 && phoneOk && emailOk && consent && signature !== null;
  const query = new URLSearchParams({ ...(previewAddress.trim() ? { mailingAddress: previewAddress.trim() } : {}), ...(previewLicense.trim() ? { floridaLicenseNo: previewLicense.trim() } : {}) }).toString();

  async function sign() {
    if (!ready || !signature) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest("/v1/me/contracts/sign", {
        method: "POST",
        body: {
          mailingAddress: address.trim(),
          ...(license.trim() ? { floridaLicenseNo: license.trim() } : {}),
          phoneConfirmed: true,
          emailConfirmed: true,
          consent: true,
          signature: { method: signature.method, pngDataUrl: signature.png },
        },
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Signing didn't go through. Please try again.");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      {data.needsResign ? (
        <FormMessage tone="error">Your agreements changed, so the earlier ones were voided. Please read and sign the updated documents.</FormMessage>
      ) : null}

      {done ? (
        <div className="space-y-4 rounded-2xl border border-line bg-white px-6 py-6">
          <p className="flex items-center gap-2 text-lg font-bold text-success">
            <CheckIcon className="size-5" />
            Both agreements are signed by you and by 365 Yachts.
          </p>
          <p className="text-[17px] text-muted">We emailed you the signed copies. You can download them here any time.</p>
          <SignedDocuments documents={data.current} title="Your signed agreements" />
        </div>
      ) : waiting ? (
        <div className="space-y-4 rounded-2xl border border-line bg-white px-6 py-6">
          <p className="text-lg font-bold">Signed. Waiting for 365 Yachts to countersign.</p>
          <p className="text-[17px] text-muted">Shelly will countersign shortly, and we&apos;ll email you the fully signed copies.</p>
          <SignedDocuments documents={data.current} title="What you signed" />
        </div>
      ) : (
        <>
          {splitsMissing ? <FormMessage tone="error">Your commission split isn&apos;t set yet, so the agreement can&apos;t be signed. Message Shelly to add it.</FormMessage> : null}
          <section aria-labelledby="documents-title" className="space-y-3">
            <h2 id="documents-title" className="text-xl font-bold">
              1. Read both documents
            </h2>
            {data.current.map((document) => (
              <DocumentCard
                key={document.id}
                document={document}
                previewUrl={`/v1/me/contracts/${document.key}/preview${query ? `?${query}` : ""}`}
                opened={Boolean(opened[document.key])}
                onOpened={() => setOpened((current) => ({ ...current, [document.key]: true }))}
              />
            ))}
          </section>

          <section aria-labelledby="details-title" className="space-y-4 rounded-2xl border border-line bg-white px-5 py-6 sm:px-6">
            <h2 id="details-title" className="text-xl font-bold">
              2. Check your details
            </h2>
            <div>
              <FieldLabel htmlFor="mailing-address">Mailing address</FieldLabel>
              <textarea id="mailing-address" value={address} onChange={(event) => setAddress(event.target.value)} rows={2} maxLength={300} autoComplete="street-address" className={`${inputClasses()} py-3`} />
            </div>
            <div>
              <FieldLabel htmlFor="license-no">Florida license number (optional)</FieldLabel>
              <input id="license-no" value={license} onChange={(event) => setLicense(event.target.value)} maxLength={40} autoComplete="off" className={inputClasses()} />
            </div>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 text-[17px]">
              <input type="checkbox" checked={phoneOk} onChange={(event) => setPhoneOk(event.target.checked)} className="size-5 shrink-0 accent-brand" />
              <span>
                My phone is <strong>{data.details.phone ?? "not set"}</strong>
              </span>
            </label>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 text-[17px]">
              <input type="checkbox" checked={emailOk} onChange={(event) => setEmailOk(event.target.checked)} className="size-5 shrink-0 accent-brand" />
              <span className="min-w-0 break-words">
                My email is <strong>{data.details.email}</strong>
              </span>
            </label>
            <p className="text-[15px] text-muted">Something wrong with your name, phone, email or split? Message Shelly before you sign.</p>
          </section>

          <section aria-labelledby="sign-title" className="space-y-5 rounded-2xl border border-line bg-white px-5 py-6 sm:px-6">
            <h2 id="sign-title" className="text-xl font-bold">
              3. Sign once for both
            </h2>
            <SignaturePad label="Your signature" typedDefault={data.details.fullName} onChange={onSignature} />
            <label className="flex cursor-pointer items-start gap-3 text-[17px] leading-snug">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 size-5 shrink-0 accent-brand" />
              <span>{data.consentText}</span>
            </label>
            {!bothOpened ? <p className="text-[15px] font-semibold text-warn">Open and read both documents to enable signing.</p> : null}
            {error ? <FormMessage tone="error">{error}</FormMessage> : null}
            <Button size="xl" className="w-full" disabled={!ready || busy} aria-busy={busy} onClick={() => void sign()}>
              {busy ? "Signing…" : "Sign both agreements"}
            </Button>
          </section>
        </>
      )}

      {data.history.length ? (
        <details className="rounded-2xl border border-line bg-white px-5 py-4">
          <summary className="min-h-11 cursor-pointer content-center text-[17px] font-semibold text-muted">Earlier versions · {data.history.length}</summary>
          <div className="mt-3">
            <SignedDocuments documents={data.history} title="Earlier versions" />
          </div>
        </details>
      ) : null}
    </div>
  );
}
