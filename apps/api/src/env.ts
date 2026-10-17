/**
 * File: apps/api/src/env.ts
 * Purpose: Validates the API's environment variables with Zod and gives the rest of the code a typed config.
 * Later phases add database, auth, storage and email settings here.
 *
 * Functions:
 * - loadApiEnv(source): parses source (defaults to process.env) and returns the typed config; throws listing every invalid variable.
 */
import { z } from "zod";

const apiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function loadApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  const result = apiEnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid API environment: ${problems}`);
  }
  return result.data;
}
