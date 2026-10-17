/**
 * File: apps/web/src/components/broker/mark-welcome-seen.tsx
 * Purpose: Tells the API the broker has seen the onboarding-complete screen, so it only opens on its own once
 * (docs/SPEC.md). Renders nothing.
 *
 * Functions:
 * - MarkWelcomeSeen({ pending }): posts /v1/me/welcome-seen once after the screen appears, if it hasn't been recorded yet.
 */
"use client";

import { useEffect } from "react";
import { apiRequest } from "@/lib/api-client";

export function MarkWelcomeSeen({ pending }: { pending: boolean }) {
  useEffect(() => {
    if (pending) void apiRequest("/v1/me/welcome-seen", { method: "POST", body: {} }).catch(() => null);
  }, [pending]);
  return null;
}
