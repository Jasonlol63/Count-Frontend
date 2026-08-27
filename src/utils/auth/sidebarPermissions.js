/** Sidebar / maintenance access rules for authenticated staff (non-member). */

import { canAccessC168AutoRenew, canAccessC168DomainPages } from "../company/loginScope.js";
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
  return r === "owner" || r === "partnership" || r === "admin";
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
 * Sidebar Report visibility — computed server-side once per session/tenant-switch
 * (backend/src/main/java/com/eazycount/security/SessionUser.java `menu.report`) from the
 * authenticated tenant's own REPORT permission + GAME feature gate. This used to be
 * re-derived here from sessionStorage-persisted dashboard filter state, which could go
 * stale across page navigations (e.g. a leftover selected-company id would silently hide
 * Report for single-group logins). Trust the backend value instead.
 */
export function canShowReportInSidebar(me) {
  if (!me) return false;
  if (!canAccessPermission(me, "report")) return false;
  return Boolean(me?.menu?.report);
}

/**
 * Sidebar Data Capture visibility — same rationale as {@link canShowReportInSidebar}:
 * backend computes `menu.dataCapture` from DATACAPTURE permission + tenant GAME/BANK
 * feature flags, instead of the frontend re-deriving it from `company_has_gambling` /
 * `company_has_bank`, which could be stale after switching pages (e.g. Ownership page's
 * owner-company cache invalidation).
 */
export function canShowDataCaptureInSidebar(me) {
  if (!me) return false;
  if (!canAccessPermission(me, "datacapture")) return false;
  return Boolean(me?.menu?.dataCapture);
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
  if (canShowDataCaptureInSidebar(me)) {
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
