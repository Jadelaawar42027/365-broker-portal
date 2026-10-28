/**
 * File: apps/web/src/app/app/steps/[stepKey]/page.tsx
 * Purpose: Screen 1c, one onboarding step in the short layout (SPEC D28): videos first, then "What to do" bullets with
 * the template download, one-line callouts, the manual's text behind "Read the full section", then the upload or
 * answer form (with the knowledge check, if any), and a side column with "What happens next" and the WhatsApp help
 * button. Steps without guidance yet show their numbered instructions instead. Sent-back, waiting and finished steps
 * explain their state instead of showing the form. Step 2 shows the agreement signing flow instead of an upload form
 * (SPEC D31). Step 9 (365 email) shows the broker's corporate email and "Reveal my temporary password" (phase H2). Steps with
 * config.paths (7 and 8) show the step-by-step guide for the licensing route the broker picked at step 6.
 *
 * Functions:
 * - StepPage({ params }): loads the step and renders it.
 * - StepLinks({ step }): the template download and outside-link buttons.
 * - hasStepLinks(step): true when the step has a template or outside link to show.
 * - StatusNotice({ step, supportName }): the banner for a sent-back, waiting or finished step.
 * - WhatHappensNext({ step, supportName }): the side card explaining what follows a submission.
 */
import { CONTRACT_STEP_KEY, type MeResponse, type MyAccountsResponse, type MyContractsResponse, type StepDetailResponse } from "@bp/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CorporateEmailCard } from "@/components/broker/corporate-email-card";
import { StepForm } from "@/components/broker/step-form";
import { StepPathGuide } from "@/components/broker/step-path-guide";
import { ContractSigning } from "@/components/contracts/contract-signing";
import { StepVideos } from "@/components/broker/step-videos";
import { GuidedContent } from "@/components/guidance/guided-content";
import { buttonClasses } from "@/components/ui/button";
import { FileLinkButton, TemplateDownloadButton } from "@/components/ui/file-link";
import { AlertIcon, ArrowLeftIcon, CheckIcon, ClockIcon, DownloadIcon, PlayIcon } from "@/components/ui/icons";
import { WhatsAppButton } from "@/components/ui/whatsapp-button";
import { firstName, formatDate } from "@/lib/format";
import { requireMe, serverGet } from "@/lib/server-api";
import { parseInstructionSteps } from "@/lib/steps";

export const metadata: Metadata = { title: "Onboarding step · 365 Yachts" };

const EMAIL_STEP_KEY = "email_signature";

function StatusNotice({ step, supportName }: { step: StepDetailResponse; supportName: string }) {
  if (step.status === "changes_requested") {
    const reviewer = step.review?.reviewerName ? firstName(step.review.reviewerName) : supportName;
    return (
      <div role="status" className="flex gap-4 rounded-2xl border border-danger-line bg-danger-soft px-5 py-5">
        <AlertIcon className="mt-0.5 size-6 shrink-0 text-danger" />
        <div>
          <p className="text-lg font-bold text-danger">{reviewer} sent this step back</p>
          {step.review?.note ? <p className="mt-1 text-lg text-[#5c2a2a]">“{step.review.note}”</p> : null}
          <p className="mt-1 text-base text-[#5c2a2a]">Fix it below and send it again.</p>
        </div>
      </div>
    );
  }
  if (step.status === "submitted") {
    return (
      <div role="status" className="flex gap-4 rounded-2xl border border-warn-line bg-warn-soft px-5 py-5">
        <ClockIcon className="mt-0.5 size-6 shrink-0 text-warn" />
        <div>
          <p className="text-lg font-bold text-warn">Sent — waiting for {supportName} to check it</p>
          <p className="mt-1 text-base text-[#5b3a10]">
            {step.submittedAt ? `You sent it on ${formatDate(step.submittedAt)}. ` : ""}You can keep going with the next step meanwhile.
          </p>
        </div>
      </div>
    );
  }
  if (step.status === "approved") {
    return (
      <div role="status" className="flex gap-4 rounded-2xl border border-[#bfe3cc] bg-success-soft px-5 py-5">
        <CheckIcon className="mt-0.5 size-6 shrink-0 text-success" />
        <p className="text-lg font-bold text-success">{step.label === "Done" ? "Done — nothing more to do here." : `${step.label} — nothing more to do here.`}</p>
      </div>
    );
  }
  return null;
}

function WhatHappensNext({ step, supportName }: { step: StepDetailResponse; supportName: string }) {
  const items = step.needsApproval
    ? [
        step.kind === "admin" ? "You book the one-on-one." : "You send it in.",
        `${supportName} checks it, usually within 1 business day. You can keep going with the next step meanwhile.`,
        "You get an email: approved, or sent back with a note on what to fix.",
      ]
    : ["You confirm it.", "It's marked done straight away.", "Your checklist moves on to the next step."];
  return (
    <section aria-labelledby="next-title" className="rounded-2xl border border-line bg-white px-6 py-7">
      <h2 id="next-title" className="text-xl font-bold">
        What happens next
      </h2>
      <ol className="mt-4 space-y-4">
        {items.map((item, index) => (
          <li key={item} className="flex gap-3 text-lg leading-relaxed">
            <span aria-hidden="true" className={`mt-2.5 size-2.5 shrink-0 rounded-full ${index === 0 ? "bg-brand" : "bg-[#a9b8cf]"}`} />
            {item}
          </li>
        ))}
      </ol>
    </section>
  );
}

function hasStepLinks(step: StepDetailResponse): boolean {
  return Boolean(step.config.templateLink || step.hasTemplateFile || step.config.links?.length);
}

function StepLinks({ step }: { step: StepDetailResponse }) {
  if (!hasStepLinks(step)) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {step.config.templateLink ? (
        <a href={step.config.templateLink.url} target="_blank" rel="noopener noreferrer" className={buttonClasses("brand-outline", "lg")}>
          <DownloadIcon />
          {step.config.templateLink.label}
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ) : null}
      {step.hasTemplateFile ? <TemplateDownloadButton stepKey={step.key} label={step.config.templateLabel ?? "Download the template"} /> : null}
      {(step.config.links ?? []).map((link) => (
        <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className={buttonClasses("brand-outline", "lg")}>
          {link.label}
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ))}
    </div>
  );
}

export default async function StepPage({ params }: { params: Promise<{ stepKey: string }> }) {
  const { stepKey } = await params;
  const me: MeResponse = await requireMe();
  const { data: step } = await serverGet<StepDetailResponse>(`/v1/me/steps/${encodeURIComponent(stepKey)}`);
  if (!step) notFound();
  const supportName = me.support.name;
  const isContractStep = step.key === CONTRACT_STEP_KEY;
  const contracts = isContractStep ? (await serverGet<MyContractsResponse>("/v1/me/contracts")).data : null;
  const accounts = step.key === EMAIL_STEP_KEY ? (await serverGet<MyAccountsResponse>("/v1/me/accounts")).data : null;
  const instructions = parseInstructionSteps(step.instructionsMd);

  return (
    <>
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-20">
          <Link href="/app" className="inline-flex min-h-11 items-center gap-2 self-start rounded-lg text-lg font-semibold text-brand">
            <ArrowLeftIcon />
            Back to my steps
          </Link>
          <p className="text-base font-semibold text-muted">
            Step {step.position} of {step.totalSteps} · {step.stageTitle}
          </p>
        </div>
      </header>
      <main id="main" className="mx-auto grid max-w-[1280px] gap-6 px-5 pt-8 pb-16 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-7 lg:px-[112px] lg:pt-10">
        <div className="space-y-6">
          <div>
            <h1 className="text-[34px] leading-tight font-extrabold tracking-tight sm:text-[40px]">{step.title}</h1>
            <p className="mt-3 max-w-[44rem] text-xl leading-relaxed text-muted">{step.intro}</p>
          </div>

          <StatusNotice step={step} supportName={supportName} />

          {accounts ? <CorporateEmailCard accounts={accounts} supportName={supportName} /> : null}

          <StepVideos stepKey={step.key} videos={step.videos} />

          <StepPathGuide step={step} supportName={supportName} />

          {step.guidance ? (
            <GuidedContent todoItems={step.guidance.todoItems} callouts={step.guidance.callouts} fullTextMd={step.guidance.fullTextMd}>
              {hasStepLinks(step) ? <StepLinks step={step} /> : null}
            </GuidedContent>
          ) : (
            <section aria-labelledby="how-title" className="rounded-2xl border border-line bg-white px-6 py-7 sm:px-7">
              <h2 id="how-title" className="text-xl font-bold">
                How to do it
              </h2>
              <ol className="mt-5 space-y-4">
                {instructions.map((line, index) => (
                  <li key={line} className="flex gap-4 text-lg leading-relaxed">
                    <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-base font-bold text-brand">
                      {index + 1}
                    </span>
                    <span className="pt-0.5">{line}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-6">
                <StepLinks step={step} />
              </div>
            </section>
          )}

          {step.files.length > 0 && !step.canSubmit && !isContractStep ? (
            <section aria-labelledby="sent-files" className="rounded-2xl border border-line bg-white px-6 py-6">
              <h2 id="sent-files" className="text-lg font-bold">
                What you sent
              </h2>
              <ul className="mt-3 space-y-2">
                {step.files.map((file) => (
                  <li key={file.id} className="flex flex-wrap items-center gap-x-3 text-lg">
                    <span className="font-semibold">{file.fileName}</span>
                    <FileLinkButton fileId={file.id} inline>
                      View<span className="sr-only"> {file.fileName}</span>
                    </FileLinkButton>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {step.kind === "admin" && step.status !== "approved" ? (
            <section className="rounded-2xl border border-line bg-white px-6 py-7">
              <p className="text-lg leading-relaxed">
                {supportName} marks this step done after your one-on-one. Message {supportName} to book a time that suits you.
              </p>
              <div className="mt-5">
                <WhatsAppButton support={me.support} brokerName={me.user.name} step={{ position: step.position, title: step.title }} size="lg" />
              </div>
            </section>
          ) : null}

          {isContractStep && contracts ? <ContractSigning data={contracts} /> : step.canSubmit ? <StepForm step={step} supportName={supportName} /> : null}
        </div>

        <aside className="space-y-6" aria-label="Help with this step">
          {step.videoUrl && step.videos.length === 0 ? (
            <a href={step.videoUrl} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-2xl border border-line bg-white">
              <span className="grid h-[170px] place-items-center bg-navy">
                <span className="grid size-16 place-items-center rounded-full bg-white text-navy">
                  <PlayIcon className="size-6" />
                </span>
              </span>
              <span className="block px-5 py-4 text-lg font-bold">Watch: {step.shortTitle}</span>
            </a>
          ) : null}
          <WhatHappensNext step={step} supportName={supportName} />
          {me.support.whatsappNumber ? (
            <section aria-labelledby="stuck-title" className="rounded-2xl bg-brand-soft px-5 py-6">
              <h2 id="stuck-title" className="text-lg font-bold">
                Stuck? Just ask.
              </h2>
              <p className="mt-1 mb-4 text-base text-muted">{supportName} usually replies the same day.</p>
              <WhatsAppButton support={me.support} brokerName={me.user.name} step={{ position: step.position, title: step.title }} size="sm" fullWidth />
            </section>
          ) : null}
        </aside>
      </main>
    </>
  );
}
