/**
 * Group vs Company login scope — mirrors {@link includes/group_company_access.php}.
 */
import {
  DASHBOARD_GROUP_FILTER_KEY,
  findOwnerCompanyById,
  isDashboardGroupOnlyMode,
  normalizeNativeCompanyGroupId,
  readAccessibleGroupIds,
  readDashboardSelectedCompanyId,
  resolveViewGroupForCompany,
} from "./sharedCompanyFilter.js";
import { peekCompanySessionFlags } from "./companySessionFlagsCache.js";
import { buildSidebarExpirationFields } from "../expiration/expirationReminder.js";

export const LOGIN_SCOPE_GROUP = "group";
export const LOGIN_SCOPE_COMPANY = "company";

export function normalizeLoginScope(scope) {
  const s = String(scope || "").trim().toLowerCase();
  if (s === LOGIN_SCOPE_GROUP || s === LOGIN_SCOPE_COMPANY) return s;
  return null;
}

export function getLoginScope(me) {
  return normalizeLoginScope(me?.login_scope);
}

export function getLoginIdentifier(me) {
  const id = String(me?.login_identifier || "").trim().toUpperCase();
  return id || null;
}

/**
 * Login scope from sign-in:
 * - group: dashboard uses group_only ledger (AP/IG as group_code), never legacy group-entity company row
 * - company: pick subsidiary company pills (group_id is view filter only)
 */
export function isGroupLogin(me) {
  return getLoginScope(me) === LOGIN_SCOPE_GROUP;
}

export function isCompanyLogin(me) {
  return getLoginScope(me) === LOGIN_SCOPE_COMPANY;
}

/** Native group of login company (default GroupID on boot). */
export function resolveCompanyLoginGroupId(me, companies = []) {
  if (!isCompanyLogin(me)) return null;
  const fromSession = me?.login_group_id;
  if (fromSession != null && String(fromSession).trim() !== "") {
    return String(fromSession).trim().toUpperCase();
  }
  const ident = getLoginIdentifier(me);
  if (!ident) return null;
  const row = (companies || []).find(
    (c) => String(c.tenant_code || "").trim().toUpperCase() === ident
  );
  const gid = row?.group_id ? String(row.group_id).trim().toUpperCase() : null;
  return gid || null;
}

/** Linked group ids for filter pills (AP+IG when domain/ownership links). */
export function resolveAccessibleGroupIds(me, companies = []) {
  const fromSession = readAccessibleGroupIds(me);
  const set = new Set(fromSession);
  const ident = getLoginIdentifier(me);
  // Group login: login_identifier is a group id (e.g. AP). Company login: it is a company code — do not add as a group pill.
  if (ident && isGroupLogin(me)) set.add(ident);
  if (isCompanyLogin(me)) {
    const loginGroup = resolveCompanyLoginGroupId(me, companies);
    if (loginGroup) set.add(loginGroup);
    for (const g of getAssignedGroupCodes(me)) set.add(g);
  }
  for (const c of companies || []) {
    const g = String(c?.group_id || "").trim().toUpperCase();
    if (g) set.add(g);
    const link = c?.link_source_group ? String(c.link_source_group).trim().toUpperCase() : "";
    if (link) set.add(link);
  }
  return [...set].sort();
}

/** Company login: full owner list. Group login: login group + linked groups (AP+IG). */
export function companyMatchesLoginScope(company, me, companies = []) {
  const scope = getLoginScope(me);
  const ident = getLoginIdentifier(me);
  if (!scope || !company) return true;
  if (!ident && scope !== LOGIN_SCOPE_COMPANY) return true;

  if (scope === LOGIN_SCOPE_COMPANY) return true;

  const linkSrc = company.link_source_group
    ? String(company.link_source_group).trim().toUpperCase()
    : "";
  if (!linkSrc && !normalizeNativeCompanyGroupId(company)) {
    return true;
  }

  const gid = String(company.group_id || "").trim().toUpperCase();
  const accessible = resolveAccessibleGroupIds(me, companies);
  if (accessible.length) {
    return accessible.some((g) => g === gid || g === linkSrc);
  }
  return ident != null && (gid === ident || linkSrc === ident);
}

export function filterCompaniesForLoginScope(companies, me) {
  if (!Array.isArray(companies) || !getLoginScope(me)) return companies || [];
  if (isCompanyLogin(me)) return companies;
  return companies.filter((c) => companyMatchesLoginScope(c, me, companies));
}

/** Admin-assigned group ledger tenants (user_group_map), from current_user_api. */
export function getAssignedGroupCodes(me) {
  const raw = me?.assigned_group_codes;
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const code of raw) {
    const g = String(code || "").trim().toUpperCase();
    if (!g || seen.has(g)) continue;
    seen.add(g);
    out.push(g);
  }
  return out.sort();
}

/** Admin-assigned subsidiary company ids (user_company_map scope_type=company). */
export function getAssignedCompanyIds(me) {
  const raw = me?.assigned_company_ids;
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const id of raw) {
    const n = Number(id);
    if (!Number.isFinite(n) || n <= 0 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out.sort((a, b) => a - b);
}

/**
 * May the session call transaction scope APIs for this company_id?
 * Mirrors tx_resolve_request_company_id / gc_session_can_access_company_id (frontend-safe).
 *
 * @param {string|null|undefined} [viewGroup] AP/IG when querying a subsidiary under a group tab.
 */
export function canPrefetchCompanyScope(me, companyId, companies = [], viewGroup = null) {
  const id = Number(companyId);
  if (!Number.isFinite(id) || id <= 0 || !me) return false;

  const list = Array.isArray(companies) ? companies : [];
  const row = list.find((c) => Number(c.id) === id) ?? null;
  const vg =
    viewGroup != null && String(viewGroup).trim() !== ""
      ? String(viewGroup).trim().toUpperCase()
      : null;

  if (isGroupLogin(me)) {
    if (!row || !companyMatchesLoginScope(row, me, list)) return false;
    if (vg) {
      const native = normalizeNativeCompanyGroupId(row);
      const link = row.link_source_group
        ? String(row.link_source_group).trim().toUpperCase()
        : "";
      return native === vg || link === vg || canAccessGroupLedgerForGroup(me, vg, list);
    }
    return true;
  }

  const role = String(me.role || "").trim().toLowerCase();
  const userType = String(me.user_type || "").trim().toLowerCase();

  if (role === "owner") {
    return row != null;
  }

  if (userType === "member") {
    return Number(me.tenant_id) === id;
  }

  if (Number(me.tenant_id) === id) return true;

  const assignedIds = getAssignedCompanyIds(me);
  if (assignedIds.includes(id)) return true;

  if (vg) {
    if (!canAccessGroupLedgerForGroup(me, vg, list)) return false;
    if (!row) return false;
    if (companyLoginHasGroupLedgerPrivilege(me)) return true;
    if (userHasAssignedGroupLedger(me) && getAssignedGroupCodes(me).includes(vg)) {
      return true;
    }
    return false;
  }

  return false;
}

/**
 * Rows that dashboard_api will accept for this user (user_company_map / assigned ids).
 * Owner and group-login users keep the full list.
 */
export function filterCompaniesForDashboardApiAccess(
  me,
  companyRows,
  companies = [],
  viewGroup = null
) {
  if (!Array.isArray(companyRows) || !companyRows.length || !me) return [];
  const list = Array.isArray(companies) && companies.length ? companies : companyRows;
  const role = String(me.role || "").trim().toLowerCase();
  if (role === "owner" || isGroupLogin(me)) {
    return companyRows;
  }
  const groupCtx =
    viewGroup != null && String(viewGroup).trim() !== ""
      ? String(viewGroup).trim().toUpperCase()
      : null;
  return companyRows.filter((row) => {
    const id = Number(row?.id);
    if (!Number.isFinite(id) || id <= 0) return false;
    const vg = groupCtx ?? resolveViewGroupForCompany(row, null);
    return canPrefetchCompanyScope(me, id, list, vg);
  });
}

/**
 * Admin assigned group ledger (user_group_map) — NOT login_scope.
 */
export function userHasAssignedGroupLedger(me) {
  return getAssignedGroupCodes(me).length > 0;
}

/** Company login: owner may enter group-only without user_group_map (manage all groups they can see). */
export function companyLoginHasGroupLedgerPrivilege(me) {
  if (!isCompanyLogin(me)) return false;
  const role = String(me?.role || "").trim().toLowerCase();
  const userType = String(me?.user_type || "").trim().toLowerCase();
  return role === "owner" || userType === "owner";
}

function resolveCompanyLoginAccessibleGroupSet(me, companies = []) {
  const set = new Set(resolveAccessibleGroupIds(me, companies));
  for (const g of getAssignedGroupCodes(me)) set.add(g);
  return set;
}

export function userCanUseGroupLedger(me) {
  if (!me) return false;
  if (isGroupLogin(me)) return true;
  if (isCompanyLogin(me)) {
    return companyLoginHasGroupLedgerPrivilege(me) || userHasAssignedGroupLedger(me);
  }
  return Boolean(me.can_use_group_ledger) || userHasAssignedGroupLedger(me);
}

/**
 * Permission: may this user access group ledger for a specific group code?
 * - Group login: login scope + linked groups
 * - Company login owner: any accessible group pill (session accessible_group_ids)
 * - Company login admin/others: Admin User modal Groups row (assigned_group_codes)
 */
export function canAccessGroupLedgerForGroup(me, groupCode, companies = []) {
  if (!me || groupCode == null || String(groupCode).trim() === "") return false;
  const g = String(groupCode).trim().toUpperCase();
  if (isGroupLogin(me)) {
    const ident = getLoginIdentifier(me);
    if (ident === g) return true;
    return resolveAccessibleGroupIds(me, companies).includes(g);
  }
  if (isCompanyLogin(me)) {
    if (companyLoginHasGroupLedgerPrivilege(me)) {
      const set = resolveCompanyLoginAccessibleGroupSet(me, companies);
      if (set.has(g)) return true;
      // Owner/admin: allow group-only while companies list is still loading.
      if (!companies?.length) return true;
      return false;
    }
    return getAssignedGroupCodes(me).includes(g);
  }

  const role = String(me?.role || me?.user_type || "").trim().toLowerCase();
  if (role === "owner") {
    for (const c of companies || []) {
      if (normalizeNativeCompanyGroupId(c) === g) return true;
    }
    return userCanUseGroupLedger(me);
  }

  return getAssignedGroupCodes(me).includes(g);
}

/**
 * Runtime: may user deselect company and view group ledger?
 * Company login manager/etc. without Admin-assigned Group → false (group pill wraps company only).
 *
 * @param {object|null|undefined} me
 * @param {string|null|undefined} [groupCode] When set, requires access to that specific group.
 * @param {object[]} [companies] Owner company rows — refines group access when groupCode is set.
 */
export function canUseGroupOnlyMode(me, groupCode = null, companies = null) {
  if (!me) return false;
  if (groupCode != null && String(groupCode).trim() !== "") {
    return canAccessGroupLedgerForGroup(me, groupCode, companies ?? []);
  }
  return userCanUseGroupLedger(me);
}

/** Company login without privilege or assignment must keep a subsidiary when a group pill is shown. */
export function companyLoginRequiresSubsidiaryWithGroup(me) {
  return (
    isCompanyLogin(me) &&
    !companyLoginHasGroupLedgerPrivilege(me) &&
    !userHasAssignedGroupLedger(me)
  );
}

/**
 * Runtime UI state: viewing group ledger (no subsidiary company selected).
 * @param {object|null|undefined} me
 * @param {{ companyId?: number|null, selectedGroup?: string|null, groupOnly?: boolean }} ctx
 */
export function isGroupLedgerMode(me, ctx = {}) {
  const companyId = ctx.companyId ?? null;
  if (companyId != null && Number.isFinite(Number(companyId))) return false;
  let selectedGroup = ctx.selectedGroup
    ? String(ctx.selectedGroup).trim().toUpperCase()
    : null;
  if (!selectedGroup && typeof sessionStorage !== "undefined") {
    const raw = sessionStorage.getItem(DASHBOARD_GROUP_FILTER_KEY);
    selectedGroup = raw ? String(raw).trim().toUpperCase() : null;
  }
  if (!selectedGroup) return false;
  const groupOnly =
    ctx.groupOnly != null ? Boolean(ctx.groupOnly) : isDashboardGroupOnlyMode();
  if (!groupOnly) return false;
  return canAccessGroupLedgerForGroup(me, selectedGroup);
}

/** When selecting a company pill, clear group-only unless user stays in group ledger. */
export function shouldClearGroupOnlyOnCompanySelect(me, companyId) {
  if (companyId == null || !Number.isFinite(Number(companyId))) return false;
  return true;
}

/**
 * Maintenance pages: group-only without auto-picking subsidiary.
 * Company login: owner/admin or Admin-assigned group ledger.
 */
export function maintenancePageAllowGroupOnlyPill(me) {
  if (isCompanyLogin(me)) {
    return canUseGroupOnlyMode(me);
  }
  return true;
}

/** Mirrors api/c168/c168_domain_access.php c168DomainPageAllowedRoles */
const C168_DOMAIN_PAGE_ROLES = new Set([
  "owner",
  "partnership",
  "admin",
  "manager",
  "supervisor",
  "accountant",
  "audit",
  "customer service",
  "company",
]);

/** Mirrors c168AutoRenewAllowedRoles */
const C168_AUTO_RENEW_ROLES = new Set(["owner", "admin"]);

export function userRoleAllowsC168Domain(role) {
  const r = String(role || "").trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
  return C168_DOMAIN_PAGE_ROLES.has(r);
}

export function userRoleAllowsC168AutoRenew(role, userType) {
  if (String(userType || "").trim().toLowerCase() === "member") return false;
  const r = String(role || "").trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
  return C168_AUTO_RENEW_ROLES.has(r);
}

/**
 * May click active company pill again to clear it (enter group-only).
 * @param {string|null|undefined} [groupCode] Active group pill code (AP/IG).
 */
export function canClearCompanySelection(me, groupCode = null) {
  return canUseGroupOnlyMode(me, groupCode);
}

/**
 * Group pills: group/company login → login group + linked groups (AP+IG) from session/API.
 */
export function resolveVisibleGroupIds(groupIds, me, companies = []) {
  const ids = Array.isArray(groupIds) ? groupIds : [];
  const scope = getLoginScope(me);
  if (!scope) return ids;

  const accessible = resolveAccessibleGroupIds(me, companies);
  if (accessible.length) {
    const set = new Set([...ids, ...accessible]);
    return [...set].sort();
  }

  const ident = getLoginIdentifier(me);
  if (scope === LOGIN_SCOPE_GROUP && ident) {
    return ids.includes(ident) ? [ident] : [ident];
  }

  return ids;
}

export function loginScopeBodyClass(me) {
  if (isGroupLogin(me)) return "ec-login-scope-group";
  if (isCompanyLogin(me)) return "ec-login-scope-company";
  return "";
}

/**
 * Append group scope query params for API calls when logged in as a group tenant.
 * @param {URLSearchParams|Record<string, string>} target
 */
export function appendLoginScopeQueryParams(target, me) {
  if (!isGroupLogin(me)) return target;
  const code = getLoginIdentifier(me);
  if (!code) return target;
  if (target instanceof URLSearchParams) {
    if (!target.has("group_id")) target.set("group_id", code);
    if (!target.has("view_group")) target.set("view_group", code);
    return target;
  }
  if (target && typeof target === "object") {
    if (target.group_id == null || String(target.group_id).trim() === "") {
      target.group_id = code;
    }
    if (target.view_group == null || String(target.view_group).trim() === "") {
      target.view_group = code;
    }
  }
  return target;
}

/** Normalize company code for sidebar / session patches (empty → null). */
export function normalizeCompanyCode(value) {
  const code = String(value ?? "").trim().toUpperCase();
  return code || null;
}

const SIDEBAR_PATCH_FIELD_KEYS = [
  "tenant_id",
  "tenant_code",
  "is_current_tenant_c168",
  "has_c168_domain_page_access",
  "has_c168_auto_renew_access",
  "tenant_has_game",
  "tenant_has_bank",
  "expiration_date",
  "expiration_hint",
  "expiration_status",
  "days_until_expiration",
];

function meSidebarPatchEqual(a, b) {
  if (a === b) return true;
  for (const key of SIDEBAR_PATCH_FIELD_KEYS) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * Optimistic sidebar `me` patch when tenant filter changes (before current-user returns).
 * When `tenantCode` is supplied in ctx, never fall back to stale `me.tenant_code`.
 */
export function patchMeFromCompanyContext(me, ctx = {}) {
  if (!me) return me;
  const rawId = ctx.tenantId ?? ctx.companyId;
  const tenantCodeInput = ctx.tenantCode ?? ctx.companyCode;
  const hasExplicitCode = tenantCodeInput != null && String(tenantCodeInput).trim() !== "";
  if (rawId == null || rawId === "" || !Number.isFinite(Number(rawId)) || Number(rawId) <= 0) {
    const next = {
      ...me,
      tenant_id: null,
      is_current_tenant_c168: false,
      has_c168_domain_page_access: false,
      has_c168_auto_renew_access: false,
      tenant_code: hasExplicitCode ? normalizeCompanyCode(tenantCodeInput) : "",
    };
    if (ctx.hasGambling != null) {
      next.tenant_has_game = Boolean(ctx.hasGambling);
    }
    if (ctx.hasBank != null) {
      next.tenant_has_bank = Boolean(ctx.hasBank);
    }
    if (ctx.expirationDate !== undefined) {
      Object.assign(next, buildSidebarExpirationFields(ctx.expirationDate));
    }
    return meSidebarPatchEqual(me, next) ? me : next;
  }
  const id = Number(rawId);
  const tenantChanged = Number(me.tenant_id) !== id;
  const explicitCode = hasExplicitCode ? normalizeCompanyCode(tenantCodeInput) : null;
  const fallbackCode = normalizeCompanyCode(me.tenant_code) ?? "";
  const code = hasExplicitCode ? explicitCode ?? "" : fallbackCode;
  const isC168 = code === "C168";
  const next = {
    ...me,
    tenant_id: id,
    tenant_code: hasExplicitCode ? code : code || me.tenant_code,
    is_current_tenant_c168: isC168,
  };
  if (isC168) {
    if (userRoleAllowsC168Domain(me.role)) {
      next.has_c168_domain_page_access = true;
    }
    if (userRoleAllowsC168AutoRenew(me.role, me.user_type)) {
      next.has_c168_auto_renew_access = true;
    }
  } else {
    next.has_c168_domain_page_access = false;
    next.has_c168_auto_renew_access = false;
  }
  if (ctx.hasGambling != null) {
    next.tenant_has_game = Boolean(ctx.hasGambling);
  } else if (tenantChanged) {
    const cached = peekCompanySessionFlags(id);
    if (cached) {
      next.tenant_has_game = Boolean(cached.has_game);
    }
  }
  if (ctx.hasBank != null) {
    next.tenant_has_bank = Boolean(ctx.hasBank);
  } else if (tenantChanged) {
    const cached = peekCompanySessionFlags(id);
    if (cached) {
      next.tenant_has_bank = Boolean(cached.has_bank);
    }
  }
  if (ctx.expirationDate !== undefined) {
    Object.assign(next, buildSidebarExpirationFields(ctx.expirationDate));
  }
  return meSidebarPatchEqual(me, next) ? me : next;
}

/** Session / current_user reflects active company (after dashboard company pick + session sync). */
export function isActiveCompanyContextC168(me) {
  if (!me) return false;
  if (isDashboardGroupOnlyMode()) return false;
  if (me.is_current_tenant_c168) return true;
  if (String(me.tenant_code || "").trim().toUpperCase() === "C168") return true;
  const persistedId = readDashboardSelectedCompanyId();
  if (persistedId != null) {
    const row = findOwnerCompanyById(persistedId);
    if (String(row?.tenant_code || "").trim().toUpperCase() === "C168") return true;
  }
  return false;
}

/**
 * Domain & Announcement — only while viewing company C168 (any login: group or company).
 * Hidden in group-only dashboard mode (no company selected) even if anchor session is C168.
 */
export function canAccessC168DomainPages(me) {
  if (!me) return false;
  if (isDashboardGroupOnlyMode()) return false;
  if (isGroupLedgerMode(me, { companyId: null })) return false;
  if (!isActiveCompanyContextC168(me)) return false;
  return userRoleAllowsC168Domain(me.role) || Boolean(me.has_c168_domain_page_access);
}

/** Auto Renew — same rules as Domain / Announcement. */
export function canAccessC168AutoRenew(me) {
  if (!me) return false;
  if (isDashboardGroupOnlyMode()) return false;
  if (isGroupLedgerMode(me, { companyId: null })) return false;
  if (!isActiveCompanyContextC168(me)) return false;
  return userRoleAllowsC168AutoRenew(me.role, me.user_type) || Boolean(me.has_c168_auto_renew_access);
}
