/**
 * File: packages/shared/src/permissions.ts
 * Purpose: Who may do what. The API runs these checks on every route (CLAUDE.md Rule 6); the web app may use
 * them only to hide buttons, never as the real check.
 *
 * Functions:
 * - isAdminRole(role): true for admin and owner.
 * - canManageAdmins(role): true only for owner; gates owner-only actions such as deleting a broker (any admin may invite admins, SPEC D7).
 * - canAccessBroker(actor, brokerUserId): true if the actor is an admin/owner or is that broker.
 * - canLogIn(input): false for a broker whose status is inactive (SPEC D9), true otherwise.
 */
import type { BrokerStatus, UserRole } from "./constants";

export type Actor = { userId: string; role: UserRole };

export function isAdminRole(role: UserRole): boolean {
  return role === "admin" || role === "owner";
}

export function canManageAdmins(role: UserRole): boolean {
  return role === "owner";
}

export function canAccessBroker(actor: Actor, brokerUserId: string): boolean {
  return isAdminRole(actor.role) || actor.userId === brokerUserId;
}

export function canLogIn(input: { role: UserRole; brokerStatus: BrokerStatus | null }): boolean {
  return !(input.role === "broker" && input.brokerStatus === "inactive");
}
