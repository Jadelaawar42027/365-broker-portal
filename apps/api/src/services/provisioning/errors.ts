/**
 * File: apps/api/src/services/provisioning/errors.ts
 * Purpose: The error the Google and GoHighLevel clients throw. Its message is already in plain words for the Accounts
 * panel (e.g. "Google: the service account isn't authorized. Check domain-wide delegation."), and it says whether
 * trying again later can help (network trouble, rate limits and server errors) or not (bad credentials or input).
 *
 * Functions:
 * - ProvisioningError.constructor(system, message, options): an error for one system with its HTTP status and retryability.
 * - isRetryableStatus(status): true for 408, 429 and 5xx responses.
 * - toProvisioningError(system, error): wraps anything thrown (network failures included) as a ProvisioningError.
 * - readErrorText(response): the best error message a provider's JSON or text body offers, or "" when there is none.
 */
import type { ProvisioningSystem } from "@bp/shared";

const SYSTEM_NAMES: Record<ProvisioningSystem, string> = { google: "Google", ghl: "GHL" };

export class ProvisioningError extends Error {
  readonly system: ProvisioningSystem;
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(system: ProvisioningSystem, message: string, options: { status?: number | null; retryable?: boolean } = {}) {
    super(message);
    this.name = "ProvisioningError";
    this.system = system;
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
  }
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export function toProvisioningError(system: ProvisioningSystem, error: unknown): ProvisioningError {
  if (error instanceof ProvisioningError) return error;
  return new ProvisioningError(system, `${SYSTEM_NAMES[system]}: couldn't reach the service. We'll try again.`, { retryable: true });
}

export async function readErrorText(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    const nested = body.error as Record<string, unknown> | string | undefined;
    if (nested && typeof nested === "object" && typeof nested.message === "string") return nested.message;
    if (typeof body.error_description === "string") return body.error_description;
    if (typeof body.message === "string") return body.message;
    if (Array.isArray(body.message)) return body.message.filter((item) => typeof item === "string").join("; ");
    if (typeof nested === "string") return nested;
  } catch {
    return text.slice(0, 300);
  }
  return "";
}
