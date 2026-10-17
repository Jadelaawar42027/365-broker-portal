/**
 * File: apps/web/src/app/app/(main)/page.tsx
 * Purpose: Screen 1b, "My onboarding": greeting, progress, the one next step, any steps sent back, and the full
 * checklist by stage. A broker who has just finished is sent to the onboarding-complete screen once (docs/SPEC.md).
 *
 * Functions:
 * - MyOnboardingPage(): loads the broker's steps and renders the checklist.
 */
import type { Metadata } from "next";
import type { MyStepsResponse } from "@bp/shared";
import { redirect } from "next/navigation";
import { NextStepCard, SentBackBanner, StepGroup } from "@/components/broker/checklist";
import { ProgressBar } from "@/components/ui/misc";
import { firstName, greeting } from "@/lib/format";
import { requireMe, serverGet } from "@/lib/server-api";
import { groupByStage } from "@/lib/steps";

export const metadata: Metadata = { title: "My onboarding · 365 Yachts" };

export default async function MyOnboardingPage() {
  const me = await requireMe();
  if (me.broker?.showWelcome) redirect("/app/welcome-aboard");
  const { data } = await serverGet<MyStepsResponse>("/v1/me/steps");
  if (!data) throw new Error("Could not load your onboarding steps.");
  const now = new Date();
  const { progress } = data;
  const percent = Math.round((progress.approved / Math.max(progress.total, 1)) * 100);
  const nextStep = data.steps.find((step) => step.key === data.nextStepKey) ?? null;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[34px] leading-tight font-extrabold tracking-tight sm:text-[38px]">
            {greeting(now)}, {firstName(me.user.name)}
          </h1>
          <p className="mt-2 text-[17px] text-muted">
            You&apos;ve sent in {progress.sent} of {progress.total} steps and {progress.approved}{" "}
            {progress.approved === 1 ? "is" : "are"} approved. Training unlocks when all {progress.total} are done.
          </p>
        </div>
        <div className="w-full shrink-0 lg:w-[340px]">
          <div className="mb-2 flex justify-between text-base font-bold tabular-nums">
            <span>
              {progress.approved} of {progress.total} steps approved
            </span>
            <span className="text-brand">{percent}%</span>
          </div>
          <ProgressBar value={progress.approved} max={progress.total} label="Steps approved" />
        </div>
      </div>

      <NextStepCard step={nextStep} complete={data.complete} />

      {data.sentBack.map((item) => (
        <SentBackBanner key={item.key} item={item} now={now} />
      ))}

      {groupByStage(data.steps).map((group) => (
        <StepGroup key={group.stage} number={group.number} title={group.stageTitle} steps={group.steps} />
      ))}
    </div>
  );
}
