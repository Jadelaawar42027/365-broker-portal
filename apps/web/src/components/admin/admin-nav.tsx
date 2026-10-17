/**
 * File: apps/web/src/components/admin/admin-nav.tsx
 * Purpose: The admin sidebar's links (Overview, Brokers, Reviews with the waiting count, Chapters & quizzes) with the
 * current section highlighted, and the signed-in admin with "Sign out".
 *
 * Functions:
 * - AdminNav({ waitingReviews }): the navigation list.
 * - AdminUser({ name, role }): the avatar, name and role at the bottom of the sidebar, opening a "Sign out" menu.
 * - signOut(): ends the session and returns to /login.
 */
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/misc";
import { apiRequest } from "@/lib/api-client";

export function AdminNav({ waitingReviews }: { waitingReviews: number }) {
  const pathname = usePathname();
  const links = [
    { href: "/admin", label: "Overview", active: pathname === "/admin" },
    { href: "/admin/brokers", label: "Brokers", active: pathname.startsWith("/admin/brokers") },
    { href: "/admin/reviews", label: "Reviews", active: pathname.startsWith("/admin/reviews"), badge: waitingReviews },
    { href: "/admin/training", label: "Chapters & quizzes", active: pathname.startsWith("/admin/training") },
  ];
  return (
    <nav aria-label="Admin" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={link.active ? "page" : undefined}
          className={`flex min-h-11 shrink-0 items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-[17px] font-semibold whitespace-nowrap transition-colors ${
            link.active ? "bg-navy-soft text-white" : "text-[#dfe6f1] hover:bg-white/5"
          }`}
        >
          {link.label}
          {link.badge ? (
            <span className="grid min-w-7 place-items-center rounded-full bg-[#f5a623] px-2 py-0.5 text-sm font-bold text-navy tabular-nums">
              {link.badge}
              <span className="sr-only"> waiting</span>
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

export function AdminUser({ name, role }: { name: string; role: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) setOpen(false);
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
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl p-1 text-left hover:bg-white/5"
      >
        <Avatar name={name} tone="white" size="sm" />
        <span className="leading-tight">
          <span className="block text-base font-bold text-white">{name}</span>
          <span className="block text-sm text-[#c9d3e3]">{role}</span>
        </span>
      </button>
      {open ? (
        <div role="menu" className="absolute bottom-full left-0 z-20 mb-2 w-48 rounded-xl border border-line bg-white p-1.5 shadow-lg">
          <button type="button" role="menuitem" onClick={signOut} className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-base font-semibold text-navy hover:bg-page">
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
