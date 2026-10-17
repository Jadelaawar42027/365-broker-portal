/**
 * File: apps/api/test/helpers/global-setup.ts
 * Purpose: Vitest global setup: starts one SeaweedFS container (S3 API) for the whole test run, creates the test
 * bucket, and hands its address to the test files through Vitest's provide/inject.
 *
 * Functions:
 * - setup(project): starts the container, creates the bucket, provides the S3 settings and returns the teardown.
 */
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GenericContainer, Wait } from "testcontainers";
import type { TestProject } from "vitest/node";

const S3_CONFIG = fileURLToPath(new URL("../../../../docker/seaweedfs/s3.json", import.meta.url));

export async function setup(project: TestProject) {
  const container = await new GenericContainer("chrislusf/seaweedfs:4.48")
    .withCommand([
      "server",
      "-dir=/data",
      "-s3",
      "-s3.port=8333",
      "-s3.config=/etc/seaweedfs/s3.json",
      "-master.volumeSizeLimitMB=64",
    ])
    .withCopyFilesToContainer([{ source: path.resolve(S3_CONFIG), target: "/etc/seaweedfs/s3.json" }])
    .withExposedPorts(8333)
    .withWaitStrategy(Wait.forHttp("/healthz", 8333).forStatusCode(200))
    .withStartupTimeout(120_000)
    .start();
  const endpoint = `http://${container.getHost()}:${container.getMappedPort(8333)}`;
  const s3 = {
    endpoint,
    bucket: "broker-files-test",
    accessKeyId: "bp-local-key",
    secretAccessKey: "bp-local-secret",
  };
  const client = new S3Client({
    endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey },
  });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await client.send(new CreateBucketCommand({ Bucket: s3.bucket }));
      break;
    } catch (error) {
      if (attempt === 19) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  project.provide("s3", s3);
  return async () => {
    await container.stop();
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    s3: { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string };
  }
}
