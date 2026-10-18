/**
 * File: apps/web/src/app/admin/brokers/page.tsx
 * Purpose: Screen 3b, every broker in one table: level, status, joined and onboarded dates, time with us, both commission splits (SPEC D29) and onboarding
 * progress, training progress and average best quiz score (from the broker_training_metrics view), the CRM phone and
 * small Google / GHL account status marks (phase H2), with search
 * (including persona text), status and level filters, CSV export and the invite button.
 *
 * Functions:
 * - BrokersPage({ searchParams }): loads the filtered list and renders the table.
 * - statusTone(status): the pill colour for a broker status.
 * - capitalise(word): "active" → "Active", for levels and statuses.
 * - trainingLabel(training): "3 of 7 chapters", "All 7 chapters", or "—" before training has started.
 */
import { formatTenure, todayInTimeZone, type BrokerListResponse, type BrokerStatus } from "@bp/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { AccountStatusMarks } from "@/components/admin/account-status";
import { BrokerFilters, ExportCsvButton } from "@/components/admin/broker-filters";
import { InviteBrokerButton } from "@/components/admin/invite-dialog";
import { Avatar, ProgressBar } from "@/components/ui/misc";
import { Pill, type PillTone } from "@/components/ui/pill";
import { formatDate, formatPhone } from "@/lib/format";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Brokers · 365 Yachts admin" };

function statusTone(status: BrokerStatus): PillTone {
  if (status === "active") return "success";
  if (status === "inactive") return "neutral";
  return "brand-soft";
}

function trainingLabel(training: BrokerListResponse["brokers"][number]["training"]): string {
  if (!training || training.chaptersTotal === 0) return "—";
  if (training.chaptersPassed >= training.chaptersTotal) return `All ${training.chaptersTotal} chapters`;
  return `${training.chaptersPassed} of ${training.chaptersTotal} chapters`;
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export default async function BrokersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const search = params.search?.trim() ?? "";
  const status = ["invited", "onboarding", "active", "inactive"].includes(params.status ?? "") ? params.status! : "";
  const level = ["junior", "senior"].includes(params.level ?? "") ? params.level! : "";
  const query = new URLSearchParams({ ...(search ? { search } : {}), ...(status ? { status } : {}), ...(level ? { level } : {}) });
  const { data } = await serverGet<BrokerListResponse>(`/v1/admin/brokers?${query.toString()}`);
  if (!data) throw new Error("Could not load brokers.");
  const today = todayInTimeZone();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[35px] leading-tight font-extrabold tracking-tight">Brokers</h1>
          <p className="mt-1 text-[17px] text-muted">
            {data.counts.total} people · {data.counts.active} active · {data.counts.onboarding} onboarding
            {data.counts.invited ? ` · ${data.counts.invited} invited` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <ExportCsvButton rows={data.brokers} />
          <InviteBrokerButton />
        </div>
      </div>

      <BrokerFilters search={search} status={status} level={level} />

      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[1080px] border-collapse text-left">
          <caption className="sr-only">Brokers</caption>
          <thead className="bg-[#f2f5fa] text-[15px] font-semibold text-muted">
            <tr>
              <th scope="col" className="px-4 py-4">Broker</th>
              <th scope="col" className="px-3 py-4">Level</th>
              <th scope="col" className="px-3 py-4">Status</th>
              <th scope="col" className="px-3 py-4">Joined</th>
              <th scope="col" className="px-3 py-4">Onboarded</th>
              <th scope="col" className="px-3 py-4">Time with us</th>
              <th scope="col" className="px-3 py-4" title="Broker's share on in-house leads">In-house</th>
              <th scope="col" className="px-3 py-4" title="Broker's share on self-generated deals">Self-gen.</th>
              <th scope="col" className="px-3 py-4">Onboarding</th>
              <th scope="col" className="px-3 py-4">Training</th>
              <th scope="col" className="px-3 py-4">Avg. quiz</th>
              <th scope="col" className="px-3 py-4">CRM phone</th>
              <th scope="col" className="px-3 py-4">Accounts</th>
            </tr>
          </thead>
          <tbody className="text-base">
            {data.brokers.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-4 py-10 text-center text-lg text-muted">
                  No brokers match. Try another search or filter.
                </td>
              </tr>
            ) : (
              data.brokers.map((row) => {
                const done = row.stepsApproved === row.stepsTotal && row.stepsTotal > 0;
                const trainingStarted = row.status === "active" || row.status === "inactive";
                return (
                  <tr key={row.brokerId} className="border-t border-line hover:bg-page">
                    <td className="px-4 py-3">
                      <Link href={`/admin/brokers/${row.brokerId}`} className="flex min-h-11 items-center gap-3 font-bold text-ink hover:underline">
                        <Avatar name={row.name} tone="soft" size="sm" />
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3">{capitalise(row.level)}</td>
                    <td className="px-3 py-3">
                      <Pill tone={statusTone(row.status)}>{capitalise(row.status)}</Pill>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-muted">{formatDate(row.joinedAt)}</td>
                    <td className="px-3 py-3 tabular-nums text-muted">{row.onboardedAt ? formatDate(row.onboardedAt) : "—"}</td>
                    <td className="px-3 py-3">{formatTenure(row.joinedAt, row.leftAt ?? today, Boolean(row.leftAt))}</td>
                    <td className="px-3 py-3 tabular-nums">{row.inHouseSplit === null ? <span className="text-muted">—</span> : `${row.inHouseSplit}%`}</td>
                    <td className="px-3 py-3 tabular-nums">{row.selfGeneratedSplit === null ? <span className="text-muted">—</span> : `${row.selfGeneratedSplit}%`}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <ProgressBar value={row.stepsApproved} max={row.stepsTotal} tone={done ? "success" : "brand"} label={`${row.name}: ${row.stepsApproved} of ${row.stepsTotal} steps approved`} className="w-20" />
                        <span className="whitespace-nowrap font-semibold tabular-nums">
                          {row.stepsApproved} / {row.stepsTotal}
                        </span>
                      </div>
                    </td>
                    <td className={`px-3 py-3 ${trainingStarted ? "" : "text-muted"}`}>{trainingStarted ? trainingLabel(row.training) : "—"}</td>
                    <td className="px-3 py-3 font-bold tabular-nums">{trainingStarted && row.training?.avgBestScore != null ? `${row.training.avgBestScore}%` : <span className="font-normal text-muted">—</span>}</td>
                    <td className="px-3 py-3 whitespace-nowrap tabular-nums">{row.crmPhone ? formatPhone(row.crmPhone) : <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-3">
                      <AccountStatusMarks accounts={row.accounts} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
