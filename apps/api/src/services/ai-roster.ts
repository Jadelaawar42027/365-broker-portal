/**
 * File: apps/api/src/services/ai-roster.ts
 * Purpose: Keeps the 365 Yachts AI's roster in step with the portal: a new broker is added to the bot's roster and a
 * deleted broker is deactivated there, through the bot's roster API (POST and DELETE /api/brokers). It does nothing
 * unless AI_ROSTER_SYNC_ENABLED is "true" and the bot's URL and secret are set, so test accounts never reach the bot.
 * A failed call never fails the portal request; it is logged and recorded in audit_log as roster.add_failed or roster.remove_failed.
 *
 * Functions:
 * - rosterTarget(env): the bot's URL and secret when syncing is switched on and configured, otherwise null.
 * - rosterPhone(phone): a phone number as the digits-only id the roster uses.
 * - callRoster(target, method, path, body): sends one request to the roster API with a 5 second limit; returns the HTTP status and error text.
 * - addBrokerToAiRoster(deps, log, broker): adds the broker to the roster as role "broker" (already on the roster counts as done) and records the outcome.
 * - removeBrokerFromAiRoster(deps, log, broker): deactivates the broker's roster entry (no entry counts as done) and records the outcome.
 */
import type { Database } from "@bp/db";
import type { FastifyBaseLogger } from "fastify";
import type { ApiEnv } from "../env";
import { writeAudit } from "./audit";

type RosterTarget = { url: string; secret: string };
type RosterDeps = { env: ApiEnv; db: Database };
type RosterBroker = { brokerId: string; name: string; phone: string | null; email?: string | null; actorUserId: string | null };

const ROSTER_TIMEOUT_MS = 5000;

export function rosterTarget(env: ApiEnv): RosterTarget | null {
  if (!env.AI_ROSTER_SYNC_ENABLED || !env.AI_ROSTER_API_URL || !env.AI_ROSTER_API_SECRET) return null;
  return { url: env.AI_ROSTER_API_URL, secret: env.AI_ROSTER_API_SECRET };
}

export function rosterPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

async function callRoster(target: RosterTarget, method: "POST" | "DELETE", path: string, body?: unknown): Promise<{ status: number; error: string | null }> {
  try {
    const response = await fetch(`${target.url}${path}`, {
      method,
      headers: { authorization: `Bearer ${target.secret}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(ROSTER_TIMEOUT_MS),
    });
    if (response.ok) return { status: response.status, error: null };
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    return { status: response.status, error: payload?.error ?? `HTTP ${response.status}` };
  } catch (error) {
    return { status: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function addBrokerToAiRoster(deps: RosterDeps, log: FastifyBaseLogger, broker: RosterBroker): Promise<void> {
  const target = rosterTarget(deps.env);
  if (!target || !broker.phone) return;
  const phone = rosterPhone(broker.phone);
  const result = await callRoster(target, "POST", "/api/brokers", { phone, name: broker.name, role: "broker", email: broker.email ?? null });
  const alreadyThere = result.status === 409 && Boolean(result.error?.includes("already on the roster - use PATCH"));
  const ok = result.error === null || alreadyThere;
  if (!ok) log.error({ brokerId: broker.brokerId, status: result.status, error: result.error }, "Couldn't add the broker to the AI roster");
  await writeAudit(deps.db, {
    actorUserId: broker.actorUserId,
    action: ok ? "roster.added" : "roster.add_failed",
    entityType: "broker",
    entityId: broker.brokerId,
    after: { phone, status: result.status, ...(alreadyThere ? { alreadyOnRoster: true } : {}), ...(ok ? {} : { error: result.error }) },
  });
}

export async function removeBrokerFromAiRoster(deps: RosterDeps, log: FastifyBaseLogger, broker: RosterBroker): Promise<void> {
  const target = rosterTarget(deps.env);
  if (!target || !broker.phone) return;
  const phone = rosterPhone(broker.phone);
  const result = await callRoster(target, "DELETE", `/api/brokers/${phone}`);
  const ok = result.error === null || result.status === 404;
  if (!ok) log.error({ brokerId: broker.brokerId, status: result.status, error: result.error }, "Couldn't remove the broker from the AI roster");
  await writeAudit(deps.db, {
    actorUserId: broker.actorUserId,
    action: ok ? "roster.removed" : "roster.remove_failed",
    entityType: "broker",
    entityId: broker.brokerId,
    after: { phone, name: broker.name, status: result.status, ...(result.status === 404 ? { notOnRoster: true } : {}), ...(ok ? {} : { error: result.error }) },
  });
}
