import { useEffect, useMemo, useState } from "react";
import { fetchOwnerCompaniesAll } from "../../../utils/company/sharedCompanyFilter.js";
import { isGroupLedgerCapture } from "../../../utils/company/c168CaptureChannel.js";
import { resolveDataCaptureTenantId } from "../../datacapture/lib/dataCaptureTenant.js";

export function normalizeCompanyRow(row) {
  if (!row || typeof row !== "object") return row;
  return {
    ...row,
    group_id: row.group_id ?? row.groupId ?? row.group ?? null,
    company_id: row.company_id ?? row.companyId ?? row.code ?? "",
  };
}

export function isVirtualGroupLinkCompanyRow(c) {
  const ls = c?.link_source_group ?? c?.linkSourceGroup;
  return ls != null && String(ls).trim() !== "";
}

/**
 * `groupOnlyAccountMode` only changes the picker UI (single fixed "the group itself" row
 * instead of a multi-company picker) — the Group is a first-class tenant (`tenant.id`,
 * resolved via `groupEntityTenantId`), so both branches call the same Spring `/api/account/*`
 * + `/api/currency/*` endpoints against `ctx.tenantId`.
 *
 * Shared by both `useSummaryAddAccount` and `useSummaryEditAccount` — Add and Edit must resolve
 * the exact same tenant/scope for a given capture session, or a saved account could silently
 * end up scoped to the wrong company/group.
 */
export function resolveSummaryAccountLedgerContext(captureScope, processData, companyId) {
  const isGroupLedger = isGroupLedgerCapture(captureScope, processData);

  const groupId = String(captureScope?.groupId || processData?.captureSelectedGroup || "")
    .trim()
    .toUpperCase();

  if (isGroupLedger && groupId) {
    const tenantId = resolveDataCaptureTenantId(captureScope);
    return {
      groupOnlyAccountMode: true,
      selectedGroup: groupId,
      companyId: null,
      tenantId,
    };
  }

  const cid = companyId != null && Number(companyId) > 0 ? Number(companyId) : null;
  return {
    groupOnlyAccountMode: false,
    selectedGroup: groupId || null,
    companyId: cid,
    tenantId: cid,
  };
}

export function canOpenSummaryAccountModal(ctx) {
  if (ctx.groupOnlyAccountMode) return Boolean(ctx.tenantId);
  return ctx.companyId != null && Number(ctx.companyId) > 0;
}

/**
 * Company/group picker rows for the shared `AccountModal` company picker, for a given ledger
 * context. Used identically by Add and Edit — both must offer the same picker options.
 */
export function useSummaryAccountPickerCompanies(ledgerCtx) {
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    if (ledgerCtx.groupOnlyAccountMode || !ledgerCtx.companyId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchOwnerCompaniesAll();
        if (!cancelled && rows.length) {
          setCompanies(rows.map(normalizeCompanyRow));
        }
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ledgerCtx.groupOnlyAccountMode, ledgerCtx.companyId]);

  const groupPickerCompanies = useMemo(() => {
    if (!ledgerCtx.groupOnlyAccountMode || !ledgerCtx.tenantId) return [];
    // `id` is the group code (matches AccountModal's groupPickerMode picker_value, which reads
    // group_id/id — same shape AccountListPage.jsx uses for its own group picker rows).
    return [{ id: ledgerCtx.selectedGroup, company_id: ledgerCtx.selectedGroup, group_id: ledgerCtx.selectedGroup }];
  }, [ledgerCtx]);

  const companyButtons = useMemo(
    () =>
      companies.filter(
        (c) => c.company_id && String(c.company_id).trim() !== "" && !isVirtualGroupLinkCompanyRow(c),
      ),
    [companies],
  );

  const modalPickerCompanies = ledgerCtx.groupOnlyAccountMode ? groupPickerCompanies : companyButtons;

  return { modalPickerCompanies };
}
