/**
 * File: apps/web/src/app/admin/steps/[key]/page.tsx
 * Purpose: The admin editor for one onboarding step (SPEC D28): the step list on the left, and on the right the
 * step's videos, its guidance (What to do bullets, callouts, the manual's full text) and its optional knowledge check.
 * Changes show to brokers straight away.
 *
 * Functions:
 * - StepAdminPage({ params }): loads the step and the list and renders the editor.
 */
import type { AdminStepDetailResponse, AdminStepListResponse } from "@bp/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StepCheckEditor } from "@/components/admin/steps/step-check-editor";
import { StepGuidanceEditor } from "@/components/admin/steps/step-guidance-editor";
import { StepList } from "@/components/admin/steps/step-list";
import { StepVideosEditor } from "@/components/admin/steps/step-videos-editor";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Onboarding steps · 365 Yachts admin" };

export default async function StepAdminPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const [{ data: list }, { data: detail }] = await Promise.all([
    serverGet<AdminStepListResponse>("/v1/admin/steps"),
    serverGet<AdminStepDetailResponse>(`/v1/admin/steps/${encodeURIComponent(key)}`),
  ]);
  if (!detail) notFound();
  const { step } = detail;

  return (
    <div className="space-y-6">
      <h1 className="text-[35px] leading-tight font-extrabold tracking-tight">Onboarding steps</h1>
      <div className="grid items-start gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <StepList steps={list?.steps ?? []} currentKey={step.key} />
        <div className="min-w-0 space-y-5">
          <section aria-labelledby="step-heading" className="rounded-2xl border border-line bg-white px-6 py-6">
            <p className="text-[15px] font-bold tracking-[0.06em] text-brand uppercase">Step {step.position}</p>
            <h2 id="step-heading" className="mt-1 text-[28px] leading-tight font-extrabold tracking-tight">
              {step.title}
            </h2>
            <p className="mt-2 text-[17px] text-muted">{step.intro}</p>
            <p className="mt-3 text-[15px] text-muted">Brokers see the changes you save here straight away.</p>
          </section>
          <StepVideosEditor key={`videos-${step.key}`} stepKey={step.key} videos={detail.videos} />
          <StepGuidanceEditor key={`guidance-${step.key}`} step={step} />
          <StepCheckEditor key={`check-${step.key}`} stepKey={step.key} questions={detail.questions} />
        </div>
      </div>
    </div>
  );
}
