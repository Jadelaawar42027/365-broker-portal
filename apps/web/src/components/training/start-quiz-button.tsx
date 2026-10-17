/**
 * File: apps/web/src/components/training/start-quiz-button.tsx
 * Purpose: The button that starts (or resumes) a chapter quiz and opens it. When the API refuses (lessons not finished,
 * lessons to re-read first) it shows the API's plain-language reason under the button.
 *
 * Functions:
 * - StartQuizButton({ chapterId, label, variant, size, className, onBeforeStart }): starts the attempt and navigates to it.
 */
"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { apiRequest, ApiError } from "@/lib/api-client";

export function StartQuizButton({
  chapterId,
  label,
  variant = "primary",
  size = "lg",
  className = "",
  onBeforeStart,
}: {
  chapterId: string;
  label: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  onBeforeStart?: () => Promise<void>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      await onBeforeStart?.();
      const { attemptId } = await apiRequest<{ attemptId: string }>(`/v1/me/training/chapters/${chapterId}/attempts`, { method: "POST" });
      router.push(`/app/training/quiz/${attemptId}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant={variant} size={size} className={className} onClick={start} disabled={busy} aria-busy={busy}>
        {busy ? "Opening the quiz…" : label}
      </Button>
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
    </div>
  );
}
