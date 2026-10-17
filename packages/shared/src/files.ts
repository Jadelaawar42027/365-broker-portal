/**
 * File: packages/shared/src/files.ts
 * Purpose: Pure helpers for uploaded files: a storage-safe file name, the storage key layout from docs/SPEC.md
 * (brokers/{brokerId}/{stepKey}/{version}-{nonce}-{name}) and the human file-size text shown on screens.
 *
 * Functions:
 * - safeFileName(name): strips paths and unsafe characters, keeps the extension, caps the length; never returns an empty string.
 * - buildStorageKey(input): returns the storage key for one uploaded file.
 * - storageKeyPrefix(brokerId, stepKey): returns the key prefix every file of that broker step must start with.
 * - formatFileSize(bytes): returns "412 KB" / "1.2 MB" / "10 MB" style text.
 */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/^\.+/, "");
  if (!cleaned) return "file";
  if (cleaned.length <= 100) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const extension = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : "";
  return cleaned.slice(0, 100 - extension.length) + extension;
}

export function buildStorageKey(input: {
  brokerId: string;
  stepKey: string;
  version: number;
  nonce: string;
  fileName: string;
}): string {
  return `${storageKeyPrefix(input.brokerId, input.stepKey)}${input.version}-${input.nonce}-${safeFileName(input.fileName)}`;
}

export function storageKeyPrefix(brokerId: string, stepKey: string): string {
  return `brokers/${brokerId}/${stepKey}/`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}
