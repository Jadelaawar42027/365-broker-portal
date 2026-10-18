/**
 * File: apps/web/src/components/guidance/guided-content.tsx
 * Purpose: The short layout every onboarding step and lesson uses (SPEC D28): a "What to do" card with 3 to 5 bullets
 * (and any buttons the step needs), the NEVER / WATCH / HOUSE RULE callouts as one-line boxes, and the manual's
 * original text in a collapsed "Read the full section" panel.
 *
 * Functions:
 * - GuidedContent({ todoItems, callouts, fullTextMd, inCard, children }): renders the three parts in that order; inCard drops the outer card frames when it sits inside a card already.
 * - CalloutBox({ kind, lines }): one box with the callout label and its lines; one line each when a kind repeats.
 * - groupCallouts(callouts): joins callouts of the same kind that follow each other, so five NEVERs share one box.
 * - FullSection({ markdown, inCard }): the collapsed panel with the manual's text.
 */
import type { GuidanceCallout } from "@bp/shared";
import type { ReactNode } from "react";
import { LessonBody } from "@/components/training/lesson-body";
import { ChevronRightIcon } from "@/components/ui/icons";

const CALLOUT_LINE_STYLES: Record<GuidanceCallout["kind"], { box: string; label: string }> = {
  NEVER: { box: "bg-navy text-white", label: "text-[#ff9a9a]" },
  WATCH: { box: "bg-[#fdf3e3] text-[#5b3a10]", label: "text-warn" },
  "HOUSE RULE": { box: "bg-brand-soft text-ink", label: "text-brand" },
};

function groupCallouts(callouts: GuidanceCallout[]): { kind: GuidanceCallout["kind"]; lines: string[] }[] {
  const groups: { kind: GuidanceCallout["kind"]; lines: string[] }[] = [];
  for (const callout of callouts) {
    const last = groups.at(-1);
    if (last && last.kind === callout.kind) last.lines.push(callout.text);
    else groups.push({ kind: callout.kind, lines: [callout.text] });
  }
  return groups;
}

export function CalloutBox({ kind, lines }: { kind: GuidanceCallout["kind"]; lines: string[] }) {
  const style = CALLOUT_LINE_STYLES[kind];
  return (
    <div className={`flex flex-col gap-1.5 rounded-xl px-5 py-3.5 text-[17px] leading-snug sm:flex-row sm:items-baseline sm:gap-4 ${style.box}`}>
      <p className={`w-[104px] shrink-0 text-[14px] font-extrabold tracking-[0.08em] uppercase ${style.label}`}>{kind}</p>
      {lines.length === 1 ? (
        <p>{lines[0]}</p>
      ) : (
        <ul className="space-y-1.5">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FullSection({ markdown, inCard }: { markdown: string; inCard: boolean }) {
  return (
    <details className={`group rounded-2xl border border-line ${inCard ? "bg-page" : "bg-white"}`}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl px-6 py-4 text-lg font-bold hover:bg-page focus-visible:outline-3 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon className="size-5 shrink-0 text-brand transition-transform group-open:rotate-90" />
        Read the full section
        <span className="ml-auto hidden text-[15px] font-semibold text-muted sm:inline">From the manual</span>
      </summary>
      <div className="space-y-5 rounded-b-2xl border-t border-line bg-white px-6 py-6">
        <LessonBody markdown={markdown} />
      </div>
    </details>
  );
}

export function GuidedContent({
  todoItems,
  callouts,
  fullTextMd,
  inCard = false,
  children,
}: {
  todoItems: string[];
  callouts: GuidanceCallout[];
  fullTextMd: string;
  inCard?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <section aria-labelledby="todo-title" className={inCard ? "rounded-2xl bg-brand-soft/60 px-6 py-6" : "rounded-2xl border border-line bg-white px-6 py-6 sm:px-7"}>
        <h2 id="todo-title" className="text-xl font-bold">
          What to do
        </h2>
        <ul className="mt-4 space-y-3">
          {todoItems.map((item) => (
            <li key={item} className="flex gap-3 text-lg leading-relaxed">
              <span aria-hidden="true" className="mt-2.5 size-2 shrink-0 rounded-full bg-brand" />
              {item}
            </li>
          ))}
        </ul>
        {children ? <div className="mt-6">{children}</div> : null}
      </section>
      {callouts.length ? (
        <div className="space-y-2.5">
          {groupCallouts(callouts).map((group, index) => (
            <CalloutBox key={`${group.kind}-${index}`} kind={group.kind} lines={group.lines} />
          ))}
        </div>
      ) : null}
      {fullTextMd.trim() ? <FullSection markdown={fullTextMd} inCard={inCard} /> : null}
    </div>
  );
}
