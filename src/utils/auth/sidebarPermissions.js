/** Sidebar / maintenance access rules for authenticated staff (non-member). */

export function normRole(role) {
  return String(role || "").trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
}

const ROLE_DISPLAY_LABELS = {
  owner: "Owner",
  partnership: "Partnership",
  admin: "Admin",
  manager: "Manager",
  supervisor: "Supervisor",
  accountant: "Accountant",
  audit: "Audit",
  "customer service": "Customer Service",
  company: "Company",
};

/** Title-case role label for UI (handles CUSTOMER_SERVICE / customer_service). */
export function formatRoleLabel(role) {
  const normalized = normRole(role);
  if (ROLE_DISPLAY_LABELS[normalized]) return ROLE_DISPLAY_LABELS[normalized];
  if (!normalized) return "";
  return normalized.replace(/\b\w/g, (c) => c.toUpperCase());
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

export function canAccessPermission(me, key) {
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
  return !!me?.tenant_has_game;
}

export function showMaintenanceInSidebar(me) {
  return canAccessFullMaintenance(me) || canAccessLimitedMaintenance(me);
}

/** Transaction / Formula maintenance pages (limited path for non-owner). */
export function canAccessTransactionFormulaMaintenance(me) {
  return canAccessFullMaintenance(me) || canAccessLimitedMaintenance(me);
}
