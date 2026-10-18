/**
 * File: apps/web/src/components/admin/account-status.tsx
 * Purpose: How a provisioned account's status looks (phase H2): the pill tone for each status, and the two small
 * labelled status marks (G for Google Workspace, GHL for GoHighLevel) in the brokers table (3b). Colour is never the
 * only signal: each mark carries a symbol and a screen-reader label.
 *
 * Functions:
 * - accountStatusTone(status): the pill tone for an account status.
 * - AccountStatusMarks({ accounts }): the G and GHL marks with their status as a symbol, a tooltip and hidden text.
 */
import { ACCOUNT_STATUS_LABELS, PROVISIONING_SYSTEM_LABELS, type AccountStatus, type ProvisioningSystem } from "@bp/shared";
import type { PillTone } from "@/components/ui/pill";

export function accountStatusTone(status: AccountStatus): PillTone {
  if (status === "created") return "success";
  if (status === "failed") return "danger";
  if (status === "pending") return "warning";
  if (status === "suspended") return "neutral";
  return "brand-soft";
}

const MARK_STYLES: Record<AccountStatus, { symbol: string; classes: string }> = {
  created: { symbol: "✓", classes: "bg-success-soft text-success" },
  pending: { symbol: "…", classes: "bg-warn-soft text-warn" },
  failed: { symbol: "!", classes: "bg-danger-soft text-danger border border-danger-line" },
  suspended: { symbol: "–", classes: "bg-neutral-soft text-muted" },
  not_set_up: { symbol: "○", classes: "bg-page text-muted border border-line" },
  not_configured: { symbol: "·", classes: "bg-page text-muted border border-dashed border-line" },
};

const SHORT_NAMES: Record<ProvisioningSystem, string> = { google: "G", ghl: "GHL" };

export function AccountStatusMarks({ accounts }: { accounts: Record<ProvisioningSystem, AccountStatus> | undefined }) {
  if (!accounts) return <span className="text-muted">—</span>;
  return (
    <span className="flex items-center gap-1.5">
      {(["google", "ghl"] as const).map((system) => {
        const status = accounts[system];
        const style = MARK_STYLES[status];
        const label = `${PROVISIONING_SYSTEM_LABELS[system]}: ${ACCOUNT_STATUS_LABELS[status]}`;
        return (
          <span key={system} title={label} className={`inline-flex h-7 items-center gap-1 rounded-full px-2 text-[13px] font-bold whitespace-nowrap ${style.classes}`}>
            <span aria-hidden="true">
              {SHORT_NAMES[system]} {style.symbol}
            </span>
            <span className="sr-only">{label}</span>
          </span>
        );
      })}
    </span>
  );
}
