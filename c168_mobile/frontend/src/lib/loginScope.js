/**
 * Group vs company login scope — mirrors desktop loginScope.js / group_company_access.php.
 */

export const LOGIN_SCOPE_GROUP = "group";
export const LOGIN_SCOPE_COMPANY = "company";

const SYSTEM_IT_LOGIN_IDS = new Set(["IT_JK", "IT_JS", "IT_MS"]);

export function isSystemMaintenanceItUser(me) {
  const loginId = String(me?.login_id || "").trim().toUpperCase();
  return SYSTEM_IT_LOGIN_IDS.has(loginId);
}

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

export function isGroupLogin(me) {
  return getLoginScope(me) === LOGIN_SCOPE_GROUP;
}

export function isCompanyLogin(me) {
  return getLoginScope(me) === LOGIN_SCOPE_COMPANY;
}

function readAccessibleGroupIds(me) {
  const raw = me?.accessible_group_ids;
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

export function userHasExplicitAssignedScope(me) {
  const role = String(me?.role || "").trim().toLowerCase();
  if (role === "owner") return false;
  return getAssignedCompanyIds(me).length > 0 || getAssignedGroupCodes(me).length > 0;
}

function normalizeNativeCompanyGroupId(comp) {
  if (!comp) return "";
  const native = comp.native_group_id ?? comp.nativeGroupId;
  if (native != null && String(native).trim() !== "") {
    return String(native).trim().toUpperCase();
  }
  return String(comp?.group_id || "").trim().toUpperCase();
}

export function resolveAssignedScopeGroupIds(me, companies = []) {
  const assignedGroups = getAssignedGroupCodes(me);
  const assignedCompanyIds = getAssignedCompanyIds(me);
  const out = new Set();
  for (const g of assignedGroups) {
    const norm = String(g || "").trim().toUpperCase();
    if (norm) out.add(norm);
  }
  if (assignedCompanyIds.length > 0) {
    const idSet = new Set(assignedCompanyIds);
    for (const c of companies || []) {
      const id = Number(c?.id);
      if (!Number.isFinite(id) || id <= 0 || !idSet.has(id)) continue;
      const gid = normalizeNativeCompanyGroupId(c);
      if (gid) out.add(gid);
    }
  }
  return [...out].sort();
}

export function companyMatchesLoginScope(company, me, companies = []) {
  const scope = getLoginScope(me);
  const ident = getLoginIdentifier(me);
  if (!scope || !company) return true;
  if (!ident && scope !== LOGIN_SCOPE_COMPANY) return true;
  if (scope === LOGIN_SCOPE_COMPANY) return true;
  const linkSrc = company.link_source_group
    ? String(company.link_source_group).trim().toUpperCase()
    : "";
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

export function filterCompaniesForAssignedScope(companies, me) {
  if (!Array.isArray(companies) || companies.length === 0 || !me) return companies || [];
  const role = String(me.role || "").trim().toLowerCase();
  if (role === "owner") return companies;
  const assignedIds = getAssignedCompanyIds(me);
  if (assignedIds.length === 0) return companies;
  const idSet = new Set(assignedIds);
  const groupSet = new Set(getAssignedGroupCodes(me));
  return companies.filter((c) => {
    if (idSet.has(Number(c?.id))) return true;
    const gid = String(c?.group_id || "").trim().toUpperCase();
    if (gid && groupSet.has(gid)) return true;
    const link = c?.link_source_group ? String(c.link_source_group).trim().toUpperCase() : "";
    if (link && groupSet.has(link)) return true;
    return false;
  });
}

export function filterCompaniesForUserScope(companies, me) {
  return filterCompaniesForAssignedScope(filterCompaniesForLoginScope(companies, me), me);
}

export function companyLoginRequiresSubsidiaryWithGroup(me) {
  return (
    isCompanyLogin(me) &&
    !companyLoginHasGroupLedgerPrivilege(me) &&
    !userHasAssignedGroupLedger(me)
  );
}

export function resolveVisibleGroupIds(groupIds, me, companies = []) {
  const ids = Array.isArray(groupIds) ? groupIds : [];
  if (!me) return ids;
  if (userHasExplicitAssignedScope(me)) {
    const scoped = resolveAssignedScopeGroupIds(me, companies);
    if (scoped.length) return scoped;
    return ids;
  }
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

export function userHasAssignedGroupLedger(me) {
  return getAssignedGroupCodes(me).length > 0;
}

export function companyLoginHasGroupLedgerPrivilege(me) {
  if (!isCompanyLogin(me)) return false;
  const role = String(me?.role || "").trim().toLowerCase();
  const userType = String(me?.user_type || "").trim().toLowerCase();
  return role === "owner" || userType === "owner";
}

/** Desktop parity: company login that may use Groups All → group-ledger aggregate. */
export function companyLoginCanUseGroupsAllLedger(me) {
  if (!me || !isCompanyLogin(me) || isGroupLogin(me)) return false;
  if (!canUseGroupOnlyMode(me)) return false;
  return companyLoginHasGroupLedgerPrivilege(me) || userHasAssignedGroupLedger(me);
}

export function resolveAccessibleGroupIds(me, companies = []) {
  const set = new Set(readAccessibleGroupIds(me));
  const ident = getLoginIdentifier(me);
  if (ident && isGroupLogin(me)) set.add(ident);
  if (isCompanyLogin(me)) {
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
      if (!companies?.length) return true;
      return false;
    }
    return getAssignedGroupCodes(me).includes(g);
  }

  const role = String(me?.role || me?.user_type || "").trim().toLowerCase();
  if (role === "owner") {
    for (const c of companies || []) {
      const gid = String(c?.group_id || "").trim().toUpperCase();
      if (gid === g) return true;
    }
    return userCanUseGroupLedger(me);
  }

  return getAssignedGroupCodes(me).includes(g);
}

/**
 * May user deselect company and view group ledger for the given group?
 */
export function canUseGroupOnlyMode(me, groupCode = null, companies = null) {
  if (isSystemMaintenanceItUser(me)) return false;
  if (!me) return false;
  if (groupCode != null && String(groupCode).trim() !== "") {
    return canAccessGroupLedgerForGroup(me, groupCode, companies ?? []);
  }
  return userCanUseGroupLedger(me);
}
