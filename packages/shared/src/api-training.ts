/**
 * File: packages/shared/src/api-training.ts
 * Purpose: The HTTP contract for training (phase G): Zod schemas for the broker's training home, chapters, lessons,
 * video progress and quizzes, and for the admin chapter / lesson / video / question editor and statistics. Broker
 * question schemas have no correct-answer or explanation fields, so those can never be sent before a quiz is submitted.
 *
 * Functions:
 * - none
 */
import { z } from "zod";
import {
  CHAPTER_STATUSES,
  MAX_VIDEO_BYTES,
  RETAKE_POLICIES,
  VIDEO_MIME_TYPE,
  VIDEO_PROVIDERS,
  VIDEO_SOURCES,
} from "./constants";

const nullableTimestamp = z.string().nullable();
const chapterStateSchema = z.enum(["passed", "in_progress", "available", "locked"]);
const quizAvailabilitySchema = z.enum(["chapter_locked", "lessons_unfinished", "reread_required", "resume", "start"]);
const lessonKindSchema = z.enum(["text", "upload", "embed"]);

export const trainingChapterRowSchema = z.object({
  id: z.string(),
  code: z.string(),
  label: z.string(),
  title: z.string(),
  summary: z.string(),
  state: chapterStateSchema,
  unlocksAfterCode: z.string().nullable(),
  lessonsTotal: z.number().int(),
  lessonsCompleted: z.number().int(),
  bestScore: z.number().int().nullable(),
  passMark: z.number().int(),
});
export type TrainingChapterRow = z.infer<typeof trainingChapterRowSchema>;

export const trainingHomeResponseSchema = z.object({
  open: z.boolean(),
  stats: z.object({ chaptersPassed: z.number().int(), chaptersTotal: z.number().int(), averageScore: z.number().int().nullable() }),
  continue: z
    .object({
      chapterId: z.string(),
      label: z.string(),
      lessonsTotal: z.number().int(),
      lessonsCompleted: z.number().int(),
      minutesLeft: z.number().int(),
      nextLessonId: z.string().nullable(),
      quizNext: z.boolean(),
    })
    .nullable(),
  volumeOne: z.array(trainingChapterRowSchema),
  volumeTwo: z.array(z.object({ id: z.string(), label: z.string(), title: z.string(), scheduleLabel: z.string().nullable() })),
});
export type TrainingHomeResponse = z.infer<typeof trainingHomeResponseSchema>;

const lessonLinkSchema = z.object({ id: z.string(), position: z.number().int(), title: z.string() });

export const trainingChapterResponseSchema = z.object({
  chapter: z.object({
    id: z.string(),
    code: z.string(),
    label: z.string(),
    title: z.string(),
    summary: z.string(),
    passMark: z.number().int(),
    retakePolicy: z.enum(RETAKE_POLICIES),
    state: chapterStateSchema,
  }),
  lessons: z.array(lessonLinkSchema.extend({ readMinutes: z.number().int(), kind: lessonKindSchema, completed: z.boolean() })),
  quiz: z.object({
    availability: quizAvailabilitySchema,
    questionCount: z.number().int(),
    inProgressAttemptId: z.string().nullable(),
    lastAttemptId: z.string().nullable(),
    lessonsToReread: z.array(lessonLinkSchema),
    bestScore: z.number().int().nullable(),
    tries: z.number().int(),
    passed: z.boolean(),
  }),
});
export type TrainingChapterResponse = z.infer<typeof trainingChapterResponseSchema>;

export const lessonVideoViewSchema = z.object({
  source: z.enum(VIDEO_SOURCES),
  provider: z.enum(VIDEO_PROVIDERS),
  embedUrl: z.string().nullable(),
  playUrl: z.string().nullable(),
  durationSeconds: z.number().int().nullable(),
});

export const trainingLessonResponseSchema = z.object({
  id: z.string(),
  chapter: z.object({ id: z.string(), label: z.string(), title: z.string() }),
  position: z.number().int(),
  lessonsTotal: z.number().int(),
  title: z.string(),
  readMinutes: z.number().int(),
  bodyMd: z.string(),
  kind: lessonKindSchema,
  video: lessonVideoViewSchema.nullable(),
  videoPlaceholder: z.boolean(),
  completed: z.boolean(),
  watchedSeconds: z.number().int(),
  lessons: z.array(lessonLinkSchema.extend({ completed: z.boolean() })),
  previousLessonId: z.string().nullable(),
  nextLessonId: z.string().nullable(),
  quizQuestionCount: z.number().int(),
});
export type TrainingLessonResponse = z.infer<typeof trainingLessonResponseSchema>;

export const completeLessonRequestSchema = z.object({ action: z.enum(["mark_read", "mark_watched"]) });
export const lessonProgressRequestSchema = z.object({
  watchedSeconds: z.number().int().min(0).max(24 * 60 * 60),
  durationSeconds: z.number().int().positive().max(24 * 60 * 60).optional(),
});
export const lessonProgressResponseSchema = z.object({ completed: z.boolean(), watchedSeconds: z.number().int() });

export const startAttemptResponseSchema = z.object({ attemptId: z.string() });

export const quizQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  options: z.array(z.object({ id: z.string(), label: z.string() })),
  answeredOptionId: z.string().nullable(),
  lesson: lessonLinkSchema.nullable(),
});

export const quizResultSchema = z.object({
  scorePct: z.number().int(),
  correctCount: z.number().int(),
  totalCount: z.number().int(),
  passed: z.boolean(),
  nextChapter: z.object({ id: z.string(), label: z.string(), title: z.string() }).nullable(),
  missed: z.array(
    z.object({
      questionId: z.string(),
      prompt: z.string(),
      yourAnswer: z.string().nullable(),
      correctAnswer: z.string(),
      explanation: z.string(),
      lesson: lessonLinkSchema.nullable(),
    }),
  ),
  lessonsToReread: z.array(lessonLinkSchema),
  canRetake: z.boolean(),
});

export const quizAttemptResponseSchema = z.object({
  id: z.string(),
  status: z.enum(["in_progress", "submitted"]),
  attemptNumber: z.number().int(),
  chapter: z.object({ id: z.string(), label: z.string(), title: z.string(), passMark: z.number().int(), retakePolicy: z.enum(RETAKE_POLICIES) }),
  questions: z.array(quizQuestionSchema),
  result: quizResultSchema.nullable(),
});
export type QuizAttemptResponse = z.infer<typeof quizAttemptResponseSchema>;

export const answerRequestSchema = z.object({ questionId: z.uuid(), optionId: z.uuid() });

export const adminChapterRowSchema = z.object({
  id: z.string(),
  volume: z.number().int(),
  code: z.string(),
  label: z.string(),
  title: z.string(),
  status: z.enum(CHAPTER_STATUSES),
  position: z.number().int(),
  lessonsCount: z.number().int(),
  questionsCount: z.number().int(),
  averageScore: z.number().int().nullable(),
  flagged: z.boolean(),
});
export type AdminChapterRow = z.infer<typeof adminChapterRowSchema>;
export const adminChapterListResponseSchema = z.object({ chapters: z.array(adminChapterRowSchema) });

export const chapterFieldsSchema = z.object({
  volume: z.number().int().min(1).max(2).optional(),
  code: z.string().trim().min(1).max(10),
  title: z.string().trim().min(2).max(120),
  summary: z.string().trim().max(300).optional(),
  passMark: z.number().int().min(1).max(100).optional(),
  questionsPerAttempt: z.number().int().min(1).max(50).optional(),
  retakePolicy: z.enum(RETAKE_POLICIES).optional(),
  scheduleLabel: z.string().trim().max(60).nullable().optional(),
  position: z.number().int().min(0).max(1000).optional(),
  comingSoon: z.boolean().optional(),
});
export const updateChapterRequestSchema = chapterFieldsSchema.partial().refine((body) => Object.keys(body).length > 0, {
  message: "Send at least one field to change.",
});

export const adminVideoSchema = z.object({
  source: z.enum(VIDEO_SOURCES),
  provider: z.enum(VIDEO_PROVIDERS),
  embedUrl: z.string().nullable(),
  fileName: z.string().nullable(),
  sizeBytes: z.number().int().nullable(),
  durationSeconds: z.number().int().nullable(),
});

export const adminLessonSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  title: z.string(),
  bodyMd: z.string(),
  readMinutes: z.number().int(),
  adminNote: z.string().nullable(),
  videoPlaceholder: z.boolean(),
  video: adminVideoSchema.nullable(),
});
export type AdminLesson = z.infer<typeof adminLessonSchema>;

export const adminQuestionSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  prompt: z.string(),
  explanation: z.string(),
  lessonId: z.string().nullable(),
  adminNote: z.string().nullable(),
  active: z.boolean(),
  options: z.array(z.object({ id: z.string(), label: z.string(), isCorrect: z.boolean() })),
  stats: z.object({ answered: z.number().int(), correctPct: z.number().int().nullable(), firstTimeCorrectPct: z.number().int().nullable() }),
});
export type AdminQuestion = z.infer<typeof adminQuestionSchema>;

export const adminChapterDetailResponseSchema = z.object({
  chapter: adminChapterRowSchema.extend({
    summary: z.string(),
    passMark: z.number().int(),
    questionsPerAttempt: z.number().int(),
    retakePolicy: z.enum(RETAKE_POLICIES),
    scheduleLabel: z.string().nullable(),
    publishedAt: nullableTimestamp,
  }),
  lessons: z.array(adminLessonSchema),
  questions: z.array(adminQuestionSchema),
});
export type AdminChapterDetailResponse = z.infer<typeof adminChapterDetailResponseSchema>;

export const lessonFieldsSchema = z.object({
  title: z.string().trim().min(2).max(120),
  bodyMd: z.string().max(40000).optional(),
  readMinutes: z.number().int().min(1).max(60).optional(),
  adminNote: z.string().trim().max(1000).nullable().optional(),
  videoPlaceholder: z.boolean().optional(),
});
export const updateLessonRequestSchema = lessonFieldsSchema.partial().refine((body) => Object.keys(body).length > 0, {
  message: "Send at least one field to change.",
});
export const lessonOrderRequestSchema = z.object({ lessonIds: z.array(z.uuid()).min(1) });
export const embedVideoRequestSchema = z.object({ url: z.string().trim().min(8).max(500) });

export const startVideoUploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  contentType: z.literal(VIDEO_MIME_TYPE, { message: "Upload an MP4 video." }),
  sizeBytes: z.number().int().positive().max(MAX_VIDEO_BYTES, "Videos can be up to 1 GB."),
  durationSeconds: z.number().int().positive().max(6 * 60 * 60).optional(),
});
export const startVideoUploadResponseSchema = z.object({
  uploadId: z.string(),
  storageKey: z.string(),
  partSize: z.number().int(),
  parts: z.array(z.object({ partNumber: z.number().int(), url: z.string() })),
});
export type StartVideoUploadResponse = z.infer<typeof startVideoUploadResponseSchema>;
export const completeVideoUploadRequestSchema = z.object({
  uploadId: z.string().min(1),
  storageKey: z.string().min(1),
  fileName: z.string().trim().min(1).max(200),
  durationSeconds: z.number().int().positive().max(6 * 60 * 60).optional(),
  parts: z.array(z.object({ partNumber: z.number().int().min(1).max(10000), etag: z.string().min(1) })).min(1),
});
export const abortVideoUploadRequestSchema = z.object({ uploadId: z.string().min(1), storageKey: z.string().min(1) });

export const questionFieldsSchema = z.object({
  prompt: z.string().trim().min(5).max(500),
  explanation: z.string().trim().max(1000).optional(),
  lessonId: z.uuid().nullable().optional(),
  adminNote: z.string().trim().max(1000).nullable().optional(),
  options: z
    .array(z.object({ id: z.uuid().optional(), label: z.string().trim().min(1).max(200), isCorrect: z.boolean() }))
    .min(2)
    .max(6)
    .refine((options) => options.filter((option) => option.isCorrect).length === 1, { message: "Mark exactly one option as correct." }),
});
export const updateQuestionRequestSchema = questionFieldsSchema.partial().refine((body) => Object.keys(body).length > 0, {
  message: "Send at least one field to change.",
});

export const idResponseSchema = z.object({ id: z.string() });

export const brokerTrainingResponseSchema = z.object({
  open: z.boolean(),
  summary: z.object({
    chaptersPassed: z.number().int(),
    chaptersTotal: z.number().int(),
    avgBestScore: z.number().int().nullable(),
    avgFirstAttemptScore: z.number().int().nullable(),
  }),
  chapters: z.array(
    trainingChapterRowSchema.extend({
      tries: z.number().int(),
      firstScore: z.number().int().nullable(),
      needsHelp: z.boolean(),
      canRetake: z.boolean(),
      lessonsToReread: z.array(lessonLinkSchema),
    }),
  ),
});
export type BrokerTrainingResponse = z.infer<typeof brokerTrainingResponseSchema>;

export const trainingOverviewResponseSchema = z.object({
  averageFirstAttemptScore: z.number().int().nullable(),
  needsHelp: z.array(z.object({ brokerId: z.string(), name: z.string(), reason: z.string(), kind: z.enum(["failed_twice", "inactive"]) })),
});
export type TrainingOverviewResponse = z.infer<typeof trainingOverviewResponseSchema>;
