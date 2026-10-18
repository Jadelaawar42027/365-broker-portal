/**
 * File: apps/web/src/components/admin/commission-split-fields.tsx
 * Purpose: The two commission split inputs used when inviting a broker and when changing their split (SPEC D29). Each
 * is a dropdown of the manual's tiers (in-house leads 30, 40, 50; self-generated deals 30 to 80) plus "Custom %",
 * which opens a whole-number box. The value is the broker's share; the house share is shown, never entered.
 *
 * Functions:
 * - CommissionSplitFields({ idPrefix, inHouseSplit, selfGeneratedSplit }): the fieldset with both inputs (form names inHouseSplit and selfGeneratedSplit).
 * - SplitSelect({ id, name, label, tiers, defaultValue }): one dropdown with its Custom % box and "house keeps" line.
 * - readPct(value): a submitted percentage as a number, or NaN when empty (so the API rejects it instead of reading 0).
 * - readSplits(form): reads both splits from submitted form data as numbers.
 */
"use client";

import { houseShare, IN_HOUSE_TIERS, isTierValue, SELF_GENERATED_TIERS } from "@bp/shared";
import { useState } from "react";
import { FieldLabel, inputClasses, selectClasses } from "@/components/ui/misc";

const CUSTOM = "custom";

function SplitSelect({ id, name, label, tiers, defaultValue }: { id: string; name: string; label: string; tiers: readonly number[]; defaultValue: number | null }) {
  const [choice, setChoice] = useState(defaultValue === null ? "" : isTierValue(tiers, defaultValue) ? String(defaultValue) : CUSTOM);
  const [custom, setCustom] = useState(defaultValue !== null && !isTierValue(tiers, defaultValue) ? String(defaultValue) : "");
  const raw = choice === CUSTOM ? custom : choice;
  const broker = Number(raw);
  const valid = raw !== "" && Number.isInteger(broker) && broker >= 0 && broker <= 100;

  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <select id={id} required value={choice} onChange={(event) => setChoice(event.target.value)} aria-describedby={`${id}-house`} className={selectClasses()}>
        <option value="" disabled>
          Choose a split
        </option>
        {tiers.map((tier) => (
          <option key={tier} value={String(tier)}>
            {tier}% broker · {houseShare(tier)}% house
          </option>
        ))}
        <option value={CUSTOM}>Custom %</option>
      </select>
      {choice === CUSTOM ? (
        <div className="relative mt-2">
          <label htmlFor={`${id}-custom`} className="sr-only">
            {label}: custom broker percentage
          </label>
          <input
            id={`${id}-custom`}
            type="number"
            inputMode="numeric"
            required
            min={0}
            max={100}
            step={1}
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            autoComplete="off"
            className={`${inputClasses()} appearance-none pr-12 tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]`}
          />
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[17px] font-semibold text-muted">
            %
          </span>
        </div>
      ) : null}
      <input type="hidden" name={name} value={valid ? String(broker) : ""} />
      <p id={`${id}-house`} aria-live="polite" className="mt-1.5 text-[15px] text-muted">
        {valid ? `Broker ${broker}% · house keeps ${houseShare(broker)}%` : choice === CUSTOM ? "Broker's share, 0 to 100" : "The broker's share of the commission"}
      </p>
    </div>
  );
}

export function CommissionSplitFields({
  idPrefix,
  inHouseSplit = null,
  selfGeneratedSplit = null,
}: {
  idPrefix: string;
  inHouseSplit?: number | null;
  selfGeneratedSplit?: number | null;
}) {
  return (
    <fieldset>
      <legend className="mb-3 block text-[15px] font-bold">Commission · broker&apos;s share</legend>
      <div className="grid gap-5 sm:grid-cols-2">
        <SplitSelect id={`${idPrefix}-in-house`} name="inHouseSplit" label="In-house leads" tiers={IN_HOUSE_TIERS} defaultValue={inHouseSplit} />
        <SplitSelect id={`${idPrefix}-self-generated`} name="selfGeneratedSplit" label="Self-generated deals" tiers={SELF_GENERATED_TIERS} defaultValue={selfGeneratedSplit} />
      </div>
    </fieldset>
  );
}

function readPct(value: FormDataEntryValue | null): number {
  const text = String(value ?? "").trim();
  return text === "" ? Number.NaN : Number(text);
}

export function readSplits(form: FormData): { inHouseSplit: number; selfGeneratedSplit: number } {
  return { inHouseSplit: readPct(form.get("inHouseSplit")), selfGeneratedSplit: readPct(form.get("selfGeneratedSplit")) };
}
