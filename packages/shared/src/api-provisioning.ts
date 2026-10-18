/**
 * File: packages/shared/src/api-provisioning.ts
 * Purpose: The HTTP contract for account provisioning (phase H2): the Accounts panel on the broker profile, the
 * manual corporate email, retry and link actions, the admin Integrations panel with "Test connection", and the
 * broker's own 365 email card on step 9 with "Reveal my temporary password". Passwords appear only in the reveal
 * response and are never stored.
 *
 * Functions:
 * - none
 */
import { z } from "zod";
import { PROVISIONING_ACTIONS, PROVISIONING_SYSTEMS, PROVISIONING_TASK_STATUSES } from "./constants";
import { ACCOUNT_STATUSES } from "./provisioning";
import { emailSchema } from "./schemas";

export const accountSystemViewSchema = z.object({
  system: z.enum(PROVISIONING_SYSTEMS),
  label: z.string(),
  status: z.enum(ACCOUNT_STATUSES),
  statusLabel: z.string(),
  accountId: z.string().nullable(),
  email: z.string().nullable(),
  error: z.string().nullable().describe("The last failure in plain words, while the account is failed"),
  lastTask: z
    .object({
      action: z.enum(PROVISIONING_ACTIONS),
      status: z.enum(PROVISIONING_TASK_STATUSES),
      attempts: z.number().int(),
      updatedAt: z.string(),
      nextAttemptAt: z.string().nullable(),
    })
    .nullable(),
  canRetry: z.boolean(),
  canLink: z.boolean(),
});
export type AccountSystemView = z.infer<typeof accountSystemViewSchema>;

export const brokerAccountsResponseSchema = z.object({
  corporateEmail: z.string().nullable(),
  googleDomain: z.string().nullable(),
  systems: z.array(accountSystemViewSchema),
});
export type BrokerAccountsResponse = z.infer<typeof brokerAccountsResponseSchema>;

export const corporateEmailRequestSchema = z.object({ email: emailSchema });

export const provisioningSystemParamsSchema = z.object({ id: z.uuid(), system: z.enum(PROVISIONING_SYSTEMS) });

export const accountActionResponseSchema = z.object({
  queued: z.array(z.enum(PROVISIONING_SYSTEMS)),
  skipped: z.array(z.object({ system: z.enum(PROVISIONING_SYSTEMS), reason: z.string() })),
});
export type AccountActionResponse = z.infer<typeof accountActionResponseSchema>;

export const integrationStatusSchema = z.object({
  system: z.enum(PROVISIONING_SYSTEMS),
  label: z.string(),
  configured: z.boolean(),
  problem: z.string().nullable().describe("What is missing or malformed, when not configured"),
  details: z.string().nullable().describe("The domain or location the system works with, when configured"),
  openTasks: z.number().int(),
  failedTasks: z.number().int(),
});
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;

export const integrationsResponseSchema = z.object({ systems: z.array(integrationStatusSchema) });
export type IntegrationsResponse = z.infer<typeof integrationsResponseSchema>;

export const integrationTestResponseSchema = z.object({ ok: z.boolean(), message: z.string() });
export type IntegrationTestResponse = z.infer<typeof integrationTestResponseSchema>;

export const myAccountsResponseSchema = z.object({
  googleConfigured: z.boolean().describe("False until Google Workspace provisioning is set up; step 9 then shows no 365 email card"),
  corporateEmail: z.string().nullable(),
  googleReady: z.boolean().describe("True when Google is configured and the broker's Workspace account exists and is active"),
  revealsLeft: z.number().int(),
  gmailUrl: z.string(),
});
export type MyAccountsResponse = z.infer<typeof myAccountsResponseSchema>;

export const revealPasswordResponseSchema = z.object({
  email: z.string(),
  password: z.string(),
  revealsLeft: z.number().int(),
});
export type RevealPasswordResponse = z.infer<typeof revealPasswordResponseSchema>;
