import { spaPath } from "../../../utils/routing/pageRoutes.js";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { fetchCompanyPermissionsForDataCapture } from "./dataCaptureApi.js";
import { canUseGroupOnlyMode } from "../../../utils/company/loginScope.js";
import { isGroupLedgerCapture } from "../../../utils/company/c168CaptureChannel.js";

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
  const perms = Array.isArray(sessionUser?.company_permissions)
    ? sessionUser.company_permissions
    : [];
  if (perms.length > 0) return true;
  if (sessionUser?.company_has_gambling === true) return true;
  if (sessionUser?.company_has_bank === true) return true;
  return false;
}

/** Session may use Data Capture when group/company has Games (incl. aggregated group flags). */
export function sessionUserHasGamblingAccess(sessionUser) {
  if (sessionUser?.company_has_gambling === true) return true;
  return permissionsIncludeGames(sessionUser?.company_permissions);
}

export async function fetchCompanyHasGamesCategory(companyCode) {
  if (!companyCode) return false;
  try {
    const result = await fetchCompanyPermissionsForDataCapture(companyCode);
    const perms =
      result.success && result.data && Array.isArray(result.data.permissions)
        ? result.data.permissions
        : [];
    return permissionsIncludeGames(perms);
  } catch {
    return false;
  }
}

export async function syncDataCaptureCompanySession(companyId) {
  const response = await fetch(
    buildApiUrl(`api/session/update_company_session_api.php?company_id=${companyId}`),
    { credentials: "include" }
  );
  return response.json();
}

/** @returns {Promise<boolean>} true when company may use Data Capture */
export async function resolveCompanyGamesAccess({ companyId, companyCode, sessionUser }) {
  if (sessionUserHasGamblingAccess(sessionUser)) return true;

  const numericId = Number(companyId);
  if (!Number.isFinite(numericId) || numericId <= 0) return false;

  try {
    const syncJson = await syncDataCaptureCompanySession(numericId);
    if (syncJson.success && syncJson.data && syncJson.data.has_gambling === false) {
      return false;
    }
    if (syncJson.success && syncJson.data && syncJson.data.has_gambling === true) {
      return true;
    }
  } catch {
    /* fall through to permissions API */
  }

  return fetchCompanyHasGamesCategory(companyCode);
}

export function isGroupCaptureScope(captureScope, sessionProcessData = null) {
  return isGroupLedgerCapture(captureScope, sessionProcessData);
}

/** Summary page access: group ledger users or company with Games category. */
export async function resolveSummaryPageAccess({
  captureScope,
  companyId,
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

  return resolveCompanyGamesAccess({ companyId, companyCode, sessionUser });
}
