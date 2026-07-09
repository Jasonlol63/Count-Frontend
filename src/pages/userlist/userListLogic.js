/** User list page — pure helpers (rules aligned with api/users/userlist_api.php + former legacy page) */

import { formatRoleLabel, normRole } from "../../utils/auth/sidebarPermissions.js";
import {
  companiesForCompanyPicker,
  DASHBOARD_GROUP_FILTER_OPT_OUT_KEY,
  dedupeOwnerCompaniesByCode,
  excludeGroupLabelsFromCompanyPicker,
  filterCompaniesWithDisplayId,
  independentCompaniesForPicker,
  normalizeCompanyGroupId,
} from "../../utils/company/sharedCompanyFilter.js";

export { formatRoleLabel, normRole };

export const PAGE_SIZE = 20;

export const ROLE_HIERARCHY = {
  owner: 0,
  partnership: 1,
  admin: 2,
  manager: 3,
  supervisor: 4,
  accountant: 5,
  audit: 6,
  "customer service": 7,
  company: 8,
};

/** Role options in `<select>` order (matches userlist_api valid roles) */
export const ALL_ROLE_OPTIONS = [
  { value: "partnership", label: "Partnership" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "supervisor", label: "Supervisor" },
  { value: "accountant", label: "Accountant" },
  { value: "audit", label: "Audit" },
  { value: "customer service", label: "Customer Service" },
  { value: "company", label: "Company" },
];

export const PERMISSION_KEYS = ["home", "admin", "account", "ownership", "process", "datacapture", "payment", "report", "maintenance"];

export const PERMISSION_ICONS = {
  home: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
  admin: "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z",
  account: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
  ownership: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
  process: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  datacapture: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z",
  payment: "M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z",
  report: "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h8c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
  maintenance: "M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z",
};

export function rowLoginId(row) {
  return row?.loginId ?? row?.login_id ?? "";
}

export function rowLastLogin(row) {
  return row?.lastLogin ?? row?.last_login ?? null;
}

export function rowCreatedBy(row) {
  return row?.createdBy ?? row?.created_by ?? "";
}

export function rowIsOwnerShadow(row) {
  return !!(row?.isOwnerShadow ?? row?.is_owner_shadow);
}

/** Partnership / Audit：显示 Read Only 开关 */
export function roleHasReadOnlyToggle(role) {
  const r = normRole(role);
  return r === "partnership" || r === "audit";
}

/**
 * Audit：manager 及以上可操作；Partnership：仅 owner（与 API canSetUserReadOnly 一致）
 */
export function canInteractWithReadOnlyToggle(currentUserRole, targetUserRole) {
  const r = normRole(targetUserRole);
  const curLevel = ROLE_HIERARCHY[normRole(currentUserRole)] ?? 999;
  const managerLevel = ROLE_HIERARCHY.manager ?? 999;
  if (r === "audit") return curLevel <= managerLevel;
  if (r === "partnership") return normRole(currentUserRole) === "owner";
  return false;
}

/**
 * Edit User：Partnership/Audit 用户在被设为 Read Only 时，仅「本人编辑自己」锁定整表。
 * Owner / Manager 等上级编辑下级只读账号时仍可修改（含关闭 Read Only）。
 */
export function isUserModalPageReadOnlyLock(isEditMode, editingRow, role, readOnly, currentUserId) {
  if (!isEditMode || rowIsOwnerShadow(editingRow)) return false;
  if (!roleHasReadOnlyToggle(role) || !readOnly) return false;
  if (!currentUserId || editingRow?.id == null) return false;
  return Number(editingRow.id) === Number(currentUserId);
}

/** Owner 登录后编辑列表中的 Owner 影子行（本人公司 Owner 资料） */
export function isOwnerEditingOwnerShadow(row, currentUserRole) {
  return rowIsOwnerShadow(row) && normRole(currentUserRole) === "owner";
}

/**
 * 编辑弹窗字段锁。Owner 影子行仅允许改姓名、邮箱、密码（权限/账户/流程由 UI 单独禁用）。
 */
export function getUserEditFieldLocks(row, currentUserId, currentUserRole) {
  if (isOwnerEditingOwnerShadow(row, currentUserRole)) {
    return { name: false, email: false, role: true, password: false, sidebar: true, company: true };
  }
  const caps = computeRowCapabilities(row, currentUserId, currentUserRole);
  const curLevel = ROLE_HIERARCHY[normRole(currentUserRole)] ?? 999;
  const editLevel = ROLE_HIERARCHY[normRole(row.role)] ?? 999;
  const isSelf = caps.isSelf;
  const isSame = !isSelf && curLevel === editLevel;
  const isLower = !isSelf && curLevel > editLevel;
  const canPickCompany = currentUserRole === "admin" || currentUserRole === "owner";
  return {
    name: isSame || isLower,
    email: isSame || isLower,
    role: isSame || isLower,
    password: false,
    sidebar: isSelf || isSame || isLower,
    company: isSelf || isSame || isLower || !canPickCompany,
  };
}

export function getCurrentUserRolePermissions(currentUserRole) {
  const rolePermissions = {
    owner: ["home", "admin", "account", "ownership", "process", "datacapture", "payment", "report", "maintenance"],
    admin: ["home", "admin", "account", "process", "datacapture", "payment", "report", "maintenance"],
    manager: ["admin", "account", "process", "datacapture", "payment", "report", "maintenance"],
    supervisor: ["admin", "account", "process", "datacapture", "payment", "report"],
    accountant: ["account", "process", "payment", "report"],
    audit: ["payment", "report", "maintenance"],
    "customer service": ["account", "process", "datacapture", "payment", "report"],
  };
  return rolePermissions[normRole(currentUserRole)] || [];
}

export function getRoleTemplateSidebarList(role) {
  if (!role) return [];
  const adminDefault = ["home", "admin", "account", "process", "datacapture", "payment", "report", "maintenance"];
  const rolePermissions = {
    partnership: PERMISSION_KEYS,
    admin: adminDefault,
    manager: ["admin", "account", "process", "datacapture", "payment", "report", "maintenance"],
    supervisor: ["admin", "account", "process", "datacapture", "payment", "report"],
    accountant: ["account", "process", "payment", "report"],
    audit: ["payment", "report", "maintenance"],
    "customer service": ["account", "process", "datacapture", "payment", "report"],
  };
  return rolePermissions[normRole(role)] || [];
}

export function getAvailableRolesForCreation(currentUserRole) {
  const currentLevel = ROLE_HIERARCHY[normRole(currentUserRole)] ?? 999;
  /** level < 5 可建账号：supervisor(4) 可建下级 */
  if (currentLevel >= 5) return [];
  return ALL_ROLE_OPTIONS.filter((role) => {
    if (role.value === "company") return false;
    const roleLevel = ROLE_HIERARCHY[role.value] ?? 999;
    return roleLevel > currentLevel;
  });
}

export function getAvailableRolesForEdit(currentUserRole, editingUserRole) {
  const currentLevel = ROLE_HIERARCHY[normRole(currentUserRole)] ?? 999;
  const editingUserLevel = ROLE_HIERARCHY[normRole(editingUserRole)] ?? 999;
  if (currentLevel >= 4) return [];
  if (editingUserLevel <= currentLevel) return [];
  return ALL_ROLE_OPTIONS.filter((role) => {
    const roleLevel = ROLE_HIERARCHY[role.value] ?? 999;
    return roleLevel > currentLevel;
  });
}

export function getFinalPermissionsForCreation(selectedRole, manuallySelected, currentUserRole) {
  const cur = normRole(currentUserRole);
  const currentUserPermissions = getCurrentUserRolePermissions(cur);
  const rolePerms = {
    partnership: PERMISSION_KEYS,
    admin: ["home", "admin", "account", "process", "datacapture", "payment", "report", "maintenance"],
    manager: ["admin", "account", "process", "datacapture", "payment", "report", "maintenance"],
    supervisor: ["admin", "account", "process", "datacapture", "payment", "report"],
    accountant: ["account", "process", "payment", "report"],
    audit: ["payment", "report", "maintenance"],
    "customer service": ["account", "process", "datacapture", "payment", "report"],
  };
  const sr = normRole(selectedRole);
  if (!sr) {
    return manuallySelected.filter((perm) => currentUserPermissions.includes(perm));
  }
  const defaultPermissions = rolePerms[sr] ?? [];
  const manual = new Set(manuallySelected);
  return defaultPermissions.filter((perm) => {
    if (currentUserPermissions.includes(perm)) return manual.has(perm);
    return true;
  });
}

/**
 * Row capabilities（列表行编辑/删除/状态规则）.
 * @param {object} row — user row with id, role, status, isOwnerShadow
 */
export function computeRowCapabilities(row, currentUserId, currentUserRole) {
  const targetRole = normRole(row.role);
  const isOwnerShadow = rowIsOwnerShadow(row);
  const targetUserId = Number(row.id);
  const currentLevel = ROLE_HIERARCHY[normRole(currentUserRole)] ?? 999;
  const targetLevel = ROLE_HIERARCHY[targetRole] ?? 999;
  const isSelf = currentUserId && targetUserId === Number(currentUserId);
  const isSameLevel = currentLevel === targetLevel && !isSelf;
  const isHigherLevel = targetLevel < currentLevel;
  /** 不含 partnership：partnership 可按层级编辑 admin 等 */
  const lowPrivilegeRoles = ["manager", "supervisor", "accountant", "audit", "customer service"];
  const isLowPrivilegeUser = lowPrivilegeRoles.includes(normRole(currentUserRole));
  const isAdminUser = targetRole === "admin";
  const isOwnerUser = targetRole === "owner";

  let canEditDelete = true;
  let canDelete = true;
  let canToggleStatus = true;

  if (isSelf) {
    canDelete = false;
  } else if (isOwnerShadow) {
    canEditDelete = normRole(currentUserRole) === "owner";
    canDelete = canEditDelete;
  } else if (isLowPrivilegeUser && (isAdminUser || isOwnerUser)) {
    canEditDelete = false;
    canDelete = false;
  } else if (isSameLevel) {
    canDelete = false;
  } else if (isHigherLevel) {
    canDelete = false;
  }

  canToggleStatus = canEditDelete && !isSelf;
  if (normRole(currentUserRole) === "admin" && targetRole === "admin" && !isSelf) {
    canToggleStatus = false;
  }

  return { canEditDelete, canDelete, canToggleStatus, isSelf, isSameLevel, isHigherLevel, isOwnerShadow };
}

export function formatLastLogin(raw) {
  if (!raw) return "-";
  const s = String(raw).trim();
  if (!s) return "-";
  const d = new Date(s.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return s;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
}

/**
 * Status visibility after toggle — aligned with processlist / account list:
 * - default: active (paginated)
 * - showInactive: inactive (paginated)
 * - showAll: all active (no pagination)
 * - showAll + showInactive: all inactive
 */
export function userRowVisibleAfterStatusChange(newStatus, { showInactive, showAll }) {
  const status = normRole(newStatus);
  if (showAll && showInactive) return status === "inactive";
  if (showAll) return status === "active";
  if (showInactive) return status === "inactive";
  return status === "active";
}

export function applyUserFilters(users, { search, showInactive, showAll, viewerRole }) {
  const vr = normRole(viewerRole);
  let rows = users.map((u) => ({ ...u }));
  if (vr !== "owner") {
    rows = rows.filter((u) => normRole(u.role) !== "partnership");
  }
  const q = search.trim().toLowerCase();
  if (q) {
    rows = rows.filter((u) => `${rowLoginId(u)} ${u.name || ""} ${u.email || ""}`.toLowerCase().includes(q));
  }
  if (showAll && showInactive) {
    rows = rows.filter((u) => normRole(u.status) === "inactive");
  } else if (showAll) {
    rows = rows.filter((u) => normRole(u.status) === "active");
  } else if (showInactive) {
    rows = rows.filter((u) => normRole(u.status) === "inactive");
  } else {
    rows = rows.filter((u) => normRole(u.status) === "active");
  }
  return rows;
}

function shadowCmp(a, b) {
  if (rowIsOwnerShadow(a) && !rowIsOwnerShadow(b)) return -1;
  if (!rowIsOwnerShadow(a) && rowIsOwnerShadow(b)) return 1;
  return 0;
}

function tiebreakLoginName(a, b) {
  const al = rowLoginId(a).toLowerCase();
  const bl = rowLoginId(b).toLowerCase();
  if (al < bl) return -1;
  if (al > bl) return 1;
  const an = String(a.name || "").toLowerCase();
  const bn = String(b.name || "").toLowerCase();
  if (an < bn) return -1;
  if (an > bn) return 1;
  return 0;
}

function lastLoginSortMs(raw) {
  if (raw == null || raw === "") return null;
  const d = new Date(String(raw).trim().replace(" ", "T"));
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
}

export function sortUsers(rows, sortColumn, sortDirection) {
  const dir = sortDirection === "desc" ? -1 : 1;
  const copy = [...rows];
  const sortWithShadow = (primary) => {
    copy.sort((a, b) => {
      const s = shadowCmp(a, b);
      if (s !== 0) return s * dir;
      let result = primary(a, b);
      if (result === 0) result = tiebreakLoginName(a, b);
      return result * dir;
    });
  };

  if (sortColumn === "no") {
    sortWithShadow((a, b) => Number(a.id || 0) - Number(b.id || 0));
  } else if (sortColumn === "loginId") {
    sortWithShadow((a, b) => {
      const aKey = rowLoginId(a).toLowerCase();
      const bKey = rowLoginId(b).toLowerCase();
      if (aKey < bKey) return -1;
      if (aKey > bKey) return 1;
      const aName = String(a.name || "").toLowerCase();
      const bName = String(b.name || "").toLowerCase();
      if (aName < bName) return -1;
      if (aName > bName) return 1;
      return 0;
    });
  } else if (sortColumn === "name") {
    sortWithShadow((a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" }));
  } else if (sortColumn === "email") {
    sortWithShadow((a, b) => String(a.email || "").localeCompare(String(b.email || ""), undefined, { sensitivity: "base" }));
  } else if (sortColumn === "role") {
    sortWithShadow((a, b) => {
      const aKey = ROLE_HIERARCHY[normRole(a.role)] ?? 999;
      const bKey = ROLE_HIERARCHY[normRole(b.role)] ?? 999;
      if (aKey < bKey) return -1;
      if (aKey > bKey) return 1;
      const aRoleN = String(a.role || "").toUpperCase().trim();
      const bRoleN = String(b.role || "").toUpperCase().trim();
      if (aRoleN < bRoleN) return -1;
      if (aRoleN > bRoleN) return 1;
      return 0;
    });
  } else if (sortColumn === "status") {
    sortWithShadow((a, b) =>
      normRole(a.status).localeCompare(normRole(b.status), undefined, { sensitivity: "base" }),
    );
  } else if (sortColumn === "lastLogin") {
    sortWithShadow((a, b) => {
      const va = lastLoginSortMs(rowLastLogin(a));
      const vb = lastLoginSortMs(rowLastLogin(b));
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return -1;
      if (va > vb) return 1;
      return 0;
    });
  } else if (sortColumn === "createdBy") {
    sortWithShadow((a, b) =>
      String(rowCreatedBy(a)).localeCompare(String(rowCreatedBy(b)), undefined, { sensitivity: "base" }),
    );
  } else {
    sortWithShadow((a, b) => {
      const aKey = rowLoginId(a).toLowerCase();
      const bKey = rowLoginId(b).toLowerCase();
      if (aKey < bKey) return -1;
      if (aKey > bKey) return 1;
      const aName = String(a.name || "").toLowerCase();
      const bName = String(b.name || "").toLowerCase();
      if (aName < bName) return -1;
      if (aName > bName) return 1;
      return 0;
    });
  }
  return copy;
}

export function getDeleteCheckboxState(row, caps) {
  if (normRole(row.status) === "active") return { show: false };
  if (!caps.canDelete) return { show: true, disabled: true, title: caps.isSelf ? "You cannot delete your own account" : "No permission to delete" };
  return { show: true, disabled: false, title: "" };
}

/** Company pills shown in User List inline filter (matches UserListPage useMemo). */
export function resolveUserListInlinePickerCompanies({
  companies = [],
  groupIds = [],
  selectedGroup = null,
  preferredCompanyId = null,
  companiesForPickerFromHook = null,
  groupFilterOptOut = false,
} = {}) {
  const independentPicker = () => {
    const list = independentCompaniesForPicker(companies, groupIds);
    if (list.length) {
      return dedupeOwnerCompaniesByCode(list, preferredCompanyId);
    }
    return excludeGroupLabelsFromCompanyPicker(
      dedupeOwnerCompaniesByCode(filterCompaniesWithDisplayId(companies), preferredCompanyId),
      groupIds,
    ).filter((c) => !normalizeCompanyGroupId(c));
  };

  if (!selectedGroup || groupFilterOptOut) {
    return independentPicker();
  }

  if (Array.isArray(companiesForPickerFromHook) && companiesForPickerFromHook.length > 0) {
    return companiesForPickerFromHook;
  }

  const effectiveGroup = String(selectedGroup).trim().toUpperCase();
  return dedupeOwnerCompaniesByCode(
    companiesForCompanyPicker(companies, effectiveGroup, groupIds),
    preferredCompanyId,
  );
}

export function isCompanyInUserListPicker(options, companyId) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) return false;
  return resolveUserListInlinePickerCompanies(options).some((c) => Number(c.id) === cid);
}

/** List fetch is allowed only with an active company pill, aggregate mode, or explicit group-only mode. */
export function shouldLoadUserListData({
  companyId = null,
  selectedGroup = null,
  groupOnlyMode = false,
  groupsAllMode = false,
  groupAllMode = false,
} = {}) {
  if (groupsAllMode || groupAllMode) return true;
  if (companyId != null && Number(companyId) > 0) return true;
  if (groupOnlyMode && selectedGroup) return true;
  return false;
}

/** Whether Add / list mutations have a resolvable company or group ledger scope. */
export function userListHasMutationScope(scopeCompanyId) {
  return scopeCompanyId != null && Number(scopeCompanyId) > 0;
}

/**
 * Stricter scope for Add User: requires an active group (group-only) or a company pill
 * visible in the inline picker — never falls back to PHP session company alone.
 */
export function resolveUserListMutationScopeCompanyId({
  companyId = null,
  selectedGroup = null,
  groupOnlyUserList = false,
  anchorCompanyId = null,
  groupsAllMode = false,
  groupAllMode = false,
  scopeCompanyId = null,
  companies = [],
  groupIds = [],
  companiesForPicker = null,
  groupFilterOptOut = false,
} = {}) {
  if (groupsAllMode || groupAllMode) {
    const id = scopeCompanyId != null ? Number(scopeCompanyId) : Number.NaN;
    return Number.isFinite(id) && id > 0 ? id : null;
  }
  if (groupOnlyUserList && anchorCompanyId != null) {
    const id = Number(anchorCompanyId);
    return Number.isFinite(id) && id > 0 ? id : null;
  }
  const cid = companyId != null ? Number(companyId) : Number.NaN;
  if (Number.isFinite(cid) && cid > 0) {
    if (
      isCompanyInUserListPicker(
        {
          companies,
          groupIds,
          selectedGroup,
          preferredCompanyId: companyId,
          companiesForPickerFromHook: companiesForPicker,
          groupFilterOptOut,
        },
        cid,
      )
    ) {
      return cid;
    }
  }
  return null;
}

export function readUserListGroupFilterOptOut() {
  return (
    typeof sessionStorage !== "undefined" &&
    sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1"
  );
}

/** Active list scope key — must stay in sync with userListFetchScopeKey useMemo in UserListPage. */
export function resolveUserListFetchScopeKey({
  companyId: cid,
  selectedGroup: sg,
  groupsAllMode: gAll = false,
  groupAllMode: cAll = false,
  groupOnlyMode = false,
} = {}) {
  if (gAll) return cAll ? "groups-all:companies-all" : "groups-all";
  if (cAll) return `group-all:${sg || ""}`;
  if (cid != null && Number(cid) > 0) return `company:${cid}`;
  if (sg && groupOnlyMode) return `group:${sg}`;
  return "";
}
