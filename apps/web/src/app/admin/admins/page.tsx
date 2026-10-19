/**
 * File: apps/web/src/app/admin/admins/page.tsx
 * Purpose: The Admins tab: everyone who can use the admin panel (the owner and every admin), whether each has created
 * their login yet, and the button to add a new admin by email invite (SPEC D7).
 *
 * Functions:
 * - AdminsPage(): loads the admin list and renders the table.
 */
import type { AdminListResponse } from "@bp/shared";
import type { Metadata } from "next";
import { AddAdminButton, ResendAdminInvite } from "@/components/admin/admin-accounts";
import { Avatar } from "@/components/ui/misc";
import { Pill } from "@/components/ui/pill";
import { formatDate } from "@/lib/format";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Admins · 365 Yachts admin" };

export default async function AdminsPage() {
  const { data } = await serverGet<AdminListResponse>("/v1/admin/admins");
  if (!data) throw new Error("Could not load admins.");
  const pending = data.admins.filter((admin) => !admin.hasLogin).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[35px] leading-tight font-extrabold tracking-tight">Admins</h1>
          <p className="mt-1 text-[17px] text-muted">
            {data.admins.length} {data.admins.length === 1 ? "person" : "people"} can use the admin panel
            {pending ? ` · ${pending} invite${pending === 1 ? "" : "s"} pending` : ""}
          </p>
        </div>
        <AddAdminButton />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <caption className="sr-only">Admins</caption>
          <thead className="bg-[#f2f5fa] text-[15px] font-semibold text-muted">
            <tr>
              <th scope="col" className="px-4 py-4">Name</th>
              <th scope="col" className="px-3 py-4">Email</th>
              <th scope="col" className="px-3 py-4">Role</th>
              <th scope="col" className="px-3 py-4">Login</th>
              <th scope="col" className="px-3 py-4">Added</th>
              <th scope="col" className="px-4 py-4">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="text-base">
            {data.admins.map((admin) => (
              <tr key={admin.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <span className="flex min-h-11 items-center gap-3 font-bold text-ink">
                    <Avatar name={admin.name} tone="soft" size="sm" />
                    {admin.name}
                  </span>
                </td>
                <td className="px-3 py-3 break-all">{admin.email}</td>
                <td className="px-3 py-3">{admin.role === "owner" ? "Owner" : "Admin"}</td>
                <td className="px-3 py-3">
                  {admin.hasLogin ? <Pill tone="success">Active</Pill> : <Pill tone="warning">Invite pending</Pill>}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">{formatDate(admin.createdAt)}</td>
                <td className="px-4 py-3 text-right">{admin.hasLogin ? null : <ResendAdminInvite adminId={admin.id} name={admin.name} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
