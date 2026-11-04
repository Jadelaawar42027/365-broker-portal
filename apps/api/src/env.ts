/**
 * File: apps/api/src/env.ts
 * Purpose: Validates the API's environment variables with Zod and gives the rest of the code a typed config.
 * Required secrets have no defaults, so a misconfigured deploy fails at start-up instead of at the first request.
 * The Google Workspace and GoHighLevel variables (phase H2) are optional here; services/provisioning/config.ts checks
 * them and treats a system with missing or malformed values as not configured instead of refusing to start.
 * GOOGLE_STARTING_PASSWORD, when set, is the first password every new 365 email gets (at least 8 characters).
 * The WhatsApp help contact defaults to the 365 Yachts AI; an empty SUPPORT_WHATSAPP_NUMBER hides the help buttons.
 *
 * Functions:
 * - loadApiEnv(source): parses source (defaults to process.env) and returns the typed config; throws listing every invalid variable.
 */
import { DEFAULT_SUPPORT_CONTACT } from "@bp/shared";
import { z } from "zod";

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

const apiEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    DATABASE_URL: z.string().min(1, "is required"),
    WEB_ORIGIN: z.url().default("http://localhost:3000").transform((value) => value.replace(/\/+$/, "")),
    BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters (openssl rand -base64 32)"),
    S3_ENDPOINT: optionalString,
    S3_REGION: z.string().default("us-east-1"),
    S3_BUCKET: z.string().min(1, "is required"),
    S3_ACCESS_KEY_ID: z.string().min(1, "is required"),
    S3_SECRET_ACCESS_KEY: z.string().min(1, "is required"),
    S3_FORCE_PATH_STYLE: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    STORAGE_UPLOAD_MODE: z.enum(["direct", "proxy"]).default("direct"),
    RESEND_API_KEY: optionalString,
    EMAIL_FROM: z.string().default("365 Yachts <onboarding@365yachts.org>"),
    SUPPORT_CONTACT_NAME: z.string().trim().min(1).default(DEFAULT_SUPPORT_CONTACT.name),
    SUPPORT_WHATSAPP_NUMBER: z.string().trim().default(DEFAULT_SUPPORT_CONTACT.whatsappNumber),
    EMAIL_OUTBOX_DIR: optionalString,
    GOOGLE_SERVICE_ACCOUNT_JSON: optionalString,
    GOOGLE_ADMIN_SUBJECT: optionalString,
    GOOGLE_DOMAIN: optionalString,
    GOOGLE_ORG_UNIT: optionalString,
    GOOGLE_STARTING_PASSWORD: z
      .string()
      .min(8, "must be at least 8 characters (Google's minimum)")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    GHL_AGENCY_TOKEN: optionalString,
    GHL_COMPANY_ID: optionalString,
    GHL_LOCATION_ID: optionalString,
    PROVISIONING_WORKER: z.enum(["on", "off"]).default("on"),
    PROVISIONING_MODE: z.enum(["live", "dry-run"]).default("live"),
    COMPANY_SIGNER_EMAIL: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email("must be the email of the owner or admin who signs for 365 Yachts"))
      .optional()
      .or(z.literal("").transform(() => undefined)),
  })
  .refine((env) => env.NODE_ENV !== "production" || env.WEB_ORIGIN.startsWith("https://"), {
    path: ["WEB_ORIGIN"],
    message: "must use https in production",
  })
  .refine((env) => env.NODE_ENV !== "production" || !env.EMAIL_OUTBOX_DIR, {
    path: ["EMAIL_OUTBOX_DIR"],
    message: "is for local development and tests only",
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
