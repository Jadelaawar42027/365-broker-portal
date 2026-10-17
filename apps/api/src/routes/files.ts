/**
 * File: apps/api/src/routes/files.ts
 * Purpose: File access. Downloads are 5-minute presigned links issued only after a permission check (a broker gets
 * their own files, admins get any, and every admin download is audited). Proxy-mode uploads (SPEC D11) land here.
 *
 * Functions:
 * - registerFileRoutes(app): mounts GET /v1/files/:id/download-url and PUT /v1/uploads/:token.
 */
import { brokerSteps, brokers, files } from "@bp/db";
import { canAccessBroker, downloadUrlResponseSchema, errorResponseSchema, isAdminRole, MAX_UPLOAD_BYTES, okResponseSchema } from "@bp/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { badRequest, forbidden, notFound } from "../errors";
import { currentActor, requireUser } from "../plugins/auth-guard";
import { writeAudit } from "../services/audit";
import { verifyUploadToken } from "../services/uploads";

const DOWNLOAD_TTL_SECONDS = 5 * 60;

export async function registerFileRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/v1/files/:id/download-url",
    {
      preHandler: requireUser,
      schema: {
        tags: ["files"],
        summary: "A 5-minute link to download or preview one file",
        params: z.object({ id: z.uuid() }),
        querystring: z.object({ inline: z.enum(["true", "false"]).optional() }),
        response: { 200: downloadUrlResponseSchema, 401: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => {
      const actor = currentActor(request);
      const [file] = await app.deps.db
        .select({
          id: files.id,
          storageKey: files.storageKey,
          fileName: files.fileName,
          brokerId: brokers.id,
          brokerUserId: brokers.userId,
        })
        .from(files)
        .innerJoin(brokerSteps, eq(brokerSteps.id, files.brokerStepId))
        .innerJoin(brokers, eq(brokers.id, brokerSteps.brokerId))
        .where(eq(files.id, request.params.id));
      if (!file || !canAccessBroker(actor, file.brokerUserId)) throw notFound("File not found.");
      const inline = request.query.inline === "true";
      const url = await app.deps.storage.presignGet({
        key: file.storageKey,
        fileName: file.fileName,
        expiresInSeconds: DOWNLOAD_TTL_SECONDS,
        inline,
      });
      if (isAdminRole(actor.role)) {
        await writeAudit(app.deps.db, {
          actorUserId: actor.userId,
          action: inline ? "file.previewed" : "file.downloaded",
          entityType: "file",
          entityId: file.id,
          after: { brokerId: file.brokerId, fileName: file.fileName },
        });
      }
      return { url, expiresAt: new Date(app.deps.now().getTime() + DOWNLOAD_TTL_SECONDS * 1000).toISOString() };
    },
  );

  await app.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser("*", { parseAs: "buffer", bodyLimit: MAX_UPLOAD_BYTES + 1024 }, (_request, body, done) =>
      done(null, body),
    );
    scope.withTypeProvider<ZodTypeProvider>().put(
      "/v1/uploads/:token",
      {
        preHandler: requireUser,
        bodyLimit: MAX_UPLOAD_BYTES + 1024,
        schema: {
          tags: ["files"],
          summary: "Upload a file through the API (proxy upload mode)",
          params: z.object({ token: z.string().min(10).max(4000) }),
          response: { 200: okResponseSchema, 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema },
        },
      },
      async (request) => {
        const actor = currentActor(request);
        const payload = verifyUploadToken(request.params.token, app.deps.env.BETTER_AUTH_SECRET, app.deps.now());
        if (payload.userId !== actor.userId) throw forbidden("This upload link belongs to someone else.");
        const body = request.body as Buffer | undefined;
        if (!Buffer.isBuffer(body) || body.length === 0) throw badRequest("The file is empty.", "file_missing");
        if (body.length !== payload.sizeBytes) throw badRequest("The file size doesn't match what was announced.", "size_mismatch");
        const contentType = request.headers["content-type"]?.split(";")[0]?.trim();
        if (contentType !== payload.contentType) throw badRequest("The file type doesn't match what was announced.", "type_mismatch");
        await app.deps.storage.putObject({ key: payload.key, body, contentType: payload.contentType });
        return { ok: true as const };
      },
    );
  });
}
