/**
 * File: packages/shared/src/api-steps.ts
 * Purpose: The HTTP contract for the admin onboarding-step editor (SPEC D28): the step list, one step with its titles
 * (title, sub-header, short title, summary), guidance (What to do, callouts, full manual text), its video slots and its
 * knowledge-check questions, and the request bodies for editing each of them. Only admin routes use these schemas; correct answers never appear in broker responses.
 *
 * Functions:
 * - none
 */
import { z } from "zod";
import { STEP_KINDS, STEP_STAGES } from "./constants";
import { calloutsSchema, guidanceCalloutSchema, todoItemsSchema } from "./guidance";

export const adminStepListRowSchema = z.object({
  key: z.string(),
  position: z.number().int(),
  stage: z.enum(STEP_STAGES),
  title: z.string(),
  shortTitle: z.string(),
  kind: z.enum(STEP_KINDS),
  todoCount: z.number().int(),
  videoCount: z.number().int(),
  emptyVideoSlots: z.number().int(),
  checkQuestionCount: z.number().int(),
});
export type AdminStepListRow = z.infer<typeof adminStepListRowSchema>;

export const adminStepListResponseSchema = z.object({ steps: z.array(adminStepListRowSchema) });
export type AdminStepListResponse = z.infer<typeof adminStepListResponseSchema>;

export const adminStepVideoSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  title: z.string(),
  source: z.literal("upload").nullable(),
  fileName: z.string().nullable(),
  sizeBytes: z.number().int().nullable(),
});
export type AdminStepVideo = z.infer<typeof adminStepVideoSchema>;

export const adminStepQuestionSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  prompt: z.string(),
  explanation: z.string(),
  options: z.array(z.object({ id: z.string(), label: z.string(), isCorrect: z.boolean() })),
});
export type AdminStepQuestion = z.infer<typeof adminStepQuestionSchema>;

export const adminStepDetailResponseSchema = z.object({
  step: adminStepListRowSchema.extend({
    intro: z.string(),
    summary: z.string(),
    todoItems: z.array(z.string()),
    callouts: z.array(guidanceCalloutSchema),
    fullTextMd: z.string(),
  }),
  videos: z.array(adminStepVideoSchema),
  questions: z.array(adminStepQuestionSchema),
});
export type AdminStepDetailResponse = z.infer<typeof adminStepDetailResponseSchema>;

export const updateStepGuidanceRequestSchema = z
  .object({
    todoItems: todoItemsSchema.optional(),
    callouts: calloutsSchema.optional(),
    fullTextMd: z.string().max(40000).optional(),
    title: z.string().trim().min(2, "Give the step a title.").max(160).optional(),
    shortTitle: z.string().trim().min(2, "Give the step a short title.").max(80).optional(),
    intro: z.string().trim().min(1, "Write a sub-header.").max(600).optional(),
    summary: z.string().trim().min(1, "Write a summary.").max(300).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "Send at least one field to change." });
export type UpdateStepGuidanceRequest = z.infer<typeof updateStepGuidanceRequestSchema>;

export const stepVideoSlotRequestSchema = z.object({ title: z.string().trim().min(2).max(120) });

export const stepQuestionFieldsSchema = z.object({
  prompt: z.string().trim().min(5).max(500),
  explanation: z.string().trim().min(1, "Add an explanation brokers see after answering.").max(1000),
  options: z
    .array(z.object({ id: z.uuid().optional(), label: z.string().trim().min(1).max(200), isCorrect: z.boolean() }))
    .min(2)
    .max(6)
    .refine((options) => options.filter((option) => option.isCorrect).length === 1, { message: "Mark exactly one option as correct." }),
});
export type StepQuestionFields = z.infer<typeof stepQuestionFieldsSchema>;
