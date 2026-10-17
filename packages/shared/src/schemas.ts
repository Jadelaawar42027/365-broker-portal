/**
 * File: packages/shared/src/schemas.ts
 * Purpose: Zod schemas shared by the API (request validation, OpenAPI) and the web app (form validation):
 * the domain enums, ISO dates, step configuration, and the answer a broker sends for each kind of step.
 *
 * Functions:
 * - formDataSchemaForStep(step): returns the Zod schema for the form_data a broker submits on that step (text, choice, confirm, checklist; empty for upload and admin steps).
 */
import { z } from "zod";
import {
  BROKER_LEVELS,
  BROKER_STATUSES,
  MIN_PASSWORD_LENGTH,
  STEP_KINDS,
  STEP_STAGES,
  STEP_STATUSES,
  USER_ROLES,
  type StepKind,
} from "./constants";
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

export const stepConfigSchema = z
  .object({
    choices: z.array(optionSchema).min(2).optional(),
    items: z.array(optionSchema.extend({ videoUrl: z.url().nullable().optional() })).min(1).optional(),
    confirmLabel: z.string().min(1).optional(),
    minLength: z.number().int().min(0).optional(),
    maxLength: z.number().int().min(1).optional(),
    placeholder: z.string().optional(),
    templateLabel: z.string().min(1).optional(),
    templateLink: linkSchema.optional(),
    links: z.array(linkSchema).optional(),
    reviewChecklist: z.array(z.string().min(1)).optional(),
    minutes: z.number().int().positive().optional(),
  })
  .strict();
export type StepConfig = z.infer<typeof stepConfigSchema>;

export function formDataSchemaForStep(step: { kind: StepKind; config: StepConfig }) {
  const { config } = step;
  switch (step.kind) {
    case "text": {
      const min = config.minLength ?? 1;
      const max = config.maxLength ?? 5000;
      return z.object({
        text: z
          .string()
          .trim()
          .min(min, min > 1 ? `Write at least ${min} characters.` : "This can't be empty.")
          .max(max, `Keep it under ${max} characters.`),
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
          .array(z.string())
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
