/**
 * File: apps/api/scripts/storage-cors.ts
 * Purpose: `pnpm storage:cors` lets the web app's origin PUT and GET files in the bucket directly, which the
 * "direct" upload mode needs (SPEC D11). Run once per bucket; if the bucket refuses, use STORAGE_UPLOAD_MODE=proxy.
 *
 * Functions:
 * - main(): reads the S3 settings and WEB_ORIGIN, applies the CORS rule and reports the result.
 */
import { createS3Storage, loadRootEnvFile, readStorageConfig } from "@bp/shared/node";

async function main(): Promise<void> {
  loadRootEnvFile();
  const config = readStorageConfig(process.env);
  if (!config) throw new Error("S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be set.");
  const origin = (process.env.WEB_ORIGIN ?? "http://localhost:3000").replace(/\/+$/, "");
  await createS3Storage(config).setCors([origin]);
  console.log(`Bucket "${config.bucket}" now accepts browser uploads from ${origin}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  console.error("If the bucket does not support CORS, set STORAGE_UPLOAD_MODE=proxy on the api service.");
  process.exit(1);
});
