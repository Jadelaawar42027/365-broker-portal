/**
 * File: apps/web/src/app/app/(main)/layout.tsx
 * Purpose: The broker header from mockups 1b and 1d (logo, navigation, avatar menu) around the checklist, welcome,
 * training and help pages. On phones the header stacks into three rows like the mobile mockups.
 *
 * Functions:
 * - BrokerMainLayout({ children }): renders the header and the page.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLockup } from "@/components/brand/logo";
import { BrokerNav, UserMenu } from "@/components/broker/broker-nav";
import { requireMe } from "@/lib/server-api";

export default async function BrokerMainLayout({ children }: { children: ReactNode }) {
  const me = await requireMe();
  return (
    <>
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-20 lg:py-3.5">
          <Link href="/app" className="self-start rounded-lg" aria-label="365 Yachts, my onboarding">
            <BrandLockup />
          </Link>
          <BrokerNav trainingOpen={me.broker?.status === "active"} />
          <UserMenu name={me.user.name} />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[1096px] px-5 pt-8 pb-16 lg:pt-11">
        {children}
      </main>
    </>
  );
}
