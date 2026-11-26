/**
 * File: apps/web/src/app/admin/coaching/targets/page.tsx
 * Purpose: Leadership edits the fixed coaching targets: one target per metric, grouped into behaviour and results, each
 * saved on its own, and the change log of who changed what and when (newest first). A target sets only a metric's
 * colour (green at target, amber within 20%, red beyond) and so what's slipping and the 1:1 topic; scores never use it.
 * Changes show on the board from the next Monday snapshot; past weeks keep the targets they had.
 *
 * Functions:
 * - CoachingTargetsPage(): loads the targets and change log and renders the form and the log.
 * - TargetGroup({ title, targets }): one group's rows.
 */
import {
  COACHING_METRIC_LABELS,
  coachingMetricGroup,
  formatCoachingTarget,
  type CoachingTarget,
  type CoachingTargetsResponse,
} from "@bp/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { NotConnected } from "@/components/admin/coaching/status";
import { TargetEditor } from "@/components/admin/coaching/target-editor";
import { Card } from "@/components/ui/misc";
import { formatDate, formatTime } from "@/lib/format";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Coaching targets · 365 Yachts admin" };

function TargetGroup({ title, targets }: { title: string; targets: CoachingTarget[] }) {
  return (
    <Card as="section" className="px-5 py-4">
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="mt-1">
        {targets.map((t) => (
          <TargetEditor key={t.metric} metric={t.metric} target={t.target} updatedByName={t.updatedByName} updatedAt={t.updatedAt} />
        ))}
      </div>
    </Card>
  );
}

export default async function CoachingTargetsPage() {
  const { status, data } = await serverGet<CoachingTargetsResponse>("/v1/admin/coaching/targets");

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/admin/coaching" className="inline-flex min-h-11 items-center text-base font-semibold text-brand underline-offset-2 hover:underline">
        ← Team overview
      </Link>
      <div>
        <h1 className="text-[35px] leading-tight font-extrabold tracking-tight">Coaching targets</h1>
        <p className="mt-2 text-[17px] text-muted">
          A target sets a metric&apos;s colour: green at or past it, amber within 20%, red beyond. That decides what&apos;s slipping and the
          1:1 topic. Scores don&apos;t use targets. A change shows from the next Monday snapshot; past weeks keep the targets they had.
        </p>
      </div>

      {status === 503 || !data ? (
        <NotConnected />
      ) : (
        <>
          <TargetGroup title="Behaviour" targets={data.targets.filter((t) => coachingMetricGroup(t.metric) === "behaviour")} />
          <TargetGroup title="Results" targets={data.targets.filter((t) => coachingMetricGroup(t.metric) === "results")} />

          <Card as="section" className="px-5 py-4">
            <h2 id="target-log" className="text-xl font-bold">
              Change log
            </h2>
            {data.changes.length === 0 ? (
              <p className="mt-2 text-[17px] text-muted">No changes yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {data.changes.map((c) => (
                  <li key={`${c.metric}-${c.changedAt}`} className="py-3 text-[17px]">
                    <span className="font-semibold">{c.changedByName}</span>{" "}
                    {c.oldTarget === null ? "set" : "changed"} {COACHING_METRIC_LABELS[c.metric]}{" "}
                    {c.oldTarget === null ? null : (
                      <>
                        from <span className="tabular-nums">{formatCoachingTarget(c.metric, c.oldTarget)}</span>{" "}
                      </>
                    )}
                    to <span className="tabular-nums">{formatCoachingTarget(c.metric, c.newTarget)}</span>
                    <span className="block text-[15px] text-muted">
                      {formatDate(c.changedAt)} at {formatTime(c.changedAt)} ET
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
