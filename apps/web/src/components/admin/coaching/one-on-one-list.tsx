/**
 * File: apps/web/src/components/admin/coaching/one-on-one-list.tsx
 * Purpose: "Needs a 1:1 this week" as collapsed bars, one per broker (name, score with its status and the trend). A bar
 * opens that broker's details below it: last week's focus, what's slipping with example leads, results and this week's
 * focus (with who set it when an admin chose the topic, and a form to set or remove one). Several can be open at once;
 * "Expand all" opens every bar. Each bar is a button with aria-expanded; the trend is against the 4-week average.
 *
 * Functions:
 * - OneOnOneList({ items, week }): the bars, the Expand all / Collapse all toggle and the open details.
 * - OneOnOneBar({ item, open, onToggle }): one broker's bar.
 * - OneOnOneDetails({ item, week }): the expanded details for one broker.
 * - SlippingList({ slipping, brokerId }): the first three slipping lines, with "+N more" to show the rest.
 * - SlippingLine({ line }): one slipping sentence and its example leads.
 */
"use client";

import { scoreBand, splitShown, type CoachingOverviewResponse } from "@bp/shared";
import Link from "next/link";
import { useState } from "react";
import { Pill } from "@/components/ui/pill";
import { TrendText } from "./status";
import { TopicForm } from "./topic-form";

type Item = CoachingOverviewResponse["needsOneOnOne"][number];
type Line = Item["details"]["slipping"][number];

export function OneOnOneList({ items, week }: { items: Item[]; week: string | null }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const allOpen = items.length > 0 && items.every((i) => open.has(i.brokerId));
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[15px] text-muted">Trend is the change vs 4-week avg.</p>
        <button
          type="button"
          onClick={() => setOpen(allOpen ? new Set() : new Set(items.map((i) => i.brokerId)))}
          className="inline-flex min-h-11 items-center rounded-lg px-3 text-base font-semibold text-brand underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.brokerId} className="overflow-hidden rounded-2xl border border-line bg-white">
            <OneOnOneBar item={item} open={open.has(item.brokerId)} onToggle={() => toggle(item.brokerId)} />
            {open.has(item.brokerId) ? <OneOnOneDetails item={item} week={week} /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function OneOnOneBar({ item, open, onToggle }: { item: Item; open: boolean; onToggle: () => void }) {
  const band = scoreBand(item.score, item.provisional);
  return (
    <h3>
      <button
        type="button"
        id={`one-on-one-${item.brokerId}`}
        aria-expanded={open}
        aria-controls={`one-on-one-panel-${item.brokerId}`}
        onClick={onToggle}
        className="flex min-h-14 w-full flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-left hover:bg-page focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none focus-visible:ring-inset"
      >
        <span className="min-w-0 basis-full truncate text-lg font-bold sm:flex-1 sm:basis-auto">{item.name}</span>
        <span className="flex flex-1 items-center gap-4 sm:flex-none">
          <Pill tone={band.tone}>{item.score === null ? band.label : `${Math.round(item.score)} · ${band.label}`}</Pill>
          <span className="w-14 text-right" title="vs 4-week avg">
            <TrendText trend={item.trend} />
          </span>
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className={`ml-auto size-5 shrink-0 text-muted transition-transform duration-150 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          >
            <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
    </h3>
  );
}

function OneOnOneDetails({ item, week }: { item: Item; week: string | null }) {
  const d = item.details;
  return (
    <div
      id={`one-on-one-panel-${item.brokerId}`}
      role="region"
      aria-labelledby={`one-on-one-${item.brokerId}`}
      className="flex flex-col gap-5 border-t border-line px-5 py-5"
    >
      <section>
        <h4 className="text-[15px] font-bold tracking-wide text-muted uppercase">Last week&apos;s focus</h4>
        {d.lastWeek ? (
          <>
            <p className="mt-1 text-[17px]">{d.lastWeek.text}</p>
            {d.lastWeek.stuck ? (
              <p className="mt-2">
                <Pill tone="warning">Same focus for 3 weeks, no change</Pill>
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-1 text-[17px] text-muted">No behaviour focus was set last week.</p>
        )}
      </section>

      <section>
        <h4 className="text-[15px] font-bold tracking-wide text-muted uppercase">What&apos;s slipping</h4>
        {d.slipping.length ? (
          <SlippingList slipping={d.slipping} brokerId={item.brokerId} />
        ) : (
          <p className="mt-1 text-[17px] text-muted">Nothing in day-to-day work is below target.</p>
        )}
      </section>

      <section>
        <h4 className="text-[15px] font-bold tracking-wide text-muted uppercase">Results</h4>
        <p className="mt-1 text-[17px]">{d.results}</p>
      </section>

      <section className="rounded-xl border border-brand/20 bg-brand-soft px-4 py-4">
        <h4 className="text-[15px] font-bold tracking-wide text-muted uppercase">This week&apos;s focus</h4>
        {d.focus ? (
          <>
            <p className="mt-1 text-lg font-bold">{d.focus.topic}</p>
            {d.focus.source === "override" ? (
              <div className="mt-2 flex flex-col gap-1">
                <p>
                  <Pill tone="neutral">Set by {d.focus.setBy}</Pill>
                </p>
                {d.focus.note ? <p className="text-[17px]">{d.focus.note}</p> : null}
                {d.focus.automaticTopic ? <p className="text-[15px] text-muted">Automatic topic: {d.focus.automaticTopic}</p> : null}
              </div>
            ) : null}
            {d.focus.question ? (
              <p className="mt-2 text-[17px]">
                <span className="font-semibold">Ask:</span> {d.focus.question}
              </p>
            ) : null}
            {d.focus.agree.length ? (
              <>
                <p className="mt-2 text-[15px] font-semibold">Agree on:</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-[17px]">
                  {d.focus.agree.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        ) : (
          <p className="mt-1 text-[17px]">{d.focusMessage}</p>
        )}
        {week ? (
          <TopicForm
            key={`${item.brokerId}-${week}-${d.focus?.source === "override" ? d.focus.topic : "auto"}`}
            brokerId={item.brokerId}
            weekStart={week}
            current={d.focus?.source === "override" ? { topic: d.focus.topic, note: d.focus.note } : null}
          />
        ) : null}
      </section>

      <Link
        href={`/admin/coaching/${item.brokerId}${week ? `?week=${encodeURIComponent(week)}` : ""}`}
        className="inline-flex min-h-11 items-center self-start text-base font-semibold text-brand underline-offset-2 hover:underline"
      >
        Open {item.name}&apos;s coaching page
      </Link>
    </div>
  );
}

function SlippingList({ slipping, brokerId }: { slipping: Line[]; brokerId: string }) {
  const [showAll, setShowAll] = useState(false);
  const { shown, more } = splitShown(slipping, 3);
  const listId = `slipping-more-${brokerId}`;
  return (
    <>
      <ul className="mt-2 flex flex-col gap-3">
        {shown.map((line) => (
          <SlippingLine key={line.metric} line={line} />
        ))}
      </ul>
      {more.length ? (
        <>
          <ul id={listId} hidden={!showAll} className="mt-3 flex flex-col gap-3">
            {more.map((line) => (
              <SlippingLine key={line.metric} line={line} />
            ))}
          </ul>
          <button
            type="button"
            aria-expanded={showAll}
            aria-controls={listId}
            onClick={() => setShowAll((v) => !v)}
            className="mt-2 inline-flex min-h-11 items-center text-base font-semibold text-brand underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          >
            {showAll ? "Show fewer" : `+${more.length} more`}
          </button>
        </>
      ) : null}
    </>
  );
}

function SlippingLine({ line }: { line: Line }) {
  return (
    <li>
      <p className="text-[17px] font-semibold">{line.sentence}</p>
      {line.examples.length ? (
        <ul className="mt-1 flex flex-col gap-1 pl-4">
          {line.examples.map((e) => (
            <li key={`${e.name}-${e.text}`} className="text-[15px] text-muted">
              {e.ghlUrl ? (
                <a href={e.ghlUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand underline-offset-2 hover:underline">
                  {e.name}
                  <span className="sr-only"> (opens in GoHighLevel in a new tab)</span>
                </a>
              ) : (
                <span className="font-semibold text-ink">{e.name}</span>
              )}
              : {e.text}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
