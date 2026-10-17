/**
 * File: apps/web/src/components/admin/persona-panel.tsx
 * Purpose: The Persona panel on the broker profile (3c), in place of the training column (docs/SPEC.md): a large
 * Markdown editor with a preview, pre-filled from the persona template when empty, showing who last edited it. Admins
 * only; leaving with unsaved changes asks first.
 *
 * Functions:
 * - PersonaPanel({ brokerId, brokerName, persona }): the editor, preview and save.
 * - MarkdownPreview({ markdown }): renders the persona's headings, paragraphs and lists as plain text elements.
 */
"use client";

import type { BrokerProfileResponse } from "@bp/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { personaTemplate } from "@/lib/content";
import { formatDate } from "@/lib/format";
import { parseMarkdownBlocks } from "@/lib/markdown";
import { apiRequest, ApiError } from "@/lib/api-client";

function MarkdownPreview({ markdown }: { markdown: string }) {
  const blocks = parseMarkdownBlocks(markdown);
  if (blocks.length === 0) return <p className="text-lg text-muted">Nothing written yet.</p>;
  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const size = block.level === 1 ? "text-2xl" : block.level === 2 ? "text-lg" : "text-base";
          return (
            <p key={index} role="heading" aria-level={block.level + 2} className={`${size} font-extrabold`}>
              {block.text}
            </p>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={index} className="list-disc space-y-1 pl-6 text-base leading-relaxed">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index} className="text-base leading-relaxed text-ink">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

export function PersonaPanel({
  brokerId,
  brokerName,
  persona,
}: {
  brokerId: string;
  brokerName: string;
  persona: BrokerProfileResponse["persona"];
}) {
  const router = useRouter();
  const saved = persona.markdown ?? "";
  const [text, setText] = useState(saved || personaTemplate(brokerName));
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = text !== (saved || personaTemplate(brokerName));

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save() {
    setBusy(true);
    setStatus(null);
    try {
      await apiRequest(`/v1/admin/brokers/${brokerId}/persona`, { method: "PUT", body: { markdown: text } });
      setStatus({ tone: "success", text: "Persona saved." });
      router.refresh();
    } catch (caught) {
      setStatus({ tone: "error", text: caught instanceof ApiError ? caught.message : "Couldn't save the persona." });
    }
    setBusy(false);
  }

  return (
    <section aria-labelledby="persona-title" className="flex flex-col rounded-2xl border border-line bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-6 py-5">
        <h2 id="persona-title" className="text-xl font-bold">
          Persona
        </h2>
        <p className="text-[15px] text-muted">
          {persona.updatedAt
            ? `Last edited by ${persona.updatedByName ?? "an admin"} on ${formatDate(persona.updatedAt)}`
            : persona.markdown
              ? "Not edited in the portal yet"
              : "Not written yet"}
        </p>
      </div>
      <div className="flex-1 space-y-4 px-6 py-5">
        <p className="text-[15px] text-muted">Admins only — brokers never see this. Used to match leads with brokers who share their background.</p>
        <div role="tablist" aria-label="Persona view" className="inline-flex rounded-xl border border-line p-1">
          {(["write", "preview"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              aria-controls="persona-body"
              onClick={() => setTab(value)}
              className={`min-h-10 rounded-lg px-4 text-base font-semibold capitalize ${tab === value ? "bg-navy text-white" : "text-navy hover:bg-page"}`}
            >
              {value}
            </button>
          ))}
        </div>
        <div id="persona-body" role="tabpanel">
          {tab === "write" ? (
            <>
              <label htmlFor="persona-text" className="sr-only">
                Persona for {brokerName}
              </label>
              <textarea
                id="persona-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={20}
                spellCheck
                className="block min-h-[520px] w-full rounded-xl border border-[#cdd5e1] px-4 py-3 text-base leading-relaxed focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/25"
              />
            </>
          ) : (
            <div className="min-h-[520px] rounded-xl border border-line bg-page px-5 py-4">
              <MarkdownPreview markdown={text} />
            </div>
          )}
        </div>
        {status ? <FormMessage tone={status.tone}>{status.text}</FormMessage> : null}
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
        {dirty ? <span className="text-[15px] text-muted">Unsaved changes</span> : null}
        <Button onClick={save} disabled={busy || !dirty}>
          {busy ? "Saving…" : "Save persona"}
        </Button>
      </div>
    </section>
  );
}
