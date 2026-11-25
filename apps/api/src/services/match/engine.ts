/**
 * File: apps/api/src/services/match/engine.ts
 * Purpose: Runs one lead-to-broker match for POST /api/match and records the setter's choice, in the shapes the 365 Yachts
 * AI (365-whatsapp-bot, brokerMatch.js) sends and expects. It loads active and onboarding brokers with their effective
 * persona tags, counts each broker's confirmed assignments in the last 7 and 14 days from match_log (TODO: source real lead
 * counts from GoHighLevel once that API is wired in; until then only picks recorded through /api/match/:matchId/choice
 * count), applies the hard filters, reads health through the health adapter, asks Claude once to judge background fit for
 * the eligible brokers with a persona (tag overlap is used if that call fails or Claude is not configured), scores and
 * ranks them, and writes the request, the full per-factor recommendations (without broker names), the excluded brokers,
 * weights, health source and fit method to match_log. The reply carries only what the bot reads. A broker's GoHighLevel
 * user id is left out while it is still a "dry-run" placeholder.
 *
 * Functions:
 * - usableGhlUserId(value): the GoHighLevel user id, or null when it is missing or a "dry-run" placeholder.
 * - loadCandidates(db, now): every active or onboarding broker with their tags, GoHighLevel user id and recent assignment counts.
 * - assignmentCounts(db, brokerIds, now): picks per broker in the last 7 and 14 days.
 * - judgeWithClaude(deps, lead, eligible): Claude's fit judgements for the eligible brokers with tags, or null when not configured, not needed or the call failed.
 * - toMatchBroker(scored, ghlUserId): one ranked broker in the bot's shape.
 * - runMatch(deps, request): runs the match, logs it and returns the bot's response.
 * - resolveChosenBroker(db, choice): the portal broker a choice refers to, by its id or else by its GoHighLevel user id, or null.
 * - parseTimestamp(value): an ISO timestamp as a Date, or null when missing or invalid.
 * - recordMatchChoice(deps, matchId, choice): stores which broker the setter picked (or none), who picked and when; throws 404 for an unknown match and never rejects a well-formed choice.
 */
import { brokers, matchLog, users, type Database } from "@bp/db";
import {
  applyHardFilters,
  rankCandidates,
  toLeadProfile,
  type FitJudgement,
  type FitMethod,
  type HealthSource,
  type LeadProfile,
  type MatchBroker,
  type MatchCandidate,
  type MatchChoiceRequest,
  type MatchRequest,
  type MatchResponse,
  type ScoredBroker,
} from "@bp/shared";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { notFound } from "../../errors";
import { writeAudit } from "../audit";
import { loadEffectiveTags } from "../persona-tags";
import type { MatchAi } from "./claude";
import { getBrokerHealth } from "./health";
import { currentMatchWeights } from "./weights";

export type MatchDeps = {
  db: Database;
  coachDb: Database | null;
  matchAi: MatchAi | null;
  healthSource: HealthSource;
  now: () => Date;
  log: Pick<FastifyBaseLogger, "warn">;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function usableGhlUserId(value: string | null | undefined): string | null {
  const id = value?.trim();
  if (!id || id.toLowerCase().startsWith("dry-run")) return null;
  return id;
}

async function assignmentCounts(db: Database, brokerIds: string[], now: Date) {
  const counts = new Map<string, { last7: number; last14: number }>();
  if (brokerIds.length === 0) return counts;
  const since7 = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const since14 = new Date(now.getTime() - 14 * DAY_MS);
  const rows = await db
    .select({
      brokerId: matchLog.chosenBrokerId,
      last7: sql<number>`count(*) filter (where ${matchLog.chosenAt} >= ${since7}::timestamptz)::int`,
      last14: sql<number>`count(*)::int`,
    })
    .from(matchLog)
    .where(and(inArray(matchLog.chosenBrokerId, brokerIds), gte(matchLog.chosenAt, since14)))
    .groupBy(matchLog.chosenBrokerId);
  for (const row of rows) if (row.brokerId) counts.set(row.brokerId, { last7: Number(row.last7), last14: Number(row.last14) });
  return counts;
}

async function loadCandidates(db: Database, now: Date) {
  const rows = await db
    .select({ id: brokers.id, name: users.name, status: brokers.status, ghlUserId: brokers.ghlUserId })
    .from(brokers)
    .innerJoin(users, eq(users.id, brokers.userId))
    .where(inArray(brokers.status, ["active", "onboarding"]));
  const ids = rows.map((row) => row.id);
  const [tags, counts] = await Promise.all([loadEffectiveTags(db, ids), assignmentCounts(db, ids, now)]);
  const candidates: MatchCandidate[] = rows.map((row) => ({
    brokerId: row.id,
    name: row.name,
    active: row.status === "active",
    tags: tags.get(row.id) ?? null,
    health: null,
    assignmentsLast7Days: counts.get(row.id)?.last7 ?? 0,
    assignmentsLast14Days: counts.get(row.id)?.last14 ?? 0,
  }));
  return { candidates, ghlUserIds: new Map(rows.map((row) => [row.id, usableGhlUserId(row.ghlUserId)])) };
}

async function judgeWithClaude(deps: MatchDeps, lead: LeadProfile, eligible: MatchCandidate[]): Promise<Map<string, FitJudgement> | null> {
  if (!deps.matchAi || (!lead.backgroundText && !lead.notes)) return null;
  const withTags = eligible.flatMap((candidate) => (candidate.tags ? [{ brokerId: candidate.brokerId, tags: candidate.tags }] : []));
  if (withTags.length === 0) return null;
  try {
    const judgements = await deps.matchAi.judgeFit(lead, withTags);
    return judgements.length > 0 ? new Map(judgements.map((judgement) => [judgement.brokerId, judgement])) : null;
  } catch (error) {
    deps.log.warn({ err: error }, "Claude fit judgement failed; using tag overlap");
    return null;
  }
}

function toMatchBroker(scored: ScoredBroker, ghlUserId: string | null): MatchBroker {
  return {
    id: scored.brokerId,
    name: scored.name,
    score: scored.score,
    breakdown: {
      fit: scored.breakdown.fit.score,
      performance: scored.breakdown.performance.score,
      availability: scored.breakdown.availability.score,
    },
    reasons: scored.reasons,
    flags: scored.flags,
    ...(ghlUserId ? { ghlUserId } : {}),
  };
}

export async function runMatch(deps: MatchDeps, request: MatchRequest): Promise<MatchResponse> {
  const now = deps.now();
  const lead = toLeadProfile(request);
  const { candidates, ghlUserIds } = await loadCandidates(deps.db, now);
  const { eligible, excluded } = applyHardFilters(lead, candidates);
  const health = await getBrokerHealth(
    { db: deps.db, coachDb: deps.coachDb, healthSource: deps.healthSource, log: deps.log },
    eligible.map((candidate) => candidate.brokerId),
  );
  for (const candidate of eligible) candidate.health = health.get(candidate.brokerId) ?? null;
  const [judgements, weightsInForce] = await Promise.all([judgeWithClaude(deps, lead, eligible), currentMatchWeights(deps.db)]);
  const weights = weightsInForce.weights;
  const fitMethod: FitMethod = judgements ? "claude" : lead.backgroundText || lead.notes ? "tag_overlap" : "none";
  const ranked = rankCandidates(lead, eligible, judgements, weights).slice(0, lead.topN);
  const [logged] = await deps.db
    .insert(matchLog)
    .values({
      contactId: request.contactId,
      leadName: request.name,
      request: request as unknown as Record<string, unknown>,
      recommendations: ranked.map(({ name: _name, ...rest }) => rest),
      excluded: excluded.map(({ name: _name, ...rest }) => rest),
      weights,
      healthSource: deps.healthSource,
      fitMethod,
    })
    .returning({ id: matchLog.id });
  return {
    matchId: logged!.id,
    brokers: ranked.map((scored) => toMatchBroker(scored, ghlUserIds.get(scored.brokerId) ?? null)),
  };
}

async function resolveChosenBroker(db: Database, choice: MatchChoiceRequest): Promise<string | null> {
  if (choice.brokerId && UUID_PATTERN.test(choice.brokerId)) {
    const [broker] = await db.select({ id: brokers.id }).from(brokers).where(eq(brokers.id, choice.brokerId));
    if (broker) return broker.id;
  }
  const ghlUserId = usableGhlUserId(choice.ghlUserId);
  if (!ghlUserId) return null;
  const matches = await db.select({ id: brokers.id }).from(brokers).where(eq(brokers.ghlUserId, ghlUserId));
  return matches.length === 1 ? matches[0]!.id : null;
}

function parseTimestamp(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function recordMatchChoice(deps: Pick<MatchDeps, "db" | "now">, matchId: string, choice: MatchChoiceRequest) {
  const [match] = await deps.db
    .select({ id: matchLog.id, recommendations: matchLog.recommendations, chosenBrokerId: matchLog.chosenBrokerId, chosenAt: matchLog.chosenAt })
    .from(matchLog)
    .where(eq(matchLog.id, matchId));
  if (!match) throw notFound("Match not found.");
  const brokerId = await resolveChosenBroker(deps.db, choice);
  const chosenAt = deps.now();
  const fromRecommendations = brokerId !== null && match.recommendations.some((entry) => entry.brokerId === brokerId);
  await deps.db.transaction(async (tx) => {
    await tx
      .update(matchLog)
      .set({
        chosenBrokerId: brokerId,
        chosenAt,
        chosenBy: choice.pickedBy,
        chosenGhlUserId: choice.ghlUserId,
        chosenBrokerName: choice.brokerName,
        chosenOffList: choice.offList,
        choiceTimestamp: parseTimestamp(choice.timestamp),
      })
      .where(eq(matchLog.id, matchId));
    await writeAudit(tx, {
      actorUserId: null,
      action: "match.choice_recorded",
      entityType: "match",
      entityId: matchId,
      before: match.chosenAt ? { brokerId: match.chosenBrokerId, chosenAt: match.chosenAt.toISOString() } : null,
      after: { brokerId, pickedBy: choice.pickedBy, offList: choice.offList, fromRecommendations, linked: brokerId !== null || (!choice.ghlUserId && !choice.brokerId) },
    });
  });
  return { ok: true as const, matchId, brokerId, fromRecommendations, offList: choice.offList, chosenAt: chosenAt.toISOString() };
}
