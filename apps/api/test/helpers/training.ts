/**
 * File: apps/api/test/helpers/training.ts
 * Purpose: Builds training content for API tests through the real admin routes: a chapter with text lessons and
 * multiple-choice questions (each tied to a lesson), optionally published, and a way to look up correct options.
 *
 * Functions:
 * - buildChapter(ctx, cookie, spec): creates the chapter, lessons and questions, publishes it if asked, and returns their ids.
 * - correctOptions(ctx, cookie, chapterId): returns a map from question id to its correct option id (admin view).
 * - wrongOption(ctx, cookie, chapterId, questionId): returns one incorrect option id for a question.
 */
import { expect } from "vitest";
import type { TestContext } from "./context";

export type ChapterSpec = {
  code: string;
  title?: string;
  position?: number;
  lessons?: number;
  questions?: number;
  questionsPerAttempt?: number;
  passMark?: number;
  publish?: boolean;
};

export async function buildChapter(ctx: TestContext, cookie: string, spec: ChapterSpec) {
  const created = await ctx.call("POST", "/v1/admin/training/chapters", {
    cookie,
    body: {
      code: spec.code,
      title: spec.title ?? `Chapter ${spec.code}`,
      summary: "Test chapter",
      position: spec.position,
      passMark: spec.passMark ?? 80,
      questionsPerAttempt: spec.questionsPerAttempt ?? 8,
    },
  });
  expect(created.statusCode).toBe(201);
  const chapterId = created.json().id as string;
  const lessonIds: string[] = [];
  for (let index = 1; index <= (spec.lessons ?? 2); index += 1) {
    const lesson = await ctx.call("POST", `/v1/admin/training/chapters/${chapterId}/lessons`, {
      cookie,
      body: { title: `Lesson ${index}`, bodyMd: `Lesson ${index} text.\n\n> [!WATCH]\n> Careful here.` },
    });
    expect(lesson.statusCode).toBe(201);
    lessonIds.push(lesson.json().id);
  }
  const questionIds: string[] = [];
  for (let index = 1; index <= (spec.questions ?? 4); index += 1) {
    const question = await ctx.call("POST", `/v1/admin/training/chapters/${chapterId}/questions`, {
      cookie,
      body: {
        prompt: `Question number ${index}?`,
        explanation: `Explanation ${index}: the right answer is A${index}.`,
        lessonId: lessonIds[(index - 1) % lessonIds.length],
        options: [
          { label: `A${index}`, isCorrect: true },
          { label: `B${index}`, isCorrect: false },
          { label: `C${index}`, isCorrect: false },
        ],
      },
    });
    expect(question.statusCode).toBe(201);
    questionIds.push(question.json().id);
  }
  if (spec.publish !== false) {
    expect((await ctx.call("POST", `/v1/admin/training/chapters/${chapterId}/publish`, { cookie })).statusCode).toBe(200);
  }
  return { chapterId, lessonIds, questionIds };
}

export async function correctOptions(ctx: TestContext, cookie: string, chapterId: string): Promise<Map<string, string>> {
  const detail = (await ctx.call("GET", `/v1/admin/training/chapters/${chapterId}`, { cookie })).json() as {
    questions: { id: string; options: { id: string; isCorrect: boolean }[] }[];
  };
  return new Map(detail.questions.map((question) => [question.id, question.options.find((option) => option.isCorrect)!.id]));
}

export async function wrongOption(ctx: TestContext, cookie: string, chapterId: string, questionId: string): Promise<string> {
  const detail = (await ctx.call("GET", `/v1/admin/training/chapters/${chapterId}`, { cookie })).json() as {
    questions: { id: string; options: { id: string; isCorrect: boolean }[] }[];
  };
  return detail.questions.find((question) => question.id === questionId)!.options.find((option) => !option.isCorrect)!.id;
}
