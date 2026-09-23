/**
 * Mobile user admin — pure helpers ported from desktop
 * frontend/src/pages/userlist/userListLogic.js. Keep role/capability rules in sync with that
 * file when they change.
 *
 * The Account/Process grant helpers were re-ported for the Spring model: the legacy PHP
 * `toggleable_ids` + `self_hidden` + `superior_closed` trio has no backend counterpart any more
 * (see the block comment further down before `buildSelfAccHeldIds`).
 */

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

export const PERMISSION_KEYS = [
  "home",
  "admin",
  "account",
  "ownership",
  "process",
  "datacapture",
  "payment",
  "report",
  "maintenance",
];

export function normRole(r) {
  return String(r || "").trim().toLowerCase();
}

/** Ownership sidebar permission — only owner and partnership roles may have or see it. */
export function roleSupportsOwnershipPermission(role) {
  const r = normRole(role);
  return r === "owner" || r === "partnership";
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

/** Partnership / Audit rows expose a Read Only toggle. */
export function roleHasReadOnlyToggle(role) {
  const r = normRole(role);
  return r === "partnership" || r === "audit";
}

/** Audit: manager and above; Partnership: owner only (matches API canSetUserReadOnly). */
export function canInteractWithReadOnlyToggle(currentUserRole, targetUserRole) {
  const r = normRole(targetUserRole);
  const curLevel = ROLE_HIERARCHY[normRole(currentUserRole)] ?? 999;
  const managerLevel = ROLE_HIERARCHY.manager ?? 999;
  if (r === "audit") return curLevel <= managerLevel;
  if (r === "partnership") return normRole(currentUserRole) === "owner";
  return false;
}

export function isOwnerEditingOwnerShadow(row, currentUserRole) {
  return !!row?.is_owner_shadow && normRole(currentUserRole) === "owner";
}

/**
 * Row capabilities (edit / delete / status-toggle rules) — same semantics as desktop.
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
  if (!isOwnerShadow && (isSameLevel || isHigherLevel)) {
    canToggleStatus = false;
  }

  return { canEditDelete, canDelete, canToggleStatus, isSelf, isSameLevel, isHigherLevel, isOwnerShadow };
}

/** Edit form field locks — mirrors desktop getUserEditFieldLocks. */
export function getUserEditFieldLocks(row, currentUserId, currentUserRole) {
  if (isOwnerEditingOwnerShadow(row, currentUserRole)) {
    return { name: false, email: false, role: true, password: false, sidebar: true, company: true, accountProcess: true };
  }
  const caps = computeRowCapabilities(row, currentUserId, currentUserRole);
  const curLevel = ROLE_HIERARCHY[normRole(currentUserRole)] ?? 999;
  const editLevel = ROLE_HIERARCHY[normRole(row.role)] ?? 999;
  const isSelf = caps.isSelf;
  const isSame = !isSelf && curLevel === editLevel;
  const isLower = !isSelf && curLevel > editLevel;
  const canPickCompany = normRole(currentUserRole) === "admin" || normRole(currentUserRole) === "owner";
  return {
    name: isSame || isLower,
    email: isSame || isLower,
    role: isSame || isLower,
    password: false,
    sidebar: isSelf || isSame || isLower,
    company: isSelf || isSame || isLower || !canPickCompany,
    // Process stays locked for self unless canSelfEditAccountAccess unlocks Acc/Process.
    accountProcess: isSelf,
  };
}

/** Non-owner editing themselves may hide/unhide Acc and Process. Owner / owner-shadow cannot. */
export function canSelfEditAccountAccess(row, currentUserId, currentUserRole) {
  if (!row || row.is_owner_shadow) return false;
  if (normRole(currentUserRole) === "owner") return false;
  if (row.id == null || currentUserId == null) return false;
  return Number(row.id) === Number(currentUserId);
}

export function getCurrentUserRolePermissions(currentUserRole) {
  const rolePermissions = {
    owner: ["home", "admin", "account", "ownership", "process", "datacapture", "payment", "report", "maintenance"],
    partnership: ["home", "admin", "account", "ownership", "process", "datacapture", "payment", "report", "maintenance"],
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
  const ownerDefault = ["home", "admin", "account", "ownership", "process", "datacapture", "payment", "report", "maintenance"];
  const rolePermissions = {
    owner: ownerDefault,
    partnership: [...ownerDefault],
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
  const merged = defaultPermissions.filter((perm) => {
    if (currentUserPermissions.includes(perm)) return manual.has(perm);
    return true;
  });
  return sanitizeSidebarPermissionsForRole(sr, merged);
}

/** List filters — non-owner viewers only see their own partnership row. */
export function applyUserFilters(users, { search, showInactive, viewerRole, viewerUserId = null }) {
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
  const q = String(search || "").trim().toLowerCase();
  if (q) {
    rows = rows.filter((u) => `${u.login_id || ""} ${u.name || ""} ${u.email || ""}`.toLowerCase().includes(q));
  }
  if (showInactive) {
    rows = rows.filter((u) => normRole(u.status) === "inactive");
  } else {
    rows = rows.filter((u) => normRole(u.status) === "active");
  }
  return rows;
}

/** Owner shadow row first, then login_id asc. */
export function sortUsersByLogin(rows) {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (a.is_owner_shadow && !b.is_owner_shadow) return -1;
    if (!a.is_owner_shadow && b.is_owner_shadow) return 1;
    const al = String(a.login_id || "").toLowerCase();
    const bl = String(b.login_id || "").toLowerCase();
    if (al < bl) return -1;
    if (al > bl) return 1;
    return String(a.name || "").toLowerCase().localeCompare(String(b.name || "").toLowerCase());
  });
  return copy;
}

export function formatLastLogin(raw) {
  if (!raw) return "-";
  const s = String(raw).trim();
  if (!s) return "-";
  const d = new Date(s.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return s;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** permissions / account_permissions columns may arrive as JSON strings. */
export function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Digit-first natural order: 2 < 10 < A < Z. */
export function compareAccessCode(a, b) {
  return String(a || "").localeCompare(String(b || ""), "en", { numeric: true, sensitivity: "base" });
}

/** Open (checked) items first, closed last; within each group numbers → A → Z. */
export function sortAccessItems(items, selectedIds, codeKey) {
  const selected = selectedIds instanceof Set ? selectedIds : new Set();
  const list = Array.isArray(items) ? items : [];
  return [...list].sort((a, b) => {
    const aOn = selected.has(Number(a?.id)) ? 0 : 1;
    const bOn = selected.has(Number(b?.id)) ? 0 : 1;
    if (aOn !== bOn) return aOn - bOn;
    const byCode = compareAccessCode(a?.[codeKey], b?.[codeKey]);
    if (byCode !== 0) return byCode;
    return Number(a?.id || 0) - Number(b?.id || 0);
  });
}

/**
 * The four `*Access*` helpers below replace the legacy `toggleable_ids` + `superior_closed` +
 * `self_hidden` trio (PHP `userlist_api.php` / `accountlistapi.php?for_assignment=1`).
 *
 * Why they changed: Spring has **no** `self_hidden` / `superior_closed` anywhere — grep the
 * backend for either name and you get nothing, and `AdminDTO.AccountPermissionItem` carries only
 * `id` + `account_id`. The stored grant set is exactly what the client submits, expressed as
 * `null` (all) / `[]` (none) / `[{id}]` rows. So "which accounts may this editor tick" is no
 * longer a server-supplied hint — it is:
 *   1. the modal's list, which the list endpoints already narrow by the *requester's* own ACL
 *      (`UserServiceImpl.filterByAccountAcl` / `ProcessServiceImpl.filterByProcessAcl`), and
 *   2. the client-side rules below, which the server does NOT re-check.
 *
 * Ported from Count-frontend/src/pages/userlist/userListLogic.js (desktop), keeping the desktop
 * names verbatim so the two files stay diffable — even though desktop itself applies the
 * "Account" ones to processes as well (they are generic over `{id}` rows).
 */

/**
 * Self-edit "held" baseline = everything still granted, which is exactly what may be (re)checked.
 * A grant a superior removed is simply absent from `existingPerms`, so it can't be re-checked —
 * that is how the legacy `superior_closed` flag is expressed now. Unset (null) → the currently
 * visible modal ids.
 *
 * @param {Array<{id?: number}|number>|null|undefined} existingPerms
 * @param {boolean} existingUnset
 * @param {Iterable<number|string>} visibleIds
 * @returns {Set<number>}
 */
export function buildSelfAccHeldIds(existingPerms, existingUnset, visibleIds) {
  const toId = (x) => Number(x?.id ?? x);
  if (!existingUnset && existingPerms != null) {
    return new Set(
      (Array.isArray(existingPerms) ? existingPerms : []).map(toId).filter((id) => id > 0),
    );
  }
  return new Set([...visibleIds].map(Number).filter((id) => id > 0));
}

/**
 * Self-edit payload: only checked ids among held grants. This is the only guard against an admin
 * granting themselves more than they already hold — the backend does not compare the submitted
 * ids against the actor's own grants.
 *
 * @param {Array<{id?: number}|number>|null|undefined} heldPerms
 * @param {Array<{id?: number}|number>} submittedPerms
 * @returns {Array<{id: number}>}
 */
export function shrinkAccountPermissionsForSelf(heldPerms, submittedPerms) {
  const toId = (x) => Number(x?.id ?? x);
  const submittedIds = [
    ...new Set((Array.isArray(submittedPerms) ? submittedPerms : []).map(toId).filter((id) => id > 0)),
  ];
  const heldIds = new Set(
    (Array.isArray(heldPerms) ? heldPerms : []).map(toId).filter((id) => id > 0),
  );
  return submittedIds.filter((id) => heldIds.has(id)).map((id) => ({ id }));
}

/**
 * Editing someone else: keep the grants the editor cannot see (they must not be revoked just
 * because they're invisible to this editor) and take the submitted ids from the grantable set.
 *
 * @param {Array<{id?: number}|number>|null|undefined} existingPerms  the target's current grants
 * @param {Array<{id?: number}|number>} submittedPerms  ids ticked in the modal
 * @param {Iterable<number|string>|null} grantableIds  modal ids; `null` = no restriction (owner)
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

/**
 * `null` means "all" server-side, so an editor who can see everything and ticks everything should
 * send `null` rather than materialising a huge grant list. Clearing always persists `[]` — never
 * `null`, which would read back as "all".
 *
 * @param {{ isSelf: boolean, editorSeesAll: boolean, selectedIds: Set<number>|Iterable<number>, rows: Array<{id?: number}> }} args
 * @param {Array<{id: number}>} compactRows
 * @returns {Array<{id: number}>|null}
 */
export function resolveSeeAllOrCompactPermissions({ isSelf, editorSeesAll, selectedIds, rows }, compactRows) {
  if (isSelf || !editorSeesAll) return compactRows;
  const selected = selectedIds instanceof Set ? selectedIds : new Set([...selectedIds].map(Number));
  const selectedCount = [...selected].filter((id) => Number(id) > 0).length;
  if (selectedCount === 0) {
    return Array.isArray(compactRows) ? compactRows : [];
  }
  const rowIds = (Array.isArray(rows) ? rows : [])
    .map((r) => Number(r?.id ?? r))
    .filter((id) => id > 0);
  if (rowIds.length > 0 && rowIds.every((id) => selected.has(id))) {
    return null;
  }
  return compactRows;
}

/**
 * Bulk select/clear for a self-edit: "select all" may only re-check held ids, so a grant a
 * superior removed (still visible in a stale modal list) stays revoked.
 *
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

export function validateUserEmail(raw) {
  const normalized = String(raw || "").trim().toLowerCase();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
  return { ok, normalized };
}

function tenantCode(value) {
  return String(value || "").trim().toUpperCase();
}

function isVirtualGroupLink(row) {
  return tenantCode(row?.link_source_group ?? row?.linkSourceGroup) !== "";
}

function isGroupEntity(row, groupId) {
  const group = tenantCode(groupId);
  if (!row || !group || isVirtualGroupLink(row)) return false;
  const code = tenantCode(row.company_id ?? row.companyId ?? row.code);
  const rowGroup = tenantCode(row.group_id ?? row.groupId ?? row.group);
  return code === group || (code === "" && rowGroup === group);
}

/** Desktop-aligned dual tenant picker: one assignable entity row per visible group. */
export function buildAdminGroupOptions(companies, visibleGroupIds) {
  const rows = Array.isArray(companies) ? companies : [];
  const out = [];
  const seen = new Set();
  for (const rawGroup of visibleGroupIds || []) {
    const group = tenantCode(rawGroup);
    if (!group || seen.has(group)) continue;
    const entity = rows.find((row) => isGroupEntity(row, group));
    const fallback = rows.find((row) => {
      if (isVirtualGroupLink(row)) return false;
      return tenantCode(row?.group_id ?? row?.groupId ?? row?.group) === group;
    });
    const picked = entity || fallback;
    const id = Number(picked?.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    seen.add(group);
    out.push({ ...picked, id, company_id: group, group_id: group });
  }
  return out;
}

/** Desktop-aligned company area: subsidiaries and independent companies, deduped by code. */
export function buildAdminCompanyOptions(companies) {
  const out = [];
  const seen = new Set();
  for (const row of companies || []) {
    const code = tenantCode(row?.company_id ?? row?.companyId ?? row?.code);
    const group = tenantCode(row?.group_id ?? row?.groupId ?? row?.group);
    if (!code || isGroupEntity(row, group) || seen.has(code)) continue;
    const id = Number(row?.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    seen.add(code);
    out.push({ ...row, id, company_id: code });
  }
  return out;
}

export function resolveAdminGroupEntityIds(groupOptions, groupCodes) {
  const wanted = new Set((groupCodes || []).map(tenantCode).filter(Boolean));
  return (groupOptions || [])
    .filter((row) => wanted.has(tenantCode(row?.group_id || row?.company_id)))
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id) && id > 0);
}

export function resolveAdminGroupCodes(groupOptions, selectedIds) {
  const wanted = new Set([...selectedIds].map(Number));
  const out = [];
  for (const row of groupOptions || []) {
    if (!wanted.has(Number(row.id))) continue;
    const code = tenantCode(row?.group_id || row?.company_id);
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}
