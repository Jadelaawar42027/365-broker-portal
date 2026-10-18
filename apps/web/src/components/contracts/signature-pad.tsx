/**
 * File: apps/web/src/components/contracts/signature-pad.tsx
 * Purpose: The signature pad used for contract signing (SPEC D31): draw with a finger, mouse or pen, or type a name
 * that is rendered in a handwriting font. Either way it produces a transparent PNG (cropped to the ink) that is
 * stamped onto the documents. Also used by the company signer to set up her signature.
 *
 * Functions:
 * - SignaturePad({ label, typedDefault, onChange }): the pad with Draw / Type tabs; reports a PNG data URL (or null) and the method.
 * - DrawPad({ onChange }): the canvas you draw on, with Clear.
 * - TypePad({ defaultName, onChange }): the name box with its rendered signature.
 * - cropToInk(canvas): a PNG data URL of the canvas cropped to the drawn area with a small margin, or null when empty.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { signatureFont } from "@/lib/fonts";
import { inputClasses } from "@/components/ui/misc";

const INK = "#0a1f3d";
type Method = "drawn" | "typed";

function cropToInk(canvas: HTMLCanvasElement): string | null {
  const context = canvas.getContext("2d");
  if (!context) return null;
  const { width, height } = canvas;
  const pixels = context.getImageData(0, 0, width, height).data;
  let top = height;
  let left = width;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3]! > 16) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return null;
  const margin = 8;
  const crop = document.createElement("canvas");
  crop.width = Math.min(width, right - left + margin * 2);
  crop.height = Math.min(height, bottom - top + margin * 2);
  crop.getContext("2d")!.drawImage(canvas, Math.max(0, left - margin), Math.max(0, top - margin), crop.width, crop.height, 0, 0, crop.width, crop.height);
  return crop.toDataURL("image/png");
}

function DrawPad({ onChange }: { onChange: (png: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(canvas.clientWidth * ratio);
    canvas.height = Math.floor(canvas.clientHeight * ratio);
    const context = canvas.getContext("2d")!;
    context.scale(ratio, ratio);
    context.lineWidth = 2.6;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = INK;
  }, []);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        aria-label="Signature drawing area. Draw your signature with your finger, mouse or pen."
        role="img"
        className="block h-[180px] w-full touch-none rounded-xl border-2 border-dashed border-[#c5d3e8] bg-white"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drawing.current = true;
          last.current = point(event);
        }}
        onPointerMove={(event) => {
          if (!drawing.current || !last.current) return;
          const context = event.currentTarget.getContext("2d")!;
          const next = point(event);
          context.beginPath();
          context.moveTo(last.current.x, last.current.y);
          context.lineTo(next.x, next.y);
          context.stroke();
          last.current = next;
        }}
        onPointerUp={() => {
          drawing.current = false;
          last.current = null;
          if (canvasRef.current) onChange(cropToInk(canvasRef.current));
        }}
        onPointerCancel={() => {
          drawing.current = false;
          last.current = null;
        }}
      />
      <div className="flex items-center justify-between">
        <p className="text-[15px] text-muted">Sign inside the box.</p>
        <button type="button" onClick={clear} className="min-h-11 rounded-lg px-3 text-base font-semibold text-brand">
          Clear
        </button>
      </div>
    </div>
  );
}

function TypePad({ defaultName, onChange }: { defaultName: string; onChange: (png: string | null) => void }) {
  const [name, setName] = useState(defaultName);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const family = signatureFont.style.fontFamily;
    document.fonts
      .load(`600 64px ${family}`)
      .catch(() => null)
      .then(() => {
        if (cancelled) return;
        canvas.width = 900;
        canvas.height = 200;
        const context = canvas.getContext("2d")!;
        context.clearRect(0, 0, canvas.width, canvas.height);
        const text = name.trim();
        if (!text) return onChange(null);
        let size = 96;
        context.font = `600 ${size}px ${family}`;
        while (context.measureText(text).width > canvas.width - 40 && size > 32) {
          size -= 4;
          context.font = `600 ${size}px ${family}`;
        }
        context.fillStyle = INK;
        context.textBaseline = "middle";
        context.fillText(text, 20, canvas.height / 2);
        onChange(cropToInk(canvas));
      });
    return () => {
      cancelled = true;
    };
  }, [name, onChange]);

  return (
    <div className="space-y-3">
      <label htmlFor="typed-signature" className="block text-[15px] font-bold">
        Type your full name
      </label>
      <input id="typed-signature" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className={inputClasses()} />
      <div className="flex h-[120px] items-center overflow-hidden rounded-xl border-2 border-dashed border-[#c5d3e8] bg-white px-4">
        <canvas ref={canvasRef} aria-hidden="true" className="h-full w-full object-contain" />
      </div>
    </div>
  );
}

export function SignaturePad({ label, typedDefault, onChange }: { label: string; typedDefault: string; onChange: (value: { png: string; method: Method } | null) => void }) {
  const [method, setMethod] = useState<Method>("drawn");
  const [drawn, setDrawn] = useState<string | null>(null);
  const [typed, setTyped] = useState<string | null>(null);

  useEffect(() => {
    const png = method === "drawn" ? drawn : typed;
    onChange(png ? { png, method } : null);
  }, [method, drawn, typed, onChange]);

  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-lg font-bold">{label}</legend>
      <div role="tablist" aria-label="How to sign" className="inline-flex rounded-xl border border-line bg-page p-1">
        {(["drawn", "typed"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={method === option}
            onClick={() => setMethod(option)}
            className={`min-h-11 rounded-lg px-4 text-base font-semibold ${method === option ? "bg-white text-navy shadow-sm" : "text-muted"}`}
          >
            {option === "drawn" ? "Draw" : "Type"}
          </button>
        ))}
      </div>
      <div hidden={method !== "drawn"}>
        <DrawPad onChange={setDrawn} />
      </div>
      <div hidden={method !== "typed"}>
        <TypePad defaultName={typedDefault} onChange={setTyped} />
      </div>
    </fieldset>
  );
}
