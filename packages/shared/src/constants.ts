/**
 * File: packages/shared/src/constants.ts
 * Purpose: The fixed value lists of the domain (roles, levels, statuses, step kinds, stages). The database
 * enums, the Zod schemas and the UI all read these, so a value is defined exactly once.
 *
 * Functions:
 * - none
 */
export const USER_ROLES = ["broker", "admin", "owner"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const BROKER_LEVELS = ["junior", "senior"] as const;
export type BrokerLevel = (typeof BROKER_LEVELS)[number];

export const BROKER_STATUSES = ["invited", "onboarding", "active", "inactive"] as const;
export type BrokerStatus = (typeof BROKER_STATUSES)[number];

export const STEP_STATUSES = ["todo", "submitted", "approved", "changes_requested"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const STEP_KINDS = ["upload", "text", "choice", "confirm", "checklist", "admin"] as const;
export type StepKind = (typeof STEP_KINDS)[number];

export const STEP_STAGES = ["paperwork", "florida_license", "your_tools"] as const;
export type StepStage = (typeof STEP_STAGES)[number];

export const STAGE_TITLES: Record<StepStage, string> = {
  paperwork: "Paperwork",
  florida_license: "Your Florida license",
  your_tools: "Your tools",
};

export const TOKEN_PURPOSES = ["invite", "password_reset"] as const;
export type TokenPurpose = (typeof TOKEN_PURPOSES)[number];

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_SUBMISSION = 5;
export const INVITE_TTL_DAYS = 7;
export const PASSWORD_RESET_TTL_HOURS = 24;
export const STUCK_AFTER_DAYS = 4;
export const DAYS_TO_ONBOARD_SAMPLE_SIZE = 10;
export const MIN_PASSWORD_LENGTH = 8;
