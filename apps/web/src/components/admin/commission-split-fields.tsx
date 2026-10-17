/**
 * File: apps/web/src/components/admin/commission-split-fields.tsx
 * Purpose: The two commission split inputs used when inviting a broker and on their profile: the broker's share of
 * in-house lead deals and of self-generated deals, each a whole percentage with the house share shown live.
 *
 * Functions:
 * - CommissionSplitFields({ idPrefix, inHouseSplit, selfGeneratedSplit }): the fieldset with both inputs (form names inHouseSplit and selfGeneratedSplit).
 * - SplitInput({ id, name, label, defaultValue }): one percentage input with its "House keeps N%" line.
 * - readSplits(form): reads both splits from submitted form data as numbers.
 */
"use client";

import { useState } from "react";
import { FieldLabel, inputClasses } from "@/components/ui/misc";

function SplitInput({ id, name, label, defaultValue }: { id: string; name: string; label: string; defaultValue: number | null }) {
  const [value, setValue] = useState(defaultValue === null ? "" : String(defaultValue));
  const broker = Number(value);
  const valid = value !== "" && Number.isInteger(broker) && broker >= 0 && broker <= 100;
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <input
          id={id}
          name={name}
          type="number"
          inputMode="numeric"
          required
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="off"
          aria-describedby={`${id}-house`}
          className={`${inputClasses()} appearance-none pr-12 tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]`}
        />
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[17px] font-semibold text-muted">
          %
        </span>
      </div>
      <p id={`${id}-house`} aria-live="polite" className="mt-1.5 text-[15px] text-muted">
        {valid ? `Broker ${broker}% · house keeps ${100 - broker}%` : "Broker's share, 0 to 100"}
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
        <SplitInput id={`${idPrefix}-in-house`} name="inHouseSplit" label="In-house leads" defaultValue={inHouseSplit} />
        <SplitInput id={`${idPrefix}-self-generated`} name="selfGeneratedSplit" label="Self-generated deals" defaultValue={selfGeneratedSplit} />
      </div>
    </fieldset>
  );
}

export function readSplits(form: FormData): { inHouseSplit: number; selfGeneratedSplit: number } {
  return { inHouseSplit: Number(form.get("inHouseSplit")), selfGeneratedSplit: Number(form.get("selfGeneratedSplit")) };
}
