/**
 * File: apps/web/src/app/page.tsx
 * Purpose: Phase A placeholder home page that proves the app, fonts and theme work. Phase D replaces it
 * with a redirect to /login, /app or /admin depending on who is signed in.
 *
 * Functions:
 * - HomePage(): renders the 365 Yachts brand mark and a short holding message.
 */
import { PRODUCT_NAME } from "@bp/shared";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-4">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-navy text-sm font-extrabold text-white">
          365
        </span>
        <span className="text-lg font-bold tracking-[0.2em] text-navy">365 YACHTS</span>
      </div>
      <h1 className="text-4xl font-extrabold text-navy">{PRODUCT_NAME}</h1>
      <p className="text-lg text-muted">The broker portal is being built. Check back soon.</p>
    </main>
  );
}
