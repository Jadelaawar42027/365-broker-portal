/**
 * File: packages/shared/src/node/storage.ts
 * Purpose: The one file-storage interface (SPEC D11) and its S3 implementation, used by the API, the seed and
 * the importer. Works with the Railway Storage Bucket in production and SeaweedFS locally; files stay private
 * and are reached only through short-lived presigned URLs.
 *
 * Functions:
 * - readStorageConfig(env): builds a StorageConfig from S3_* environment variables, or returns null if any required one is missing.
 * - contentDisposition(fileName, inline): returns a Content-Disposition header value that is safe for any file name.
 * - createS3Storage(config): returns a FileStorage backed by an S3 client.
 * - presignPut(input): presigned PUT URL locked to the key, content type and exact size.
 * - presignGet(input): presigned GET URL that names the file for download or inline preview.
 * - putObject(input): uploads bytes straight from the server.
 * - headObject(key): returns size and content type of a stored object, or null if it does not exist.
 * - getObject(key): returns a stored object's bytes, or null if it does not exist (contract signatures, SPEC D31).
 * - setCors(origins): allows browsers on the given origins to PUT and GET objects (needed for direct uploads).
 * - createMultipartUpload(input): starts a multipart upload (large lesson videos) and returns its upload id.
 * - presignUploadPart(input): presigned PUT URL for one part of a multipart upload.
 * - completeMultipartUpload(input): joins the uploaded parts (with their ETags) into the final object.
 * - abortMultipartUpload(input): cancels a multipart upload and discards its parts.
 * - deletePrefix(prefix): deletes every object whose key starts with prefix (a folder ending in "/"); returns how many were deleted.
 */
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  UploadPartCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type StorageConfig = {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

export type StoredObjectInfo = { sizeBytes: number; contentType: string | null };

export interface FileStorage {
  presignPut(input: { key: string; contentType: string; sizeBytes: number; expiresInSeconds: number }): Promise<string>;
  presignGet(input: { key: string; fileName: string; expiresInSeconds: number; inline?: boolean }): Promise<string>;
  putObject(input: { key: string; body: Uint8Array; contentType: string }): Promise<void>;
  headObject(key: string): Promise<StoredObjectInfo | null>;
  getObject(key: string): Promise<Uint8Array | null>;
  setCors(origins: string[]): Promise<void>;
  deletePrefix(prefix: string): Promise<number>;
  createMultipartUpload(input: { key: string; contentType: string }): Promise<string>;
  presignUploadPart(input: { key: string; uploadId: string; partNumber: number; expiresInSeconds: number }): Promise<string>;
  completeMultipartUpload(input: { key: string; uploadId: string; parts: { partNumber: number; etag: string }[] }): Promise<void>;
  abortMultipartUpload(input: { key: string; uploadId: string }): Promise<void>;
}

export function readStorageConfig(env: NodeJS.ProcessEnv): StorageConfig | null {
  const { S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env;
  if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) return null;
  return {
    endpoint: env.S3_ENDPOINT || undefined,
    region: env.S3_REGION || "us-east-1",
    bucket: S3_BUCKET,
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
  };
}

export function contentDisposition(fileName: string, inline: boolean): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export function createS3Storage(config: StorageConfig): FileStorage {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const Bucket = config.bucket;

  return {
    async presignPut({ key, contentType, sizeBytes, expiresInSeconds }) {
      const command = new PutObjectCommand({ Bucket, Key: key, ContentType: contentType, ContentLength: sizeBytes });
      return getSignedUrl(client, command, {
        expiresIn: expiresInSeconds,
        signableHeaders: new Set(["content-type", "content-length"]),
      });
    },
    async presignGet({ key, fileName, expiresInSeconds, inline = false }) {
      const command = new GetObjectCommand({
        Bucket,
        Key: key,
        ResponseContentDisposition: contentDisposition(fileName, inline),
      });
      return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
    },
    async putObject({ key, body, contentType }) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async getObject(key) {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        return result.Body ? await result.Body.transformToByteArray() : null;
      } catch (error) {
        if (error instanceof NoSuchKey) return null;
        throw error;
      }
    },
    async headObject(key) {
      try {
        const result = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { sizeBytes: result.ContentLength ?? 0, contentType: result.ContentType ?? null };
      } catch (error) {
        if (error instanceof NotFound) return null;
        if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) return null;
        throw error;
      }
    },
    async deletePrefix(prefix) {
      if (!prefix || !prefix.endsWith("/") || prefix === "/") throw new Error("Refusing to delete without a folder prefix.");
      let deleted = 0;
      let continuationToken: string | undefined;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken: continuationToken }));
        for (const object of page.Contents ?? []) {
          if (!object.Key?.startsWith(prefix)) continue;
          await client.send(new DeleteObjectCommand({ Bucket, Key: object.Key }));
          deleted += 1;
        }
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (continuationToken);
      return deleted;
    },
    async createMultipartUpload({ key, contentType }) {
      const result = await client.send(new CreateMultipartUploadCommand({ Bucket, Key: key, ContentType: contentType }));
      if (!result.UploadId) throw new Error("Storage did not return an upload id.");
      return result.UploadId;
    },
    async presignUploadPart({ key, uploadId, partNumber, expiresInSeconds }) {
      return getSignedUrl(client, new UploadPartCommand({ Bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }), {
        expiresIn: expiresInSeconds,
      });
    },
    async completeMultipartUpload({ key, uploadId, parts }) {
      await client.send(
        new CompleteMultipartUploadCommand({
          Bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: [...parts].sort((a, b) => a.partNumber - b.partNumber).map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
          },
        }),
      );
    },
    async abortMultipartUpload({ key, uploadId }) {
      await client.send(new AbortMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId }));
    },
    async setCors(origins) {
      await client.send(
        new PutBucketCorsCommand({
          Bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: origins,
                AllowedMethods: ["PUT", "GET", "HEAD"],
                AllowedHeaders: ["*"],
                ExposeHeaders: ["ETag"],
                MaxAgeSeconds: 3600,
              },
            ],
          },
        }),
      );
    },
  };
}
