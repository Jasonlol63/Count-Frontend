/**
 * C168 company channel: group payroll UI template, company-scoped data (not AP group ledger).
 */
import {
  findOwnerCompanyById,
  isDashboardGroupOnlyMode,
  readPersistedDashboardGcFilter,
} from "./sharedCompanyFilter.js";

export const C168_COMPANY_CODE = "C168";

export function isC168CompanyCode(code) {
  return String(code ?? "").trim().toUpperCase() === C168_COMPANY_CODE;
}

export function isC168CompanyRow(row) {
  if (!row) return false;
  return isC168CompanyCode(row.company_id);
}

/**
 * Active dashboard/Data Capture context is company C168 (not group-only AP/IG ledger).
 */
export function isC168GroupCaptureChannel(me, companyRow = null) {
  if (isDashboardGroupOnlyMode()) return false;
  if (companyRow && isC168CompanyRow(companyRow)) return true;
  if (me?.is_current_company_c168) return true;
  const filter = readPersistedDashboardGcFilter();
  if (filter.groupOnly || filter.companyId == null) return false;
  const cached = findOwnerCompanyById(filter.companyId);
  if (cached && isC168CompanyRow(cached)) return true;
  return isC168CompanyCode(me?.company_code);
}

/** Group payroll UI (SALARY/BONUS table) — includes true group-only and C168 channel. */
export function isGroupPayrollUi(groupLedgerScope, c168Channel) {
  return Boolean(groupLedgerScope || c168Channel);
}

/**
 * Data writes to group ledger (AP/IG) — false for C168 company payroll channel.
 */
export function isGroupLedgerCapture(scope, processMeta = null) {
  if (processMeta?.groupPayrollCapture === true) return false;
  if (
    processMeta?.groupPayrollUi === true &&
    String(processMeta?.captureScopeMode || "").toLowerCase() === "company"
  ) {
    return false;
  }
  if (scope?.mode === "group") {
    if (String(processMeta?.captureScopeMode || "").toLowerCase() === "company") {
      return false;
    }
    return true;
  }
  return (
    processMeta?.groupOnlyCapture === true &&
    String(processMeta?.captureScopeMode || "").toLowerCase() !== "company"
  );
}

/** Session uses group payroll form (group ledger or C168 company channel). */
export function isGroupPayrollCaptureSession(processData) {
  if (!processData) return false;
  if (processData.groupPayrollCapture === true) return true;
  if (processData.groupPayrollUi === true) return true;
  return processData.groupOnlyCapture === true;
}

/**
 * Draft / prefs bucket — C168 uses company id; AP group-only uses group code.
 * @returns {{ bucket: string, serverSync: boolean, prefsKey: string }}
 */
export function resolvePayrollDraftBucket({ c168Channel, companyId, selectedGroup }) {
  if (c168Channel) {
    const id = Number(companyId);
    if (Number.isFinite(id) && id > 0) {
      const tag = `company:${id}`;
      return { bucket: tag, serverSync: false, prefsKey: tag };
    }
  }
  const g = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
  return { bucket: g, serverSync: Boolean(g), prefsKey: g };
}

export function payrollDraftBucketIsCompany(bucket) {
  return String(bucket || "").startsWith("company:");
}
