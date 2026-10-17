/**
 * File: apps/web/src/components/admin/training/use-action.ts
 * Purpose: The pattern every content-editor button shares: run an API call, show "busy" while it runs, show the API's
 * plain-language error if it fails, and refresh the server data when it succeeds.
 *
 * Functions:
 * - useAction(): returns { busy, error, setError, run(task, options) } for one button or form.
 */
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ApiError } from "@/lib/api-client";

export function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <T>(task: () => Promise<T>, options: { refresh?: boolean } = {}): Promise<T | null> => {
      setBusy(true);
      setError(null);
      try {
        const result = await task();
        if (options.refresh !== false) router.refresh();
        return result;
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  return { busy, error, setError, run };
}
