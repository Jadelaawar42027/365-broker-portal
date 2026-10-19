/**
 * File: apps/api/src/services/provisioning/handlers.ts
 * Purpose: What each provisioning task does, per system and action. Every create looks the user up by email first, so
 * a retry never makes a duplicate: Google users are tagged with the broker's id (externalIds), and the address is saved
 * on the broker before Google is asked to create it. Google suspends and unsuspends; GoHighLevel has no deactivate
 * endpoint, so suspending deletes the GHL user and unsuspending creates (or finds) one again. Once the Google account
 * exists, the corporate email becomes the broker's portal login. Every change writes audit_log; passwords are generated
 * here, sent to the provider and forgotten. In dry-run mode linking an address nobody holds pretends it was found.
 *
 * Functions:
 * - DeferTask.constructor(message): signals that a task must wait for another one (it doesn't count as an attempt).
 * - loadTaskBroker(db, brokerId): the broker with their user's id, name, login email and personal phone; throws if gone.
 * - isUniqueViolation(error): true for a Postgres unique-constraint error (also when wrapped by Drizzle).
 * - addressInUseByOther(db, address, broker): true when another portal user or broker already holds the address.
 * - useAsLoginEmail(db, broker, email): makes the corporate email the broker's login when no one else uses it; audits the change.
 * - saveGoogleAccount(db, broker, user, action, extra): stores the Google user id (and address), switches the login email and audits.
 * - googleCreate(context, broker): finds or creates the broker's Workspace user (firstname, then firstname.lastname on a clash, then firstname.lastname2, 3, ...).
 * - googleLink(context, broker): stores the id of the existing Workspace user at the broker's corporate email (a pretend one in dry-run).
 * - googleSetSuspended(context, broker, suspended): suspends or unsuspends the broker's Workspace user.
 * - ghlEmail(context, broker): the address to use in GHL, or defers / fails when there is none yet.
 * - saveGhlAccount(db, broker, userId, action): stores the GHL user id and audits.
 * - ghlCreate(context, broker): finds or creates the broker's GHL user in the location.
 * - ghlLink(context, broker): stores the id of the existing GHL user with the broker's corporate email (a pretend one in dry-run).
 * - ghlSuspend(context, broker): deletes the broker's GHL user (the API has no deactivate).
 * - runTaskAction(context, task): dispatches a claimed task to the handler for its system and action.
 */
import { brokers, provisioningTasks, users, type Database, type DbOrTx } from "@bp/db";
import {
  corporateAddressCandidate,
  corporateLocalPart,
  generateTemporaryPassword,
  splitPersonName,
  type ProvisioningAction,
  type ProvisioningSystem,
} from "@bp/shared";
import { and, eq, inArray, ne, or } from "drizzle-orm";
import { writeAudit } from "../audit";
import { ProvisioningError } from "./errors";
import type { GoogleUser } from "./google";
import type { Integrations } from "./integrations";

export class DeferTask extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeferTask";
  }
}

export type TaskContext = { db: Database; integrations: Integrations; now: () => Date };

export type TaskBroker = Awaited<ReturnType<typeof loadTaskBroker>>;

const MAX_ADDRESS_CANDIDATES = 20;

export async function loadTaskBroker(db: DbOrTx, brokerId: string) {
  const [row] = await db
    .select({
      id: brokers.id,
      userId: brokers.userId,
      status: brokers.status,
      corporateEmail: brokers.corporateEmail,
      googleUserId: brokers.googleUserId,
      ghlUserId: brokers.ghlUserId,
      name: users.name,
      loginEmail: users.email,
      phone: users.phone,
    })
    .from(brokers)
    .innerJoin(users, eq(users.id, brokers.userId))
    .where(eq(brokers.id, brokerId));
  if (!row) throw new ProvisioningError("google", "The broker no longer exists.");
  return row;
}

function isUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: string; cause?: { code?: string } } | null;
  return candidate?.code === "23505" || candidate?.cause?.code === "23505";
}

async function addressInUseByOther(db: DbOrTx, address: string, broker: TaskBroker): Promise<boolean> {
  const [user] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, address), ne(users.id, broker.userId))).limit(1);
  if (user) return true;
  const [other] = await db.select({ id: brokers.id }).from(brokers).where(and(eq(brokers.corporateEmail, address), ne(brokers.id, broker.id))).limit(1);
  return Boolean(other);
}

async function useAsLoginEmail(db: DbOrTx, broker: TaskBroker, email: string): Promise<void> {
  if (broker.loginEmail === email) return;
  if (await addressInUseByOther(db, email, broker)) return;
  await db.update(users).set({ email }).where(eq(users.id, broker.userId));
  await writeAudit(db, {
    actorUserId: null,
    action: "user.login_email_changed",
    entityType: "user",
    entityId: broker.userId,
    before: { email: broker.loginEmail },
    after: { email, reason: "365 email created" },
  });
}

async function saveGoogleAccount(db: Database, broker: TaskBroker, user: GoogleUser, action: string, extra: Record<string, unknown> = {}) {
  await db.transaction(async (tx) => {
    await tx.update(brokers).set({ googleUserId: user.id, corporateEmail: user.email }).where(eq(brokers.id, broker.id));
    await useAsLoginEmail(tx, broker, user.email);
    await writeAudit(tx, {
      actorUserId: null,
      action: `provisioning.google.${action}`,
      entityType: "broker",
      entityId: broker.id,
      before: { googleUserId: broker.googleUserId, corporateEmail: broker.corporateEmail },
      after: { googleUserId: user.id, corporateEmail: user.email, ...extra },
    });
  });
}

async function googleCreate(context: TaskContext, broker: TaskBroker): Promise<void> {
  const google = context.integrations.google!;
  if (broker.googleUserId) return;
  const fixed = broker.corporateEmail;
  if (!fixed && !corporateLocalPart(broker.name)) {
    throw new ProvisioningError("google", "Google: the broker's name has no letters to build an address from. Enter the corporate email by hand.");
  }
  const candidates = fixed
    ? [fixed]
    : Array.from({ length: MAX_ADDRESS_CANDIDATES }, (_, index) => corporateAddressCandidate(broker.name, google.domain, index + 1)!);
  for (const address of candidates) {
    if (!fixed && (await addressInUseByOther(context.db, address, broker))) continue;
    const existing = await google.findUser(address);
    if (existing) {
      if (existing.brokerId === broker.id) {
        await saveGoogleAccount(context.db, broker, existing, "created", { found: "already created on an earlier attempt" });
        return;
      }
      if (fixed) {
        throw new ProvisioningError("google", `Google: ${address} already belongs to another Workspace account. If it is this broker's, use "Link existing account".`);
      }
      continue;
    }
    if (!fixed) {
      try {
        await context.db.update(brokers).set({ corporateEmail: address }).where(eq(brokers.id, broker.id));
      } catch (error) {
        if (isUniqueViolation(error)) continue;
        throw error;
      }
    }
    const { firstName, lastName } = splitPersonName(broker.name);
    let created: GoogleUser;
    try {
      created = await google.createUser({ email: address, firstName, lastName, password: generateTemporaryPassword(), recoveryPhone: broker.phone, brokerId: broker.id });
    } catch (error) {
      if (error instanceof ProvisioningError && error.status === 409 && !fixed) {
        await context.db.update(brokers).set({ corporateEmail: null }).where(eq(brokers.id, broker.id));
        continue;
      }
      throw error;
    }
    await saveGoogleAccount(context.db, broker, created, "created");
    return;
  }
  throw new ProvisioningError("google", `Google: couldn't find a free address for ${broker.name}. Enter the corporate email by hand.`);
}

async function googleLink(context: TaskContext, broker: TaskBroker): Promise<void> {
  if (!broker.corporateEmail) throw new ProvisioningError("google", "Google: add the broker's corporate email first, then link.");
  const google = context.integrations.google!;
  const found =
    (await google.findUser(broker.corporateEmail)) ??
    (google.dryRun ? await google.createUser({ email: broker.corporateEmail, ...splitPersonName(broker.name), password: "", recoveryPhone: null, brokerId: broker.id }) : null);
  if (!found) throw new ProvisioningError("google", `Google: there's no Workspace account for ${broker.corporateEmail}.`);
  await saveGoogleAccount(context.db, broker, found, "linked", { suspended: found.suspended });
}

async function googleSetSuspended(context: TaskContext, broker: TaskBroker, suspended: boolean): Promise<void> {
  if (!broker.googleUserId) return;
  await context.integrations.google!.setSuspended(broker.googleUserId, suspended);
  await writeAudit(context.db, {
    actorUserId: null,
    action: suspended ? "provisioning.google.suspended" : "provisioning.google.unsuspended",
    entityType: "broker",
    entityId: broker.id,
    after: { googleUserId: broker.googleUserId },
  });
}

async function ghlEmail(context: TaskContext, broker: TaskBroker): Promise<string> {
  if (broker.corporateEmail) return broker.corporateEmail;
  if (context.integrations.google) {
    const [googleOpen] = await context.db
      .select({ id: provisioningTasks.id })
      .from(provisioningTasks)
      .where(and(eq(provisioningTasks.brokerId, broker.id), eq(provisioningTasks.system, "google"), inArray(provisioningTasks.status, ["pending", "running"]), or(eq(provisioningTasks.action, "create"), eq(provisioningTasks.action, "link"))))
      .limit(1);
    if (googleOpen) throw new DeferTask("Waiting for the 365 email to be created in Google first.");
  }
  throw new ProvisioningError("ghl", "GHL: the broker has no 365 email yet. Create the Google account or enter the corporate email, then Retry.");
}

async function saveGhlAccount(db: Database, broker: TaskBroker, userId: string, action: string) {
  await db.transaction(async (tx) => {
    await tx.update(brokers).set({ ghlUserId: userId }).where(eq(brokers.id, broker.id));
    await writeAudit(tx, {
      actorUserId: null,
      action: `provisioning.ghl.${action}`,
      entityType: "broker",
      entityId: broker.id,
      before: { ghlUserId: broker.ghlUserId },
      after: { ghlUserId: userId },
    });
  });
}

async function ghlCreate(context: TaskContext, broker: TaskBroker, action: "created" | "unsuspended"): Promise<void> {
  if (broker.ghlUserId && action === "created") return;
  const ghl = context.integrations.ghl!;
  const email = await ghlEmail(context, broker);
  const existing = await ghl.findUserByEmail(email);
  if (existing) {
    await saveGhlAccount(context.db, broker, existing.id, action);
    return;
  }
  const { firstName, lastName } = splitPersonName(broker.name);
  const created = await ghl.createUser({ email, firstName, lastName, phone: broker.phone, password: generateTemporaryPassword() });
  await saveGhlAccount(context.db, broker, created.id, action);
}

async function ghlLink(context: TaskContext, broker: TaskBroker): Promise<void> {
  if (!broker.corporateEmail) throw new ProvisioningError("ghl", "GHL: add the broker's corporate email first, then link.");
  const ghl = context.integrations.ghl!;
  const found =
    (await ghl.findUserByEmail(broker.corporateEmail)) ??
    (ghl.dryRun ? await ghl.createUser({ email: broker.corporateEmail, ...splitPersonName(broker.name), phone: null, password: "" }) : null);
  if (!found) throw new ProvisioningError("ghl", `GHL: there's no user with ${broker.corporateEmail} in the agency.`);
  await saveGhlAccount(context.db, broker, found.id, "linked");
}

async function ghlSuspend(context: TaskContext, broker: TaskBroker): Promise<void> {
  if (!broker.ghlUserId) return;
  await context.integrations.ghl!.deleteUser(broker.ghlUserId);
  await writeAudit(context.db, {
    actorUserId: null,
    action: "provisioning.ghl.suspended",
    entityType: "broker",
    entityId: broker.id,
    after: { ghlUserId: broker.ghlUserId, how: "deleted (GHL has no deactivate)" },
  });
}

export async function runTaskAction(context: TaskContext, task: { brokerId: string; system: ProvisioningSystem; action: ProvisioningAction }): Promise<void> {
  const broker = await loadTaskBroker(context.db, task.brokerId);
  if (task.system === "google") {
    if (task.action === "create") return googleCreate(context, broker);
    if (task.action === "link") return googleLink(context, broker);
    return googleSetSuspended(context, broker, task.action === "suspend");
  }
  if (task.action === "create") return ghlCreate(context, broker, "created");
  if (task.action === "link") return ghlLink(context, broker);
  if (task.action === "suspend") return ghlSuspend(context, broker);
  return ghlCreate(context, broker, "unsuspended");
}
