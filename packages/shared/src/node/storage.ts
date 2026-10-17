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
 * - setCors(origins): allows browsers on the given origins to PUT and GET objects (needed for direct uploads).
 */
import {
  HeadObjectCommand,
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
  setCors(origins: string[]): Promise<void>;
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
