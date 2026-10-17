/**
 * File: apps/web/src/components/ui/file-link.tsx
 * Purpose: Buttons that fetch a short-lived download link from the API and open it: one for uploaded files (the API
 * checks permission and logs admin downloads) and one for a step's blank template.
 *
 * Functions:
 * - FileLinkButton({ fileId, inline, children, className }): opens or downloads one uploaded file.
 * - TemplateDownloadButton({ stepKey, label }): downloads the step's template file.
 * - openUrl(path, inline): asks the API for the link at path and opens it in a new tab or the current one.
 */
"use client";

import { useState, type ReactNode } from "react";
import { buttonClasses } from "./button";
import { DownloadIcon } from "./icons";
import { apiRequest, ApiError } from "@/lib/api-client";

async function openUrl(path: string, inline: boolean): Promise<string | null> {
  try {
    const { url } = await apiRequest<{ url: string }>(path);
    if (inline) window.open(url, "_blank", "noopener,noreferrer");
    else window.location.assign(url);
    return null;
  } catch (caught) {
    return caught instanceof ApiError ? caught.message : "Couldn't open the file. Try again.";
  }
}

export function FileLinkButton({
  fileId,
  inline = false,
  children,
  className = "",
}: {
  fileId: string;
  inline?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className={className || "min-h-11 font-semibold text-brand underline underline-offset-2"}
        onClick={async () => setError(await openUrl(`/v1/files/${fileId}/download-url${inline ? "?inline=true" : ""}`, inline))}
      >
        {children}
      </button>
      {error ? <span role="alert" className="block text-sm text-danger">{error}</span> : null}
    </>
  );
}

export function TemplateDownloadButton({ stepKey, label }: { stepKey: string; label: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className={buttonClasses("brand-outline", "lg")}
        onClick={async () => setError(await openUrl(`/v1/me/steps/${stepKey}/template-url`, false))}
      >
        <DownloadIcon />
        {label}
      </button>
      {error ? <span role="alert" className="mt-2 block text-base text-danger">{error}</span> : null}
    </>
  );
}
