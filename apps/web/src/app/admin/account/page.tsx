/**
 * File: apps/web/src/app/admin/account/page.tsx
 * Purpose: The signed-in admin's profile: who they are and, for the company signer, the company signature used to
 * countersign every broker's Broker Agreement and NDA (SPEC D31).
 *
 * Functions:
 * - AdminAccountPage(): loads the admin and the company signature status and renders the page.
 */
import type { CompanySignatureStatus } from "@bp/shared";
import type { Metadata } from "next";
import { CompanySignatureSetup } from "@/components/admin/company-signature-setup";
import { requireMe, serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Your profile · 365 Yachts admin" };

export default async function AdminAccountPage() {
  const me = await requireMe();
  const { data: status } = await serverGet<CompanySignatureStatus>("/v1/admin/company-signature");
  return (
    <div className="max-w-[880px] space-y-6">
      <div>
        <h1 className="text-[35px] leading-tight font-extrabold tracking-tight">Your profile</h1>
        <p className="mt-1 text-[17px] text-muted">
          {me.user.name} · {me.user.email}
        </p>
      </div>
      <section aria-labelledby="company-signature-title" className="space-y-4 rounded-2xl border border-line bg-white px-6 py-6">
        <div>
          <h2 id="company-signature-title" className="text-xl font-bold">
            Company signature
          </h2>
          <p className="mt-1 text-[17px] text-muted">Applied for 365 Yachts Inc. to every broker&apos;s Broker Agreement and NDA as soon as the broker signs.</p>
        </div>
        {status ? <CompanySignatureSetup status={status} /> : null}
      </section>
    </div>
  );
}
