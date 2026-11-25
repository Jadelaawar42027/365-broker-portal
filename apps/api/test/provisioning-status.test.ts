/**
 * File: apps/api/test/provisioning-status.test.ts
 * Purpose: Unit tests for the account status shown to admins: a finished Google suspend shows as suspended, a finished
 * GoHighLevel suspend shows as manual_action (the portal never deletes GHL users, so an admin has to handle them in GHL),
 * and the other states are unchanged.
 *
 * Functions:
 * - none
 */
import { ACCOUNT_STATUS_LABELS } from "@bp/shared";
import { describe, expect, it } from "vitest";
import { deriveAccountStatus } from "../src/services/provisioning/status";

const suspendDone = { action: "suspend" as const, status: "done" as const };

describe("deriveAccountStatus", () => {
  it("shows a suspended Google account as suspended", () => {
    expect(deriveAccountStatus({ system: "google", configured: true, accountId: "g-1", latest: suspendDone })).toBe("suspended");
  });

  it("shows a suspended GHL account as needing manual action, because the GHL user is never deleted", () => {
    const status = deriveAccountStatus({ system: "ghl", configured: true, accountId: "ghl-1", latest: suspendDone });
    expect(status).toBe("manual_action");
    expect(ACCOUNT_STATUS_LABELS[status]).toBe("Handle in GHL manually");
  });

  it("keeps the other states", () => {
    expect(deriveAccountStatus({ system: "ghl", configured: true, accountId: "ghl-1", latest: { action: "create", status: "done" } })).toBe("created");
    expect(deriveAccountStatus({ system: "ghl", configured: true, accountId: "ghl-1", latest: { action: "suspend", status: "pending" } })).toBe("pending");
    expect(deriveAccountStatus({ system: "ghl", configured: true, accountId: "ghl-1", latest: { action: "suspend", status: "failed" } })).toBe("failed");
    expect(deriveAccountStatus({ system: "ghl", configured: true, accountId: null, latest: null })).toBe("not_set_up");
    expect(deriveAccountStatus({ system: "ghl", configured: false, accountId: null, latest: null })).toBe("not_configured");
  });
});
