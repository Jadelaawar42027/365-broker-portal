/**
 * File: apps/web/src/components/admin/persona-tags-panel.tsx
 * Purpose: The "Matching tags" panel under the Persona panel on the broker profile (3c): the structured tags Claude pulled
 * from the persona for lead matching, whether they match the saved persona, and which values an admin overrode. "Edit
 * tags" turns every field into a form; saving sends only the fields that changed as overrides, and "Use extracted"
 * removes one override. "Re-extract" asks Claude again now. Admins only.
 *
 * Functions:
 * - PersonaTagsPanel({ brokerId, view }): the panel with its read view, edit form, re-extract and save.
 * - TagValue({ field, tags }): one field's value as chips or text, or "Not stated".
 * - FieldEditor({ field, draft, onChange }): the form control for one field in edit mode.
 * - toDraft(tags): the effective tags as form values.
 * - fromDraft(field, draft, current): one field's form value turned back into a tag value.
 * - chipLabel(field, value): the readable label for one value of a field.
 * - sameValue(a, b): true when two tag values are equal.
 */
"use client";

import {
  BACKGROUND_LABELS,
  BACKGROUND_TAGS,
  BOAT_TYPE_LABELS,
  BOAT_TYPES,
  CONTACT_CHANNELS,
  FOLLOW_UP_STYLES,
  MILITARY_BRANCHES,
  PERSONA_TAG_FIELDS,
  PRICE_BAND_LABELS,
  PRICE_BANDS,
  RESPONSE_SPEEDS,
  type BackgroundTagEntry,
  type LanguageFluency,
  type PersonaTagField,
  type PersonaTags,
  type PersonaTagsStatus,
  type PersonaTagsView,
} from "@bp/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { Pill, type PillTone } from "@/components/ui/pill";
import { formatDate } from "@/lib/format";
import { apiRequest, ApiError } from "@/lib/api-client";

type Draft = {
  backgroundTags: { tags: string[]; branch: string };
  storyKeywords: string;
  boatTypes: string[];
  priceBands: string[];
  buyerTypesClick: string;
  strengths: string;
  avoidNotes: string;
  languages: string;
  followUpStyle: string;
  responseSpeed: string;
  channels: string[];
  sellingStyle: string;
  maxLeadsPerWeek: string;
  availabilityText: string;
  doNotMention: string;
};

const FIELD_LABELS: Record<PersonaTagField, string> = {
  backgroundTags: "Background",
  storyKeywords: "Story hooks",
  boatTypes: "Boat types",
  priceBands: "Price ranges",
  buyerTypesClick: "Clicks with",
  strengths: "Strengths",
  avoidNotes: "Avoid pairing with",
  languages: "Languages",
  followUpStyle: "Follow-up style",
  responseSpeed: "Reply speed",
  channels: "Channels",
  sellingStyle: "Selling style",
  maxLeadsPerWeek: "Max new leads a week",
  availabilityText: "Availability",
  doNotMention: "Never mention to leads",
};

const FOLLOW_UP_LABELS: Record<string, string> = {
  chaser: "Follows up hard",
  consistent: "Consistent, can slip",
  light_touch: "Light touch",
  wait_for_lead: "Waits for the lead",
};

const SPEED_LABELS: Record<string, string> = {
  within_minutes: "Within minutes",
  within_hour: "Within the hour",
  same_day: "Same day",
  next_day: "Next day",
  slower: "Slower",
};

const CHANNEL_LABELS: Record<string, string> = {
  call: "Call",
  text: "Text",
  whatsapp: "WhatsApp",
  email: "Email",
  video: "Video",
  in_person: "In person",
};

const BRANCH_LABELS: Record<string, string> = {
  army: "Army",
  navy: "Navy",
  air_force: "Air Force",
  marine_corps: "Marine Corps",
  coast_guard: "Coast Guard",
  space_force: "Space Force",
  national_guard: "National Guard",
};

const STATUS: Record<PersonaTagsStatus, { tone: PillTone; label: string; help: string }> = {
  current: { tone: "success", label: "Up to date", help: "These tags match the saved persona." },
  stale: { tone: "warning", label: "Updating", help: "The persona changed since these tags were made. New tags are being extracted; reload in a minute or re-extract now." },
  pending: { tone: "neutral", label: "Not extracted", help: "Tags haven't been extracted from this persona yet." },
  failed: { tone: "danger", label: "Extraction failed", help: "The last extraction failed. The tags below are from the last good one, if any." },
  no_persona: { tone: "neutral", label: "No persona", help: "Write a persona above to get matching tags. Until then this broker is matched without a background fit." },
};

const LIST_FIELDS = new Set<PersonaTagField>(["storyKeywords", "buyerTypesClick", "strengths", "avoidNotes", "doNotMention"]);
const CHOICE_FIELDS: Partial<Record<PersonaTagField, readonly string[]>> = {
  boatTypes: BOAT_TYPES,
  priceBands: PRICE_BANDS,
  channels: CONTACT_CHANNELS,
};

const inputClass =
  "block w-full rounded-xl border border-[#cdd5e1] px-3.5 py-2.5 text-base focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/25";

function chipLabel(field: PersonaTagField, value: string): string {
  if (field === "boatTypes") return BOAT_TYPE_LABELS[value as keyof typeof BOAT_TYPE_LABELS] ?? value;
  if (field === "priceBands") return PRICE_BAND_LABELS[value as keyof typeof PRICE_BAND_LABELS] ?? value;
  if (field === "channels") return CHANNEL_LABELS[value] ?? value;
  if (field === "followUpStyle") return FOLLOW_UP_LABELS[value] ?? value;
  if (field === "responseSpeed") return SPEED_LABELS[value] ?? value;
  return value;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function toDraft(tags: PersonaTags): Draft {
  const lines = (values: string[] | null) => (values ?? []).join("\n");
  return {
    backgroundTags: {
      tags: (tags.backgroundTags ?? []).map((entry) => entry.tag),
      branch: tags.backgroundTags?.find((entry) => entry.tag === "veteran")?.branch ?? "",
    },
    storyKeywords: lines(tags.storyKeywords),
    boatTypes: tags.boatTypes ?? [],
    priceBands: tags.priceBands ?? [],
    buyerTypesClick: lines(tags.buyerTypesClick),
    strengths: lines(tags.strengths),
    avoidNotes: lines(tags.avoidNotes),
    languages: (tags.languages ?? []).map((entry) => (entry.fluency ? `${entry.language} (${entry.fluency})` : entry.language)).join("\n"),
    followUpStyle: tags.followUpStyle ?? "",
    responseSpeed: tags.responseSpeed ?? "",
    channels: tags.channels ?? [],
    sellingStyle: tags.sellingStyle ?? "",
    maxLeadsPerWeek: tags.maxLeadsPerWeek === null ? "" : String(tags.maxLeadsPerWeek),
    availabilityText: tags.availabilityText ?? "",
    doNotMention: lines(tags.doNotMention),
  };
}

function fromDraft(field: PersonaTagField, draft: Draft, current: PersonaTags): unknown {
  const list = (text: string) => {
    const items = text.split("\n").map((line) => line.trim()).filter(Boolean);
    return items.length > 0 ? items : null;
  };
  const choices = (values: string[]) => (values.length > 0 ? values : null);
  switch (field) {
    case "backgroundTags": {
      const kept = draft.backgroundTags.tags.map((tag): BackgroundTagEntry => {
        const existing = current.backgroundTags?.find((entry) => entry.tag === tag);
        const branch = tag === "veteran" && draft.backgroundTags.branch ? (draft.backgroundTags.branch as BackgroundTagEntry["branch"]) : null;
        return { tag: tag as BackgroundTagEntry["tag"], branch, detail: existing?.detail ?? null };
      });
      return kept.length > 0 ? kept : null;
    }
    case "languages": {
      const entries = (list(draft.languages) ?? []).map((line) => {
        const match = /^(.+?)\s*\((native|fluent|conversational|basic)\)$/i.exec(line);
        return match
          ? { language: match[1]!.trim().toLowerCase(), fluency: match[2]!.toLowerCase() as LanguageFluency }
          : { language: line.toLowerCase(), fluency: null };
      });
      return entries.length > 0 ? entries : null;
    }
    case "boatTypes":
    case "priceBands":
    case "channels":
      return choices(draft[field]);
    case "followUpStyle":
    case "responseSpeed":
    case "sellingStyle":
    case "availabilityText":
      return draft[field].trim() || null;
    case "maxLeadsPerWeek":
      return draft.maxLeadsPerWeek.trim() ? Number(draft.maxLeadsPerWeek) : null;
    default:
      return list(draft[field]);
  }
}

function TagValue({ field, tags }: { field: PersonaTagField; tags: PersonaTags }) {
  const value = tags[field];
  if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
    return <span className="text-base text-muted">Not stated</span>;
  }
  if (field === "backgroundTags") {
    return (
      <ul className="flex flex-wrap gap-2">
        {(value as BackgroundTagEntry[]).map((entry) => (
          <li key={`${entry.tag}-${entry.branch ?? ""}`} className="rounded-lg bg-brand-soft px-2.5 py-1 text-[15px] font-semibold text-brand">
            {entry.branch ? `${BRANCH_LABELS[entry.branch]} veteran` : BACKGROUND_LABELS[entry.tag]}
            {entry.detail ? <span className="font-normal text-ink"> · {entry.detail}</span> : null}
          </li>
        ))}
      </ul>
    );
  }
  if (field === "languages") {
    return (
      <span className="text-base">
        {(value as PersonaTags["languages"])!
          .map((entry) => `${entry.language.charAt(0).toUpperCase()}${entry.language.slice(1)}${entry.fluency ? ` (${entry.fluency})` : ""}`)
          .join(", ")}
      </span>
    );
  }
  if (Array.isArray(value)) {
    return (
      <ul className="flex flex-wrap gap-2">
        {(value as string[]).map((item) => (
          <li
            key={item}
            className={`rounded-lg px-2.5 py-1 text-[15px] font-semibold ${field === "doNotMention" ? "bg-danger-soft text-danger" : "bg-neutral-soft text-ink"}`}
          >
            {chipLabel(field, item)}
          </li>
        ))}
      </ul>
    );
  }
  return <span className="text-base">{chipLabel(field, String(value))}</span>;
}

function FieldEditor({ field, draft, onChange }: { field: PersonaTagField; draft: Draft; onChange: (next: Draft) => void }) {
  const id = `tag-${field}`;
  if (field === "backgroundTags") {
    const selected = draft.backgroundTags.tags;
    return (
      <div className="space-y-3">
        <div role="group" aria-label={FIELD_LABELS.backgroundTags} className="flex flex-wrap gap-x-4 gap-y-1">
          {BACKGROUND_TAGS.map((tag) => (
            <label key={tag} className="inline-flex min-h-11 items-center gap-2 text-base">
              <input
                type="checkbox"
                className="size-5 accent-brand"
                checked={selected.includes(tag)}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    backgroundTags: {
                      ...draft.backgroundTags,
                      tags: event.target.checked ? [...selected, tag] : selected.filter((value) => value !== tag),
                    },
                  })
                }
              />
              {BACKGROUND_LABELS[tag]}
            </label>
          ))}
        </div>
        {selected.includes("veteran") ? (
          <label className="block max-w-xs text-[15px] font-semibold">
            Branch
            <select
              className={`${inputClass} mt-1`}
              value={draft.backgroundTags.branch}
              onChange={(event) => onChange({ ...draft, backgroundTags: { ...draft.backgroundTags, branch: event.target.value } })}
            >
              <option value="">Not stated</option>
              {MILITARY_BRANCHES.map((branch) => (
                <option key={branch} value={branch}>
                  {BRANCH_LABELS[branch]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    );
  }
  const choices = CHOICE_FIELDS[field];
  if (choices) {
    const selected = draft[field as "boatTypes" | "priceBands" | "channels"];
    return (
      <div role="group" aria-label={FIELD_LABELS[field]} className="flex flex-wrap gap-x-4 gap-y-1">
        {choices.map((choice) => (
          <label key={choice} className="inline-flex min-h-11 items-center gap-2 text-base">
            <input
              type="checkbox"
              className="size-5 accent-brand"
              checked={selected.includes(choice)}
              onChange={(event) =>
                onChange({ ...draft, [field]: event.target.checked ? [...selected, choice] : selected.filter((value) => value !== choice) })
              }
            />
            {chipLabel(field, choice)}
          </label>
        ))}
      </div>
    );
  }
  if (field === "followUpStyle" || field === "responseSpeed") {
    const options = field === "followUpStyle" ? FOLLOW_UP_STYLES : RESPONSE_SPEEDS;
    return (
      <select id={id} className={`${inputClass} max-w-xs`} value={draft[field]} onChange={(event) => onChange({ ...draft, [field]: event.target.value })}>
        <option value="">Not stated</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {chipLabel(field, option)}
          </option>
        ))}
      </select>
    );
  }
  if (field === "maxLeadsPerWeek") {
    return (
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={50}
        className={`${inputClass} max-w-32`}
        value={draft.maxLeadsPerWeek}
        onChange={(event) => onChange({ ...draft, maxLeadsPerWeek: event.target.value })}
      />
    );
  }
  if (field === "sellingStyle" || field === "availabilityText") {
    return <input id={id} type="text" className={inputClass} value={draft[field]} onChange={(event) => onChange({ ...draft, [field]: event.target.value })} />;
  }
  const textField = field as "storyKeywords" | "buyerTypesClick" | "strengths" | "avoidNotes" | "doNotMention" | "languages";
  return (
    <>
      <textarea
        id={id}
        rows={3}
        className={inputClass}
        value={draft[textField]}
        onChange={(event) => onChange({ ...draft, [textField]: event.target.value })}
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="mt-1 text-[15px] text-muted">
        {field === "languages" ? "One per line, like: spanish (native)" : LIST_FIELDS.has(field) ? "One per line." : null}
      </p>
    </>
  );
}

export function PersonaTagsPanel({ brokerId, view }: { brokerId: string; view: PersonaTagsView }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(view.effective));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const status = STATUS[view.status];

  async function send(body: { set?: Record<string, unknown>; clear?: PersonaTagField[] }, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      const next = await apiRequest<PersonaTagsView>(`/v1/admin/brokers/${brokerId}/persona-tags`, { method: "PATCH", body });
      setDraft(toDraft(next.effective));
      setEditing(false);
      setMessage({ tone: "success", text: done });
      router.refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Couldn't save the tags." });
    }
    setBusy(false);
  }

  async function save() {
    const set: Record<string, unknown> = {};
    for (const field of PERSONA_TAG_FIELDS) {
      const value = fromDraft(field, draft, view.effective);
      if (!sameValue(value, view.effective[field])) set[field] = value;
    }
    if (Object.keys(set).length === 0) {
      setEditing(false);
      return;
    }
    await send({ set }, "Overrides saved. They win over what Claude extracts.");
  }

  async function reextract() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await apiRequest<{ outcome: string; view: PersonaTagsView }>(`/v1/admin/brokers/${brokerId}/persona-tags/refresh`, { method: "POST" });
      setDraft(toDraft(result.view.effective));
      setMessage(
        result.outcome === "updated"
          ? { tone: "success", text: "Tags extracted again from the persona." }
          : { tone: "error", text: result.view.extractionError ?? "Nothing to extract." },
      );
      router.refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Couldn't re-extract the tags." });
    }
    setBusy(false);
  }

  return (
    <section aria-labelledby="persona-tags-title" className="flex flex-col rounded-2xl border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="persona-tags-title" className="text-xl font-bold">
            Matching tags
          </h2>
          <Pill tone={status.tone}>{status.label}</Pill>
        </div>
        <p className="text-[15px] text-muted">
          {view.extractedAt ? `Extracted ${formatDate(view.extractedAt)}${view.extractionModel ? ` · ${view.extractionModel}` : ""}` : "Never extracted"}
        </p>
      </div>
      <div className="space-y-4 px-6 py-5">
        <p className="text-[15px] text-muted">
          Pulled from the persona by Claude and used to match leads. {status.help} Values marked “Override” were set by an admin and always win.
        </p>
        {!view.aiConfigured ? (
          <p className="rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-base font-semibold text-warn">
            ANTHROPIC_API_KEY isn&apos;t set on the API, so tags can&apos;t be extracted. Overrides still work.
          </p>
        ) : null}
        {view.extractionError ? <FormMessage tone="error">Last extraction error: {view.extractionError}</FormMessage> : null}
        <dl className="divide-y divide-line">
          {PERSONA_TAG_FIELDS.map((field) => {
            const overridden = Object.prototype.hasOwnProperty.call(view.overrides, field);
            return (
              <div key={field} className="grid gap-2 py-3 sm:grid-cols-[180px_1fr]">
                <dt className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-muted">
                  {editing && field !== "backgroundTags" && !CHOICE_FIELDS[field] ? <label htmlFor={`tag-${field}`}>{FIELD_LABELS[field]}</label> : FIELD_LABELS[field]}
                  {overridden ? <span className="rounded-md bg-brand-soft px-2 py-0.5 text-[13px] font-bold text-brand">Override</span> : null}
                </dt>
                <dd className="min-w-0 space-y-2">
                  {editing ? <FieldEditor field={field} draft={draft} onChange={setDraft} /> : <TagValue field={field} tags={view.effective} />}
                  {overridden && !editing ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => send({ clear: [field] }, `${FIELD_LABELS[field]} now uses the extracted value.`)}
                      className="min-h-11 rounded-lg px-2 text-[15px] font-semibold text-brand underline underline-offset-2 hover:bg-brand-soft disabled:opacity-60"
                    >
                      Use extracted<span className="sr-only"> value for {FIELD_LABELS[field]}</span>
                    </button>
                  ) : null}
                </dd>
              </div>
            );
          })}
        </dl>
        {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-6 py-4">
        {editing ? (
          <>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setDraft(toDraft(view.effective));
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save overrides"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={reextract} disabled={busy || !view.aiConfigured || view.status === "no_persona"}>
              {busy ? "Working…" : "Re-extract"}
            </Button>
            <Button
              onClick={() => {
                setDraft(toDraft(view.effective));
                setEditing(true);
              }}
              disabled={busy}
            >
              Edit tags
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
