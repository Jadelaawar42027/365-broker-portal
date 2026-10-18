/**
 * File: packages/shared/src/constants.ts
 * Purpose: The fixed value lists of the domain (roles, levels, statuses, step kinds, stages, and training: chapter
 * statuses, retake policies, video sources, quiz attempt statuses). The database enums, the Zod schemas and the UI all
 * read these, so a value is defined exactly once.
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

export const STEP_STAGES = ["start_here", "paperwork", "florida_license", "your_tools"] as const;
export type StepStage = (typeof STEP_STAGES)[number];

export const STAGE_TITLES: Record<StepStage, string> = {
  start_here: "Start here",
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

export const CHAPTER_STATUSES = ["draft", "live", "coming_soon"] as const;
export type ChapterStatus = (typeof CHAPTER_STATUSES)[number];

export const RETAKE_POLICIES = ["reread", "immediate"] as const;
export type RetakePolicy = (typeof RETAKE_POLICIES)[number];

export const VIDEO_SOURCES = ["upload", "embed"] as const;
export type VideoSource = (typeof VIDEO_SOURCES)[number];

export const VIDEO_PROVIDERS = ["upload", "youtube", "loom", "vimeo"] as const;
export type VideoProvider = (typeof VIDEO_PROVIDERS)[number];

export const QUIZ_ATTEMPT_STATUSES = ["in_progress", "submitted"] as const;
export type QuizAttemptStatus = (typeof QUIZ_ATTEMPT_STATUSES)[number];

export const QUESTION_SOURCES = ["human", "ai"] as const;
export type QuestionSource = (typeof QUESTION_SOURCES)[number];

export const DEFAULT_PASS_MARK = 80;
export const DEFAULT_QUESTIONS_PER_ATTEMPT = 8;
export const VIDEO_COMPLETE_RATIO = 0.9;
export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
export const VIDEO_PART_BYTES = 16 * 1024 * 1024;
export const VIDEO_MIME_TYPE = "video/mp4";
export const READ_WORDS_PER_MINUTE = 200;
