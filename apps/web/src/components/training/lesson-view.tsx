/**
 * File: apps/web/src/components/training/lesson-view.tsx
 * Purpose: The interactive parts of screen 2b around the lesson text: the video at the top and the footer buttons.
 * Text lessons finish with "Got it — next lesson", embedded videos with "Mark as watched", and uploaded videos once
 * 90% has been watched. Moving on from a finished lesson records it again, which is how a re-read before a retake
 * counts. On the last lesson the main button opens the chapter quiz.
 *
 * Functions:
 * - LessonView({ lesson, children }): renders the video, the lesson text passed as children, and the footer.
 * - LessonFooter({ lesson, completed, onCompleted }): Previous, and the button that finishes the lesson and moves on.
 */
"use client";

import type { TrainingLessonResponse } from "@bp/shared";
import { useRouter } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button, LinkButton } from "@/components/ui/button";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon } from "@/components/ui/icons";
import { apiRequest, ApiError } from "@/lib/api-client";
import { LessonVideo, VideoPlaceholder } from "./lesson-video";
import { StartQuizButton } from "./start-quiz-button";

function LessonFooter({ lesson, completed, onCompleted }: { lesson: TrainingLessonResponse; completed: boolean; onCompleted: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isLast = !lesson.nextLessonId;
  const hasQuiz = lesson.quizQuestionCount > 0;
  const needsWatchButton = lesson.kind === "embed" && !completed;
  const waitingForVideo = lesson.kind === "upload" && !completed;

  async function finishLesson() {
    if (lesson.kind !== "text" && !completed) return;
    const action = lesson.kind === "text" ? "mark_read" : "mark_watched";
    await apiRequest(`/v1/me/training/lessons/${lesson.id}/complete`, { method: "POST", body: { action } });
    onCompleted();
  }

  async function markWatched() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/v1/me/training/lessons/${lesson.id}/complete`, { method: "POST", body: { action: "mark_watched" } });
      onCompleted();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function goNext() {
    setBusy(true);
    setError(null);
    try {
      await finishLesson();
      router.push(lesson.nextLessonId ? `/app/training/lessons/${lesson.nextLessonId}` : "/app/training");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  const nextLabel = lesson.kind === "text" ? (isLast ? "Got it — back to training" : "Got it — next lesson") : isLast ? "Back to training" : "Next lesson";
  const quizLabel = lesson.kind === "text" ? "Got it — take the quiz" : "Take the quiz";

  return (
    <div className="space-y-4 border-t border-line pt-6">
      {waitingForVideo ? (
        <p className="text-[17px] text-muted">Watch the video to the end to finish this lesson. Your place is saved as you go.</p>
      ) : null}
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-start sm:justify-between">
        {lesson.previousLessonId ? (
          <LinkButton href={`/app/training/lessons/${lesson.previousLessonId}`} variant="outline" size="lg">
            <ArrowLeftIcon />
            Previous
          </LinkButton>
        ) : (
          <span className="hidden sm:block" />
        )}
        {needsWatchButton ? (
          <Button size="lg" onClick={markWatched} disabled={busy} aria-busy={busy}>
            <CheckIcon />
            Mark as watched
          </Button>
        ) : isLast && hasQuiz ? (
          <StartQuizButton
            chapterId={lesson.chapter.id}
            onBeforeStart={finishLesson}
            variant={waitingForVideo ? "outline" : "primary"}
            label={
              <>
                {quizLabel}
                <ArrowRightIcon />
              </>
            }
          />
        ) : (
          <Button size="lg" variant={waitingForVideo ? "outline" : "primary"} onClick={goNext} disabled={busy} aria-busy={busy}>
            {nextLabel}
            <ArrowRightIcon />
          </Button>
        )}
      </div>
    </div>
  );
}

export function LessonView({ lesson, children }: { lesson: TrainingLessonResponse; children: ReactNode }) {
  const [completed, setCompleted] = useState(lesson.completed);
  const markCompleted = useCallback(() => setCompleted(true), []);
  return (
    <>
      {lesson.video ? (
        <LessonVideo lessonId={lesson.id} title={lesson.title} video={lesson.video} watchedSeconds={lesson.watchedSeconds} onCompleted={markCompleted} />
      ) : lesson.videoPlaceholder ? (
        <VideoPlaceholder />
      ) : null}
      {children}
      {completed && lesson.kind !== "text" ? (
        <p role="status" className="flex items-center gap-2 text-[17px] font-semibold text-success">
          <CheckIcon className="size-5" />
          Lesson finished
        </p>
      ) : null}
      <LessonFooter lesson={lesson} completed={completed} onCompleted={markCompleted} />
    </>
  );
}
