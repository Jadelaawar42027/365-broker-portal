/**
 * File: apps/web/src/lib/api-client.ts
 * Purpose: How browser code talks to the API: same-origin requests to /v1 and /api/auth (proxied by Next.js, SPEC
 * D10) that return parsed JSON or throw an ApiError carrying the API's plain-language message.
 *
 * Functions:
 * - ApiError.constructor(status, code, message): an error with the HTTP status and the API's error code.
 * - apiRequest(path, options): sends a JSON request and returns the parsed response body.
 * - uploadToTarget(target, file): PUTs a file to the upload URL the API issued (storage or the API's proxy).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function apiRequest<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    credentials: "same-origin",
    headers: options.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!response.ok) {
    const message = typeof data.message === "string" ? data.message : "Something went wrong. Please try again.";
    const code = typeof data.error === "string" ? data.error : typeof data.code === "string" ? data.code : "error";
    throw new ApiError(response.status, code, message);
  }
  return data as T;
}

export async function uploadToTarget(
  target: { url: string; method: "PUT"; headers: Record<string, string> },
  file: Blob,
): Promise<void> {
  const response = await fetch(target.url, {
    method: target.method,
    headers: target.headers,
    body: file,
    credentials: target.url.startsWith("/") ? "same-origin" : "omit",
  });
  if (!response.ok) throw new ApiError(response.status, "upload_failed", "The upload didn't finish. Check your connection and try again.");
}
