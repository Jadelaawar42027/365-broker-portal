/**
 * File: apps/web/src/components/admin/integrations-panel.tsx
 * Purpose: The "Integrations" panel on the admin overview (3a, phase H2): one row each for Google Workspace and
 * GoHighLevel saying whether it is configured (and if not, what is missing), how many account tasks are waiting or
 * failed, and a "Test connection" button that makes one harmless read call and shows the answer in place.
 *
 * Functions:
 * - IntegrationsPanel({ data }): renders the panel.
 * - IntegrationRow({ system }): one system's status, details and test button.
 * - test(): runs the connection test and shows its result.
 */
"use client";

import type { IntegrationStatus, IntegrationsResponse, IntegrationTestResponse } from "@bp/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { apiRequest, ApiError } from "@/lib/api-client";

function IntegrationRow({ system }: { system: IntegrationStatus }) {
  const [result, setResult] = useState<IntegrationTestResponse | null>(null);
  const [busy, setBusy] = useState(false);

  async function test() {
    setBusy(true);
    setResult(null);
    try {
      setResult(await apiRequest<IntegrationTestResponse>(`/v1/admin/integrations/${system.system}/test`, { method: "POST", body: {} }));
    } catch (caught) {
      setResult({ ok: false, message: caught instanceof ApiError ? caught.message : "The test didn't run. Try again." });
    }
    setBusy(false);
  }

  const counts = [system.openTasks ? `${system.openTasks} waiting` : null, system.failedTasks ? `${system.failedTasks} failed` : null].filter(Boolean).join(" · ");
  return (
    <li className="border-b border-line px-6 py-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[17px] font-bold">{system.label}</p>
          <p className="text-[15px] text-muted">{system.configured ? [system.details, counts].filter(Boolean).join(" · ") || "Ready" : system.problem}</p>
        </div>
        <div className="flex items-center gap-3">
          <Pill tone={system.configured ? "success" : "neutral"}>{system.configured ? "Configured" : "Not configured"}</Pill>
          {system.configured ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void test()}>
              {busy ? "Testing…" : "Test connection"}
              <span className="sr-only"> to {system.label}</span>
            </Button>
          ) : null}
        </div>
      </div>
      {result ? (
        <p role="status" className={`mt-2 text-[15px] font-semibold ${result.ok ? "text-success" : "text-danger"}`}>
          {result.message}
        </p>
      ) : null}
    </li>
  );
}

export function IntegrationsPanel({ data }: { data: IntegrationsResponse }) {
  return (
    <section aria-labelledby="integrations-title" className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="border-b border-line px-6 py-5">
        <h2 id="integrations-title" className="text-xl font-bold">
          Integrations
        </h2>
        <p className="mt-1 text-[15px] text-muted">New brokers get a 365 email and a GoHighLevel user automatically once both are configured.</p>
      </div>
      <ul>
        {data.systems.map((system) => (
          <IntegrationRow key={system.system} system={system} />
        ))}
      </ul>
    </section>
  );
}
