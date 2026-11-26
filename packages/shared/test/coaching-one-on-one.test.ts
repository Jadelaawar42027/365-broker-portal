/**
 * File: packages/shared/test/coaching-one-on-one.test.ts
 * Purpose: Unit tests for the "Needs a 1:1 this week" details: what's slipping (behaviour only, largest gap first),
 * this week's focus (never a results metric, never next step, an empty case), "+N more", the plain sentences and
 * example leads, the results line, and last week's focus with the "same focus for 3 weeks" flag.
 *
 * Functions:
 * - cell(o): a metric cell with defaults (green, no value).
 * - red(value, target, points, weight, extra): a red cell.
 * - amber(value, target, points, weight, extra): an amber cell.
 */
import { describe, expect, it } from "vitest";
import {
  buildOneOnOneDetails,
  exampleText,
  focusMetric,
  NO_BEHAVIOUR_GAPS,
  ONLY_NEXT_STEP_GAP,
  resultsLine,
  slippingMetrics,
  slippingSentence,
  splitShown,
  workTime,
  type OneOnOneCell,
} from "../src/coaching-one-on-one";

const cell = (o: Partial<OneOnOneCell>): OneOnOneCell => ({ status: "green", value: null, target: null, points: null, weight: null, ...o });
const red = (value: number, target: number, points: number, weight: number, extra: Partial<OneOnOneCell> = {}) => cell({ status: "red", value, target, points, weight, ...extra });
const amber = (value: number, target: number, points: number, weight: number, extra: Partial<OneOnOneCell> = {}) => cell({ status: "amber", value, target, points, weight, ...extra });

const playbook = {
  responsiveness: { topic: "Same-day replies", question: "What stops you answering within the hour?", agree: ["Notifications on", "Same-day answers", "Two slots a day"] },
  on_time_touches: { topic: "Consistent follow-ups", question: "Which leads slipped through?", agree: ["Task list every morning", "A date on every lead"] },
  next_step_coverage: { topic: "Always book the next step", question: "What should happen next?", agree: ["End with a date"] },
  call_quality: { topic: "Call structure", question: "Which part felt weakest?", agree: ["Listen to one call"] },
  speed_to_follow: { topic: "Fast follow-up after calls", question: "What do you do in the next hour?", agree: ["Recap within 2 hours"] },
  promises_kept: { topic: "Keep your promises", question: "What did you promise?", agree: ["A task for every promise"] },
};

describe("what's slipping", () => {
  it("lists behaviour metrics below target only, largest weighted gap first; results never appear", () => {
    const cells = {
      responsiveness: red(923, 60, 28, 7),
      next_step_coverage: red(0.17, 0.8, 16.7, 8),
      speed_to_follow: red(33.3, 61, 33.3, 10),
      call_quality: cell({ status: "green", value: 61, target: 58, points: 61, weight: 8 }),
      closes: red(0, 2, 0, 9),
      closed_value: red(0, 1000000, 0, 9),
      hot_pipeline: red(2, 8, 25, 10),
      showings_completed: red(1, 6, 16.7, 12),
      pipeline_movement: red(0.2, 0.6, 20, 4),
    };
    expect(slippingMetrics(cells)).toEqual(["speed_to_follow", "next_step_coverage", "responsiveness"]);
  });

  it("shows three and puts the rest behind +N more", () => {
    expect(splitShown([1, 2, 3, 4, 5])).toEqual({ shown: [1, 2, 3], more: [4, 5] });
    expect(splitShown([1, 2])).toEqual({ shown: [1, 2], more: [] });
    expect(splitShown([])).toEqual({ shown: [], more: [] });
  });
});

describe("this week's focus", () => {
  it("is the first slipping metric that is not next step", () => {
    expect(focusMetric(["next_step_coverage", "responsiveness", "call_quality"])).toBe("responsiveness");
    expect(focusMetric(["call_quality"])).toBe("call_quality");
  });

  it("is never a results metric, even if one is passed in", () => {
    expect(focusMetric(["closes", "closed_value", "hot_pipeline", "showings_completed", "pipeline_movement"])).toBeNull();
    expect(focusMetric(["closes", "promises_kept"])).toBe("promises_kept");
  });

  it("is empty when nothing is slipping, with its message; next step alone gets its own message", () => {
    const none = buildOneOnOneDetails({ current: { closes: red(0, 2, 0, 9) }, previous: null, twoBack: null, playbook, leadName: () => null, ghlUrl: () => null });
    expect(none.focus).toBeNull();
    expect(none.focusMessage).toBe(NO_BEHAVIOUR_GAPS);
    const onlyNext = buildOneOnOneDetails({ current: { next_step_coverage: red(0.5, 0.8, 50, 8) }, previous: null, twoBack: null, playbook, leadName: () => null, ghlUrl: () => null });
    expect(onlyNext.slipping.map((s) => s.metric)).toEqual(["next_step_coverage"]);
    expect(onlyNext.focus).toBeNull();
    expect(onlyNext.focusMessage).toBe(ONLY_NEXT_STEP_GAP);
  });

  it("uses the playbook's topic, question and up to three things to agree", () => {
    const d = buildOneOnOneDetails({
      current: { next_step_coverage: red(0, 0.8, 0, 8), on_time_touches: amber(0.444, 0.571, 44.4, 10) },
      previous: null, twoBack: null, playbook, leadName: () => null, ghlUrl: () => null,
    });
    expect(d.focus).toEqual({ topic: "Consistent follow-ups", question: "Which leads slipped through?", agree: ["Task list every morning", "A date on every lead"] });
  });
});

describe("plain sentences", () => {
  it("say the actual number and the target in words", () => {
    expect(slippingSentence("responsiveness", red(923, 60, 28, 7))).toBe("Replies to clients take about 15 working hours (target: within 1 hour)");
    expect(slippingSentence("on_time_touches", amber(0.541, 0.571, 54.1, 10))).toBe("54% of follow-ups that were due happened on time (target: 57% or more)");
    expect(slippingSentence("next_step_coverage", red(0.167, 0.8, 16.7, 8))).toBe("17% of Active and Buy Now leads have a next step booked (target: 80% or more)");
    expect(slippingSentence("promises_kept", amber(0.6, 0.643, 60, 7))).toBe("60% of promises to clients were kept on time (target: 64% or more)");
    expect(slippingSentence("call_quality", amber(57.3, 57.9, 57.3, 8))).toBe("Calls rate 57 out of 100 on the call checklist (target: 58 or more)");
    expect(slippingSentence("call_quality", amber(57.5, 58.2, 57.5, 8))).toBe("Calls rate 57.5 out of 100 on the call checklist (target: 58.2 or more)");
    expect(slippingSentence("speed_to_follow", red(58.9, 75, 58.9, 10, { detail: { median_work_minutes_to_next_touch: 64.5, fast_share: 0.4, scheduled_share: 0.333 } }))).toBe(
      "After calls, the client heard back within 2 working hours (or on the agreed day) 40% of the time and a next contact was booked 33% of the time; follow-up rates 59 out of 100 (target: 75 or more)",
    );
    expect(slippingSentence("speed_to_follow", red(33.3, 61, 33.3, 10, { detail: { median_work_minutes_to_next_touch: 540 } }))).toBe(
      "Follow-up after calls rates 33 out of 100 (target: 61 or more)",
    );
    expect(workTime(35)).toBe("35 minutes");
  });

  it("explain each example lead in plain words", () => {
    expect(exampleText("on_time_touches", { reason: "idle", dueAt: "2026-11-17T15:00:00Z", daysWithoutTouch: 12 })).toBe("went 12 days without broker contact");
    expect(exampleText("on_time_touches", { reason: "agreed_followup", dueAt: "2026-11-18T15:00:00Z", daysWithoutTouch: 3 })).toBe("the follow-up the client agreed for Nov 18 was missed");
    expect(exampleText("responsiveness", { messageAt: "2026-11-18T15:00:00Z", minutes: 900, replied: true })).toBe("waited about 15 working hours for a reply on Nov 18");
    expect(exampleText("responsiveness", { messageAt: "2026-11-18T15:00:00Z", minutes: 400, replied: false })).toBe("message on Nov 18 still unanswered after about 7 working hours");
    expect(exampleText("speed_to_follow", { callAt: "2026-11-18T15:00:00Z", minutes: null, nextStepBooked: false })).toBe("no follow-up after the call on Nov 18, no next step booked");
    expect(exampleText("call_quality", { callAt: "2026-11-19T15:00:00Z", score: 41 })).toBe("call on Nov 19 rated 41 out of 100");
    expect(exampleText("promises_kept", { madeAt: "2026-11-17T15:00:00Z", dueAt: "2026-11-19T15:00:00Z" })).toBe("promise made Nov 17 was not kept by Nov 19");
    expect(exampleText("next_step_coverage", { priority: "Buy Now" })).toBe("Buy Now lead with no next step booked");
    expect(exampleText("on_time_touches", undefined)).toBeNull();
  });

  it("give results on one line with their time windows", () => {
    expect(resultsLine({ showings_completed: cell({ value: 3 }), hot_pipeline: cell({ value: 2 }), closes: cell({ value: 1 }), closed_value: cell({ value: 318000 }) })).toBe(
      "3 showings in the last 90 days · 2 hot leads right now · 1 close worth $318K in the last 12 months",
    );
    expect(resultsLine({})).toBe("showings: not enough data yet · hot leads: not enough data yet · closes: not enough data yet");
  });
});

describe("example leads", () => {
  it("one example per lead: a lead behind several misses shows once", () => {
    const e = (id: string, days: number) => ({ leadId: id, at: "2026-11-17T15:00:00Z", note: "x", facts: { reason: "idle", dueAt: "2026-11-17T15:00:00Z", daysWithoutTouch: days } });
    const d = buildOneOnOneDetails({
      current: { on_time_touches: amber(0.5, 0.57, 50, 10, { evidence: [e("A", 20), e("A", 15), e("B", 12), e("A", 9), e("C", 8)] }) },
      previous: null, twoBack: null, playbook, leadName: (id) => id, ghlUrl: () => null,
    });
    expect(d.slipping[0]!.examples.map((x) => [x.name, x.text])).toEqual([["A", "went 20 days without broker contact"], ["B", "went 12 days without broker contact"], ["C", "went 8 days without broker contact"]]);
  });

  it("up to three per line, named and linked to GHL, from the facts in the snapshot", () => {
    const evidence = [1, 2, 3, 4].map((n) => ({ leadId: `L${n}`, at: "2026-11-17T15:00:00Z", note: "x", facts: { reason: "idle", dueAt: "2026-11-17T15:00:00Z", daysWithoutTouch: 10 + n } }));
    const d = buildOneOnOneDetails({
      current: { on_time_touches: amber(0.5, 0.57, 50, 10, { evidence }) },
      previous: null, twoBack: null, playbook,
      leadName: (id) => (id === "L2" ? null : `Lead ${id}`),
      ghlUrl: (id) => `https://ghl.example/${id}`,
    });
    expect(d.slipping[0]!.examples).toEqual([
      { name: "Lead L1", text: "went 11 days without broker contact", ghlUrl: "https://ghl.example/L1" },
      { name: "A lead", text: "went 12 days without broker contact", ghlUrl: "https://ghl.example/L2" },
      { name: "Lead L3", text: "went 13 days without broker contact", ghlUrl: "https://ghl.example/L3" },
    ]);
  });
});

describe("last week's focus", () => {
  const base = { playbook, leadName: () => null, ghlUrl: () => null };
  it("names last week's topic and says how it moved, in words", () => {
    const d = buildOneOnOneDetails({ ...base, current: { responsiveness: amber(360, 60, 50, 7) }, previous: { responsiveness: red(900, 60, 30, 7) }, twoBack: null });
    expect(d.lastWeek).toEqual({ text: "Last week: Same-day replies. Reply time went from about 15 working hours to about 6 working hours, improving", direction: "improving", stuck: false });
  });

  it("flags the same focus three weeks running with no improvement", () => {
    const d = buildOneOnOneDetails({
      ...base,
      current: { on_time_touches: amber(0.5, 0.57, 50, 10) },
      previous: { on_time_touches: amber(0.51, 0.57, 51, 10) },
      twoBack: { on_time_touches: amber(0.5, 0.57, 50, 10) },
    });
    expect(d.lastWeek).toMatchObject({ direction: "about the same", stuck: true });
  });

  it("does not flag it when the metric improved over the three weeks", () => {
    const d = buildOneOnOneDetails({
      ...base,
      current: { on_time_touches: amber(0.55, 0.57, 55, 10) },
      previous: { on_time_touches: amber(0.51, 0.57, 51, 10) },
      twoBack: { on_time_touches: amber(0.45, 0.57, 45, 10) },
    });
    expect(d.lastWeek?.stuck).toBe(false);
  });

  it("is empty when last week had no behaviour focus", () => {
    const d = buildOneOnOneDetails({ ...base, current: { call_quality: amber(55, 58, 55, 8) }, previous: { next_step_coverage: red(0.5, 0.8, 50, 8) }, twoBack: null });
    expect(d.lastWeek).toBeNull();
  });
});
