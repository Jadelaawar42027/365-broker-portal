/**
 * File: apps/web/src/components/contracts/pdf-viewer.tsx
 * Purpose: A mobile-friendly PDF viewer built on pdf.js (SPEC D31): renders every page of a PDF at the width of its
 * container (sharp on high-density screens), with zoom out, zoom in and "fit width" buttons, inside a scrollable frame.
 * Used for the live previews of the Broker Agreement and NDA. pdf.js is loaded only in the browser.
 *
 * Functions:
 * - PdfViewer({ url, title, onLoaded }): fetches the PDF at url and renders it; calls onLoaded once the first page is drawn.
 * - renderPages(pdf, container, width): draws each page into a canvas sized for the container width and zoom.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { FormMessage } from "@/components/auth/form-message";

const ZOOM_STEPS = [0.75, 1, 1.25, 1.5, 2] as const;

type PdfDocument = { numPages: number; getPage(number: number): Promise<PdfPage>; destroy(): Promise<void> };
type PdfPage = {
  getViewport(options: { scale: number }): { width: number; height: number };
  render(options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number }; transform?: number[] }): { promise: Promise<void> };
};

async function renderPages(pdf: PdfDocument, container: HTMLDivElement, width: number): Promise<void> {
  container.replaceChildren();
  const ratio = window.devicePixelRatio || 1;
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    canvas.className = "mx-auto block rounded-md bg-white shadow-sm";
    canvas.setAttribute("aria-label", `Page ${number} of ${pdf.numPages}`);
    canvas.setAttribute("role", "img");
    container.appendChild(canvas);
    const context = canvas.getContext("2d");
    if (!context) continue;
    await page.render({ canvasContext: context, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] }).promise;
  }
}

export function PdfViewer({ url, title, onLoaded }: { url: string; title: string; onLoaded?: () => void }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [zoomIndex, setZoomIndex] = useState(1);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const onLoadedRef = useRef(onLoaded);

  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);

  useEffect(() => {
    let cancelled = false;
    let loaded: PdfDocument | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const response = await fetch(url, { credentials: "same-origin" });
        if (!response.ok) throw new Error(`Preview failed (${response.status})`);
        const data = new Uint8Array(await response.arrayBuffer());
        loaded = (await pdfjs.getDocument({ data }).promise) as unknown as PdfDocument;
        if (cancelled) return void loaded.destroy();
        setStatus("loading");
        setPdf(loaded);
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      void loaded?.destroy();
    };
  }, [url]);

  useEffect(() => {
    if (!pdf || !frameRef.current || !pagesRef.current) return;
    let cancelled = false;
    const width = Math.max(240, frameRef.current.clientWidth - 24) * ZOOM_STEPS[zoomIndex]!;
    renderPages(pdf, pagesRef.current, width)
      .then(() => {
        if (cancelled) return;
        setStatus("ready");
        onLoadedRef.current?.();
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [pdf, zoomIndex]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[15px] text-muted" aria-live="polite">
          {status === "loading" ? "Loading the document…" : status === "ready" ? "Scroll to read every page." : ""}
        </p>
        <div className="flex gap-1.5" role="group" aria-label={`Zoom for ${title}`}>
          <button type="button" onClick={() => setZoomIndex((index) => Math.max(0, index - 1))} disabled={zoomIndex === 0} aria-label="Zoom out" className="grid size-11 place-items-center rounded-lg border border-line bg-white text-lg font-bold disabled:opacity-40">
            −
          </button>
          <button type="button" onClick={() => setZoomIndex(1)} className="min-h-11 rounded-lg border border-line bg-white px-3 text-[15px] font-semibold">
            Fit
          </button>
          <button type="button" onClick={() => setZoomIndex((index) => Math.min(ZOOM_STEPS.length - 1, index + 1))} disabled={zoomIndex === ZOOM_STEPS.length - 1} aria-label="Zoom in" className="grid size-11 place-items-center rounded-lg border border-line bg-white text-lg font-bold disabled:opacity-40">
            +
          </button>
        </div>
      </div>
      {status === "error" ? <FormMessage tone="error">The document couldn&apos;t be shown. Reload the page to try again.</FormMessage> : null}
      <div ref={frameRef} role="region" aria-label={`${title} preview`} className="max-h-[70vh] overflow-auto rounded-xl border border-line bg-page p-3 overscroll-contain">
        <div ref={pagesRef} className="space-y-3" />
      </div>
    </div>
  );
}
