import { spaPath } from "../../../utils/routing/pageRoutes.js";
import { syncCompanySessionApi } from "../../../utils/company/companySessionSync.js";
import { peekCompanySessionFlags } from "../../../utils/company/companySessionFlagsCache.js";
import { sessionHasTenantBank, sessionHasTenantGame } from "../../../utils/auth/sessionTenant.js";
import { fetchTenantCategoryPermissions } from "./dataCaptureSpringApi.js";
import { canUseGroupOnlyMode } from "../../../utils/company/loginScope.js";
import {
  isBankOnlySessionUser,
  isGroupLedgerCapture,
  syncDataIsBankOnlyPayrollCompany,
} from "../../../utils/company/c168CaptureChannel.js";
import { companyMatchesBankOnlyPillScope } from "../../../utils/company/companyCategoryFlags.js";

/** Home route when the active company has no Games / Gambling category. */
export const DATA_CAPTURE_HOME_PATH = spaPath("dashboard");

export function permissionsIncludeGames(permissions) {
  return (
    Array.isArray(permissions) &&
    (permissions.includes("Games") || permissions.includes("Gambling"))
  );
}

/** Session has any company category (direct row or aggregated group flags). */
export function sessionUserHasCompanyCategoryAccess(sessionUser) {
  if (sessionHasTenantGame(sessionUser) || sessionHasTenantBank(sessionUser)) return true;
  const perms = Array.isArray(sessionUser?.company_permissions)
    ? sessionUser.company_permissions
    : [];
  if (perms.length > 0) return true;
  if (sessionUser?.company_has_gambling === true) return true;
  if (sessionUser?.company_has_bank === true) return true;
  return false;
}

/** Session may use Data Capture when tenant has Games or bank-only payroll channel. */
export function sessionUserHasGamblingAccess(sessionUser) {
  if (sessionHasTenantGame(sessionUser) || sessionUser?.company_has_gambling === true) return true;
  return permissionsIncludeGames(sessionUser?.company_permissions);
}

/** Bank-only company uses company payroll Data Capture (same UI as C168). */
export function sessionUserHasBankOnlyPayrollAccess(sessionUser) {
  return isBankOnlySessionUser(sessionUser);
}

/** Data Capture page: Games/Gambling or bank-only payroll channel. */
export function sessionUserHasDataCapturePageAccess(sessionUser) {
  return (
    sessionUserHasGamblingAccess(sessionUser) ||
    sessionUserHasBankOnlyPayrollAccess(sessionUser)
  );
}

export function companyRowHasBankOnlyPayrollAccess(companyRow) {
  return companyMatchesBankOnlyPillScope(companyRow);
}

export function syncDataAllowsDataCaptureAccess(syncData) {
  if (!syncData) return false;
  if (syncData.has_gambling === true || syncData.has_game === true) return true;
  return syncDataIsBankOnlyPayrollCompany(syncData);
}

export async function fetchCompanyHasGamesCategory(tenantId) {
  const tid = Number(tenantId);
  if (!tid) return false;
  try {
    const result = await fetchTenantCategoryPermissions(tid);
    const perms =
      result.success && result.data && Array.isArray(result.data.permissions)
        ? result.data.permissions
        : [];
    return permissionsIncludeGames(perms);
  } catch {
    return false;
  }
}

/** Switch session tenant — Spring POST `/auth/switch-tenant`. */
export async function syncDataCaptureCompanySession(tenantId) {
  return syncCompanySessionApi(Number(tenantId));
}

function tenantFlagsAllowDataCapture(tenantId) {
  const flags = peekCompanySessionFlags(Number(tenantId));
  if (!flags) return null;
  if (flags.has_gambling) return true;
  return Boolean(flags.has_bank && !flags.has_gambling);
}

/** @returns {Promise<boolean>} true when tenant may use Data Capture */
export async function resolveCompanyGamesAccess({
  companyId,
  tenantId = null,
  companyCode,
  sessionUser,
  companyRow = null,
}) {
  if (sessionUserHasDataCapturePageAccess(sessionUser)) return true;
  if (companyRow && companyRowHasBankOnlyPayrollAccess(companyRow)) return true;

  const numericId = Number(tenantId ?? companyId);
  if (!Number.isFinite(numericId) || numericId <= 0) return false;

  const cached = tenantFlagsAllowDataCapture(numericId);
  if (cached === true) return true;
  if (cached === false) {
    const flags = peekCompanySessionFlags(numericId);
    return Boolean(flags?.has_bank && !flags?.has_gambling);
  }

  try {
    const syncJson = await syncDataCaptureCompanySession(numericId);
    if (syncJson.success && syncJson.data && syncDataAllowsDataCaptureAccess(syncJson.data)) {
      return true;
    }
    if (syncJson.success && syncJson.data && syncJson.data.has_gambling === false) {
      if (syncDataAllowsDataCaptureAccess(syncJson.data)) return true;
      return false;
    }
  } catch {
    /* fall through to permissions API */
  }

  if (await fetchCompanyHasGamesCategory(numericId)) return true;

  try {
    const result = await fetchTenantCategoryPermissions(numericId);
    const perms =
      result.success && result.data && Array.isArray(result.data.permissions)
        ? result.data.permissions
        : [];
    const hasBank = perms.includes("Bank");
    const hasGames = permissionsIncludeGames(perms);
    return hasBank && !hasGames;
  } catch {
    return false;
  }
}

export function isGroupCaptureScope(captureScope, sessionProcessData = null) {
  return isGroupLedgerCapture(captureScope, sessionProcessData);
}

/** Summary page access: group ledger users or company with Games category. */
export async function resolveSummaryPageAccess({
  captureScope,
  companyId,
  tenantId = null,
  companyCode,
  sessionUser,
  sessionProcessData = null,
  hasStoredCaptureSession = false,
}) {
  if (hasStoredCaptureSession) return true;

  if (isGroupCaptureScope(captureScope, sessionProcessData)) {
    const groupKey =
      captureScope?.groupId || sessionProcessData?.captureSelectedGroup || null;
    if (canUseGroupOnlyMode(sessionUser, groupKey ? String(groupKey) : null)) {
      return true;
    }
  }

  if (sessionUserHasBankOnlyPayrollAccess(sessionUser)) return true;

  return resolveCompanyGamesAccess({
    companyId,
    tenantId,
    companyCode,
    sessionUser,
  });
}
