/**
 * File: apps/web/src/app/admin/coaching/[id]/page.tsx
 * Purpose: One broker's coaching page for leadership: score, band, trend and data coverage; the two focus areas with
 * the leads behind them (linking to the GHL contact) and the playbook action; every metric with its own 0-100 points
 * (the score is their weighted average; the target only sets the colour), its target, an 8-week line and sample size
 * (marked "90-day data" when measured over 90 days; speed to follow also shows the first-call score and median time
 * to the next touch; reply time shows how many client messages needed no reply); AI-excused misses
 * with Shelly's confirm / count-as-missed; the suggested 1:1 topic; results context (not scored); Shelly's weekly
 * pulse form; and the 1:1 history.
 *
 * Functions:
 * - BrokerCoachingPage({ params, searchParams }): loads the broker's coaching data for ?week= and renders the page.
 * - sourceLabel(excuse): where an excuse came from, in words ("Client's words", "Call transcript", "Broker note only").
 * - contextRows(context): the results context as labelled values, skipping ones not available yet.
 * - money(value): "$480K" style amounts (Intl compact USD).
 * - followDetail(detail): speed to follow's context line ("First calls 72 (5) · next touch 1.2 h median"), or null.
 * - replyDetail(detail): reply time's context line ("4 messages needed no reply"), or null when none were left out.
 * - metricDetail(metric, detail): the context line shown under a metric's name, or null.
 */
import {
  COACHING_METRIC_LABELS,
  formatCoachingTarget,
  formatCoachingValue,
  formatPoints,
  formatWorkMinutes,
  windowLabel,
  scoreBand,
  type CoachingBrokerResponse,
  type CoachingMetricId,
} from "@bp/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExcuseActions } from "@/components/admin/coaching/excuse-actions";
import { MetricCell } from "@/components/admin/coaching/metric-cell";
import { PulseForm } from "@/components/admin/coaching/pulse-form";
import { Sparkline } from "@/components/admin/coaching/sparkline";
import { WeekPicker } from "@/components/admin/coaching/week-picker";
import { Avatar, Card } from "@/components/ui/misc";
import { Pill } from "@/components/ui/pill";
import { formatDate } from "@/lib/format";
import { serverGet } from "@/lib/server-api";
import { NotConnected, TrendText } from "@/components/admin/coaching/status";

export const metadata: Metadata = { title: "Broker coaching · 365 Yachts admin" };

function sourceLabel(excuse: CoachingBrokerResponse["excuses"][number]): string {
  if (excuse.needsConfirmation) return "Broker note only · needs confirming";
  if (excuse.sourceKind === "transcript") return "Call transcript";
  return "Client's words";
}

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });

function followDetail(detail: Record<string, number | null> | null): string | null {
  if (!detail) return null;
  const parts: string[] = [];
  const firstValue = detail.first_calls_value;
  if (typeof firstValue === "number") parts.push(`First calls ${Math.round(firstValue)} (${detail.first_calls_sample ?? 0})`);
  const minutes = detail.median_work_minutes_to_next_touch;
  if (typeof minutes === "number") parts.push(`next touch ${formatWorkMinutes(minutes)} median`);
  return parts.length ? parts.join(" · ") : null;
}

function replyDetail(detail: Record<string, number | null> | null): string | null {
  const skipped = detail?.no_reply_needed;
  if (typeof skipped !== "number" || skipped <= 0) return null;
  return `${skipped} ${skipped === 1 ? "message" : "messages"} needed no reply`;
}

function metricDetail(metric: CoachingMetricId, detail: Record<string, number | null> | null): string | null {
  if (metric === "speed_to_follow") return followDetail(detail);
  if (metric === "responsiveness") return replyDetail(detail);
  return null;
}

function money(value: number): string {
  return MONEY.format(value);
}

function contextRows(context: Record<string, number | null>): Array<{ label: string; value: string }> {
  const rows: Array<[string, string, (v: number) => string]> = [
    ["deals_closed_week", "Closed this week", String],
    ["deals_closed_28d", "Closed (28 days)", String],
    ["closed_volume_28d", "Closed volume (28 days)", money],
    ["active_pipeline_value", "Active pipeline", money],
    ["listings_active", "Listings", String],
    ["days_since_last_close", "Days since last close", String],
    ["commission", "Commission", money],
    ["self_generated_leads", "Self-generated leads", String],
  ];
  return rows.flatMap(([key, label, fmt]) => {
    const value = context[key];
    return typeof value === "number" ? [{ label, value: fmt(value) }] : [];
  });
}

export default async function BrokerCoachingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { id } = await params;
  const { week } = await searchParams;
  const { status, data } = await serverGet<CoachingBrokerResponse>(`/v1/admin/coaching/brokers/${encodeURIComponent(id)}${week ? `?week=${encodeURIComponent(week)}` : ""}`);
  if (status === 404) notFound();

  return (
    <div className="space-y-6">
      <Link href={`/admin/coaching${week ? `?week=${encodeURIComponent(week)}` : ""}`} className="inline-flex min-h-11 items-center text-base font-semibold text-brand underline-offset-2 hover:underline">
        ← Team overview
      </Link>
      {status === 503 || !data ? (
        <NotConnected />
      ) : (
        <>
          <Card as="section" className="flex flex-col gap-5 px-6 py-6 lg:flex-row lg:items-center">
            <div className="flex items-center gap-4">
              <Avatar name={data.broker.name} size="lg" />
              <div>
                <h1 className="text-[30px] leading-tight font-extrabold tracking-tight">{data.broker.name}</h1>
                <p className="mt-1 text-[17px] capitalize text-muted">
                  {data.broker.level} · {data.broker.status}
                </p>
              </div>
            </div>
            {data.snapshot ? (
              <div className="flex flex-wrap items-end gap-x-8 gap-y-4 lg:ml-auto">
              <dl className="flex flex-wrap items-end gap-x-8 gap-y-4">
                <div>
                  <dt className="text-[15px] text-muted">Score</dt>
                  <dd className="mt-1 flex items-center gap-2">
                    <span className="text-[32px] leading-none font-extrabold tabular-nums">{data.snapshot.score === null ? "—" : Math.round(data.snapshot.score)}</span>
                    <Pill tone={scoreBand(data.snapshot.score, data.snapshot.provisional).tone}>{scoreBand(data.snapshot.score, data.snapshot.provisional).label}</Pill>
                  </dd>
                </div>
                <div>
                  <dt className="text-[15px] text-muted">vs 4-week average</dt>
                  <dd className="mt-1 text-xl">
                    <TrendText trend={data.snapshot.trend} />
                  </dd>
                </div>
                <div>
                  <dt className="text-[15px] text-muted">Data coverage</dt>
                  <dd className="mt-1 text-xl font-bold tabular-nums">{Math.round(data.snapshot.coverage * 100)}%</dd>
                </div>
              </dl>
                <WeekPicker weeks={data.weeks} current={data.week?.weekStart ?? null} />
              </div>
            ) : null}
          </Card>

          {!data.snapshot ? (
            <Card className="px-6 py-5">
              <p className="text-[17px] text-muted">No snapshot for {data.broker.name} in this week. They may not be linked to a GoHighLevel user yet.</p>
            </Card>
          ) : (
            <div className="grid items-start gap-6 min-[1400px]:grid-cols-[minmax(0,1fr)_380px]">
              <div className="flex min-w-0 flex-col gap-6">
                <section aria-labelledby="focus" className="space-y-3">
                  <h2 id="focus" className="text-xl font-bold">
                    Focus areas
                  </h2>
                  {data.focusAreas.length === 0 ? (
                    <Card className="px-6 py-5">
                      <p className="text-[17px] text-muted">No focus areas this week: every metric with enough data is at full points.</p>
                    </Card>
                  ) : (
                    data.focusAreas.map((focus) => (
                      <Card key={focus.metric} className="flex flex-col gap-4 px-6 py-5">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-lg font-bold">{COACHING_METRIC_LABELS[focus.metric]}</h3>
                          <MetricCell metric={focus.metric} value={focus.value} status={focus.status} />
                          <span className="text-[15px] text-muted">
                            {focus.points === null ? null : (
                              <>
                                <strong className="font-bold text-ink tabular-nums">{formatPoints(focus.points)}</strong> points ·{" "}
                              </>
                            )}
                            target {formatCoachingTarget(focus.metric, focus.target)}
                          </span>
                        </div>
                        {focus.evidence.length ? (
                          <ul className="flex flex-col gap-2">
                            {focus.evidence.map((e) => (
                              <li key={`${e.leadId}-${e.at}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-page px-4 py-3">
                                <span className="font-semibold">{formatDate(e.at)}</span>
                                <span className="text-[17px]">{e.note}</span>
                                {e.ghlUrl ? (
                                  <a href={e.ghlUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex min-h-11 items-center text-base font-semibold text-brand underline-offset-2 hover:underline">
                                    Open in GHL<span className="sr-only"> (opens in a new tab)</span>
                                  </a>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {focus.action ? (
                          <p className="text-[15px]">
                            <strong className="font-bold">Playbook:</strong> {focus.action}
                          </p>
                        ) : null}
                      </Card>
                    ))
                  )}
                </section>

                <Card as="section" className="px-6 py-5">
                  <h2 className="text-xl font-bold">All metrics</h2>
                  <p className="mt-1 mb-3 text-[15px] text-muted">Each metric scores 0–100 points on its own; the score is their weighted average. The target only sets the colour.</p>
                  <div className="relative overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse text-left">
                      <thead>
                        <tr className="border-b border-line text-[15px] text-muted">
                          <th scope="col" className="px-3 py-2.5 font-semibold">Metric</th>
                          <th scope="col" className="px-3 py-2.5 text-right font-semibold">Points</th>
                          <th scope="col" className="px-3 py-2.5 font-semibold whitespace-nowrap">This week</th>
                          <th scope="col" className="px-3 py-2.5 font-semibold">Target</th>
                          <th scope="col" className="px-3 py-2.5 font-semibold whitespace-nowrap">Last 8 weeks</th>
                          <th scope="col" className="px-3 py-2.5 font-semibold">Sample</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.metrics.map((m) => (
                          <tr key={m.metric} className="border-b border-line last:border-0">
                            <th scope="row" className="px-3 py-3 font-semibold">
                              {COACHING_METRIC_LABELS[m.metric]}
                              {metricDetail(m.metric, m.detail) ? (
                                <span className="block text-[14px] font-normal text-muted">{metricDetail(m.metric, m.detail)}</span>
                              ) : null}
                            </th>
                            <td className="px-3 py-3 text-right text-[17px] font-bold tabular-nums">{formatPoints(m.points)}</td>
                            <td className="px-3 py-3">
                              <MetricCell metric={m.metric} value={m.value} status={m.status} />
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap tabular-nums text-muted">{formatCoachingTarget(m.metric, m.target)}</td>
                            <td className="px-3 py-3">
                              <Sparkline values={m.history} label={`${COACHING_METRIC_LABELS[m.metric]}, last ${m.history.length} weeks, now ${formatCoachingValue(m.metric, m.value)}`} />
                            </td>
                            <td className="px-3 py-3 tabular-nums text-muted">
                              {m.sample}
                              {windowLabel(m.windowDays) ? <span className="block text-[14px]">{windowLabel(m.windowDays)}</span> : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card as="section" className="flex flex-col gap-4 px-6 py-5">
                  <div>
                    <h2 className="text-xl font-bold">Excused misses</h2>
                    <p className="mt-1 text-[15px] text-muted">Found by the AI excuse check, with the exact words it relied on. Not counted against the broker.</p>
                  </div>
                  {data.excuses.length === 0 ? (
                    <p className="text-[17px] text-muted">No excused misses in the last 28 days.</p>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {data.excuses.map((excuse) => (
                        <li key={excuse.momentKey} className="flex flex-col gap-3 rounded-xl border border-line px-4 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">Due {formatDate(excuse.dueAt)}</span>
                            <Pill tone={excuse.needsConfirmation && !excuse.decision ? "warning" : excuse.decision === "reject" ? "danger" : "success"}>{sourceLabel(excuse)}</Pill>
                            {excuse.ghlUrl ? (
                              <a href={excuse.ghlUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex min-h-11 items-center text-base font-semibold text-brand underline-offset-2 hover:underline">
                                Open in GHL<span className="sr-only"> (opens in a new tab)</span>
                              </a>
                            ) : null}
                          </div>
                          {excuse.quote ? <blockquote className="text-[17px]">“{excuse.quote}”</blockquote> : null}
                          {excuse.reason ? <p className="text-[15px] text-muted">{excuse.reason}</p> : null}
                          {excuse.decidedBy ? (
                            <p className="text-[15px] text-muted">
                              {excuse.decision === "confirm" ? "Confirmed" : "Counted as missed"} by {excuse.decidedBy}
                            </p>
                          ) : null}
                          <ExcuseActions momentKey={excuse.momentKey} decision={excuse.decision} needsConfirmation={excuse.needsConfirmation} />
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>

              <aside className="flex min-w-0 flex-col gap-6">
                <section aria-labelledby="topic" className="rounded-2xl border border-brand/20 bg-brand-soft px-6 py-5">
                  <h2 id="topic" className="text-lg font-bold">
                    Suggested 1:1 topic
                  </h2>
                  <p className="mt-2 text-[17px]">{data.topic ?? "No focus area this week: use the 1:1 to keep momentum."}</p>
                </section>

                <Card as="section" className="px-6 py-5">
                  <h2 className="text-lg font-bold">
                    Results <span className="text-[15px] font-normal text-muted">context, not scored</span>
                  </h2>
                  {contextRows(data.context).length === 0 ? (
                    <p className="mt-3 text-[15px] text-muted">No results figures for this week yet.</p>
                  ) : (
                    <dl className="mt-3 grid grid-cols-2 gap-4">
                      {contextRows(data.context).map((row) => (
                        <div key={row.label}>
                          <dt className="text-[15px] text-muted">{row.label}</dt>
                          <dd className="text-lg font-bold tabular-nums">{row.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </Card>

                {data.week ? (
                  <Card as="section" className="px-6 py-5">
                    <h2 className="mb-4 text-lg font-bold">Shelly&apos;s weekly pulse</h2>
                    <PulseForm
                      key={data.week.weekStart}
                      brokerId={data.broker.brokerId}
                      weekStart={data.week.weekStart}
                      initial={data.pulse ? { engagement: data.pulse.engagement, attitude: data.pulse.attitude, supportNeeded: data.pulse.supportNeeded } : null}
                    />
                  </Card>
                ) : null}

                <Card as="section" className="px-6 py-5">
                  <h2 className="text-lg font-bold">1:1 history</h2>
                  {data.history.length === 0 ? <p className="mt-3 text-[15px] text-muted">No earlier weeks yet.</p> : null}
                  <ol className="mt-3 flex flex-col gap-3">
                    {data.history.map((h) => (
                      <li key={h.weekStart} className="text-[15px]">
                        <strong className="font-bold">{h.isoWeek.replace(/^\d{4}-W/, "Week ")}</strong> · {h.topic ?? "No focus area"}
                        {h.pulse ? (
                          <span className="block text-muted">
                            Pulse {h.pulse.engagement}/5 engagement, {h.pulse.attitude}/5 attitude{h.pulse.supportNeeded ? ` · ${h.pulse.supportNeeded}` : ""}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </Card>
              </aside>
            </div>
          )}
        </>
      )}
    </div>
  );
}
