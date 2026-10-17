/**
 * File: packages/shared/test/permissions.test.ts
 * Purpose: Tests for the permission helpers, including the inactive-broker login block (SPEC D9).
 *
 * Functions:
 * - none
 */
import { describe, expect, it } from "vitest";
import { canAccessBroker, canLogIn, canManageAdmins, isAdminRole } from "../src/permissions";

describe("roles", () => {
  it("admin and owner are admin roles, broker is not", () => {
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("owner")).toBe(true);
    expect(isAdminRole("broker")).toBe(false);
  });

  it("only the owner manages admins", () => {
    expect(canManageAdmins("owner")).toBe(true);
    expect(canManageAdmins("admin")).toBe(false);
    expect(canManageAdmins("broker")).toBe(false);
  });
});

describe("canAccessBroker", () => {
  it("lets a broker reach only their own data", () => {
    expect(canAccessBroker({ userId: "a", role: "broker" }, "a")).toBe(true);
    expect(canAccessBroker({ userId: "a", role: "broker" }, "b")).toBe(false);
  });

  it("lets admins reach any broker", () => {
    expect(canAccessBroker({ userId: "x", role: "admin" }, "b")).toBe(true);
    expect(canAccessBroker({ userId: "x", role: "owner" }, "b")).toBe(true);
  });
});

describe("canLogIn", () => {
  it("blocks inactive brokers only", () => {
    expect(canLogIn({ role: "broker", brokerStatus: "inactive" })).toBe(false);
    expect(canLogIn({ role: "broker", brokerStatus: "active" })).toBe(true);
    expect(canLogIn({ role: "broker", brokerStatus: "onboarding" })).toBe(true);
    expect(canLogIn({ role: "admin", brokerStatus: null })).toBe(true);
  });
});
