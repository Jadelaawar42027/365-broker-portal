/**
 * File: packages/shared/test/storage.int.test.ts
 * Purpose: Integration tests for the S3 storage adapter against a real SeaweedFS container: presigned PUT and GET,
 * multipart uploads for large videos, server-side upload, HEAD for existing and missing objects, bucket CORS, and the config and header helpers.
 *
 * Functions:
 * - none
 */
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { fileURLToPath } from "node:url";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contentDisposition, createS3Storage, readStorageConfig, type FileStorage } from "../src/node/storage";

const S3_CONFIG = fileURLToPath(new URL("../../../docker/seaweedfs/s3.json", import.meta.url));
let container: StartedTestContainer;
let storage: FileStorage;

beforeAll(async () => {
  container = await new GenericContainer("chrislusf/seaweedfs:4.48")
    .withCommand(["server", "-dir=/data", "-s3", "-s3.port=8333", "-s3.config=/etc/seaweedfs/s3.json", "-master.volumeSizeLimitMB=64"])
    .withCopyFilesToContainer([{ source: S3_CONFIG, target: "/etc/seaweedfs/s3.json" }])
    .withExposedPorts(8333)
    .withWaitStrategy(Wait.forHttp("/healthz", 8333).forStatusCode(200))
    .start();
  const endpoint = `http://${container.getHost()}:${container.getMappedPort(8333)}`;
  const config = readStorageConfig({
    S3_ENDPOINT: endpoint,
    S3_BUCKET: "storage-test",
    S3_ACCESS_KEY_ID: "bp-local-key",
    S3_SECRET_ACCESS_KEY: "bp-local-secret",
    S3_FORCE_PATH_STYLE: "true",
  })!;
  const client = new S3Client({
    endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  for (let attempt = 0; ; attempt += 1) {
    try {
      await client.send(new CreateBucketCommand({ Bucket: config.bucket }));
      break;
    } catch (error) {
      if (attempt > 20) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  storage = createS3Storage(config);
}, 180_000);

afterAll(async () => {
  await container?.stop();
});

describe("readStorageConfig", () => {
  it("returns null when credentials are missing and applies defaults otherwise", () => {
    expect(readStorageConfig({ S3_BUCKET: "b" })).toBeNull();
    expect(readStorageConfig({ S3_BUCKET: "b", S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s" })).toEqual({
      endpoint: undefined,
      region: "us-east-1",
      bucket: "b",
      accessKeyId: "k",
      secretAccessKey: "s",
      forcePathStyle: false,
    });
  });
});

describe("contentDisposition", () => {
  it("names the file safely for download or preview", () => {
    expect(contentDisposition('W9 "final".pdf', false)).toBe(
      `attachment; filename="W9 _final_.pdf"; filename*=UTF-8''W9%20%22final%22.pdf`,
    );
    expect(contentDisposition("résumé.pdf", true)).toMatch(/^inline; filename="r_sum_.pdf"; filename\*=UTF-8''r%C3%A9sum%C3%A9.pdf$/);
  });
});

describe("S3 storage", () => {
  it("uploads with a presigned PUT locked to type and size, then reads it back", async () => {
    const body = new TextEncoder().encode("%PDF-1.4 presigned");
    const url = await storage.presignPut({ key: "t/a.pdf", contentType: "application/pdf", sizeBytes: body.byteLength, expiresInSeconds: 60 });
    const wrongSize = await fetch(url, { method: "PUT", headers: { "content-type": "application/pdf" }, body: new TextEncoder().encode("x") });
    expect(wrongSize.ok).toBe(false);
    const put = await fetch(url, { method: "PUT", headers: { "content-type": "application/pdf" }, body });
    expect(put.ok).toBe(true);
    expect(await storage.headObject("t/a.pdf")).toEqual({ sizeBytes: body.byteLength, contentType: "application/pdf" });
    const get = await fetch(await storage.presignGet({ key: "t/a.pdf", fileName: "a.pdf", expiresInSeconds: 60, inline: true }));
    expect(await get.text()).toBe("%PDF-1.4 presigned");
    expect(get.headers.get("content-disposition")).toMatch(/^inline;/);
  });

  it("uploads from the server and reports missing objects as null", async () => {
    await storage.putObject({ key: "t/b.png", body: new Uint8Array([1, 2, 3]), contentType: "image/png" });
    expect(await storage.headObject("t/b.png")).toEqual({ sizeBytes: 3, contentType: "image/png" });
    expect(await storage.headObject("t/missing.pdf")).toBeNull();
  });

  it("uploads a large file in parts through presigned part URLs, and can abort an upload", async () => {
    const partOne = new Uint8Array(5 * 1024 * 1024).fill(1);
    const partTwo = new TextEncoder().encode("the end");
    const uploadId = await storage.createMultipartUpload({ key: "t/video.mp4", contentType: "video/mp4" });
    const etags = [];
    for (const [index, body] of [partOne, partTwo].entries()) {
      const url = await storage.presignUploadPart({ key: "t/video.mp4", uploadId, partNumber: index + 1, expiresInSeconds: 60 });
      const response = await fetch(url, { method: "PUT", body });
      expect(response.ok).toBe(true);
      etags.push({ partNumber: index + 1, etag: response.headers.get("etag")! });
    }
    await storage.completeMultipartUpload({ key: "t/video.mp4", uploadId, parts: etags.reverse() });
    expect(await storage.headObject("t/video.mp4")).toEqual({ sizeBytes: partOne.byteLength + partTwo.byteLength, contentType: "video/mp4" });

    const abandoned = await storage.createMultipartUpload({ key: "t/abandoned.mp4", contentType: "video/mp4" });
    await storage.abortMultipartUpload({ key: "t/abandoned.mp4", uploadId: abandoned });
    expect(await storage.headObject("t/abandoned.mp4")).toBeNull();
  });

  it("sets bucket CORS for the web origin", async () => {
    await storage.setCors(["http://localhost:3000"]);
    const endpoint = `http://${container.getHost()}:${container.getMappedPort(8333)}`;
    const preflight = await fetch(`${endpoint}/storage-test/t/a.pdf`, {
      method: "OPTIONS",
      headers: { origin: "http://localhost:3000", "access-control-request-method": "PUT" },
    });
    expect(preflight.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
  });
});
