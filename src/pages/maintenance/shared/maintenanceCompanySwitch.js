import {
  applySidebarForCompanySwitch,
  resolveMaintenanceRedirectForSession,
} from "../../../utils/company/sidebarCompanySwitch.js";
import { peekCompanySessionFlags } from "../../../utils/company/companySessionFlagsCache.js";

/**
 * Sync PHP session + sidebar flags on maintenance page boot (persisted company filter).
 * Skips redundant session API when PHP session + cache already match.
 */
export async function syncMaintenanceBootSidebar({
  companyRow,
  viewGroup,
  updateSessionCompany,
  sessionCompanyId = null,
}) {
  if (!companyRow?.id || typeof updateSessionCompany !== "function") return null;
  const cid = Number(companyRow.id);
  if (!Number.isFinite(cid) || cid <= 0) return null;

  const cached = peekCompanySessionFlags(cid);
  const sessionMatches =
    sessionCompanyId != null &&
    Number(sessionCompanyId) === cid &&
    cached?.company_id === cid;

  if (sessionMatches) {
    applySidebarForCompanySwitch(viewGroup, companyRow, {
      company_id: cid,
      company_code: cached.company_code,
      has_gambling: cached.has_gambling,
      has_bank: cached.has_bank,
    });
    return cached;
  }

  try {
    const sessionData = await updateSessionCompany(cid);
    applySidebarForCompanySwitch(viewGroup, companyRow, sessionData);
    return sessionData;
  } catch {
    applySidebarForCompanySwitch(viewGroup, companyRow, null);
    return null;
  }
}

/**
 * Sync PHP session + sidebar flags, then redirect if company category mismatches current maintenance route.
 * @returns {{ redirected: boolean, sessionData: object|null }}
 */
export async function runMaintenanceCompanySwitch({
  companyRow,
  viewGroup,
  currentPath,
  navigate,
  updateSessionCompany,
  onStay,
}) {
  if (!companyRow?.id) return { redirected: false, sessionData: null };

  const sessionData = await updateSessionCompany(companyRow.id);
  const vg =
    viewGroup ??
    (companyRow.group_id ? String(companyRow.group_id).trim().toUpperCase() : null);

  applySidebarForCompanySwitch(vg, companyRow, sessionData);

  const redirect = resolveMaintenanceRedirectForSession(sessionData, currentPath);
  if (redirect) {
    navigate(redirect, { replace: true });
    return { redirected: true, sessionData, redirectTo: redirect };
  }

  if (onStay) {
    await onStay(sessionData);
  }
  return { redirected: false, sessionData };
}
