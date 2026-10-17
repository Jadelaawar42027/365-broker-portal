/**
 * File: packages/shared/src/api.ts
 * Purpose: The HTTP contract between the web app and the API: Zod schemas for every request body and response.
 * The API validates and serialises with them (and builds OpenAPI from them); the web app uses the inferred types.
 * Response schemas strip unknown keys, so a field missing here (such as persona notes on broker routes) can never leak.
 *
 * Functions:
 * - none
 */
import { z } from "zod";
import {
  BROKER_LEVELS,
  BROKER_STATUSES,
  MAX_FILES_PER_SUBMISSION,
  STEP_KINDS,
  STEP_STAGES,
  STEP_STATUSES,
  USER_ROLES,
} from "./constants";
import { emailSchema, isoDateSchema, passwordSchema, stepConfigSchema } from "./schemas";

const timestampSchema = z.string().describe("ISO 8601 timestamp");
const nullableTimestamp = timestampSchema.nullable();
const toneSchema = z.enum(["success", "warning", "danger", "info", "neutral"]);
const phoneSchema = z
  .string()
  .trim()
  .regex(/^[0-9()+\-.\s]{7,20}$/, "Enter a phone number like (561) 000-0000.");
const commissionSplitSchema = z
  .number({ error: "Enter the broker's share as a percentage." })
  .int("Use a whole percentage, like 60.")
  .min(0, "A split can't be below 0%.")
  .max(100, "A split can't be above 100%.")
  .describe("The broker's share in percent; the house keeps the rest");

export const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const okResponseSchema = z.object({ ok: z.literal(true) });

export const supportContactSchema = z.object({
  name: z.string(),
  whatsappNumber: z.string().nullable(),
});

export const meResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    phone: z.string().nullable(),
    role: z.enum(USER_ROLES),
  }),
  broker: z
    .object({
      id: z.string(),
      level: z.enum(BROKER_LEVELS),
      status: z.enum(BROKER_STATUSES),
      joinedAt: z.string(),
      onboardedAt: z.string().nullable(),
      inHouseSplit: z.number().int().nullable(),
      selfGeneratedSplit: z.number().int().nullable(),
      showWelcome: z.boolean(),
    })
    .nullable(),
  support: supportContactSchema,
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const reviewInfoSchema = z.object({
  note: z.string().nullable(),
  reviewerName: z.string().nullable(),
  reviewedAt: nullableTimestamp,
});

export const stepSummarySchema = z.object({
  key: z.string(),
  position: z.number().int(),
  stage: z.enum(STEP_STAGES),
  stageTitle: z.string(),
  title: z.string(),
  shortTitle: z.string(),
  summary: z.string(),
  kind: z.enum(STEP_KINDS),
  needsApproval: z.boolean(),
  status: z.enum(STEP_STATUSES),
  label: z.string(),
  tone: toneSchema,
  isNext: z.boolean(),
  minutes: z.number().int().nullable(),
  review: reviewInfoSchema.nullable(),
});
export type StepSummary = z.infer<typeof stepSummarySchema>;

export const myStepsResponseSchema = z.object({
  progress: z.object({ total: z.number().int(), approved: z.number().int(), sent: z.number().int() }),
  nextStepKey: z.string().nullable(),
  complete: z.boolean(),
  sentBack: z.array(
    z.object({
      key: z.string(),
      position: z.number().int(),
      shortTitle: z.string(),
      note: z.string().nullable(),
      reviewerName: z.string().nullable(),
      reviewedAt: nullableTimestamp,
    }),
  ),
  steps: z.array(stepSummarySchema),
});
export type MyStepsResponse = z.infer<typeof myStepsResponseSchema>;

export const fileViewSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  version: z.number().int(),
  uploadedAt: timestampSchema,
  uploadedByName: z.string().nullable(),
  uploadedByAdmin: z.boolean(),
});
export type FileView = z.infer<typeof fileViewSchema>;

export const brokerStepConfigSchema = stepConfigSchema.omit({ reviewChecklist: true });

export const stepDetailResponseSchema = stepSummarySchema.extend({
  intro: z.string(),
  instructionsMd: z.string(),
  videoUrl: z.string().nullable(),
  acceptedTypes: z.array(z.string()),
  maxSizeBytes: z.number().int(),
  config: brokerStepConfigSchema,
  hasTemplateFile: z.boolean(),
  formData: z.record(z.string(), z.unknown()).nullable(),
  files: z.array(fileViewSchema),
  attempts: z.number().int(),
  submittedAt: nullableTimestamp,
  canSubmit: z.boolean(),
  totalSteps: z.number().int(),
});
export type StepDetailResponse = z.infer<typeof stepDetailResponseSchema>;

export const uploadUrlRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(1).max(100),
  sizeBytes: z.number().int().positive(),
});
export type UploadUrlRequest = z.infer<typeof uploadUrlRequestSchema>;

export const uploadTargetResponseSchema = z.object({
  storageKey: z.string(),
  upload: z.object({
    url: z.string(),
    method: z.literal("PUT"),
    headers: z.record(z.string(), z.string()),
  }),
});
export type UploadTargetResponse = z.infer<typeof uploadTargetResponseSchema>;

export const submittedFileSchema = z.object({
  storageKey: z.string().min(1).max(500),
  fileName: z.string().trim().min(1).max(200),
});

export const submitStepRequestSchema = z.object({
  formData: z.record(z.string(), z.unknown()).optional(),
  files: z.array(submittedFileSchema).max(MAX_FILES_PER_SUBMISSION).optional(),
});
export type SubmitStepRequest = z.infer<typeof submitStepRequestSchema>;

export const submitStepResponseSchema = z.object({
  status: z.enum(STEP_STATUSES),
  onboardingComplete: z.boolean(),
});

export const downloadUrlResponseSchema = z.object({ url: z.string(), expiresAt: timestampSchema });
export type DownloadUrlResponse = z.infer<typeof downloadUrlResponseSchema>;

export const inviteInfoResponseSchema = z.object({
  email: z.string(),
  name: z.string(),
  firstName: z.string(),
  role: z.enum(USER_ROLES),
});
export type InviteInfoResponse = z.infer<typeof inviteInfoResponseSchema>;

export const acceptInviteRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  password: passwordSchema,
  phone: phoneSchema,
});
export type AcceptInviteRequest = z.infer<typeof acceptInviteRequestSchema>;

export const acceptInviteResponseSchema = z.object({ role: z.enum(USER_ROLES) });

export const passwordResetRequestSchema = z.object({ email: emailSchema });
export const passwordResetInfoResponseSchema = z.object({ email: z.string() });
export const passwordResetCompleteRequestSchema = z.object({ password: passwordSchema });

export const reviewListItemSchema = z.object({
  brokerStepId: z.string(),
  brokerId: z.string(),
  brokerName: z.string(),
  stepKey: z.string(),
  stepShortTitle: z.string(),
  position: z.number().int(),
  submittedAt: nullableTimestamp,
  attempts: z.number().int(),
});
export type ReviewListItem = z.infer<typeof reviewListItemSchema>;

export const reviewListResponseSchema = z.object({ reviews: z.array(reviewListItemSchema) });

export const overviewResponseSchema = z.object({
  today: z.string(),
  counts: z.object({
    active: z.number().int(),
    junior: z.number().int(),
    senior: z.number().int(),
    onboarding: z.number().int(),
    stuck: z.number().int(),
    waitingReview: z.number().int(),
  }),
  averageDaysToOnboard: z.number().nullable(),
  reviews: z.array(reviewListItemSchema),
  inProgress: z.array(
    z.object({
      brokerId: z.string(),
      name: z.string(),
      approved: z.number().int(),
      total: z.number().int(),
      nextStep: z
        .object({ key: z.string(), shortTitle: z.string(), status: z.enum(STEP_STATUSES) })
        .nullable(),
      waitingOnUs: z.boolean(),
      stuckDays: z.number().int().nullable(),
    }),
  ),
});
export type OverviewResponse = z.infer<typeof overviewResponseSchema>;

export const brokerListRowSchema = z.object({
  brokerId: z.string(),
  name: z.string(),
  email: z.string(),
  level: z.enum(BROKER_LEVELS),
  status: z.enum(BROKER_STATUSES),
  joinedAt: z.string(),
  onboardedAt: z.string().nullable(),
  leftAt: z.string().nullable(),
  tenureDays: z.number().int(),
  daysToOnboard: z.number().int().nullable(),
  stepsApproved: z.number().int(),
  stepsTotal: z.number().int(),
  stepsWaitingReview: z.number().int(),
  lastActivityAt: nullableTimestamp,
  training: z
    .object({ chaptersPassed: z.number().int(), chaptersTotal: z.number().int(), avgBestScore: z.number().int().nullable() })
    .optional(),
});
export type BrokerListRow = z.infer<typeof brokerListRowSchema>;

export const brokerListQuerySchema = z.object({
  status: z.enum(BROKER_STATUSES).optional(),
  level: z.enum(BROKER_LEVELS).optional(),
  search: z.string().trim().max(100).optional(),
});

export const brokerListResponseSchema = z.object({
  counts: z.object({
    total: z.number().int(),
    invited: z.number().int(),
    onboarding: z.number().int(),
    active: z.number().int(),
    inactive: z.number().int(),
  }),
  brokers: z.array(brokerListRowSchema),
});
export type BrokerListResponse = z.infer<typeof brokerListResponseSchema>;

export const createBrokerRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  phone: phoneSchema.optional(),
  level: z.enum(BROKER_LEVELS),
  joinedAt: isoDateSchema.optional(),
  inHouseSplit: commissionSplitSchema,
  selfGeneratedSplit: commissionSplitSchema,
});
export type CreateBrokerRequest = z.infer<typeof createBrokerRequestSchema>;

export const createBrokerResponseSchema = z.object({ brokerId: z.string() });

export const adminStepRowSchema = z.object({
  brokerStepId: z.string(),
  key: z.string(),
  position: z.number().int(),
  stage: z.enum(STEP_STAGES),
  title: z.string(),
  shortTitle: z.string(),
  kind: z.enum(STEP_KINDS),
  needsApproval: z.boolean(),
  status: z.enum(STEP_STATUSES),
  label: z.string(),
  tone: toneSchema,
  attempts: z.number().int(),
  submittedAt: nullableTimestamp,
  reviewedAt: nullableTimestamp,
  reviewerName: z.string().nullable(),
  reviewNote: z.string().nullable(),
  formData: z.record(z.string(), z.unknown()).nullable(),
  files: z.array(fileViewSchema),
});
export type AdminStepRow = z.infer<typeof adminStepRowSchema>;

export const brokerProfileResponseSchema = z.object({
  broker: z.object({
    id: z.string(),
    userId: z.string(),
    name: z.string(),
    email: z.string(),
    phone: z.string().nullable(),
    level: z.enum(BROKER_LEVELS),
    status: z.enum(BROKER_STATUSES),
    joinedAt: z.string(),
    onboardedAt: z.string().nullable(),
    leftAt: z.string().nullable(),
    inHouseSplit: z.number().int().nullable(),
    selfGeneratedSplit: z.number().int().nullable(),
    hasLogin: z.boolean(),
  }),
  metrics: z.object({
    tenureDays: z.number().int(),
    daysToOnboard: z.number().int().nullable(),
    stepsApproved: z.number().int(),
    stepsTotal: z.number().int(),
    lastActivityAt: nullableTimestamp,
  }),
  persona: z.object({
    markdown: z.string().nullable(),
    updatedAt: nullableTimestamp,
    updatedByName: z.string().nullable(),
  }),
  steps: z.array(adminStepRowSchema),
});
export type BrokerProfileResponse = z.infer<typeof brokerProfileResponseSchema>;

export const updateBrokerRequestSchema = z
  .object({
    level: z.enum(BROKER_LEVELS).optional(),
    status: z.enum(BROKER_STATUSES).optional(),
    joinedAt: isoDateSchema.optional(),
    leftAt: isoDateSchema.nullable().optional(),
    inHouseSplit: commissionSplitSchema.optional(),
    selfGeneratedSplit: commissionSplitSchema.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "Send at least one field to change." });
export type UpdateBrokerRequest = z.infer<typeof updateBrokerRequestSchema>;

export const personaRequestSchema = z.object({ markdown: z.string().max(20000) });

export const remindRequestSchema = z.object({ message: z.string().trim().max(1000).optional() });

export const reviewDetailResponseSchema = z.object({
  brokerStepId: z.string(),
  status: z.enum(STEP_STATUSES),
  position: z.number().int(),
  totalSteps: z.number().int(),
  stageTitle: z.string(),
  step: z.object({ key: z.string(), title: z.string(), shortTitle: z.string(), kind: z.enum(STEP_KINDS) }),
  broker: z.object({ id: z.string(), name: z.string(), firstName: z.string() }),
  submittedAt: nullableTimestamp,
  attempts: z.number().int(),
  formData: z.record(z.string(), z.unknown()).nullable(),
  files: z.array(fileViewSchema),
  reviewChecklist: z.array(z.string()),
  queue: z.object({
    index: z.number().int(),
    total: z.number().int(),
    previousId: z.string().nullable(),
    nextId: z.string().nullable(),
  }),
});
export type ReviewDetailResponse = z.infer<typeof reviewDetailResponseSchema>;

export const sendBackRequestSchema = z.object({
  note: z.string().trim().min(1, "Add a note saying what needs fixing.").max(2000),
});

export const markDoneRequestSchema = z.object({
  note: z.string().trim().max(2000).optional(),
});

export const stepActionResponseSchema = z.object({
  status: z.enum(STEP_STATUSES),
  onboardingComplete: z.boolean(),
});

export const adminUploadCompleteRequestSchema = z.object({
  files: z.array(submittedFileSchema).min(1).max(MAX_FILES_PER_SUBMISSION),
});

export const metricsResponseSchema = z.object({ brokers: z.array(brokerListRowSchema) });

export const createAdminRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
});
export const createAdminResponseSchema = z.object({ userId: z.string() });
