/**
 * File: apps/web/src/app/admin/steps/page.tsx
 * Purpose: The entry to the admin onboarding-step editor: opens the first step.
 *
 * Functions:
 * - StepsAdminPage(): redirects to the first active step, or says there are none.
 */
import type { AdminStepListResponse } from "@bp/shared";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Onboarding steps · 365 Yachts admin" };

export default async function StepsAdminPage() {
  const { data } = await serverGet<AdminStepListResponse>("/v1/admin/steps");
  const first = data?.steps[0];
  if (first) redirect(`/admin/steps/${first.key}`);
  return (
    <div className="space-y-6">
      <h1 className="text-[35px] leading-tight font-extrabold tracking-tight">Onboarding steps</h1>
      <p className="rounded-2xl border border-line bg-white px-6 py-8 text-lg text-muted">No onboarding steps yet. Run pnpm db:seed to load them.</p>
    </div>
  );
}
