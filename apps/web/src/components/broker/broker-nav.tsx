/**
 * File: apps/web/src/components/broker/broker-nav.tsx
 * Purpose: The broker header's navigation (My onboarding, Training with a lock, Help) with the current page
 * highlighted, and the avatar menu with "Sign out".
 *
 * Functions:
 * - BrokerNav(): the three navigation links, marking the active one with aria-current.
 * - UserMenu({ name }): the avatar and name button that opens a small menu with "Sign out".
 * - signOut(): ends the session through Better Auth and returns to /login.
 */
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LockIcon } from "@/components/ui/icons";
import { Avatar } from "@/components/ui/misc";
import { apiRequest } from "@/lib/api-client";

const LINKS = [
  { href: "/app", label: "My onboarding", locked: false },
  { href: "/app/training", label: "Training", locked: true },
  { href: "/app/help", label: "Help", locked: false },
];

export function BrokerNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-wrap gap-1">
      {LINKS.map((link) => {
        const active = link.href === "/app" ? pathname === "/app" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl px-5 text-lg font-semibold transition-colors ${
              active ? "bg-brand-soft text-navy" : link.locked ? "text-[#5f6f86] hover:bg-page" : "text-navy hover:bg-page"
            }`}
          >
            {link.locked ? <LockIcon className="size-4" /> : null}
            {link.label}
            {link.locked ? <span className="sr-only">(locked until onboarding is done)</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function UserMenu({ name }: { name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  async function signOut() {
    await apiRequest("/api/auth/sign-out", { method: "POST", body: {} }).catch(() => null);
    router.replace("/login");
    router.refresh();
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 items-center gap-3 rounded-xl pr-2 text-lg font-semibold text-navy hover:bg-page"
      >
        <Avatar name={name} />
        {name}
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-line bg-white p-1.5 shadow-lg">
          <button type="button" role="menuitem" onClick={signOut} className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-base font-semibold text-navy hover:bg-page">
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
