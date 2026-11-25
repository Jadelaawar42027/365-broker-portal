/**
 * File: apps/api/src/services/persona-tags.ts
 * Purpose: Keeps broker_persona_tags in step with each broker's persona. After a persona is saved (and from the backfill)
 * the tags are re-extracted with Claude only when the persona text's hash changed (or when forced); an empty persona
 * clears the extracted values. Admin overrides are kept through every re-extraction and always win over extracted
 * values. Every extraction, failure, clearing and override edit is written to audit_log against the broker.
 *
 * Functions:
 * - rowToExtracted(row): the extracted tags stored on a row, or null when nothing was ever extracted.
 * - loadPersonaState(db, brokerId): the broker's persona text and tags row; throws 404 when the broker doesn't exist.
 * - refreshPersonaTags(deps, brokerId, options): re-extracts one broker's tags if needed; returns what happened (updated, unchanged, cleared, no_persona, superseded, failed or no_ai).
 * - backfillPersonaTags(deps, options): runs refreshPersonaTags for every broker with a persona or stored tags, three at a time; returns the count of each outcome.
 * - countBackfillBrokers(db): how many brokers the backfill would check.
 * - personaTagsStatus(personaMd, row): current, stale, failed, pending or no_persona.
 * - personaTagsView(deps, brokerId): the admin view of a broker's extracted, overridden and effective tags.
 * - updatePersonaTagOverrides(deps, brokerId, patch, actorUserId): sets and clears overrides (cleaned the same way as extracted tags) and audits the change; returns the new view.
 * - loadEffectiveTags(db, brokerIds): each broker's effective tags (overrides over extracted), or null when they have none.
 */
import { brokerPersonaTags, brokers, personaHash, type Database } from "@bp/db";
import {
  cleanPersonaTags,
  emptyPersonaTags,
  hasAnyPersonaTag,
  MAX_LEADS_PER_WEEK_LIMIT,
  mergePersonaTags,
  PERSONA_TAG_FIELDS,
  type PersonaTagOverrides,
  type PersonaTags,
  type PersonaTagsPatch,
  type PersonaTagsStatus,
  type PersonaTagsView,
} from "@bp/shared";
import { eq, inArray, isNotNull, or } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { badRequest, notFound } from "../errors";
import { writeAudit } from "./audit";
import type { MatchAi } from "./match/claude";

export type PersonaTagDeps = { db: Database; matchAi: MatchAi | null; now: () => Date; log: Pick<FastifyBaseLogger, "warn"> };

export type RefreshOutcome = "updated" | "unchanged" | "cleared" | "no_persona" | "superseded" | "failed" | "no_ai";

type TagRow = typeof brokerPersonaTags.$inferSelect;

const BACKFILL_CONCURRENCY = 3;

function rowToExtracted(row: TagRow | null): PersonaTags | null {
  if (!row || !row.extractedAt) return null;
  return {
    backgroundTags: row.backgroundTags ?? null,
    storyKeywords: row.storyKeywords ?? null,
    boatTypes: (row.boatTypes ?? null) as PersonaTags["boatTypes"],
    priceBands: (row.priceBands ?? null) as PersonaTags["priceBands"],
    buyerTypesClick: row.buyerTypesClick ?? null,
    strengths: row.strengths ?? null,
    avoidNotes: row.avoidNotes ?? null,
    languages: row.languages ?? null,
    followUpStyle: (row.followUpStyle ?? null) as PersonaTags["followUpStyle"],
    responseSpeed: (row.responseSpeed ?? null) as PersonaTags["responseSpeed"],
    channels: (row.channels ?? null) as PersonaTags["channels"],
    sellingStyle: row.sellingStyle ?? null,
    maxLeadsPerWeek: row.maxLeadsPerWeek ?? null,
    availabilityText: row.availabilityText ?? null,
    doNotMention: row.doNotMention ?? null,
  };
}

async function loadPersonaState(db: Database, brokerId: string) {
  const [broker] = await db.select({ personaMd: brokers.personaMd }).from(brokers).where(eq(brokers.id, brokerId));
  if (!broker) throw notFound("Broker not found.");
  const [row] = await db.select().from(brokerPersonaTags).where(eq(brokerPersonaTags.brokerId, brokerId));
  return { personaMd: broker.personaMd, row: row ?? null };
}

export async function refreshPersonaTags(
  deps: PersonaTagDeps,
  brokerId: string,
  options: { force?: boolean; actorUserId?: string | null } = {},
): Promise<RefreshOutcome> {
  const { db } = deps;
  const { personaMd, row } = await loadPersonaState(db, brokerId);
  const hash = personaHash(personaMd);
  if (!hash) {
    if (!row || (!row.sourceHash && !row.extractedAt)) return "no_persona";
    await db.transaction(async (tx) => {
      await tx
        .update(brokerPersonaTags)
        .set({ ...emptyPersonaTags(), sourceHash: null, extractedAt: null, extractionModel: null, extractionError: null })
        .where(eq(brokerPersonaTags.brokerId, brokerId));
      await writeAudit(tx, {
        actorUserId: options.actorUserId ?? null,
        action: "persona_tags.cleared",
        entityType: "broker",
        entityId: brokerId,
        before: { sourceHash: row.sourceHash },
        after: { sourceHash: null },
      });
    });
    return "cleared";
  }
  if (!options.force && row?.sourceHash === hash && !row.extractionError) return "unchanged";
  if (!deps.matchAi) return "no_ai";
  const model = deps.matchAi.model;
  try {
    const tags = await deps.matchAi.extractPersonaTags(personaMd!);
    const latest = await loadPersonaState(db, brokerId);
    if (personaHash(latest.personaMd) !== hash) return "superseded";
    await db.transaction(async (tx) => {
      const values = { ...tags, sourceHash: hash, extractedAt: deps.now(), extractionModel: model, extractionError: null };
      await tx
        .insert(brokerPersonaTags)
        .values({ brokerId, ...values })
        .onConflictDoUpdate({ target: brokerPersonaTags.brokerId, set: values });
      await writeAudit(tx, {
        actorUserId: options.actorUserId ?? null,
        action: "persona_tags.extracted",
        entityType: "broker",
        entityId: brokerId,
        before: { sourceHash: row?.sourceHash ?? null },
        after: { sourceHash: hash, model },
      });
    });
    return "updated";
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    deps.log.warn({ brokerId, err: error }, "Persona tag extraction failed");
    await db.transaction(async (tx) => {
      await tx
        .insert(brokerPersonaTags)
        .values({ brokerId, extractionError: message })
        .onConflictDoUpdate({ target: brokerPersonaTags.brokerId, set: { extractionError: message } });
      await writeAudit(tx, {
        actorUserId: options.actorUserId ?? null,
        action: "persona_tags.extract_failed",
        entityType: "broker",
        entityId: brokerId,
        after: { sourceHash: hash, model, error: message },
      });
    });
    return "failed";
  }
}

export async function backfillPersonaTags(
  deps: PersonaTagDeps,
  options: { force?: boolean; actorUserId?: string | null; onProgress?: (brokerId: string, outcome: RefreshOutcome) => void } = {},
): Promise<Record<RefreshOutcome, number> & { checked: number }> {
  const rows = await deps.db
    .select({ id: brokers.id })
    .from(brokers)
    .leftJoin(brokerPersonaTags, eq(brokerPersonaTags.brokerId, brokers.id))
    .where(or(isNotNull(brokers.personaMd), isNotNull(brokerPersonaTags.sourceHash)));
  const counts = { checked: rows.length, updated: 0, unchanged: 0, cleared: 0, no_persona: 0, superseded: 0, failed: 0, no_ai: 0 };
  const queue = rows.map((row) => row.id);
  const workers = Array.from({ length: Math.min(BACKFILL_CONCURRENCY, queue.length) }, async () => {
    for (let brokerId = queue.shift(); brokerId; brokerId = queue.shift()) {
      const outcome = await refreshPersonaTags(deps, brokerId, { force: options.force, actorUserId: options.actorUserId });
      counts[outcome] += 1;
      options.onProgress?.(brokerId, outcome);
    }
  });
  await Promise.all(workers);
  return counts;
}

export async function countBackfillBrokers(db: Database): Promise<number> {
  const rows = await db
    .select({ id: brokers.id })
    .from(brokers)
    .leftJoin(brokerPersonaTags, eq(brokerPersonaTags.brokerId, brokers.id))
    .where(or(isNotNull(brokers.personaMd), isNotNull(brokerPersonaTags.sourceHash)));
  return rows.length;
}

export function personaTagsStatus(personaMd: string | null, row: TagRow | null): PersonaTagsStatus {
  const hash = personaHash(personaMd);
  if (!hash) return "no_persona";
  if (row?.extractionError) return "failed";
  if (!row?.extractedAt) return "pending";
  return row.sourceHash === hash ? "current" : "stale";
}

export async function personaTagsView(deps: Pick<PersonaTagDeps, "db" | "matchAi">, brokerId: string): Promise<PersonaTagsView> {
  const { personaMd, row } = await loadPersonaState(deps.db, brokerId);
  const extracted = rowToExtracted(row);
  const overrides = row?.manualOverrides ?? {};
  return {
    brokerId,
    status: personaTagsStatus(personaMd, row),
    extracted,
    overrides,
    effective: mergePersonaTags(extracted, overrides),
    extractedAt: row?.extractedAt?.toISOString() ?? null,
    extractionModel: row?.extractionModel ?? null,
    extractionError: row?.extractionError ?? null,
    aiConfigured: deps.matchAi !== null,
  };
}

export async function updatePersonaTagOverrides(
  deps: Pick<PersonaTagDeps, "db" | "matchAi">,
  brokerId: string,
  patch: PersonaTagsPatch,
  actorUserId: string,
): Promise<PersonaTagsView> {
  const { row } = await loadPersonaState(deps.db, brokerId);
  const set = patch.set ?? {};
  const cap = set.maxLeadsPerWeek;
  if (cap !== undefined && cap !== null && (cap < 1 || cap > MAX_LEADS_PER_WEEK_LIMIT)) {
    throw badRequest(`Max leads per week must be between 1 and ${MAX_LEADS_PER_WEEK_LIMIT}.`);
  }
  const before: PersonaTagOverrides = row?.manualOverrides ?? {};
  const next: Record<string, unknown> = { ...before };
  for (const field of patch.clear ?? []) delete next[field];
  const merged = mergePersonaTags(rowToExtracted(row), { ...(next as PersonaTagOverrides), ...set });
  const cleaned = cleanPersonaTags(merged);
  for (const field of PERSONA_TAG_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(set, field) && set[field] !== undefined) next[field] = cleaned[field];
  }
  const overrides = next as PersonaTagOverrides;
  await deps.db.transaction(async (tx) => {
    await tx
      .insert(brokerPersonaTags)
      .values({ brokerId, manualOverrides: overrides })
      .onConflictDoUpdate({ target: brokerPersonaTags.brokerId, set: { manualOverrides: overrides } });
    await writeAudit(tx, {
      actorUserId,
      action: "persona_tags.overrides_updated",
      entityType: "broker",
      entityId: brokerId,
      before: { overrides: before },
      after: { overrides },
    });
  });
  return personaTagsView(deps, brokerId);
}

export async function loadEffectiveTags(db: Database, brokerIds: string[]): Promise<Map<string, PersonaTags | null>> {
  const result = new Map<string, PersonaTags | null>(brokerIds.map((id) => [id, null]));
  if (brokerIds.length === 0) return result;
  const rows = await db.select().from(brokerPersonaTags).where(inArray(brokerPersonaTags.brokerId, brokerIds));
  for (const row of rows) {
    const effective = mergePersonaTags(rowToExtracted(row), row.manualOverrides);
    result.set(row.brokerId, hasAnyPersonaTag(effective) ? effective : null);
  }
  return result;
}
