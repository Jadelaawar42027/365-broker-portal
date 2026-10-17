/**
 * File: apps/web/src/components/admin/broker-filters.tsx
 * Purpose: The controls above the brokers table (3b): search (name, email or persona text), the All / Active /
 * Onboarding / Inactive switch and the level menu. Filters live in the URL so a filtered view can be shared or bookmarked.
 *
 * Functions:
 * - BrokerFilters({ search, status, level }): renders the controls and updates the URL as they change.
 * - hrefWith(changes): builds the /admin/brokers URL with the current filters plus the given changes.
 * - ExportCsvButton({ rows }): downloads the rows currently shown as brokers.csv.
 */
"use client";

import type { BrokerListRow } from "@bp/shared";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { buildBrokersCsv } from "@/lib/csv";

const STATUSES = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "onboarding", label: "Onboarding" },
  { value: "inactive", label: "Inactive" },
];

export function BrokerFilters({ search, status, level }: { search: string; status: string; level: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [text, setText] = useState(search);

  function hrefWith(changes: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  useEffect(() => {
    if (text.trim() === search) return;
    const timer = setTimeout(() => router.replace(hrefWith({ search: text.trim() }), { scroll: false }), 300);
    return () => clearTimeout(timer);
  });

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <label htmlFor="broker-search" className="sr-only">
        Search by name, email or persona
      </label>
      <input
        id="broker-search"
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Search by name, email or persona…"
        autoComplete="off"
        spellCheck={false}
        className="min-h-12 flex-1 rounded-xl border border-[#cdd5e1] bg-white px-4 text-[17px] placeholder:text-[#6b7a90] focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/25"
      />
      <nav aria-label="Filter by status" className="flex rounded-xl border border-line bg-white p-1">
        {STATUSES.map((option) => {
          const active = status === option.value;
          return (
            <Link
              key={option.label}
              href={hrefWith({ status: option.value })}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-10 items-center rounded-lg px-4 text-base font-semibold ${active ? "bg-navy text-white" : "text-navy hover:bg-page"}`}
            >
              {option.label}
            </Link>
          );
        })}
      </nav>
      <label htmlFor="broker-level" className="sr-only">
        Level
      </label>
      <select
        id="broker-level"
        value={level}
        onChange={(event) => router.replace(hrefWith({ level: event.target.value }), { scroll: false })}
        className="min-h-12 rounded-xl border border-line bg-white px-4 text-base font-semibold text-navy"
      >
        <option value="">All levels</option>
        <option value="junior">Junior</option>
        <option value="senior">Senior</option>
      </select>
    </div>
  );
}

export function ExportCsvButton({ rows }: { rows: BrokerListRow[] }) {
  return (
    <Button
      variant="outline"
      size="lg"
      onClick={() => {
        const url = URL.createObjectURL(new Blob([buildBrokersCsv(rows)], { type: "text/csv" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "brokers.csv";
        link.click();
        URL.revokeObjectURL(url);
      }}
    >
      Export CSV
    </Button>
  );
}
