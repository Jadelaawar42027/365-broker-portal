/**
 * File: apps/api/src/routes/match.ts
 * Purpose: The lead-matching routes the 365 Yachts AI (365-whatsapp-bot) calls so leadership and the setter can ask for
 * broker recommendations by text: POST /api/match and POST /api/match/:matchId/choice, matching the bot's contract
 * (its README, "Portal contract"). They live outside /v1 because they use no session cookie: every request must send
 * MATCH_API_KEY as "Authorization: Bearer <key>" or "X-API-Key: <key>" (compared in constant time), and with MATCH_API_KEY
 * unset the routes answer 503. Replies never include persona notes or do-not-mention content (see @bp/shared matching).
 *
 * Functions:
 * - registerMatchRoutes(app): mounts the two routes behind the API-key check.
 * - keysMatch(provided, expected): true when the two keys are equal, compared in constant time.
 * - providedKeys(request): the keys sent in the Authorization: Bearer and X-API-Key headers.
 * - requireMatchApiKey(request): preHandler that rejects a missing or wrong key (401) and answers 503 when matching has no key configured.
 */
import {
  errorResponseSchema,
  matchChoiceRequestSchema,
  matchChoiceResponseSchema,
  matchRequestSchema,
  matchResponseSchema,
} from "@bp/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { HttpError, unauthorized } from "../errors";
import { recordMatchChoice, runMatch } from "../services/match/engine";

function keysMatch(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function providedKeys(request: FastifyRequest): string[] {
  const keys: string[] = [];
  const authorization = request.headers.authorization;
  const bearer = authorization ? /^Bearer\s+(.+)$/i.exec(authorization.trim()) : null;
  if (bearer) keys.push(bearer[1]!.trim());
  const header = request.headers["x-api-key"];
  const apiKey = Array.isArray(header) ? header[0] : header;
  if (apiKey) keys.push(apiKey.trim());
  return keys;
}

export function registerMatchRoutes(app: FastifyInstance): void {
  async function requireMatchApiKey(request: FastifyRequest): Promise<void> {
    const expected = app.deps.env.MATCH_API_KEY;
    if (!expected) throw new HttpError(503, "matching_not_configured", "Lead matching is not switched on (MATCH_API_KEY is not set).");
    const keys = providedKeys(request);
    if (!keys.some((key) => keysMatch(key, expected))) {
      throw unauthorized("Send the matching API key as Authorization: Bearer <key> or X-API-Key: <key>.");
    }
  }

  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    "/api/match",
    {
      preHandler: requireMatchApiKey,
      schema: {
        tags: ["match"],
        summary: "Recommend the best brokers for an inbound lead (API key as Authorization: Bearer or X-API-Key)",
        body: matchRequestSchema,
        response: { 200: matchResponseSchema, 400: errorResponseSchema, 401: errorResponseSchema, 503: errorResponseSchema },
      },
    },
    async (request) => {
      const { db, coachDb, matchAi, now, env } = app.deps;
      return runMatch({ db, coachDb, matchAi, now, healthSource: env.HEALTH_SOURCE, log: request.log }, request.body);
    },
  );

  r.post(
    "/api/match/:matchId/choice",
    {
      preHandler: requireMatchApiKey,
      schema: {
        tags: ["match"],
        summary: "Record which broker was picked for a match: a listed one, one off the list (offList), or none",
        params: z.object({ matchId: z.uuid() }),
        body: matchChoiceRequestSchema,
        response: {
          200: matchChoiceResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request) => recordMatchChoice(app.deps, request.params.matchId, request.body),
  );
}
