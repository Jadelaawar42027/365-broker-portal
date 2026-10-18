/**
 * File: apps/web/src/app/admin/brokers/[id]/page.tsx
 * Purpose: Screen 3c, one broker's profile: header with contact details, level and status, the key dates and numbers,
 * the two commission splits with their history and a "Change commission" form (SPEC D29), the agreements panel
 * (status, every version, countersign, void and re-issue, signed-outside uploads, SPEC D31),
 * the onboarding record with per-step actions (review, upload on behalf, mark done), every file with its version and
 * uploader, the Accounts panel (365 email, Google Workspace and GoHighLevel status, CRM phone, phase H2), the Persona
 * panel (docs/SPEC.md) and, under it, the Training & quizzes panel with the average quiz score. The owner also sees
 * "Delete this broker" at the bottom, which removes the broker and everything about them for good.
 *
 * Functions:
 * - BrokerProfilePage({ params, searchParams }): loads the profile and renders the page.
 * - StatTile({ label, value }): one of the grey number tiles under the header.
 * - stepDateText(step): "Approved Aug 18" / "Sent Oct 15" / "Sent back Oct 16" / "Not started" for a record row.
 */
import {
  formatFileSize,
  formatTenure,
  todayInTimeZone,
  type AdminContractsResponse,
  type AdminStepRow,
  type BrokerAccountsResponse,
  type BrokerProfileResponse,
  type BrokerTrainingResponse,
  type CompanySignatureStatus,
} from "@bp/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountsPanel } from "@/components/admin/accounts-panel";
import { AccountActions, BrokerControls } from "@/components/admin/broker-controls";
import { CommissionEditor } from "@/components/admin/commission-editor";
import { DeleteBrokerSection } from "@/components/admin/delete-broker";
import { ContractsPanel } from "@/components/admin/contracts-panel";
import { PersonaPanel } from "@/components/admin/persona-panel";
import { StepActions } from "@/components/admin/step-actions";
import { TrainingPanel } from "@/components/admin/training-panel";
import { FormMessage } from "@/components/auth/form-message";
import { StepIcon } from "@/components/broker/step-icon";
import { FileLinkButton } from "@/components/ui/file-link";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { Avatar } from "@/components/ui/misc";
import { Pill } from "@/components/ui/pill";
import { formatDate, formatPhone, formatShortDate } from "@/lib/format";
import { requireMe, serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Broker profile · 365 Yachts admin" };

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-page px-4 py-4">
      <p className="text-[15px] font-semibold text-muted">{label}</p>
      <p className="mt-1 text-[22px] font-bold tabular-nums">{value}</p>
    </div>
  );
}

function stepDateText(step: AdminStepRow): string {
  if (step.status === "approved") {
    const at = step.reviewedAt ?? step.submittedAt;
    return at ? `${step.label} ${formatShortDate(at)}` : step.label;
  }
  if (step.status === "changes_requested" && step.reviewedAt) return `Sent back ${formatShortDate(step.reviewedAt)}`;
  if (step.status === "submitted" && step.submittedAt) return `Sent ${formatShortDate(step.submittedAt)}`;
  return "Not started";
}

export default async function BrokerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ invited?: string }>;
}) {
  const { id } = await params;
  const { invited } = await searchParams;
  const [{ data }, { data: training }, { data: contracts }, { data: signature }, { data: accounts }] = await Promise.all([
    serverGet<BrokerProfileResponse>(`/v1/admin/brokers/${encodeURIComponent(id)}`),
    serverGet<BrokerTrainingResponse>(`/v1/admin/training/brokers/${encodeURIComponent(id)}`),
    serverGet<AdminContractsResponse>(`/v1/admin/brokers/${encodeURIComponent(id)}/contracts`),
    serverGet<CompanySignatureStatus>("/v1/admin/company-signature"),
    serverGet<BrokerAccountsResponse>(`/v1/admin/brokers/${encodeURIComponent(id)}/accounts`),
  ]);
  if (!data) notFound();
  const me = await requireMe();
  const { broker, metrics, steps } = data;
  const today = todayInTimeZone();
  const files = steps.flatMap((step) => step.files.map((file) => ({ ...file, step })));

  return (
    <div className="space-y-6">
      <Link href="/admin/brokers" className="inline-flex min-h-11 items-center gap-2 rounded-lg text-lg font-semibold text-brand">
        <ArrowLeftIcon />
        All brokers
      </Link>

      {invited && broker.email ? <FormMessage tone="success">Invite sent to {broker.email}. The link works for 7 days.</FormMessage> : null}

      <section aria-labelledby="broker-name" className="rounded-2xl border border-line bg-white px-6 py-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-center gap-5">
            <Avatar name={broker.name} tone="soft" size="lg" />
            <div>
              <h1 id="broker-name" className="text-[30px] leading-tight font-extrabold tracking-tight">
                {broker.name}
              </h1>
              <p className="mt-1 text-[17px] text-muted">
                {broker.email ?? "No email yet"}
                {broker.phone ? ` · ${formatPhone(broker.phone)}` : ""}
              </p>
            </div>
          </div>
          <BrokerControls broker={broker} today={today} hasAccounts={Boolean(accounts?.systems.some((view) => view.accountId))} />
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <StatTile label="Joined" value={formatDate(broker.joinedAt)} />
          <StatTile label="Onboarded" value={broker.onboardedAt ? formatDate(broker.onboardedAt) : "—"} />
          <StatTile label="Time with us" value={formatTenure(broker.joinedAt, broker.leftAt ?? today, Boolean(broker.leftAt))} />
          <StatTile label="Days to onboard" value={metrics.daysToOnboard === null ? "—" : String(metrics.daysToOnboard)} />
          <StatTile label="Avg. quiz score" value={training?.summary.avgBestScore == null ? "—" : `${training.summary.avgBestScore}%`} />
        </div>
        <div className="mt-3">
          <CommissionEditor
            brokerId={broker.id}
            today={today}
            inHouseSplit={broker.inHouseSplit}
            selfGeneratedSplit={broker.selfGeneratedSplit}
            history={data.commissionHistory}
            agreementsSigned={Boolean(contracts?.fullySigned)}
          />
        </div>
        <div className="mt-5">
          <AccountActions broker={broker} />
        </div>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <section aria-labelledby="record-title" className="overflow-hidden rounded-2xl border border-line bg-white">
            <div className="flex items-center justify-between border-b border-line px-6 py-5">
              <h2 id="record-title" className="text-xl font-bold">
                Onboarding record
              </h2>
              <Pill tone={metrics.stepsApproved === metrics.stepsTotal ? "success" : "neutral"} className="tabular-nums">
                {metrics.stepsApproved} / {metrics.stepsTotal} complete
              </Pill>
            </div>
            <ul>
              {steps.map((step) => {
                const latest = step.files[0];
                return (
                  <li key={step.brokerStepId} className="border-b border-line px-5 py-3 last:border-b-0">
                    <div className="flex items-center gap-3.5">
                      <StepIcon status={step.status} position={step.position} isNext={false} />
                      <p className="min-w-0 flex-1 text-[17px] font-semibold">{step.shortTitle}</p>
                      <span className={`shrink-0 text-right text-[15px] ${step.status === "changes_requested" ? "text-danger" : "text-muted"}`}>
                        {stepDateText(step)}
                      </span>
                      {latest ? (
                        <FileLinkButton fileId={latest.id} inline className="min-h-11 shrink-0 rounded-lg px-1.5 text-[15px] font-semibold text-brand underline underline-offset-2 hover:bg-brand-soft">
                          View file<span className="sr-only"> for {step.shortTitle}</span>
                        </FileLinkButton>
                      ) : null}
                    </div>
                    {step.status === "changes_requested" && step.reviewNote ? (
                      <p className="mt-1 pl-[58px] text-[15px] text-danger">“{step.reviewNote}”</p>
                    ) : null}
                    {step.status !== "approved" || (step.kind === "upload" && step.files.length === 0) ? (
                      <div className="mt-1 pl-[50px]">
                        <StepActions brokerId={broker.id} step={step} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="files-title" className="overflow-hidden rounded-2xl border border-line bg-white">
            <div className="border-b border-line px-6 py-5">
              <h2 id="files-title" className="text-xl font-bold">
                Files
              </h2>
            </div>
            {files.length === 0 ? (
              <p className="px-6 py-6 text-lg text-muted">No files yet. Uploads from the broker, or from you on their behalf, appear here.</p>
            ) : (
              <ul>
                {files.map((file) => (
                  <li key={file.id} className="flex flex-col gap-1 border-b border-line px-6 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-[17px] font-semibold">{file.fileName}</p>
                      <p className="text-[15px] text-muted">
                        {file.step.shortTitle} · version {file.version} · {formatFileSize(file.sizeBytes)} · {formatDate(file.uploadedAt)} ·{" "}
                        {file.uploadedByName ? `uploaded by ${file.uploadedByName}${file.uploadedByAdmin ? " (admin)" : ""}` : "uploader unknown"}
                      </p>
                    </div>
                    <FileLinkButton fileId={file.id} className="min-h-11 shrink-0 self-start rounded-lg px-2.5 text-[15px] font-semibold text-brand underline underline-offset-2 hover:bg-brand-soft sm:self-center">
                      Download<span className="sr-only"> {file.fileName}</span>
                    </FileLinkButton>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {contracts ? <ContractsPanel brokerId={broker.id} data={contracts} signature={signature ?? null} /> : null}
        </div>

        <div className="space-y-5">
          {accounts ? <AccountsPanel brokerId={broker.id} data={accounts} crmPhone={broker.crmPhone} inactive={broker.status === "inactive"} /> : null}
          <PersonaPanel brokerId={broker.id} brokerName={broker.name} persona={data.persona} />
          {training ? <TrainingPanel brokerId={broker.id} training={training} /> : null}
        </div>
      </div>
      {me.user.role === "owner" ? (
        <DeleteBrokerSection brokerId={broker.id} brokerName={broker.name} hasExternalAccounts={Boolean(accounts?.systems.some((view) => view.accountId))} />
      ) : null}
    </div>
  );
}
