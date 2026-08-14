/** Sidebar / maintenance access rules for authenticated staff (non-member). */

import { canAccessC168AutoRenew, canAccessC168DomainPages } from "../company/loginScope.js";
import {
  companyMatchesBankOnlyPillScope,
  resolveCompanyCategoryFlags,
} from "../company/companyCategoryFlags.js";
import { findOwnerCompanyById, readPersistedDashboardGcFilter } from "../company/sharedCompanyFilter.js";
import { spaPath } from "../routing/pageRoutes.js";

export function normRole(role) {
  return String(role || "").trim().toLowerCase();
}

export function isOwnerUser(me) {
  return normRole(me?.role) === "owner";
}

export function getUserPermissions(me) {
  return Array.isArray(me?.permissions) ? me.permissions : [];
}

/** Empty permissions array = unrestricted (owner / legacy). */
export function hasFullPermissions(me) {
  return getUserPermissions(me).length === 0;
}

export function roleSupportsOwnershipPermission(role) {
  const r = normRole(role);
  return r === "owner" || r === "partnership";
}

export function canAccessPermission(me, key) {
  if (key === "ownership" && !roleSupportsOwnershipPermission(me?.role)) return false;
  if (hasFullPermissions(me)) return true;
  return getUserPermissions(me).includes(key);
}

export function canAccessFullMaintenance(me) {
  if (isOwnerUser(me) || hasFullPermissions(me)) return true;
  return canAccessPermission(me, "maintenance");
}

/**
 * Non-owner without Maintenance permission: sidebar still shows Transaction + Formula under Maintenance.
 */
export function canAccessLimitedMaintenance(me) {
  if (isOwnerUser(me) || hasFullPermissions(me)) return false;
  if (canAccessFullMaintenance(me)) return false;
  return !!(me?.company_has_gambling || me?.company_has_bank);
}

export function showMaintenanceInSidebar(me) {
  return canAccessFullMaintenance(me) || canAccessLimitedMaintenance(me);
}

/** Transaction / Formula maintenance pages (limited path for non-owner). */
export function canAccessTransactionFormulaMaintenance(me) {
  return canAccessFullMaintenance(me) || canAccessLimitedMaintenance(me);
}

/**
 * Capture maintenance: only when Maintenance permission is granted (full menu).
 * Limited path (Supervisor and below without Maintenance) keeps Transaction + Formula only —
 * never Capture, including Bank companies and Group ↔ company switches.
 */
export function canAccessCaptureMaintenance(me) {
  return canAccessFullMaintenance(me);
}

export function canAccessDashboard(me) {
  return canAccessPermission(me, "home");
}

/**
 * Sidebar Report: visible for pure Group, Games companies, and C168.
 * Hidden only when the active filter company is Bank-only (e.g. C2).
 * Prefer persisted GC filter over stale session `me` after Group ↔ Bank switches.
 */
export function canShowReportInSidebar(me) {
  if (!me) return false;
  if (!canAccessPermission(me, "report")) return false;

  const filter = readPersistedDashboardGcFilter();
  if (filter.groupOnly && filter.selectedGroup) return true;

  const cid =
    filter.companyId != null && filter.companyId !== "" ? Number(filter.companyId) : Number.NaN;
  if (Number.isFinite(cid) && cid > 0) {
    const row = findOwnerCompanyById(cid);
    if (row && companyMatchesBankOnlyPillScope(row)) return false;
    const flags = resolveCompanyCategoryFlags(row);
    if (flags?.hasGambling) return true;
    const code = String(row?.company_id || me.company_code || "")
      .trim()
      .toUpperCase();
    if (code === "C168") return true;
    // Known subsidiary with neither Games nor C168 → hide (Bank / empty).
    if (flags) return false;
  }

  if (me.company_has_gambling) return true;
  const code = String(me.company_code || "").trim().toUpperCase();
  return code === "C168" || Boolean(me.is_current_company_c168);
}

/**
 * First SPA route after login — mirrors sidebar order in AuthenticatedLayout.
 * @returns {string|null} spaPath result, or null when no staff page is accessible
 */
export function resolveDefaultLandingPath(me) {
  if (!me) return spaPath("login");

  const userType = String(me.user_type || "").toLowerCase();
  if (userType === "member") return spaPath("member");

  if (canAccessDashboard(me)) return spaPath("dashboard");
  if (canAccessC168DomainPages(me)) return spaPath("domain");
  if (canAccessC168AutoRenew(me)) return spaPath("auto-renew");
  if (canAccessPermission(me, "admin")) return spaPath("userlist");
  if (canAccessPermission(me, "account")) return spaPath("account-list");
  if (canAccessPermission(me, "ownership")) return spaPath("ownership");
  if (canAccessPermission(me, "process")) {
    return me?.company_has_bank && !me?.company_has_gambling
      ? spaPath("bank-process-list")
      : spaPath("process-list");
  }
  if (canAccessPermission(me, "datacapture") && (me?.company_has_gambling || me?.company_has_bank)) {
    return spaPath("datacapture");
  }
  if (canAccessPermission(me, "payment")) return spaPath("transaction");
  if (canShowReportInSidebar(me)) {
    return spaPath("customer-report");
  }
  if (canAccessFullMaintenance(me)) return spaPath("payment-maintenance");
  if (canAccessLimitedMaintenance(me)) return spaPath("transaction-maintenance");

  return null;
}
