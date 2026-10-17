/**
 * File: apps/web/src/app/page.tsx
 * Purpose: The site root. Sends brokers to their checklist, admins to the admin overview, and everyone else to sign in.
 *
 * Functions:
 * - HomePage(): redirects based on who is signed in.
 */
import { redirect } from "next/navigation";
import { optionalMe } from "@/lib/server-api";

export default async function HomePage() {
  const me = await optionalMe();
  if (!me) redirect("/login");
  redirect(me.user.role === "broker" ? "/app" : "/admin");
}
