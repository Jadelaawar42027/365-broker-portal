/**
 * File: apps/web/src/app/admin/page.tsx
 * Purpose: Screen 3a, the admin overview: active and onboarding counts, average days to onboard, the average
 * first-attempt quiz score, submissions waiting for review, every broker who is onboarding with their progress, next step and a
 * "stuck" flag after 4 quiet days, and "Training — who needs a hand" (failed a chapter twice, or 7+ days idle). A banner
 * shows while the company signature for the agreements isn't set up (SPEC D31).
 *
 * Functions:
 * - OverviewPage(): loads the overview numbers and renders the screen.
 * - nextStepText(row): "Next: W-9 (sent, waiting on you)" style wording for an in-progress broker.
 */
import type { CompanySignatureStatus, OverviewResponse, TrainingOverviewResponse } from "@bp/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { InviteBrokerButton } from "@/components/admin/invite-dialog";
import { RemindButton } from "@/components/admin/remind-button";
import { StatCard } from "@/components/admin/stat-card";
import { LinkButton } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/misc";
import { Pill } from "@/components/ui/pill";
import { formatLongDate, relativeTime } from "@/lib/format";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Overview · 365 Yachts admin" };

function nextStepText(row: OverviewResponse["inProgress"][number]): string {
  if (row.stuckDays !== null && row.nextStep) return `Hasn't started: ${row.nextStep.shortTitle}`;
  if (!row.nextStep) return "Everything sent";
  if (row.nextStep.status === "submitted") return `Next: ${row.nextStep.shortTitle} (sent, waiting on you)`;
  return `Next: ${row.nextStep.shortTitle}${row.waitingOnUs ? " · review waiting" : ""}`;
}

export default async function OverviewPage() {
  const [{ data }, { data: training }, { data: signature }] = await Promise.all([
    serverGet<OverviewResponse>("/v1/admin/overview"),
    serverGet<TrainingOverviewResponse>("/v1/admin/training/overview"),
    serverGet<CompanySignatureStatus>("/v1/admin/company-signature"),
  ]);
  if (!data) throw new Error("Could not load the overview.");
  const now = new Date();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[35px] leading-tight font-extrabold tracking-tight">Overview</h1>
          <p className="mt-1 text-[17px] text-muted">{formatLongDate(now)}</p>
        </div>
        <InviteBrokerButton />
      </div>

      {signature && !signature.configured ? (
        <div role="status" className="flex flex-col gap-3 rounded-2xl border border-[#f1d39b] bg-[#fdf3e3] px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[17px] text-[#5b3a10]">
            <strong className="font-bold">The company signature isn&apos;t set up.</strong>{" "}
            {signature.signerEmail
              ? `Until ${signature.signerName ?? "the company signer"} sets it up, every signed Broker Agreement and NDA waits for a manual countersignature.`
              : "Set COMPANY_SIGNER_EMAIL on the API service to the person who signs for 365 Yachts."}
          </p>
          {signature.isSigner ? (
            <Link href="/admin/account" className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-navy px-5 font-bold text-white">
              Set up my signature
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active brokers" value={String(data.counts.active)} detail={`${data.counts.junior} junior · ${data.counts.senior} senior`} />
        <StatCard
          label="Onboarding right now"
          value={String(data.counts.onboarding)}
          detail={data.counts.stuck > 0 ? `${data.counts.stuck} stuck for 4+ days` : "Nobody stuck"}
        />
        <StatCard
          label="Avg. days to onboard"
          value={data.averageDaysToOnboard === null ? "—" : String(data.averageDaysToOnboard)}
          detail="Last 10 brokers"
        />
        <StatCard
          label="Avg. quiz score"
          value={training?.averageFirstAttemptScore == null ? "—" : `${training.averageFirstAttemptScore}%`}
          detail="All brokers, first attempt"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section aria-labelledby="review-title" className="overflow-hidden rounded-2xl border border-line bg-white">
          <div className="flex items-center justify-between border-b border-line px-6 py-5">
            <h2 id="review-title" className="text-xl font-bold">
              Waiting for your review
            </h2>
            {data.reviews.length > 0 ? (
              <Link href="/admin/reviews" className="min-h-11 content-center text-base font-semibold text-brand underline underline-offset-2">
                See all {data.reviews.length}
              </Link>
            ) : null}
          </div>
          {data.reviews.length === 0 ? (
            <p className="px-6 py-8 text-lg text-muted">Nothing waiting. New submissions show up here.</p>
          ) : (
            <ul>
              {data.reviews.slice(0, 5).map((item) => (
                <li key={item.brokerStepId} className="flex items-center justify-between gap-4 border-b border-line px-6 py-4 last:border-b-0">
                  <div className="min-w-0">
                    <p className="text-lg font-bold">{item.stepShortTitle}</p>
                    <p className="text-base text-muted">
                      {item.brokerName}
                      {item.submittedAt ? ` · ${relativeTime(item.submittedAt, now)}` : ""}
                    </p>
                  </div>
                  <LinkButton href={`/admin/reviews/${item.brokerStepId}`} variant="soft" className="shrink-0">
                    Review<span className="sr-only"> {item.stepShortTitle} from {item.brokerName}</span>
                  </LinkButton>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="progress-title" className="overflow-hidden rounded-2xl border border-line bg-white">
          <div className="border-b border-line px-6 py-5">
            <h2 id="progress-title" className="text-xl font-bold">
              Onboarding in progress
            </h2>
          </div>
          {data.inProgress.length === 0 ? (
            <p className="px-6 py-8 text-lg text-muted">Nobody is onboarding right now. Invite a broker to get started.</p>
          ) : (
            <ul>
              {data.inProgress.map((row) => {
                const stuck = row.stuckDays !== null;
                return (
                  <li key={row.brokerId} className={`border-b border-line px-6 py-4 last:border-b-0 ${stuck ? "bg-[#fff8ea]" : ""}`}>
                    <div className="flex items-center justify-between gap-3">
                      <Link href={`/admin/brokers/${row.brokerId}`} className="text-lg font-bold hover:underline">
                        {row.name}
                      </Link>
                      {stuck ? (
                        <Pill tone="warning">Stuck {row.stuckDays} days</Pill>
                      ) : (
                        <span className="text-base font-semibold text-muted tabular-nums">
                          {row.approved} / {row.total} approved
                        </span>
                      )}
                    </div>
                    <ProgressBar value={row.approved} max={row.total} tone={stuck ? "warn" : "brand"} label={`${row.name}: ${row.approved} of ${row.total} approved`} className="mt-3" />
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className={`text-base ${stuck ? "text-warn" : "text-muted"}`}>{nextStepText(row)}</p>
                      {stuck ? <RemindButton brokerId={row.brokerId} /> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="training-help-title" className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="border-b border-line px-6 py-5">
          <h2 id="training-help-title" className="text-xl font-bold">
            Training — who needs a hand
          </h2>
        </div>
        {!training || training.needsHelp.length === 0 ? (
          <p className="px-6 py-8 text-lg text-muted">Nobody is stuck in training right now.</p>
        ) : (
          <ul>
            {training.needsHelp.map((row) => (
              <li key={`${row.brokerId}-${row.kind}`} className="flex flex-col gap-1 border-b border-line px-6 py-4 last:border-b-0 md:flex-row md:items-center md:justify-between md:gap-6">
                <p className="text-lg font-bold">{row.name}</p>
                <p className="flex-1 text-base text-muted md:text-right">{row.reason}</p>
                <Link href={`/admin/brokers/${row.brokerId}`} className="inline-flex min-h-11 shrink-0 items-center self-start rounded-lg text-base font-semibold text-brand underline underline-offset-2 md:self-center">
                  See progress<span className="sr-only"> for {row.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
