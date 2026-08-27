/** User list page — pure helpers (rules aligned with api/users/userlist_api.php + former legacy page) */

import {
  companiesForCompanyPicker,
  DASHBOARD_GROUP_FILTER_OPT_OUT_KEY,
  dedupeOwnerCompaniesByCode,
  excludeGroupLabelsFromCompanyPicker,
  filterCompaniesWithDisplayId,
  independentCompaniesForPicker,
  normalizeCompanyGroupId,
} from "../../utils/company/sharedCompanyFilter.js";
import { formatDmyDash } from "../../utils/date/dateUtils.js";

export const ROLE_HIERARCHY = {
  owner: 0,
  partnership: 1,
  admin: 2,
  manager: 3,
  supervisor: 4,
  accountant: 5,
  audit: 6,
  customer_service: 7,
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
  { value: "customer_service", label: "Customer Service" },
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

export function normRole(r) {
  return String(r || "").trim().toLowerCase().replace(/[\s_]+/g, "_");
}

/** Ownership sidebar permission — owner/partnership/admin may have or see it (matches user_role_permission). */
export function roleSupportsOwnershipPermission(role) {
  const r = normRole(role);
  return r === "owner" || r === "partnership" || r === "admin";
}

export function getVisiblePermissionKeys(targetRole) {
  if (roleSupportsOwnershipPermission(targetRole)) return PERMISSION_KEYS;
  return PERMISSION_KEYS.filter((k) => k !== "ownership");
}

export function sanitizeSidebarPermissionsForRole(role, permissions) {
  if (!Array.isArray(permissions)) return [];
  if (roleSupportsOwnershipPermission(role)) return permissions;
  return permissions.filter((p) => p !== "ownership");
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
  if (!isEditMode || editingRow?.is_owner_shadow) return false;
  if (!roleHasReadOnlyToggle(role) || !readOnly) return false;
  if (!currentUserId || editingRow?.id == null) return false;
  return Number(editingRow.id) === Number(currentUserId);
}

/** Owner 登录后编辑列表中的 Owner 影子行（本人公司 Owner 资料） */
export function isOwnerEditingOwnerShadow(row, currentUserRole) {
  return !!row?.is_owner_shadow && normRole(currentUserRole) === "owner";
}

/**
 * 编辑弹窗字段锁。Owner 影子行仅允许改姓名、邮箱、密码（权限/账户/流程由 UI 单独禁用）。
 */
export function getUserEditFieldLocks(row, currentUserId, currentUserRole) {
  if (isOwnerEditingOwnerShadow(row, currentUserRole)) {
    return {
      name: false,
      email: false,
      role: true,
      password: false,
      sidebar: true,
      company: true,
      account: true,
      process: true,
      /** @deprecated use account + process */
      accountProcess: true,
    };
  }
  const caps = computeRowCapabilities(row, currentUserId, currentUserRole);
  const curLevel = ROLE_HIERARCHY[normRole(currentUserRole)] ?? 999;
  const editLevel = ROLE_HIERARCHY[normRole(row.role)] ?? 999;
  const isSelf = caps.isSelf;
  const isSame = !isSelf && curLevel === editLevel;
  const isLower = !isSelf && curLevel > editLevel;
  const canPickCompany = currentUserRole === "admin" || currentUserRole === "owner";
  // Acc / Process：自己可关不想看的；同级/上级锁定
  const accountLocked = isSame || isLower;
  const processLocked = isSame || isLower;
  return {
    name: isSame || isLower,
    email: isSame || isLower,
    // role 字段：自己不能改自己的角色（防止自我提权），同级/上级同样不可改
    role: isSelf || isSame || isLower,
    // 密码：自己或严格下级可改；同级/上级不可越级改
    password: isSame || isLower,
    sidebar: isSelf || isSame || isLower,
    company: isSelf || isSame || isLower || !canPickCompany,
    account: accountLocked,
    process: processLocked,
    /** @deprecated use account + process */
    accountProcess: accountLocked && processLocked,
  };
}

/** @param {unknown} row */
export function isAccountPermSelfHidden(row) {
  if (!row || typeof row !== "object") return false;
  const v = row.self_hidden;
  return v === true || v === 1 || v === "1";
}

/**
 * Ensure Accs still granted but self_hidden appear in the modal so the user can re-check them.
 * @param {Array<{id?: number, account_id?: string, name?: string}>} accList
 * @param {Array<{id?: number, account_id?: string, name?: string}|number>} grantedRows
 */
export function mergeModalAccountsWithGranted(accList, grantedRows) {
  const byId = new Map((Array.isArray(accList) ? accList : []).map((a) => [Number(a.id), a]));
  for (const row of Array.isArray(grantedRows) ? grantedRows : []) {
    const id = Number(row?.id ?? row);
    if (!(id > 0)) continue;
    const grantCode = typeof row === "object" && row ? String(row.account_id || "") : "";
    const grantName = typeof row === "object" && row ? String(row.name || "").trim() : "";
    const existing = byId.get(id);
    if (existing) {
      if (!String(existing.account_id || "") && grantCode) existing.account_id = grantCode;
      if (!String(existing.name || "").trim() && grantName) existing.name = grantName;
      continue;
    }
    byId.set(id, {
      id,
      account_id: grantCode,
      name: grantName,
    });
  }
  return [...byId.values()];
}

/**
 * Ensure still-granted but self_hidden processes appear in the modal for re-check.
 * @param {Array<{id?: number, process_id?: string, description?: string}>} procList
 * @param {Array<{id?: number, process_id?: string, description?: string}|number>} grantedRows
 */
export function mergeModalProcessesWithGranted(procList, grantedRows) {
  const byId = new Map((Array.isArray(procList) ? procList : []).map((p) => [Number(p.id), p]));
  for (const row of Array.isArray(grantedRows) ? grantedRows : []) {
    const id = Number(row?.id ?? row);
    if (!(id > 0)) continue;
    const grantCode = typeof row === "object" && row ? String(row.process_id || "") : "";
    const grantDesc = typeof row === "object" && row ? String(row.description || "").trim() : "";
    const existing = byId.get(id);
    if (existing) {
      if (!String(existing.process_id || "") && grantCode) existing.process_id = grantCode;
      if (!String(existing.description || "").trim() && grantDesc) existing.description = grantDesc;
      continue;
    }
    byId.set(id, {
      id,
      process_id: grantCode,
      description: grantDesc,
    });
  }
  return [...byId.values()];
}

/**
 * Self-edit held baseline (= still granted, including self_hidden).
 * Superior-revoked Accs are absent from existingPerms and cannot be re-checked.
 * Unset (null) → currently visible modal ids at open.
 * @param {Array<{id?: number}|number>|null|undefined} existingPerms
 * @param {boolean} existingUnset
 * @param {Iterable<number|string>} visibleAccountIds
 * @returns {Set<number>}
 */
export function buildSelfAccHeldIds(existingPerms, existingUnset, visibleAccountIds) {
  const toId = (x) => Number(x?.id ?? x);
  if (!existingUnset && existingPerms != null) {
    return new Set(
      (Array.isArray(existingPerms) ? existingPerms : []).map(toId).filter((id) => id > 0),
    );
  }
  return new Set([...visibleAccountIds].map(Number).filter((id) => id > 0));
}

/**
 * Self-edit payload: only checked (visible) ids among held grants.
 * API marks unchecked held ids as self_hidden (still granted for later self re-open).
 * @param {Array<{id?: number}|number>|null|undefined} heldPerms
 * @param {Array<{id?: number}|number>} submittedPerms
 * @returns {Array<{id: number}>}
 */
export function shrinkAccountPermissionsForSelf(heldPerms, submittedPerms) {
  const toId = (x) => Number(x?.id ?? x);
  const submittedIds = [...new Set((Array.isArray(submittedPerms) ? submittedPerms : []).map(toId).filter((id) => id > 0))];
  const heldIds = new Set(
    (Array.isArray(heldPerms) ? heldPerms : []).map(toId).filter((id) => id > 0),
  );
  return submittedIds.filter((id) => heldIds.has(id)).map((id) => ({ id }));
}

/**
 * Self Acc bulk select/clear: Select All may only re-check held ids (cannot restore
 * superior-closed Accs that still appear in a stale modal list).
 * @param {Iterable<number|string>} prevSelected
 * @param {Iterable<number|string>} visibleIds
 * @param {Iterable<number|string>} heldIds
 * @param {"select"|"clear"} mode
 * @returns {Set<number>}
 */
export function nextSelfAccountSelection(prevSelected, visibleIds, heldIds, mode) {
  const next = new Set([...prevSelected].map(Number).filter((id) => id > 0));
  const visible = [...visibleIds].map(Number).filter((id) => id > 0);
  const held = new Set([...heldIds].map(Number).filter((id) => id > 0));
  if (mode === "select") {
    visible.forEach((id) => {
      if (held.has(id)) next.add(id);
    });
    return next;
  }
  visible.forEach((id) => next.delete(id));
  return next;
}

/**
 * Owner (sees-all) Select All on the modal → send null (DB unset = see-all).
 * Avoids materializing huge grant JSON and matches product intent.
 * Self / restricted editors always send compact id rows.
 * @param {{ isSelf: boolean, editorSeesAll: boolean, selectedIds: Set<number>|Iterable<number>, modalRows: Array<{id?: number}> }} args
 * @param {Array<{id: number, self_hidden?: boolean}>} compactRows
 * @returns {Array<{id: number, self_hidden?: boolean}>|null}
 */
export function resolveSeeAllOrCompactPermissions({ isSelf, editorSeesAll, selectedIds, modalRows }, compactRows) {
  if (isSelf || !editorSeesAll) return compactRows;
  const selected = selectedIds instanceof Set ? selectedIds : new Set([...selectedIds].map(Number));
  const selectedCount = [...selected].filter((id) => Number(id) > 0).length;
  // Clear All / nothing checked → always persist [] (never SQL NULL see-all).
  if (selectedCount === 0) {
    return Array.isArray(compactRows) ? compactRows : [];
  }
  const modalIds = (Array.isArray(modalRows) ? modalRows : [])
    .map((r) => Number(r?.id ?? r))
    .filter((id) => id > 0);
  if (modalIds.length > 0 && modalIds.every((id) => selected.has(id))) {
    return null;
  }
  return compactRows;
}

/**
 * Bulk select/clear in User Modal Acc column: only touch editor-visible ids,
 * keep selected ids outside that set (accounts the editor cannot see/grant).
 * @param {Iterable<number|string>} prevSelected
 * @param {Iterable<number|string>} visibleIds
 * @param {"select"|"clear"} mode
 * @returns {Set<number>}
 */
export function nextAccountSelectionPreservingOutside(prevSelected, visibleIds, mode) {
  const next = new Set([...prevSelected].map(Number).filter((id) => id > 0));
  const visible = [...visibleIds].map(Number).filter((id) => id > 0);
  if (mode === "select") {
    visible.forEach((id) => next.add(id));
    return next;
  }
  visible.forEach((id) => next.delete(id));
  return next;
}

/**
 * Merge target account permissions: editor may only change ids in grantableIds.
 * Ids outside grantable stay as on the target (avoids Clear-All wiping hidden accs).
 * @param {Array<{id?: number}|number>|null|undefined} existingPerms
 * @param {Array<{id?: number}|number>} submittedPerms
 * @param {Iterable<number|string>|null|undefined} grantableIds null/undefined = editor may set any submitted id
 * @returns {Array<{id: number}>}
 */
export function mergeAccountPermissionsForEditor(existingPerms, submittedPerms, grantableIds) {
  const toId = (x) => Number(x?.id ?? x);
  const submittedIds = new Set(
    (Array.isArray(submittedPerms) ? submittedPerms : []).map(toId).filter((id) => id > 0),
  );
  const existingIds = new Set(
    (Array.isArray(existingPerms) ? existingPerms : []).map(toId).filter((id) => id > 0),
  );
  if (grantableIds == null) {
    return [...submittedIds].map((id) => ({ id }));
  }
  const grantable = new Set([...grantableIds].map(Number).filter((id) => id > 0));
  const merged = new Set();
  existingIds.forEach((id) => {
    if (!grantable.has(id)) merged.add(id);
  });
  submittedIds.forEach((id) => {
    if (grantable.has(id)) merged.add(id);
  });
  return [...merged].map((id) => ({ id }));
}

export function getCurrentUserRolePermissions(currentUserRole) {
  const rolePermissions = {
    owner: ["home", "admin", "account", "ownership", "process", "datacapture", "payment", "report", "maintenance"],
    partnership: ["home", "admin", "account", "ownership", "process", "datacapture", "payment", "report", "maintenance"],
    admin: ["home", "admin", "account", "ownership", "process", "datacapture", "payment", "report", "maintenance"],
    manager: ["admin", "account", "process", "datacapture", "payment", "report", "maintenance"],
    supervisor: ["admin", "account", "process", "datacapture", "payment", "report"],
    accountant: ["account", "process", "payment", "report"],
    audit: ["payment", "report", "maintenance"],
    "customer_service": ["account", "process", "datacapture", "payment", "report"],
  };
  return rolePermissions[normRole(currentUserRole)] || [];
}

export function getRoleTemplateSidebarList(role) {
  if (!role) return [];
  const adminDefault = ["home", "admin", "account", "ownership", "process", "datacapture", "payment", "report", "maintenance"];
  const ownerDefault = ["home", "admin", "account", "ownership", "process", "datacapture", "payment", "report", "maintenance"];
  const partnershipDefault = [...ownerDefault];
  const rolePermissions = {
    owner: ownerDefault,
    partnership: partnershipDefault,
    admin: adminDefault,
    manager: ["admin", "account", "process", "datacapture", "payment", "report", "maintenance"],
    supervisor: ["admin", "account", "process", "datacapture", "payment", "report"],
    accountant: ["account", "process", "payment", "report"],
    audit: ["payment", "report", "maintenance"],
    "customer_service": ["account", "process", "datacapture", "payment", "report"],
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
    admin: ["home", "admin", "account", "ownership", "process", "datacapture", "payment", "report", "maintenance"],
    manager: ["admin", "account", "process", "datacapture", "payment", "report", "maintenance"],
    supervisor: ["admin", "account", "process", "datacapture", "payment", "report"],
    accountant: ["account", "process", "payment", "report"],
    audit: ["payment", "report", "maintenance"],
    "customer_service": ["account", "process", "datacapture", "payment", "report"],
  };
  const sr = normRole(selectedRole);
  if (!sr) {
    return manuallySelected.filter((perm) => currentUserPermissions.includes(perm));
  }
  const defaultPermissions = rolePerms[sr] ?? [];
  const manual = new Set(manuallySelected);
  const merged = defaultPermissions.filter((perm) => {
    if (currentUserPermissions.includes(perm)) return manual.has(perm);
    return true;
  });
  return sanitizeSidebarPermissionsForRole(sr, merged);
}

/**
 * Row capabilities（列表行编辑/删除/状态规则）.
 * @param {object} row — user row with id, role, status, is_owner_shadow
 */
export function computeRowCapabilities(row, currentUserId, currentUserRole) {
  const targetRole = normRole(row.role);
  const isOwnerShadow = !!row.is_owner_shadow;
  const targetUserId = Number(row.id);
  const currentLevel = ROLE_HIERARCHY[normRole(currentUserRole)] ?? 999;
  const targetLevel = ROLE_HIERARCHY[targetRole] ?? 999;
  const isSelf = currentUserId && targetUserId === Number(currentUserId);
  const isSameLevel = currentLevel === targetLevel && !isSelf;
  const isHigherLevel = targetLevel < currentLevel;
  /** 不含 partnership：partnership 可按层级编辑 admin 等 */
  const lowPrivilegeRoles = ["manager", "supervisor", "accountant", "audit", "customer_service"];
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
  } else if (isSameLevel || isHigherLevel) {
    // 同级或更高权限的目标：编辑也一并锁定，不只是禁止删除——否则会出现按钮可点、
    // 提交后被后端 AccessControlUtils.assertCanManageAdminTarget 拒绝的情况。
    canEditDelete = false;
    canDelete = false;
  }

  canToggleStatus = canEditDelete && !isSelf;
  if (!isOwnerShadow && (isSameLevel || isHigherLevel)) {
    canToggleStatus = false;
  }

  return { canEditDelete, canDelete, canToggleStatus, isSelf, isSameLevel, isHigherLevel, isOwnerShadow };
}

function parseUserLastLogin(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const d = new Date(s.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Last Login 列：仅展示日期 DD-MM-YYYY */
export function formatUserLastLoginDate(raw) {
  const d = parseUserLastLogin(raw);
  if (!d) {
    const s = String(raw || "").trim();
    return s || "-";
  }
  return formatDmyDash(d);
}

/** Last Login 悬浮提示：仅时间 HH:MM:SS */
export function formatUserLastLoginTimeTitle(raw) {
  const d = parseUserLastLogin(raw);
  if (!d) return "";
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const sec = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${min}:${sec}`;
}


export function applyUserFilters(users, { search, showActive = false, showInactive = false, showAll: _showAll, viewerRole, viewerUserId = null }) {
  const vr = normRole(viewerRole);
  let rows = users.map((u) => ({ ...u }));
  if (vr !== "owner") {
    const viewerIdNum = Number(viewerUserId);
    rows = rows.filter((u) => {
      if (normRole(u.role) !== "partnership") return true;
      if (!Number.isFinite(viewerIdNum) || viewerIdNum <= 0) return false;
      return Number(u.id) === viewerIdNum;
    });
  }
  const q = search.trim().toLowerCase();
  if (q) {
    rows = rows.filter((u) => `${u.login_id || ""} ${u.name || ""} ${u.email || ""}`.toLowerCase().includes(q));
  }
  if (showActive && showInactive) {
    return rows;
  }
  if (showInactive) {
    rows = rows.filter((u) => normRole(u.status) === "inactive");
  } else {
    rows = rows.filter((u) => normRole(u.status) === "active");
  }
  return rows;
}

function shadowCmp(a, b) {
  if (a.is_owner_shadow && !b.is_owner_shadow) return -1;
  if (!a.is_owner_shadow && b.is_owner_shadow) return 1;
  return 0;
}

function tiebreakLoginName(a, b) {
  const al = String(a.login_id || "").toLowerCase();
  const bl = String(b.login_id || "").toLowerCase();
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
      const aKey = String(a.login_id || "").toLowerCase();
      const bKey = String(b.login_id || "").toLowerCase();
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
      const va = lastLoginSortMs(a.last_login);
      const vb = lastLoginSortMs(b.last_login);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return -1;
      if (va > vb) return 1;
      return 0;
    });
  } else if (sortColumn === "createdBy") {
    sortWithShadow((a, b) =>
      String(a.created_by || "").localeCompare(String(b.created_by || ""), undefined, { sensitivity: "base" }),
    );
  } else {
    sortWithShadow((a, b) => {
      const aKey = String(a.login_id || "").toLowerCase();
      const bKey = String(b.login_id || "").toLowerCase();
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

/** Whether Add / list mutations have a resolvable company or pure group ledger scope. */
export function userListHasMutationScope(scopeCompanyId, { groupOnly = false, selectedGroup = null } = {}) {
  if (scopeCompanyId != null && Number(scopeCompanyId) > 0) return true;
  // Phase 4: empty group (no company anchor) still allows Add User when group-only.
  if (groupOnly && String(selectedGroup || "").trim() !== "") return true;
  return false;
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
  // Phase 4: group-only without anchor — signal mutation via null company + groupOnly flag at call site.
  if (groupOnlyUserList && selectedGroup) {
    return null;
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
