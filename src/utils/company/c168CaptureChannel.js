/**
 * Company payroll capture channel: group payroll UI (SALARY/COMMISSION/BONUS/PROFIT),
 * company-scoped data — not AP/IG group ledger. Applies to C168 and bank-only companies.
 */
import {
  companyMatchesBankOnlyPillScope,
} from "./companyCategoryFlags.js";
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

export function isBankOnlyCompanyRow(row) {
  return companyMatchesBankOnlyPillScope(row);
}

/** Session user is bank-only (has Bank, no Games/Gambling). */
export function isBankOnlySessionUser(me) {
  return Boolean(me?.company_has_bank && !me?.company_has_gambling);
}

/** Company sync payload allows bank-only Data Capture / group payroll channel. */
export function syncDataIsBankOnlyPayrollCompany(syncData) {
  if (!syncData || typeof syncData !== "object") return false;
  return Boolean(syncData.has_bank && !syncData.has_gambling);
}

/**
 * C168-only: hide Process List entry (C168 uses Data Capture payroll UI instead).
 * Bank-only companies use bank-process-list — do not redirect them here.
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

/**
 * Active dashboard/Data Capture context uses company payroll UI (C168 or bank-only).
 * Not group-only AP/IG ledger.
 */
export function isCompanyPayrollCaptureChannel(me, companyRow = null) {
  if (isC168GroupCaptureChannel(me, companyRow)) return true;
  if (isDashboardGroupOnlyMode()) return false;
  if (companyRow && isBankOnlyCompanyRow(companyRow)) return true;
  if (isBankOnlySessionUser(me)) return true;
  const filter = readPersistedDashboardGcFilter();
  if (filter.groupOnly || filter.companyId == null) return false;
  const cached = findOwnerCompanyById(filter.companyId);
  if (cached && isBankOnlyCompanyRow(cached)) return true;
  return false;
}

/** Group payroll UI — includes true group-only (AP/IG) and company payroll channel. */
export function isGroupPayrollUi(groupLedgerScope, companyPayrollChannel) {
  return Boolean(groupLedgerScope || companyPayrollChannel);
}

/**
 * Data writes to group ledger (AP/IG) — false for C168 / bank-only company payroll channel.
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

/** Session uses group payroll form (group ledger or company payroll channel). */
export function isGroupPayrollCaptureSession(processData) {
  if (!processData) return false;
  if (processData.groupPayrollCapture === true) return true;
  if (processData.groupPayrollUi === true) return true;
  return processData.groupOnlyCapture === true;
}

/**
 * Draft / prefs bucket — company payroll channel uses company id; AP group-only uses group code.
 * @returns {{ bucket: string, serverSync: boolean, prefsKey: string }}
 */
export function resolvePayrollDraftBucket({
  c168Channel,
  companyPayrollChannel,
  companyId,
  selectedGroup,
}) {
  const channel = companyPayrollChannel ?? c168Channel;
  if (channel) {
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
