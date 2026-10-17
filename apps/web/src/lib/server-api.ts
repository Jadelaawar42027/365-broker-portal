/**
 * File: apps/web/src/lib/server-api.ts
 * Purpose: How server components read from the API: calls the Fastify service directly on API_INTERNAL_URL,
 * forwarding the visitor's cookies, and sends people to /login when their session is gone.
 *
 * Functions:
 * - apiBaseUrl(): the API address for server-side calls.
 * - serverGet(path): GETs JSON with the visitor's cookies; redirects to /login on 401; returns { status, data }.
 * - requireMe(): returns the signed-in user from /v1/me (once per request), or redirects to /login.
 * - publicGet(path): GETs JSON without cookies (invite and reset links); returns { status, data, message }.
 * - optionalMe(): returns the signed-in user, or null when nobody is signed in (never redirects).
 */
import type { MeResponse } from "@bp/shared";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

function apiBaseUrl(): string {
  return (process.env.API_INTERNAL_URL ?? "http://localhost:4000").replace(/\/+$/, "");
}

export async function serverGet<T>(path: string): Promise<{ status: number; data: T | null }> {
  const cookieHeader = (await cookies()).toString();
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login");
  if (!response.ok) return { status: response.status, data: null };
  return { status: response.status, data: (await response.json()) as T };
}

export const requireMe = cache(async (): Promise<MeResponse> => {
  const { data } = await serverGet<MeResponse>("/v1/me");
  if (!data) redirect("/login");
  return data;
});

export async function publicGet<T>(path: string): Promise<{ status: number; data: T | null; message: string | null }> {
  const response = await fetch(`${apiBaseUrl()}${path}`, { cache: "no-store" });
  const body = (await response.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!response.ok) return { status: response.status, data: null, message: body?.message ?? null };
  return { status: response.status, data: body, message: null };
}

export async function optionalMe(): Promise<MeResponse | null> {
  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader) return null;
  const response = await fetch(`${apiBaseUrl()}/v1/me`, { headers: { cookie: cookieHeader }, cache: "no-store" });
  return response.ok ? ((await response.json()) as MeResponse) : null;
}
