/**
 * File: packages/shared/src/coaching-one-on-one.ts
 * Purpose: The plain-language "Needs a 1:1 this week" details for one broker: last week's focus and whether it moved,
 * what's slipping (behaviour only, with example leads), a one-line results summary and this week's focus with a question
 * and things to agree. Written for a manager who does not know the scoring system: no metric names or bare numbers.
 * Nothing here computes a score; the numbers come from the coach service's weekly snapshots.
 *
 * Functions:
 * - slippingMetrics(cells): behaviour metrics below target (red or amber), largest weighted point gap first.
 * - focusMetric(slipping): the metric this week's focus comes from: the first slipping one that is not next step, or null.
 * - splitShown(items, limit): the first `limit` items to show and the rest behind "+N more".
 * - workTime(minutes): working minutes in words ("about 15 working hours", "40 minutes").
 * - targetTime(minutes): a reply-time target in words ("within 1 hour", "within 35 minutes").
 * - shortDate(iso): "Nov 18" in Eastern time.
 * - percent(value, target): a share and its target as "54%" and "57%", with one decimal when rounding would make them equal.
 * - outOf100(value, target): a 0-100 rating and its target, with one decimal when rounding would make them equal.
 * - slippingSentence(metric, cell): one plain sentence with the actual number and the target (for follow-up after calls: the two
 *   parts the rating is made of: the share of calls followed up within 2 working hours and the share with a next contact booked).
 * - exampleText(metric, facts): what happened on one lead, in plain words, or null without facts.
 * - count(n, one, many): "1 close" or "3 closes".
 * - resultsLine(cells): showings, hot leads, closes and closed value, each with its time window.
 * - movement(metric, before, after): whether a metric improved, stayed about the same or got worse between two weeks.
 * - phrase(metric, value): a metric's value in words for "went from ... to ..." ("about 6 working hours", "54%", "59 out of 100").
 * - lastWeekText(metric, topic, before, after): "Last week: Same-day replies. Reply time went from ... to ..., improving".
 * - buildOneOnOneDetails(input): the details for one broker from this week's and the two previous weeks' cells (one example per lead, up to three).
 */
import { formatCoachingValue, type CoachingMetricId, type CoachingStatus } from "./api-coaching";

export const BEHAVIOUR_METRICS: readonly CoachingMetricId[] = [
  "speed_to_follow",
  "on_time_touches",
  "next_step_coverage",
  "call_quality",
  "responsiveness",
  "promises_kept",
];

export const SKIPPED_FOR_FOCUS: ReadonlySet<CoachingMetricId> = new Set(["next_step_coverage"]);

export const NO_BEHAVIOUR_GAPS = "No behaviour gaps this week. Review results and pipeline together";
export const ONLY_NEXT_STEP_GAP = "The only behaviour gap this week is booking next steps, which is being checked separately. Review results and pipeline together";
export const SAME_FOCUS_THREE_WEEKS = "Same focus for 3 weeks, no change";

export type OneOnOneCell = {
  status: CoachingStatus;
  value: number | null;
  target: number | null;
  points: number | null;
  weight: number | null;
  detail?: Record<string, number | null> | null;
  evidence?: Array<{ leadId: string; at: string; note: string; facts?: Record<string, string | number | boolean | null> }>;
};

export type CoachingEntry = { topic: string; measures?: string; question: string; agree: string[]; action?: string };

export type OneOnOneDetails = {
  lastWeek: { text: string; direction: "improving" | "about the same" | "getting worse"; stuck: boolean } | null;
  slipping: Array<{ metric: CoachingMetricId; sentence: string; examples: Array<{ name: string; text: string; ghlUrl: string | null }> }>;
  results: string;
  focus: { topic: string; question: string; agree: string[] } | null;
  focusMessage: string | null;
};

const MINUTES_PER_HOUR = 60;
const STEADY_POINTS = 2;
const EXAMPLES = 3;
const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });

export function slippingMetrics(cells: Partial<Record<CoachingMetricId, OneOnOneCell>>): CoachingMetricId[] {
  const gap = (m: CoachingMetricId) => {
    const c = cells[m]!;
    return typeof c.points === "number" && typeof c.weight === "number" ? c.weight * (100 - c.points) : -1;
  };
  return BEHAVIOUR_METRICS.filter((m) => cells[m]?.status === "red" || cells[m]?.status === "amber").sort(
    (a, b) => gap(b) - gap(a) || BEHAVIOUR_METRICS.indexOf(a) - BEHAVIOUR_METRICS.indexOf(b),
  );
}

export function focusMetric(slipping: CoachingMetricId[]): CoachingMetricId | null {
  return slipping.find((m) => BEHAVIOUR_METRICS.includes(m) && !SKIPPED_FOR_FOCUS.has(m)) ?? null;
}

export function splitShown<T>(items: T[], limit = 3): { shown: T[]; more: T[] } {
  return { shown: items.slice(0, limit), more: items.slice(limit) };
}

export function workTime(minutes: number): string {
  if (minutes < 90) return `${Math.max(1, Math.round(minutes))} minutes`;
  const hours = Math.round(minutes / MINUTES_PER_HOUR);
  return `about ${hours} working ${hours === 1 ? "hour" : "hours"}`;
}

export function targetTime(minutes: number): string {
  if (minutes % MINUTES_PER_HOUR === 0) {
    const hours = minutes / MINUTES_PER_HOUR;
    return `within ${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  return `within ${Math.round(minutes)} minutes`;
}

export function shortDate(iso: string): string {
  return DATE.format(new Date(iso));
}

function percent(value: number, target: number | null): [string, string] {
  let v = `${Math.round(value * 100)}%`;
  let t = target === null ? "" : `${Math.round(target * 100)}%`;
  if (target !== null && v === t && value !== target) {
    v = `${(Math.round(value * 1000) / 10).toFixed(1)}%`;
    t = `${(Math.round(target * 1000) / 10).toFixed(1)}%`;
  }
  return [v, t];
}

function outOf100(value: number, target: number | null): [string, string] {
  let v = String(Math.round(value));
  let t = target === null ? "" : String(Math.round(target));
  if (target !== null && v === t && value !== target) {
    v = (Math.round(value * 10) / 10).toFixed(1);
    t = (Math.round(target * 10) / 10).toFixed(1);
  }
  return [v, t];
}

export function slippingSentence(metric: CoachingMetricId, cell: OneOnOneCell): string {
  const value = cell.value ?? 0;
  const target = cell.target;
  switch (metric) {
    case "responsiveness":
      return `Replies to clients take ${workTime(value)}${target === null ? "" : ` (target: ${targetTime(target)})`}`;
    case "on_time_touches": {
      const [v, t] = percent(value, target);
      return `${v} of follow-ups that were due happened on time${t ? ` (target: ${t} or more)` : ""}`;
    }
    case "next_step_coverage": {
      const [v, t] = percent(value, target);
      return `${v} of Active and Buy Now leads have a next step booked${t ? ` (target: ${t} or more)` : ""}`;
    }
    case "promises_kept": {
      const [v, t] = percent(value, target);
      return `${v} of promises to clients were kept on time${t ? ` (target: ${t} or more)` : ""}`;
    }
    case "call_quality": {
      const [v, t] = outOf100(value, target);
      return `Calls rate ${v} out of 100 on the call checklist${t ? ` (target: ${t} or more)` : ""}`;
    }
    case "speed_to_follow": {
      const [v, t] = outOf100(value, target);
      const fast = cell.detail?.fast_share;
      const booked = cell.detail?.scheduled_share;
      const goal = t ? ` (target: ${t} or more)` : "";
      if (typeof fast === "number" && typeof booked === "number") {
        return `Client heard back within 2 working hours after ${Math.round(fast * 100)}% of calls; a next contact was booked after ${Math.round(booked * 100)}%${goal}`;
      }
      return `Follow-up after calls rates ${v} out of 100${goal}`;
    }
    default:
      return formatCoachingValue(metric, cell.value);
  }
}

export function exampleText(metric: CoachingMetricId, facts: Record<string, string | number | boolean | null> | undefined): string | null {
  if (!facts) return null;
  const date = (key: string) => (typeof facts[key] === "string" ? shortDate(facts[key] as string) : null);
  switch (metric) {
    case "on_time_touches": {
      const due = date("dueAt");
      const days = facts.daysWithoutTouch;
      switch (facts.reason) {
        case "idle":
          return typeof days === "number" ? `went ${days} days without broker contact` : `no broker contact around ${due}`;
        case "agreed_followup":
          return `the follow-up the client agreed for ${due} was missed`;
        case "post_consultation":
          return `no follow-up after the consultation (due ${due})`;
        case "no_show":
          return `no new attempt after the missed call (due ${due})`;
        case "first_touch":
          return `not contacted in time after being assigned (due ${due})`;
        case "appointment":
          return `the call booked for ${due} did not start on time`;
        default:
          return `a follow-up due ${due} was missed`;
      }
    }
    case "responsiveness": {
      const minutes = typeof facts.minutes === "number" ? facts.minutes : null;
      const when = date("messageAt");
      if (facts.replied === false) return `message on ${when} still unanswered${minutes === null ? "" : ` after ${workTime(minutes)}`}`;
      return minutes === null ? `slow reply to the message on ${when}` : `waited ${workTime(minutes)} for a reply on ${when}`;
    }
    case "speed_to_follow": {
      const when = date("callAt");
      const minutes = typeof facts.minutes === "number" ? facts.minutes : null;
      const noNextStep = facts.nextStepBooked === false ? ", no next step booked" : "";
      return minutes === null ? `no follow-up after the call on ${when}${noNextStep}` : `next contact ${workTime(minutes)} after the call on ${when}${noNextStep}`;
    }
    case "next_step_coverage":
      return `${typeof facts.priority === "string" ? facts.priority : "Active"} lead with no next step booked`;
    case "call_quality":
      return typeof facts.score === "number" ? `call on ${date("callAt")} rated ${facts.score} out of 100` : null;
    case "promises_kept":
      return `promise made ${date("madeAt")} was not kept by ${date("dueAt")}`;
    default:
      return null;
  }
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function resultsLine(cells: Partial<Record<CoachingMetricId, OneOnOneCell>>): string {
  const value = (m: CoachingMetricId) => cells[m]?.value ?? null;
  const showings = value("showings_completed");
  const hot = value("hot_pipeline");
  const closes = value("closes");
  const closed = value("closed_value");
  const parts = [
    showings === null ? "showings: not enough data yet" : `${count(showings, "showing", "showings")} in the last 90 days`,
    hot === null ? "hot leads: not enough data yet" : `${count(hot, "hot lead", "hot leads")} right now`,
    closes === null ? "closes: not enough data yet" : `${count(closes, "close", "closes")}${closed === null ? "" : ` worth ${MONEY.format(closed)}`} in the last 12 months`,
  ];
  return parts.join(" · ");
}

export function movement(metric: CoachingMetricId, before: OneOnOneCell, after: OneOnOneCell): "improving" | "about the same" | "getting worse" {
  if (typeof before.points === "number" && typeof after.points === "number") {
    const d = after.points - before.points;
    return d >= STEADY_POINTS ? "improving" : d <= -STEADY_POINTS ? "getting worse" : "about the same";
  }
  if (before.value === null || after.value === null || before.value === after.value) return "about the same";
  const better = metric === "responsiveness" ? after.value < before.value : after.value > before.value;
  return better ? "improving" : "getting worse";
}

function phrase(metric: CoachingMetricId, value: number | null): string {
  if (value === null) return "unknown";
  switch (metric) {
    case "responsiveness":
      return workTime(value);
    case "speed_to_follow":
    case "call_quality":
      return `${Math.round(value)} out of 100`;
    default:
      return `${Math.round(value * 100)}%`;
  }
}

const WHAT: Partial<Record<CoachingMetricId, string>> = {
  responsiveness: "Reply time",
  on_time_touches: "Follow-ups done on time",
  next_step_coverage: "Leads with a next step booked",
  speed_to_follow: "Follow-up after calls",
  call_quality: "The call checklist rating",
  promises_kept: "Promises kept on time",
};

export function lastWeekText(metric: CoachingMetricId, topic: string, before: OneOnOneCell, after: OneOnOneCell): string {
  return `Last week: ${topic}. ${WHAT[metric] ?? topic} went from ${phrase(metric, before.value)} to ${phrase(metric, after.value)}, ${movement(metric, before, after)}`;
}

export function buildOneOnOneDetails(input: {
  current: Partial<Record<CoachingMetricId, OneOnOneCell>>;
  previous: Partial<Record<CoachingMetricId, OneOnOneCell>> | null;
  twoBack: Partial<Record<CoachingMetricId, OneOnOneCell>> | null;
  playbook: Partial<Record<CoachingMetricId, CoachingEntry>>;
  leadName: (leadId: string) => string | null;
  ghlUrl: (leadId: string) => string | null;
}): OneOnOneDetails {
  const slippingNow = slippingMetrics(input.current);
  const focusNow = focusMetric(slippingNow);
  const topicOf = (m: CoachingMetricId) => input.playbook[m]?.topic ?? WHAT[m] ?? m;

  let lastWeek: OneOnOneDetails["lastWeek"] = null;
  const focusBefore = input.previous ? focusMetric(slippingMetrics(input.previous)) : null;
  if (input.previous && focusBefore && input.previous[focusBefore] && input.current[focusBefore]) {
    const before = input.previous[focusBefore]!;
    const after = input.current[focusBefore]!;
    const focusTwoBack = input.twoBack ? focusMetric(slippingMetrics(input.twoBack)) : null;
    const start = input.twoBack?.[focusBefore];
    const stuck = focusNow === focusBefore && focusTwoBack === focusBefore && !!start && movement(focusBefore, start, after) !== "improving";
    lastWeek = { text: lastWeekText(focusBefore, topicOf(focusBefore), before, after), direction: movement(focusBefore, before, after), stuck };
  }

  const slipping = slippingNow.map((metric) => ({
    metric,
    sentence: slippingSentence(metric, input.current[metric]!),
    examples: (input.current[metric]!.evidence ?? [])
      .filter((e, i, all) => all.findIndex((x) => x.leadId === e.leadId) === i)
      .flatMap((e) => {
        const text = exampleText(metric, e.facts);
        return text ? [{ name: input.leadName(e.leadId) ?? "A lead", text, ghlUrl: input.ghlUrl(e.leadId) }] : [];
      })
      .slice(0, EXAMPLES),
  }));

  const entry = focusNow ? input.playbook[focusNow] : undefined;
  const focus = focusNow ? { topic: topicOf(focusNow), question: entry?.question ?? "", agree: (entry?.agree ?? []).slice(0, 3) } : null;
  const focusMessage = focusNow ? null : slippingNow.length ? ONLY_NEXT_STEP_GAP : NO_BEHAVIOUR_GAPS;
  return { lastWeek, slipping, results: resultsLine(input.current), focus, focusMessage };
}
