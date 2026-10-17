/**
 * File: apps/web/src/app/app/layout.tsx
 * Purpose: Guard for every broker screen under /app: signed-out visitors go to /login and admins go to /admin.
 * The API checks permissions again on every request; this only sends people to the right place.
 *
 * Functions:
 * - BrokerAreaLayout({ children }): checks the signed-in user's role, then renders the page.
 */
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireMe } from "@/lib/server-api";

export default async function BrokerAreaLayout({ children }: { children: ReactNode }) {
  const me = await requireMe();
  if (me.user.role !== "broker" || !me.broker) redirect("/admin");
  return children;
}
