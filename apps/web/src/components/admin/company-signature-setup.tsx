/**
 * File: apps/web/src/components/admin/company-signature-setup.tsx
 * Purpose: The company signature on the signer's admin profile (SPEC D31). The company signer (COMPANY_SIGNER_EMAIL)
 * draws or uploads her signature (PNG), ticks the authorization to apply it to Broker Agreements and NDAs, and can
 * replace it or switch automatic signing off. Other admins see whether it's set up.
 *
 * Functions:
 * - CompanySignatureSetup({ status }): the panel.
 * - readPng(file): a PNG file as a data URL; rejects other types and files over 400 KB.
 */
"use client";

import { MAX_SIGNATURE_PNG_BYTES, type CompanySignatureStatus } from "@bp/shared";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { SignaturePad } from "@/components/contracts/signature-pad";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { apiRequest, ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";

function readPng(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.type !== "image/png") return reject(new Error("Upload a PNG image (a transparent background works best)."));
    if (file.size > MAX_SIGNATURE_PNG_BYTES) return reject(new Error("The image is over 400 KB. Crop it closer to the signature."));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The image couldn't be read."));
    reader.readAsDataURL(file);
  });
}

export function CompanySignatureSetup({ status }: { status: CompanySignatureStatus }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!status.configured);
  const [source, setSource] = useState<"draw" | "upload">("draw");
  const [drawn, setDrawn] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [authorize, setAuthorize] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const onDrawn = useCallback((value: { png: string } | null) => setDrawn(value?.png ?? null), []);

  useEffect(() => {
    if (!status.isSigner || !status.configured) return;
    apiRequest<{ url: string }>("/v1/admin/company-signature/image-url")
      .then((result) => setImageUrl(result.url))
      .catch(() => setImageUrl(null));
  }, [status.isSigner, status.configured, status.authorizedAt]);

  if (!status.signerEmail) {
    return <FormMessage tone="error">No company signer is set. Aj needs to set COMPANY_SIGNER_EMAIL on the API service to Shelly&apos;s admin email.</FormMessage>;
  }
  if (!status.isSigner) {
    return (
      <div className="space-y-2 text-[17px]">
        <p>
          The company signer is <strong>{status.signerName ?? status.signerEmail}</strong>. Only they can set or change the company signature.
        </p>
        <p>
          <Pill tone={status.configured ? "success" : "warning"}>{status.configured ? (status.autoSign ? "Set up · signing automatically" : "Set up · auto-signing off") : "Not set up yet"}</Pill>
        </p>
      </div>
    );
  }

  const png = source === "draw" ? drawn : uploaded;

  async function save() {
    if (!png || !authorize) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiRequest("/v1/admin/company-signature", { method: "PUT", body: { pngDataUrl: png, authorize: true } });
      setEditing(false);
      setAuthorize(false);
      setMessage({ tone: "success", text: "Saved. Your signature will be applied to new Broker Agreements and NDAs." });
      router.refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Couldn't save your signature." });
    }
    setBusy(false);
  }

  async function toggleAutoSign(next: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      await apiRequest("/v1/admin/company-signature", { method: "PATCH", body: { autoSign: next } });
      router.refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Couldn't change auto-signing." });
    }
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      {status.configured ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Pill tone={status.autoSign ? "success" : "warning"}>{status.autoSign ? "Signing automatically" : "Auto-signing off · you countersign by hand"}</Pill>
            {status.authorizedAt ? <span className="text-[15px] text-muted">Authorized {formatDate(status.authorizedAt)}</span> : null}
          </div>
          {imageUrl ? (
            <div className="inline-block rounded-xl border border-line bg-white px-6 py-4">
              <img src={imageUrl} alt="Your company signature" className="h-16 w-auto" />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" disabled={busy} onClick={() => void toggleAutoSign(!status.autoSign)}>
              {status.autoSign ? "Turn auto-signing off" : "Turn auto-signing on"}
            </Button>
            {!editing ? (
              <Button variant="outline" onClick={() => setEditing(true)}>
                Replace signature
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <FormMessage tone="error">Your company signature isn&apos;t set up yet. Until it is, every broker&apos;s agreements wait for you to countersign them.</FormMessage>
      )}

      {editing ? (
        <div className="space-y-5 rounded-2xl border border-line bg-white px-5 py-6">
          <div role="tablist" aria-label="Signature source" className="inline-flex rounded-xl border border-line bg-page p-1">
            {(["draw", "upload"] as const).map((option) => (
              <button key={option} type="button" role="tab" aria-selected={source === option} onClick={() => setSource(option)} className={`min-h-11 rounded-lg px-4 text-base font-semibold ${source === option ? "bg-white text-navy shadow-sm" : "text-muted"}`}>
                {option === "draw" ? "Draw it" : "Upload a PNG"}
              </button>
            ))}
          </div>
          <div hidden={source !== "draw"}>
            <SignaturePad label="Your signature" typedDefault={status.signerName ?? ""} onChange={onDrawn} />
          </div>
          <div hidden={source !== "upload"} className="space-y-3">
            <label htmlFor="signature-file" className="block text-lg font-bold">
              Upload your signature
            </label>
            <input
              id="signature-file"
              type="file"
              accept="image/png"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                try {
                  setUploaded(await readPng(file));
                  setMessage(null);
                } catch (caught) {
                  setUploaded(null);
                  setMessage({ tone: "error", text: caught instanceof Error ? caught.message : "That image can't be used." });
                }
              }}
              className="block w-full text-base file:mr-4 file:min-h-11 file:rounded-lg file:border file:border-line file:bg-white file:px-4 file:font-semibold"
            />
            {uploaded ? <img src={uploaded} alt="The signature you uploaded" className="h-16 w-auto rounded-lg border border-line bg-white p-2" /> : null}
          </div>
          <label className="flex cursor-pointer items-start gap-3 text-[17px] leading-snug">
            <input type="checkbox" checked={authorize} onChange={(event) => setAuthorize(event.target.checked)} className="mt-0.5 size-5 shrink-0 accent-brand" />
            <span>{status.authorizationText}</span>
          </label>
          <div className="flex flex-wrap gap-3">
            <Button disabled={!png || !authorize || busy} aria-busy={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save my signature"}
            </Button>
            {status.configured ? (
              <Button variant="outline" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
    </div>
  );
}
