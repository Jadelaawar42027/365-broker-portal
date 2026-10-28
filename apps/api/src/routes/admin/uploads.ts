/**
 * File: apps/api/src/routes/admin/uploads.ts
 * Purpose: Admins uploading paperwork on a broker's behalf from the profile page (docs/SPEC.md), e.g. for existing
 * brokers. Files are stored the same way, recorded with the admin as uploader, and the step is marked approved.
 *
 * Functions:
 * - registerAdminUploadRoutes(app): mounts POST /v1/admin/brokers/:id/steps/:key/upload-url and .../upload-complete (refuses more files than the step takes).
 * - requireStep(app, brokerId, key): loads the broker's step by key (checking the broker exists) or throws 404.
 */
import {
  adminUploadCompleteRequestSchema,
  errorResponseSchema,
  fileCountLimits,
  stepActionResponseSchema,
  uploadTargetResponseSchema,
  uploadUrlRequestSchema,
} from "@bp/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { badRequest, notFound } from "../../errors";
import { currentActor } from "../../plugins/auth-guard";
import { loadBrokerWithUser } from "../../services/brokers";
import { activateIfComplete, applyStepAction, loadBrokerStepByKey, nextFileVersion } from "../../services/steps";
import { todayFor } from "../../services/support";
import { assertUploadAllowed, createUploadTarget, verifySubmittedFiles } from "../../services/uploads";
import { notifyOnboardingComplete } from "../broker-steps";

const params = z.object({ id: z.uuid(), key: z.string().min(1).max(60) });

async function requireStep(app: FastifyInstance, brokerId: string, key: string) {
  await loadBrokerWithUser(app.deps.db, brokerId);
  const row = await loadBrokerStepByKey(app.deps.db, brokerId, key);
  if (!row) throw notFound("That onboarding step doesn't exist.");
  return row;
}

export function registerAdminUploadRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    "/v1/admin/brokers/:id/steps/:key/upload-url",
    {
      schema: {
        tags: ["admin", "files"],
        summary: "Where to upload a file for a broker's step (admin on behalf)",
        params,
        body: uploadUrlRequestSchema,
        response: { 200: uploadTargetResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      const row = await requireStep(app, request.params.id, request.params.key);
      assertUploadAllowed(row, request.body);
      return createUploadTarget(app.deps, {
        brokerId: row.brokerId,
        stepKey: row.key,
        version: await nextFileVersion(app.deps.db, row.brokerStepId),
        userId: actor.userId,
        request: request.body,
      });
    },
  );

  r.post(
    "/v1/admin/brokers/:id/steps/:key/upload-complete",
    {
      schema: {
        tags: ["admin", "files"],
        summary: "Record files uploaded on a broker's behalf and mark the step approved",
        params,
        body: adminUploadCompleteRequestSchema,
        response: { 200: stepActionResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      const row = await requireStep(app, request.params.id, request.params.key);
      const { max } = fileCountLimits(row.config);
      if (request.body.files.length > max) throw badRequest(`This step takes up to ${max} ${max === 1 ? "file" : "files"}.`, "wrong_file_count");
      const verified = await verifySubmittedFiles(app.deps, { brokerId: row.brokerId, step: row, files: request.body.files });
      const now = app.deps.now();
      const result = await app.deps.db.transaction(async (tx) => {
        const change = await applyStepAction(tx, {
          row,
          action: "admin_override",
          actorUserId: actor.userId,
          now,
          note: null,
          files: verified,
        });
        const completed = await activateIfComplete(tx, { brokerId: row.brokerId, actorUserId: actor.userId, today: todayFor(now) });
        return { status: change.to, onboardingComplete: completed };
      });
      if (result.onboardingComplete) await notifyOnboardingComplete(app, request.log, row.brokerId);
      return result;
    },
  );
}
