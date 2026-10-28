/**
 * File: apps/web/src/components/admin/contracts-panel.tsx
 * Purpose: The agreements panel on a broker's profile (3c, SPEC D31): the status of the Broker Agreement and the NDA
 * (not started, signed by broker, fully signed, signed outside, voided) with download links for every version,
 * one-click countersigning for the company signer (with a signature pad if her signature isn't set up), "Void and
 * re-issue", and uploading a copy signed outside the portal for brokers who signed on paper.
 *
 * Functions:
 * - ContractsPanel({ brokerId, data, signature }): the panel.
 * - OutsideUpload({ brokerId, documentKey, onDone }): the form to upload one already-signed document (the signing date can't be after today).
 */
"use client";

import { CONTRACT_STEP_KEY, CONTRACT_TEMPLATE_KEYS, CONTRACT_TITLES, contractStatusLabel, todayInTimeZone, type AdminContractsResponse, type CompanySignatureStatus, type ContractTemplateKey, type UploadTargetResponse } from "@bp/shared";
import { useRouter } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { DownloadVersion } from "@/components/contracts/contract-signing";
import { SignaturePad } from "@/components/contracts/signature-pad";
import { Button } from "@/components/ui/button";
import { FieldLabel, inputClasses } from "@/components/ui/misc";
import { Pill } from "@/components/ui/pill";
import { apiRequest, ApiError, uploadToTarget } from "@/lib/api-client";
import { formatDate } from "@/lib/format";

function OutsideUpload({ brokerId, documentKey, onDone }: { brokerId: string; documentKey: ContractTemplateKey; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return setError("Choose the signed PDF or scan.");
    setBusy(true);
    setError(null);
    try {
      const target = await apiRequest<UploadTargetResponse>(`/v1/admin/brokers/${brokerId}/steps/${CONTRACT_STEP_KEY}/upload-url`, {
        method: "POST",
        body: { fileName: file.name, contentType: file.type || "application/pdf", sizeBytes: file.size },
      });
      await uploadToTarget(target.upload, file);
      await apiRequest(`/v1/admin/brokers/${brokerId}/contracts/${documentKey}/outside`, {
        method: "POST",
        body: { storageKey: target.storageKey, fileName: file.name, signedOn: String(form.get("signedOn")) },
      });
      onDone();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The upload didn't finish. Try again.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl bg-page px-4 py-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
        <div>
          <FieldLabel htmlFor={`outside-file-${documentKey}`}>Signed copy (PDF, JPG or PNG)</FieldLabel>
          <input id={`outside-file-${documentKey}`} name="file" type="file" required accept="application/pdf,image/jpeg,image/png" className="block w-full text-base file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-line file:bg-white file:px-3 file:font-semibold" />
        </div>
        <div>
          <FieldLabel htmlFor={`outside-date-${documentKey}`}>Signed on</FieldLabel>
          <input id={`outside-date-${documentKey}`} name="signedOn" type="date" required max={todayInTimeZone()} className={inputClasses()} />
        </div>
      </div>
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      <Button type="submit" disabled={busy} aria-busy={busy}>
        {busy ? "Uploading…" : "Mark as signed outside the portal"}
      </Button>
    </form>
  );
}

export function ContractsPanel({ brokerId, data, signature }: { brokerId: string; data: AdminContractsResponse; signature: CompanySignatureStatus | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [uploading, setUploading] = useState<ContractTemplateKey | null>(null);
  const [drawn, setDrawn] = useState<string | null>(null);
  const onDrawn = useCallback((value: { png: string } | null) => setDrawn(value?.png ?? null), []);
  const current = new Map(CONTRACT_TEMPLATE_KEYS.map((key) => [key, data.documents.find((document) => document.key === key && document.status !== "voided") ?? null]));
  const voided = data.documents.filter((document) => document.status === "voided");
  const needsPad = data.canCountersign && !signature?.configured;

  async function countersign() {
    setBusy(true);
    setMessage(null);
    try {
      await apiRequest(`/v1/admin/brokers/${brokerId}/contracts/countersign`, { method: "POST", body: needsPad && drawn ? { pngDataUrl: drawn } : {} });
      setMessage({ tone: "success", text: "Countersigned. The broker has been emailed both signed copies." });
      router.refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Couldn't countersign." });
    }
    setBusy(false);
  }

  async function voidAll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
    setBusy(true);
    setMessage(null);
    try {
      await apiRequest(`/v1/admin/brokers/${brokerId}/contracts/void`, { method: "POST", body: { reason } });
      setVoiding(false);
      setMessage({ tone: "success", text: "Voided. The broker has been asked to sign the new documents." });
      router.refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Couldn't void the documents." });
    }
    setBusy(false);
  }

  return (
    <section aria-labelledby="contracts-title" className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-5">
        <h2 id="contracts-title" className="text-xl font-bold">
          Agreements
        </h2>
        {data.fullySigned ? <Pill tone="success">Fully signed</Pill> : data.waitingForCountersignature ? <Pill tone="warning">Waiting for countersignature</Pill> : null}
      </div>
      <ul>
        {CONTRACT_TEMPLATE_KEYS.map((key) => {
          const document = current.get(key);
          return (
            <li key={key} className="border-b border-line px-6 py-4 last:border-b-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold">{CONTRACT_TITLES[key].short}</p>
                  <p className="text-[15px] text-muted">
                    {document?.brokerSignedAt ? `Broker signed ${formatDate(document.brokerSignedAt)}` : ""}
                    {document?.companySignedAt ? ` · 365 signed ${formatDate(document.companySignedAt)}${document.companySignMethod === "auto" ? " (automatic)" : ""}` : ""}
                  </p>
                </div>
                <Pill tone={!document || document.status === "pending" ? "neutral" : document.status === "broker_signed" ? "warning" : "success"}>{document ? contractStatusLabel(document.status) : "Not started"}</Pill>
              </div>
              {document?.versions.length ? (
                <div className="mt-1 flex flex-wrap gap-x-4">
                  {document.versions.map((version) => (
                    <DownloadVersion key={version.kind} admin documentId={document.id} version={version.kind} label={version.label} />
                  ))}
                </div>
              ) : null}
              {uploading === key ? (
                <OutsideUpload
                  brokerId={brokerId}
                  documentKey={key}
                  onDone={() => {
                    setUploading(null);
                    setMessage({ tone: "success", text: `${CONTRACT_TITLES[key].short} recorded as signed outside the portal.` });
                    router.refresh();
                  }}
                />
              ) : document?.status !== "fully_signed" && document?.status !== "signed_outside" ? (
                <button type="button" onClick={() => setUploading(key)} className="mt-1 min-h-11 rounded-lg px-1 text-[15px] font-semibold text-brand">
                  Upload a copy signed outside the portal
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="space-y-4 border-t border-line bg-page/60 px-6 py-5">
        {data.waitingForCountersignature && !data.canCountersign ? (
          <p className="text-[17px] text-muted">Waiting for {signature?.signerName ?? "the company signer"} to countersign.</p>
        ) : null}
        {data.canCountersign ? (
          <div className="space-y-3">
            {needsPad ? <SignaturePad label="Your signature for this countersignature" typedDefault={signature?.signerName ?? ""} onChange={onDrawn} /> : null}
            <Button variant="approve" disabled={busy || (needsPad && !drawn)} aria-busy={busy} onClick={() => void countersign()}>
              Countersign both for 365 Yachts
            </Button>
          </div>
        ) : null}
        {voiding ? (
          <form onSubmit={voidAll} className="space-y-3">
            <div>
              <FieldLabel htmlFor="void-reason">Why are you voiding them?</FieldLabel>
              <input id="void-reason" name="reason" required minLength={3} maxLength={500} placeholder="e.g. Wrong legal name" autoComplete="off" className={inputClasses()} />
            </div>
            <div className="flex gap-3">
              <Button type="submit" variant="danger-outline" disabled={busy}>
                Void and re-issue
              </Button>
              <Button variant="outline" onClick={() => setVoiding(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="outline" onClick={() => setVoiding(true)} disabled={!data.documents.some((document) => document.status !== "voided")}>
            Void and re-issue
          </Button>
        )}
        {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
      </div>

      {voided.length ? (
        <details className="border-t border-line px-6 py-4">
          <summary className="min-h-11 cursor-pointer content-center text-[17px] font-semibold text-muted">Voided versions · {voided.length}</summary>
          <ul className="mt-2 space-y-3">
            {voided.map((document) => (
              <li key={document.id} className="text-[15px]">
                <p className="font-semibold">
                  {CONTRACT_TITLES[document.key].short} · voided {document.voidedAt ? formatDate(document.voidedAt) : ""}
                </p>
                {document.voidReason ? <p className="text-muted">{document.voidReason}</p> : null}
                <div className="flex flex-wrap gap-x-4">
                  {document.versions.map((version) => (
                    <DownloadVersion key={version.kind} admin documentId={document.id} version={version.kind} label={version.label} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
