/**
 * File: apps/web/src/app/admin/coaching/page.tsx
 * Purpose: The Coaching team overview for leadership (with a link to edit the targets): team totals, who needs a 1:1 this week (full scores only, highest
 * first, as collapsed bars that open to plain-language details), and every broker's row (score, trend, data coverage, the twelve metric cells grouped into behaviour
 * and results against their targets, placeholder targets marked, with "90-day data" or "12-month data" under a cell
 * measured over a longer window, focus areas under the name; the name column stays put
 * while the table scrolls on a phone), full scores highest first, then provisional ("prov."), then no score A-Z ("—"),
 * with the colour legend. Numbers come from the coach
 * service's frozen Monday snapshot for the chosen week.
 *
 * Functions:
 * - CoachingOverviewPage({ searchParams }): loads the overview for ?week= (default the newest) and renders the screen.
 * - pct(value): a 0-1 share as "82%", or "—".
 */
import {
  COACHING_METRIC_LABELS,
  COACHING_METRICS,
  coachingMetricGroup,
  formatCoachingTarget,
  formatWorkMinutes,
  scoreBand,
  windowLabel,
  type CoachingOverviewResponse,
} from "@bp/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { CoachingLegend, MetricCell } from "@/components/admin/coaching/metric-cell";
import { OneOnOneList } from "@/components/admin/coaching/one-on-one-list";
import { NotConnected, TrendText } from "@/components/admin/coaching/status";
import { WeekPicker } from "@/components/admin/coaching/week-picker";
import { StatCard } from "@/components/admin/stat-card";
import { Card } from "@/components/ui/misc";
import { Pill } from "@/components/ui/pill";
import { serverGet } from "@/lib/server-api";

const BEHAVIOUR_COUNT = COACHING_METRICS.filter((metric) => coachingMetricGroup(metric) === "behaviour").length;
const FIRST_RESULT = COACHING_METRICS.find((metric) => coachingMetricGroup(metric) === "results");

export const metadata: Metadata = { title: "Coaching · 365 Yachts admin" };

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export default async function CoachingOverviewPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  const { status, data } = await serverGet<CoachingOverviewResponse>(`/v1/admin/coaching/overview${week ? `?week=${encodeURIComponent(week)}` : ""}`);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[35px] leading-tight font-extrabold tracking-tight">Coaching</h1>
          <p className="mt-1 text-[17px] text-muted">What each broker controls, against target · last 28 days · highest score first</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Link href="/admin/coaching/targets" className="inline-flex min-h-11 items-center text-base font-semibold text-brand underline-offset-2 hover:underline">
            Edit targets
          </Link>
          {data ? <WeekPicker weeks={data.weeks} current={data.week?.weekStart ?? null} /> : null}
        </div>
      </div>

      {status === 503 || !data ? (
        <NotConnected />
      ) : !data.week ? (
        <Card className="px-6 py-6">
          <p className="text-[17px] text-muted">No weekly snapshot yet. The first one is frozen on Monday at 06:00 ET.</p>
        </Card>
      ) : (
        <>
          <section aria-label="Team totals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Team score" value={data.totals.teamScore === null ? "—" : String(data.totals.teamScore)} detail="Average of non-provisional scores" />
            <StatCard label="Deadlines met on time" value={pct(data.totals.onTimeRate)} detail="New leads, after consultations and no-shows, agreed dates" />
            <StatCard label="Median follow-up" value={formatWorkMinutes(data.totals.medianFollowMinutes)} detail="Working time from a call's end to the next touch" />
            <StatCard label="Calls reviewed" value={data.totals.callsReviewed === null ? "—" : String(data.totals.callsReviewed)} detail="Calls in the last 28 days with a scored review" />
            <StatCard label="Excuses to confirm" value={String(data.totals.excusesToConfirm)} detail="Found only in a broker note" />
          </section>

          <section aria-labelledby="needs-1on1" className="space-y-3">
            <h2 id="needs-1on1" className="text-xl font-bold">
              Needs a 1:1 this week
            </h2>
            {data.needsOneOnOne.length === 0 ? (
              <Card className="px-6 py-5">
                <p className="text-[17px] text-muted">Nobody is off target or dropping this week.</p>
              </Card>
            ) : (
              <OneOnOneList items={data.needsOneOnOne} week={week ?? data.week?.weekStart ?? null} />
            )}
          </section>

          <Card as="section" className="space-y-4 px-5 py-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <h2 className="text-xl font-bold">All brokers</h2>
              <CoachingLegend />
            </div>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[1460px] border-collapse text-left">
                <thead>
                  <tr className="text-[14px] font-bold tracking-wide text-muted uppercase">
                    <td colSpan={4} className="sticky left-0 z-10 bg-white" />
                    <th scope="colgroup" colSpan={BEHAVIOUR_COUNT} className="border-b border-line px-1.5 pt-2 pb-1">
                      Behaviour
                    </th>
                    <th scope="colgroup" colSpan={COACHING_METRICS.length - BEHAVIOUR_COUNT} className="border-b border-l border-line px-1.5 pt-2 pb-1">
                      Results
                    </th>
                  </tr>
                  <tr className="border-b border-line text-[15px] text-muted">
                    <th scope="col" className="sticky left-0 z-10 bg-white px-3 py-2.5 font-semibold">Broker</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Score</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold whitespace-nowrap">vs 4-week avg</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Data</th>
                    {COACHING_METRICS.map((metric) => {
                      const target = data.brokers[0]?.metrics[metric]?.target ?? null;
                      const placeholder = target !== null && data.brokers[0]?.metrics[metric]?.targetPlaceholder === true;
                      return (
                        <th key={metric} scope="col" className={`px-1.5 py-2.5 align-bottom font-semibold ${metric === FIRST_RESULT ? "border-l border-line" : ""}`}>
                          {COACHING_METRIC_LABELS[metric]}
                          <span className="block font-normal tabular-nums">{formatCoachingTarget(metric, target)}</span>
                          {placeholder ? <span className="block text-[13px] font-normal">placeholder</span> : null}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {data.brokers.map((row) => {
                    const band = scoreBand(row.score, row.provisional);
                    return (
                      <tr key={row.brokerId} className="border-b border-line last:border-0">
                        <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-3 text-left font-normal">
                          <Link href={`/admin/coaching/${row.brokerId}${week ? `?week=${encodeURIComponent(week)}` : ""}`} className="font-bold whitespace-nowrap text-brand underline-offset-2 hover:underline">
                            {row.name}
                          </Link>
                          <span className="block max-w-56 text-[14px] text-muted">
                            <span className="capitalize">{row.level}</span>
                            {row.focus.length ? ` · Focus: ${row.focus.map((m) => COACHING_METRIC_LABELS[m].toLowerCase()).join(", ")}` : ""}
                          </span>
                        </th>
                        <td className="px-3 py-3">
                          <Pill tone={band.tone}>{row.score === null ? "—" : `${Math.round(row.score)}${row.provisional ? " prov." : ""}`}</Pill>
                        </td>
                        <td className="px-3 py-3">
                          <TrendText trend={row.trend} />
                        </td>
                        <td className="px-3 py-3 tabular-nums text-muted">{pct(row.coverage)}</td>
                        {COACHING_METRICS.map((metric) => {
                          const longer = windowLabel(row.metrics[metric]?.windowDays ?? null);
                          return (
                            <td key={metric} className={`px-1.5 py-3 text-center ${metric === FIRST_RESULT ? "border-l border-line" : ""}`}>
                              <MetricCell metric={metric} value={row.metrics[metric]?.value ?? null} status={row.metrics[metric]?.status ?? "unknown"} />
                              {longer ? <span className="mt-1 block text-[13px] leading-tight text-muted">{longer}</span> : null}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
