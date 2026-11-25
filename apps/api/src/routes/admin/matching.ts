/**
 * File: apps/api/src/routes/admin/matching.ts
 * Purpose: Admin routes for lead matching: a broker's persona tags (extracted, overrides and effective values), editing
 * overrides, re-extracting one broker's tags now, starting a backfill of every broker in the background, and reading or
 * changing the scoring weights. Mounted inside the admin scope, so every route requires an admin.
 *
 * Functions:
 * - registerAdminMatchingRoutes(app): mounts the persona-tag, backfill and weights routes.
 */
import {
  errorResponseSchema,
  matchWeightsResponseSchema,
  matchWeightsSchema,
  personaTagsBackfillRequestSchema,
  personaTagsBackfillResponseSchema,
  personaTagsPatchSchema,
  personaTagsViewSchema,
} from "@bp/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { currentActor } from "../../plugins/auth-guard";
import { currentMatchWeights, saveMatchWeights } from "../../services/match/weights";
import {
  backfillPersonaTags,
  countBackfillBrokers,
  personaTagsView,
  refreshPersonaTags,
  updatePersonaTagOverrides,
} from "../../services/persona-tags";

const idParams = z.object({ id: z.uuid() });

const REFRESH_OUTCOMES = ["updated", "unchanged", "cleared", "no_persona", "superseded", "failed", "no_ai"] as const;

export function registerAdminMatchingRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/v1/admin/brokers/:id/persona-tags",
    {
      schema: {
        tags: ["admin"],
        summary: "A broker's persona tags: extracted, admin overrides and the effective values used for matching",
        params: idParams,
        response: { 200: personaTagsViewSchema, 404: errorResponseSchema },
      },
    },
    async (request) => personaTagsView(app.deps, request.params.id),
  );

  r.patch(
    "/v1/admin/brokers/:id/persona-tags",
    {
      schema: {
        tags: ["admin"],
        summary: "Set or clear persona-tag overrides (overrides always win over extracted values)",
        params: idParams,
        body: personaTagsPatchSchema,
        response: { 200: personaTagsViewSchema, 400: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => updatePersonaTagOverrides(app.deps, request.params.id, request.body, currentActor(request).userId),
  );

  r.post(
    "/v1/admin/brokers/:id/persona-tags/refresh",
    {
      schema: {
        tags: ["admin"],
        summary: "Re-extract a broker's persona tags with Claude now, even if the persona hasn't changed",
        params: idParams,
        response: {
          200: z.object({ outcome: z.enum(REFRESH_OUTCOMES), view: personaTagsViewSchema }),
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const { db, matchAi, now } = app.deps;
      const outcome = await refreshPersonaTags(
        { db, matchAi, now, log: request.log },
        request.params.id,
        { force: true, actorUserId: currentActor(request).userId },
      );
      return { outcome, view: await personaTagsView(app.deps, request.params.id) };
    },
  );

  r.post(
    "/v1/admin/persona-tags/backfill",
    {
      schema: {
        tags: ["admin"],
        summary: "Extract persona tags for every broker whose persona changed (or all, with force) in the background",
        body: personaTagsBackfillRequestSchema,
        response: { 200: personaTagsBackfillResponseSchema },
      },
    },
    async (request) => {
      const { db, matchAi, now, background } = app.deps;
      const actorUserId = currentActor(request).userId;
      const log = request.log;
      const brokers = await countBackfillBrokers(db);
      background.run("persona-tags-backfill", async () => {
        const summary = await backfillPersonaTags({ db, matchAi, now, log }, { force: request.body.force, actorUserId });
        log.info({ summary }, "Persona tag backfill finished");
      });
      return { started: true as const, brokers };
    },
  );

  r.get(
    "/v1/admin/match/weights",
    {
      schema: {
        tags: ["admin"],
        summary: "The lead-matching weights in force",
        response: { 200: matchWeightsResponseSchema },
      },
    },
    async () => currentMatchWeights(app.deps.db),
  );

  r.put(
    "/v1/admin/match/weights",
    {
      schema: {
        tags: ["admin"],
        summary: "Change the lead-matching weights (takes effect on the next match, no redeploy)",
        body: matchWeightsSchema,
        response: { 200: matchWeightsResponseSchema, 400: errorResponseSchema },
      },
    },
    async (request) => saveMatchWeights(app.deps.db, request.body, currentActor(request).userId),
  );
}
