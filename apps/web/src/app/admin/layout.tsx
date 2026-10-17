/**
 * File: apps/web/src/app/admin/layout.tsx
 * Purpose: The admin shell from mockups 3a-3d: a navy sidebar with the brand, navigation and signed-in admin, and the
 * page area. Brokers are sent to /app (the API refuses them on every /v1/admin route as well).
 *
 * Functions:
 * - AdminLayout({ children }): checks the role, loads the review count for the badge, and renders the shell.
 */
import type { ReviewListItem } from "@bp/shared";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AdminNav, AdminUser } from "@/components/admin/admin-nav";
import { BrandLockup } from "@/components/brand/logo";
import { requireMe, serverGet } from "@/lib/server-api";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const me = await requireMe();
  if (me.user.role === "broker") redirect("/app");
  const { data } = await serverGet<{ reviews: ReviewListItem[] }>("/v1/admin/reviews");
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="bg-navy">
        <div className="flex flex-col gap-5 px-3 py-5 lg:sticky lg:top-0 lg:h-dvh lg:gap-8 lg:py-6">
        <Link href="/admin" className="self-start rounded-lg px-2" aria-label="365 Yachts admin overview">
          <BrandLockup tone="light" sublabel="Admin" size="sm" />
        </Link>
        <AdminNav waitingReviews={data?.reviews.length ?? 0} />
        <div className="lg:mt-auto">
          <AdminUser name={me.user.name} role={me.user.role === "owner" ? "Owner" : "Admin"} />
        </div>
        </div>
      </aside>
      <main id="main" className="px-5 py-8 lg:px-9 lg:py-10">
        {children}
      </main>
    </div>
  );
}
