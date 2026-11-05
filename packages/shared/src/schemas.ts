/**
 * File: packages/shared/src/schemas.ts
 * Purpose: Zod schemas shared by the API (request validation, OpenAPI) and the web app (form validation):
 * the domain enums, ISO dates, step configuration, and the answer a broker sends for each kind of step. A step's config
 * can hold "paths": a guide per answer of an earlier choice step (config.paths.fromStep), so steps 8 and 9 show the
 * licensing route the broker picked at step 7; and "alertChoices": answers that email the admins (e.g. "I need help").
 *
 * Functions:
 * - formDataSchemaForStep(step): returns the Zod schema for the form_data a broker submits on that step (text with character and word limits, choice, confirm, checklist limited to the step's own items; empty for upload and admin steps).
 * - fileCountLimits(config): the { min, max } number of files an upload step takes (config.minFiles/maxFiles, default 1 to MAX_FILES_PER_SUBMISSION).
 * - fileCountProblem(config, count): a message when count is outside the step's file limits, or null.
 */
import { z } from "zod";
import {
  BROKER_LEVELS,
  MAX_FILES_PER_SUBMISSION,
  BROKER_STATUSES,
  MIN_PASSWORD_LENGTH,
  STEP_KINDS,
  STEP_STAGES,
  STEP_STATUSES,
  USER_ROLES,
  type StepKind,
} from "./constants";
import { countWords } from "./guidance";
import { parseIsoDate } from "./metrics";

export const userRoleSchema = z.enum(USER_ROLES);
export const brokerLevelSchema = z.enum(BROKER_LEVELS);
export const brokerStatusSchema = z.enum(BROKER_STATUSES);
export const stepStatusSchema = z.enum(STEP_STATUSES);
export const stepKindSchema = z.enum(STEP_KINDS);
export const stepStageSchema = z.enum(STEP_STAGES);

export const isoDateSchema = z.string().refine(
  (value) => {
    try {
      parseIsoDate(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Use a date like 2026-10-17." },
);

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address."));
export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(128, "Use at most 128 characters.");

const optionSchema = z.object({ value: z.string().min(1), label: z.string().min(1) });
const linkSchema = z.object({ label: z.string().min(1), url: z.url() });
const stepPathSchema = z.object({ value: z.string().min(1), heading: z.string().min(1), bodyMd: z.string().min(1).max(20000) });
const stepPathsSchema = z.object({ fromStep: z.string().min(1), options: z.array(stepPathSchema).min(1) });

export const stepConfigSchema = z
  .object({
    choices: z.array(optionSchema).min(2).optional(),
    items: z.array(optionSchema.extend({ videoUrl: z.url().nullable().optional() })).min(1).optional(),
    confirmLabel: z.string().min(1).optional(),
    minLength: z.number().int().min(0).optional(),
    maxLength: z.number().int().min(1).optional(),
    minWords: z.number().int().min(0).optional(),
    maxWords: z.number().int().min(1).optional(),
    minFiles: z.number().int().min(1).max(MAX_FILES_PER_SUBMISSION).optional(),
    maxFiles: z.number().int().min(1).max(MAX_FILES_PER_SUBMISSION).optional(),
    minImagePx: z.number().int().min(1).optional(),
    placeholder: z.string().optional(),
    templateLabel: z.string().min(1).optional(),
    templateLink: linkSchema.optional(),
    links: z.array(linkSchema).optional(),
    reviewChecklist: z.array(z.string().min(1)).optional(),
    minutes: z.number().int().positive().optional(),
    paths: stepPathsSchema.optional(),
    alertChoices: z.array(z.string().min(1)).optional(),
  })
  .strict();
export type StepPath = z.infer<typeof stepPathSchema>;
export type StepConfig = z.infer<typeof stepConfigSchema>;

export function fileCountLimits(config: { minFiles?: number; maxFiles?: number }): { min: number; max: number } {
  const max = Math.min(config.maxFiles ?? MAX_FILES_PER_SUBMISSION, MAX_FILES_PER_SUBMISSION);
  const min = Math.min(config.minFiles ?? 1, max);
  return { min, max };
}

export function fileCountProblem(config: { minFiles?: number; maxFiles?: number }, count: number): string | null {
  const { min, max } = fileCountLimits(config);
  if (count < min) return min === 1 ? "Add a file before sending." : `Add at least ${min} files before sending.`;
  if (count > max) return max === 1 ? "This step takes one file. Remove the extra ones." : `This step takes up to ${max} files.`;
  return null;
}

export function formDataSchemaForStep(step: { kind: StepKind; config: StepConfig }) {
  const { config } = step;
  switch (step.kind) {
    case "text": {
      const min = config.minLength ?? 1;
      const max = config.maxLength ?? 5000;
      const minWords = config.minWords ?? 0;
      const maxWords = config.maxWords;
      return z.object({
        text: z
          .string()
          .trim()
          .min(min, min > 1 ? `Write at least ${min} characters.` : "This can't be empty.")
          .max(max, `Keep it under ${max} characters.`)
          .refine((text) => countWords([text]) >= minWords, { message: `Write at least ${minWords} words.` })
          .refine((text) => maxWords === undefined || countWords([text]) <= maxWords, { message: `Keep it to ${maxWords} words or fewer.` }),
      });
    }
    case "choice": {
      const values = (config.choices ?? []).map((choice) => choice.value);
      return z.object({
        choice: z.string().refine((value) => values.includes(value), { message: "Pick one of the options." }),
      });
    }
    case "confirm":
      return z.object({ confirmed: z.literal(true, { message: "Tick the box to confirm." }) });
    case "checklist": {
      const required = (config.items ?? []).map((item) => item.value);
      return z.object({
        checked: z
          .array(z.string().refine((value) => required.includes(value), { message: "That item isn't part of this step." }))
          .max(required.length)
          .refine((checked) => required.every((value) => checked.includes(value)), {
            message: "Tick every item to finish this step.",
          }),
      });
    }
    case "upload":
    case "admin":
      return z.object({}).strict();
  }
}
