/**
 * File: apps/api/src/services/uploads.ts
 * Purpose: Issues upload targets and checks uploaded files (SPEC D11). In "direct" mode the browser PUTs to a
 * presigned storage URL; in "proxy" mode it PUTs to /v1/uploads/:token and the API forwards the bytes. Callers get
 * the same { storageKey, upload } shape either way, and every file is re-checked in storage before it is recorded.
 *
 * Functions:
 * - assertUploadAllowed(step, request): throws 400 unless the step takes uploads and the file type and size are allowed.
 * - signUploadToken(payload, secret): returns a tamper-proof token describing one permitted proxy upload.
 * - verifyUploadToken(token, secret, now): returns the payload of a valid, unexpired token; throws 400 otherwise.
 * - createUploadTarget(deps, input): returns the storage key and where/how the browser should PUT the file.
 * - verifySubmittedFiles(deps, input): checks each submitted file belongs to this broker step, exists in storage, is new, and has an allowed type and size; returns the verified files.
 */
import { files as filesTable } from "@bp/db";
import { buildStorageKey, storageKeyPrefix, type UploadTargetResponse, type UploadUrlRequest } from "@bp/shared";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { inArray } from "drizzle-orm";
import type { AppDeps } from "../deps";
import { badRequest } from "../errors";
import type { VerifiedFile } from "./steps";

export const UPLOAD_URL_TTL_SECONDS = 15 * 60;

type UploadableStep = { kind: string; acceptedTypes: string[]; maxSizeBytes: number; shortTitle: string };

export function assertUploadAllowed(step: UploadableStep, request: UploadUrlRequest): void {
  if (step.kind !== "upload") throw badRequest("This step doesn't take file uploads.", "not_an_upload_step");
  if (!step.acceptedTypes.includes(request.contentType)) {
    throw badRequest(`That file type isn't accepted here. Use ${step.acceptedTypes.join(", ")}.`, "file_type_not_allowed");
  }
  if (request.sizeBytes > step.maxSizeBytes) {
    throw badRequest(`That file is too big. The limit is ${Math.round(step.maxSizeBytes / 1024 / 1024)} MB.`, "file_too_large");
  }
}

export type UploadTokenPayload = {
  key: string;
  contentType: string;
  sizeBytes: number;
  userId: string;
  expiresAt: number;
};

export function signUploadToken(payload: UploadTokenPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyUploadToken(token: string, secret: string, now: Date): UploadTokenPayload {
  const [body, signature] = token.split(".");
  if (!body || !signature) throw badRequest("This upload link is not valid.", "invalid_upload_token");
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw badRequest("This upload link is not valid.", "invalid_upload_token");
  }
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as UploadTokenPayload;
  if (payload.expiresAt <= now.getTime()) throw badRequest("This upload link has expired. Try again.", "upload_token_expired");
  return payload;
}

export async function createUploadTarget(
  deps: AppDeps,
  input: { brokerId: string; stepKey: string; version: number; userId: string; request: UploadUrlRequest },
): Promise<UploadTargetResponse> {
  const { request } = input;
  const storageKey = buildStorageKey({
    brokerId: input.brokerId,
    stepKey: input.stepKey,
    version: input.version,
    nonce: randomBytes(6).toString("hex"),
    fileName: request.fileName,
  });
  const headers = { "content-type": request.contentType };
  if (deps.env.STORAGE_UPLOAD_MODE === "proxy") {
    const token = signUploadToken(
      {
        key: storageKey,
        contentType: request.contentType,
        sizeBytes: request.sizeBytes,
        userId: input.userId,
        expiresAt: deps.now().getTime() + UPLOAD_URL_TTL_SECONDS * 1000,
      },
      deps.env.BETTER_AUTH_SECRET,
    );
    return { storageKey, upload: { url: `/v1/uploads/${token}`, method: "PUT", headers } };
  }
  const url = await deps.storage.presignPut({
    key: storageKey,
    contentType: request.contentType,
    sizeBytes: request.sizeBytes,
    expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
  });
  return { storageKey, upload: { url, method: "PUT", headers } };
}

export async function verifySubmittedFiles(
  deps: AppDeps,
  input: {
    brokerId: string;
    step: UploadableStep & { key: string };
    files: { storageKey: string; fileName: string }[];
  },
): Promise<VerifiedFile[]> {
  const prefix = storageKeyPrefix(input.brokerId, input.step.key);
  const keys = input.files.map((file) => file.storageKey);
  if (new Set(keys).size !== keys.length) throw badRequest("The same file was sent twice.", "duplicate_file");
  for (const key of keys) {
    if (!key.startsWith(prefix) || key.includes("..")) {
      throw badRequest("One of the files doesn't belong to this step.", "file_not_for_step");
    }
  }
  const alreadyRecorded = await deps.db
    .select({ storageKey: filesTable.storageKey })
    .from(filesTable)
    .where(inArray(filesTable.storageKey, keys));
  if (alreadyRecorded.length > 0) throw badRequest("One of the files was already sent before.", "file_already_submitted");

  const verified: VerifiedFile[] = [];
  for (const file of input.files) {
    const stored = await deps.storage.headObject(file.storageKey);
    if (!stored) throw badRequest(`"${file.fileName}" didn't finish uploading. Please try again.`, "file_missing");
    const mimeType = stored.contentType?.split(";")[0]?.trim() ?? "";
    if (!input.step.acceptedTypes.includes(mimeType)) {
      throw badRequest(`"${file.fileName}" isn't an accepted file type.`, "file_type_not_allowed");
    }
    if (stored.sizeBytes <= 0 || stored.sizeBytes > input.step.maxSizeBytes) {
      throw badRequest(`"${file.fileName}" is empty or too big.`, "file_too_large");
    }
    verified.push({ storageKey: file.storageKey, fileName: file.fileName, mimeType, sizeBytes: stored.sizeBytes });
  }
  return verified;
}
