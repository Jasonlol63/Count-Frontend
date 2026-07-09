/**
 * Pure helpers mirroring legacy `js/shared_company_filter.js` + PHP `api/company/company_filter.php` (SSR, unused by SPA).
 * React pages should use these for session key `dashboard_group_filter` and group/company visibility logic.
 *
 * Login scope rules: see `loginScope.js` and `includes/group_company_access.php`.
 */
import { buildApiUrl } from "../core/apiUrl.js";
import { pathnameIs } from "../routing/pageRoutes.js";
import {
  fetchAccessibleTenants,
  tenantAccessibleRowToUiCompany,
} from "./tenantAccessibleApi.js";
import {
  clearCompanySessionFlagsCache,
  peekCompanySessionFlags,
  rememberCompanySessionFlags,
} from "./companySessionFlagsCache.js";
import {
  permissionsIncludeBank,
  permissionsIncludeGames,
  resolveCompanyCategoryFlagsFromRow,
} from "./companyCategoryFlags.js";
import {
  canUseGroupOnlyMode,
  filterCompaniesForLoginScope,
  getLoginIdentifier,
  getLoginScope,
  isCompanyLogin,
  isGroupLogin,
  resolveAccessibleGroupIds,
} from "./loginScope.js";

export {
  canUseGroupOnlyMode,
  filterCompaniesForLoginScope,
  getLoginIdentifier,
  getLoginScope,
  isCompanyLogin,
  isGroupLogin,
} from "./loginScope.js";

export const DASHBOARD_GROUP_FILTER_KEY = "dashboard_group_filter";
/** Set to "1" when company login explicitly cleared the group pill (do not re-derive from company row). */
export const DASHBOARD_GROUP_FILTER_OPT_OUT_KEY = "dashboard_group_filter_opt_out";
/** Set to "1" when user cleared company but kept a group (group-only mode across pages). */
export const DASHBOARD_GROUP_ONLY_KEY = "dashboard_group_only";
/** Set to "1" when Company row "All" aggregates subsidiaries in the current group scope. */
export const DASHBOARD_GROUP_ALL_MODE_KEY = "dashboard_group_all_mode";
/** Set to "1" when Group row "All" is active (every group — never sent as group_id). */
export const DASHBOARD_GROUPS_ALL_MODE_KEY = "dashboard_groups_all_mode";
/** Last AP/IG tab before Group "All" — sidebar menu follows this group while groups-all KPI scope is active. */
export const DASHBOARD_GROUPS_ALL_SIDEBAR_GROUP_KEY = "dashboard_groups_all_sidebar_group";
/** Last explicitly selected company id (SPA navigation; overrides stale PHP session when set). */
export const DASHBOARD_SELECTED_COMPANY_KEY = "dashboard_selected_company_id";
/** Cross-page currency pill / dropdown selection (scoped by company or group). */
export const DASHBOARD_SELECTED_CURRENCY_KEY = "dashboard_selected_currency_code";
export const DASHBOARD_SELECTED_CURRENCY_SCOPE_KEY = "dashboard_selected_currency_scope";
/** Per company/group scope → last selected currency code (session JSON map). */
export const DASHBOARD_SELECTED_CURRENCY_BY_SCOPE_KEY = "dashboard_selected_currency_by_scope";
/** Prevents re-applying login defaults on refresh while the same login session is active. */
export const DASHBOARD_LOGIN_FILTER_APPLIED_KEY = "dashboard_login_filter_applied";
/** Linked parent tenant codes (AP+IG) from tenant-accessible API for company login filter pills. */
export const DASHBOARD_ACCESSIBLE_GROUP_IDS_KEY = "dashboard_accessible_group_ids";
export const DASHBOARD_GROUP_FILTER_EVENT = "eazycount:dashboard-group-filter-changed";
export const DASHBOARD_CURRENCY_FILTER_EVENT = "eazycount:dashboard-currency-filter-changed";
/** Dashboard Group/Company bootstrap finished — layout replays sidebar sync (login may miss events). */
export const DASHBOARD_GC_BOOTSTRAP_READY_EVENT = "eazycount:dashboard-gc-bootstrap-ready";
/** One-shot localStorage handoff when opening an authenticated route in a new tab (sessionStorage is per-tab). */
const DASHBOARD_TAB_BOOTSTRAP_KEY = "ec_dashboard_tab_bootstrap";
const DASHBOARD_TAB_BOOTSTRAP_KEYS = [
  DASHBOARD_GROUP_FILTER_KEY,
  DASHBOARD_GROUP_FILTER_OPT_OUT_KEY,
  DASHBOARD_GROUP_ONLY_KEY,
  DASHBOARD_GROUP_ALL_MODE_KEY,
  DASHBOARD_GROUPS_ALL_MODE_KEY,
  DASHBOARD_GROUPS_ALL_SIDEBAR_GROUP_KEY,
  DASHBOARD_SELECTED_COMPANY_KEY,
  DASHBOARD_SELECTED_CURRENCY_KEY,
  DASHBOARD_SELECTED_CURRENCY_SCOPE_KEY,
  DASHBOARD_SELECTED_CURRENCY_BY_SCOPE_KEY,
  DASHBOARD_LOGIN_FILTER_APPLIED_KEY,
  DASHBOARD_ACCESSIBLE_GROUP_IDS_KEY,
];

export function clearDashboardFilterSession() {
  clearCompanySessionFlagsCache();
  sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_KEY);
  sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY);
  sessionStorage.removeItem(DASHBOARD_GROUP_ONLY_KEY);
  sessionStorage.removeItem(DASHBOARD_GROUP_ALL_MODE_KEY);
  sessionStorage.removeItem(DASHBOARD_GROUPS_ALL_MODE_KEY);
  sessionStorage.removeItem(DASHBOARD_GROUPS_ALL_SIDEBAR_GROUP_KEY);
  sessionStorage.removeItem(DASHBOARD_SELECTED_COMPANY_KEY);
  sessionStorage.removeItem(DASHBOARD_SELECTED_CURRENCY_KEY);
  sessionStorage.removeItem(DASHBOARD_SELECTED_CURRENCY_SCOPE_KEY);
  sessionStorage.removeItem(DASHBOARD_SELECTED_CURRENCY_BY_SCOPE_KEY);
  sessionStorage.removeItem(DASHBOARD_LOGIN_FILTER_APPLIED_KEY);
  sessionStorage.removeItem(DASHBOARD_ACCESSIBLE_GROUP_IDS_KEY);
}

/** Snapshot dashboard filter sessionStorage for a new browser tab (middle-click / modified click). */
export function stashDashboardFilterForNewTab() {
  if (typeof window === "undefined") return;
  try {
    const snapshot = {};
    for (const key of DASHBOARD_TAB_BOOTSTRAP_KEYS) {
      const value = sessionStorage.getItem(key);
      if (value != null) snapshot[key] = value;
    }
    localStorage.setItem(DASHBOARD_TAB_BOOTSTRAP_KEY, JSON.stringify(snapshot));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Apply one-shot bootstrap in the new tab, if present. */
export function consumeDashboardFilterNewTabBootstrap() {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(DASHBOARD_TAB_BOOTSTRAP_KEY);
    if (!raw) return false;
    localStorage.removeItem(DASHBOARD_TAB_BOOTSTRAP_KEY);
    const snapshot = JSON.parse(raw);
    if (!snapshot || typeof snapshot !== "object") return false;
    for (const key of DASHBOARD_TAB_BOOTSTRAP_KEYS) {
      const value = snapshot[key];
      if (typeof value === "string") sessionStorage.setItem(key, value);
      else sessionStorage.removeItem(key);
    }
    return true;
  } catch {
    try {
      localStorage.removeItem(DASHBOARD_TAB_BOOTSTRAP_KEY);
    } catch {
      /* ignore */
    }
    return false;
  }
}

export function buildDashboardCurrencyScopeKey({ companyId, selectedGroup } = {}) {
  const cid = companyId != null && companyId !== "" ? Number(companyId) : Number.NaN;
  if (Number.isFinite(cid) && cid > 0) return `company:${cid}`;
  const g = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
  return g ? `group:${g}` : null;
}

export function readLastDashboardSelectedCurrency() {
  try {
    const cur = sessionStorage.getItem(DASHBOARD_SELECTED_CURRENCY_KEY);
    return cur ? String(cur).trim().toUpperCase() : null;
  } catch {
    return null;
  }
}

function normalizeCurrencyCodeList(availableCodes) {
  if (!Array.isArray(availableCodes)) return null;
  const codes = availableCodes.map((c) => String(c).trim().toUpperCase()).filter(Boolean);
  return codes.length ? codes : null;
}

function pickCurrencyIfAllowed(code, allowedCodes) {
  const cur = code ? String(code).trim().toUpperCase() : "";
  if (!cur) return null;
  if (allowedCodes?.length && !allowedCodes.includes(cur)) return null;
  return cur;
}

function readDashboardCurrencyScopeMap() {
  try {
    const raw = sessionStorage.getItem(DASHBOARD_SELECTED_CURRENCY_BY_SCOPE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeDashboardCurrencyScopeMap(map) {
  try {
    sessionStorage.setItem(DASHBOARD_SELECTED_CURRENCY_BY_SCOPE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** Last currency the user picked for a specific company or group scope. */
export function readDashboardScopedCurrency(scopeKey, availableCodes = null) {
  const key = scopeKey ? String(scopeKey).trim() : "";
  if (!key) return null;
  const allowed = normalizeCurrencyCodeList(availableCodes);
  const fromMap = pickCurrencyIfAllowed(readDashboardCurrencyScopeMap()[key], allowed);
  if (fromMap) return fromMap;
  try {
    if (sessionStorage.getItem(DASHBOARD_SELECTED_CURRENCY_SCOPE_KEY) !== key) return null;
    return pickCurrencyIfAllowed(sessionStorage.getItem(DASHBOARD_SELECTED_CURRENCY_KEY), allowed);
  } catch {
    return null;
  }
}

export function persistDashboardSelectedCurrency(scopeKey, code) {
  const key = scopeKey ? String(scopeKey).trim() : "";
  const cur = code ? String(code).trim().toUpperCase() : "";
  if (!cur) return;
  try {
    if (key) {
      sessionStorage.setItem(DASHBOARD_SELECTED_CURRENCY_SCOPE_KEY, key);
      const map = readDashboardCurrencyScopeMap();
      map[key] = cur;
      writeDashboardCurrencyScopeMap(map);
    }
    sessionStorage.setItem(DASHBOARD_SELECTED_CURRENCY_KEY, cur);
  } catch {
    /* ignore */
  }
}

/** Drop persisted currency for one company/group scope (used when switching company pills). */
export function clearDashboardScopedCurrency(scopeKey) {
  const key = scopeKey ? String(scopeKey).trim() : "";
  if (!key) return;
  try {
    const map = readDashboardCurrencyScopeMap();
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      delete map[key];
      writeDashboardCurrencyScopeMap(map);
    }
    if (sessionStorage.getItem(DASHBOARD_SELECTED_CURRENCY_SCOPE_KEY) === key) {
      sessionStorage.removeItem(DASHBOARD_SELECTED_CURRENCY_KEY);
      sessionStorage.removeItem(DASHBOARD_SELECTED_CURRENCY_SCOPE_KEY);
    }
  } catch {
    /* ignore */
  }
}

/** Clear cross-page currency pill selection (e.g. user picked ALL currencies). */
export function clearDashboardSelectedCurrency() {
  try {
    sessionStorage.removeItem(DASHBOARD_SELECTED_CURRENCY_KEY);
    sessionStorage.removeItem(DASHBOARD_SELECTED_CURRENCY_SCOPE_KEY);
    sessionStorage.removeItem(DASHBOARD_SELECTED_CURRENCY_BY_SCOPE_KEY);
  } catch {
    /* ignore */
  }
}

/** Last cross-page currency for a scope; falls back to global last when scopeOnly is false. */
export function readDashboardSelectedCurrency(scopeKey, options = {}) {
  const allowed = normalizeCurrencyCodeList(options.availableCodes);
  const scopeOnly = options.scopeOnly === true;
  const key = scopeKey ? String(scopeKey).trim() : "";
  if (key) {
    const scoped = readDashboardScopedCurrency(key, allowed);
    if (scoped) return scoped;
  }
  const isCompanyScope = key.startsWith("company:");
  if (!scopeOnly && !isCompanyScope) {
    const last = pickCurrencyIfAllowed(readLastDashboardSelectedCurrency(), allowed);
    if (last) return last;
  }
  return null;
}

/** Persist + broadcast so every currency-filter page stays in sync. */
export function notifyDashboardCurrencyFilterChanged(currencyCode, scopeKey = null) {
  const code = String(currencyCode || "").trim().toUpperCase();
  if (!code) return;
  const scope =
    scopeKey != null && String(scopeKey).trim()
      ? String(scopeKey).trim()
      : buildDashboardCurrencyScopeKey({});
  persistDashboardSelectedCurrency(scope, code);
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(DASHBOARD_CURRENCY_FILTER_EVENT, {
      detail: { currencyCode: code, scopeKey: scope },
    }),
  );
}

/** Boot / navigation: per-scope memory wins, then global last, then URL/default. */
export function resolveCrossPageCurrencyPreference({
  scopeKey = null,
  availableCodes = [],
  urlCurrency = "",
  scopeOnly = false,
} = {}) {
  const allowed = normalizeCurrencyCodeList(availableCodes) ?? [];
  const url = String(urlCurrency || "").trim().toUpperCase();
  const key = scopeKey ? String(scopeKey).trim() : "";
  if (key) {
    const scoped = readDashboardScopedCurrency(key, allowed.length ? allowed : null);
    if (scoped) return scoped;
  }
  const isCompanyScope = key.startsWith("company:");
  if (!scopeOnly && !isCompanyScope) {
    const global = pickCurrencyIfAllowed(
      readLastDashboardSelectedCurrency(),
      allowed.length ? allowed : null,
    );
    if (global) return global;
  }
  return (
    pickCurrencyIfAllowed(url, allowed.length ? allowed : null) ||
    allowed[0] ||
    ""
  );
}

/** Store linked parent tenant codes from tenant-accessible API (company login: AP+IG). */
export function persistAccessibleGroupIdsFromApi(json) {
  const ids = Array.isArray(json?.accessible_parent_tenant_codes)
    ? json.accessible_parent_tenant_codes
    : Array.isArray(json?.accessibleParentTenantCodes)
      ? json.accessibleParentTenantCodes
      : [];
  if (!ids.length) return;
  sessionStorage.setItem(
    DASHBOARD_ACCESSIBLE_GROUP_IDS_KEY,
    JSON.stringify(ids.map((g) => String(g).trim().toUpperCase()).filter(Boolean))
  );
}

export function readAccessibleGroupIds(me) {
  if (Array.isArray(me?.accessible_group_ids) && me.accessible_group_ids.length) {
    return me.accessible_group_ids.map((g) => String(g).trim().toUpperCase()).filter(Boolean);
  }
  try {
    const raw = sessionStorage.getItem(DASHBOARD_ACCESSIBLE_GROUP_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((g) => String(g).trim().toUpperCase()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function buildLoginFilterAppliedKey(me) {
  if (!me?.login_scope || !me?.login_identifier) return null;
  const uid = me.user_id != null ? String(me.user_id) : "";
  const scope = String(me.login_scope).trim().toLowerCase();
  const ident = String(me.login_identifier).trim().toUpperCase();
  if (!uid || !scope || !ident) return null;
  return `${uid}|${scope}|${ident}`;
}

/**
 * Seed dashboard Group / Company sessionStorage from login scope (company code vs group id).
 * @returns {{ selectedGroup: string|null, companyId: number|null, groupOnly: boolean }}
 */
export function seedDashboardFilterFromLogin({
  loginScope,
  loginIdentifier,
  companies = [],
  sessionTenantId = null,
  sessionTenantCode = null,
}) {
  const ident = String(loginIdentifier || "").trim().toUpperCase();
  const list = filterCompaniesWithDisplayId(companies);

  if (loginScope === "group" && ident) {
    persistDashboardGroupFilter(ident);
    persistDashboardGroupOnlyMode(true);
    persistDashboardSelectedCompany(null);
    stripCompanyIdFromUrl();
    notifyDashboardGroupFilterChanged(ident, null);
    return { selectedGroup: ident, companyId: null, groupOnly: true };
  }

  if (loginScope === "company" && ident) {
    persistDashboardGroupOnlyMode(false);
  }

  let row = list.find((c) => String(c.tenant_code || "").trim().toUpperCase() === ident);
  if (!row && sessionTenantId != null) {
    row = list.find((c) => Number(c.tenant_id ?? c.id) === Number(sessionTenantId));
  }
  if (
    !row &&
    sessionTenantCode &&
    String(sessionTenantCode).trim().toUpperCase() === ident &&
    sessionTenantId != null
  ) {
    row = {
      tenant_id: sessionTenantId,
      id: sessionTenantId,
      tenant_code: sessionTenantCode,
      parent_tenant_code: null,
    };
  }

  const cidRaw = row?.tenant_id ?? row?.id ?? sessionTenantId;
  const cid = Number.isFinite(Number(cidRaw)) && Number(cidRaw) > 0 ? Number(cidRaw) : null;
  const group = row?.parent_tenant_code ? normalizeCompanyGroupId(row) : null;

  persistDashboardGroupOnlyMode(false);
  if (group) persistDashboardGroupFilter(group);
  else sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_KEY);
  if (cid) persistDashboardSelectedCompany(cid);
  else persistDashboardSelectedCompany(null);
  stripCompanyIdFromUrl();
  notifyDashboardGroupFilterChanged(group, cid);

  return { selectedGroup: group, companyId: cid, groupOnly: false };
}

/** Apply login defaults once per login (see {@link buildLoginFilterAppliedKey}). */
export function applyLoginScopeToSessionStorageIfNeeded(me, companies = []) {
  const key = buildLoginFilterAppliedKey(me);
  if (!key || sessionStorage.getItem(DASHBOARD_LOGIN_FILTER_APPLIED_KEY) === key) {
    return false;
  }
  const existing = readPersistedDashboardGcFilter();
  const scope = String(me?.login_scope || "").trim().toLowerCase();
  const ident = String(me?.login_identifier || "").trim().toUpperCase();
  if (
    existing.groupOnly &&
    existing.selectedGroup &&
    scope === "group" &&
    ident === existing.selectedGroup
  ) {
    sessionStorage.setItem(DASHBOARD_LOGIN_FILTER_APPLIED_KEY, key);
    return false;
  }
  seedDashboardFilterFromLogin({
    loginScope: me.login_scope,
    loginIdentifier: me.login_identifier,
    companies,
    sessionTenantId: me.tenant_id,
    sessionTenantCode: me.tenant_code,
  });
  sessionStorage.setItem(DASHBOARD_LOGIN_FILTER_APPLIED_KEY, key);
  return true;
}

export function isDashboardGroupOnlyMode() {
  return sessionStorage.getItem(DASHBOARD_GROUP_ONLY_KEY) === "1";
}

export function persistDashboardGroupOnlyMode(groupOnly) {
  if (groupOnly) sessionStorage.setItem(DASHBOARD_GROUP_ONLY_KEY, "1");
  else sessionStorage.removeItem(DASHBOARD_GROUP_ONLY_KEY);
}

export function isDashboardGroupAllMode() {
  return sessionStorage.getItem(DASHBOARD_GROUP_ALL_MODE_KEY) === "1";
}

export function persistDashboardGroupAllMode(groupAll) {
  if (groupAll) sessionStorage.setItem(DASHBOARD_GROUP_ALL_MODE_KEY, "1");
  else sessionStorage.removeItem(DASHBOARD_GROUP_ALL_MODE_KEY);
}

export function isDashboardGroupsAllMode() {
  return sessionStorage.getItem(DASHBOARD_GROUPS_ALL_MODE_KEY) === "1";
}

export function persistDashboardGroupsAllMode(groupsAll) {
  if (groupsAll) sessionStorage.setItem(DASHBOARD_GROUPS_ALL_MODE_KEY, "1");
  else {
    sessionStorage.removeItem(DASHBOARD_GROUPS_ALL_MODE_KEY);
    sessionStorage.removeItem(DASHBOARD_GROUPS_ALL_SIDEBAR_GROUP_KEY);
  }
}

export function readGroupsAllSidebarGroup() {
  const raw = sessionStorage.getItem(DASHBOARD_GROUPS_ALL_SIDEBAR_GROUP_KEY);
  return raw ? String(raw).trim().toUpperCase() : null;
}

export function persistGroupsAllSidebarGroup(groupId) {
  const g = groupId ? String(groupId).trim().toUpperCase() : "";
  if (g) sessionStorage.setItem(DASHBOARD_GROUPS_ALL_SIDEBAR_GROUP_KEY, g);
  else sessionStorage.removeItem(DASHBOARD_GROUPS_ALL_SIDEBAR_GROUP_KEY);
}

/** Group tab to keep for sidebar when entering Group "All" (current tab, then session, then prior anchor). */
export function resolveGroupsAllSidebarAnchorGroup(selectedGroup = null) {
  const fromArg = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
  if (fromArg) return fromArg;
  const fromFilter = sessionStorage.getItem(DASHBOARD_GROUP_FILTER_KEY);
  if (fromFilter) return String(fromFilter).trim().toUpperCase();
  return readGroupsAllSidebarGroup();
}

function resolveSidebarGroupFromPersistedFilter(filter) {
  if (filter.groupsAllMode && filter.sidebarAnchorGroup) return filter.sidebarAnchorGroup;
  return filter.selectedGroup;
}

/** Group All: sidebar gambling/bank follows the AP/IG tab user came from, not subsidiary company flags. */
function resolveGroupsAllSidebarCategoryFlags(filter = readPersistedDashboardGcFilter()) {
  if (!filter.groupsAllMode || !filter.sidebarAnchorGroup) return null;
  const includeBank = Boolean(filter.groupAllMode) && !filter.groupOnly;
  return resolveGroupCategoryFlagsForSidebar(filter.sidebarAnchorGroup, { includeBank });
}

export function persistDashboardSelectedCompany(companyId) {
  if (companyId == null || companyId === "" || !Number.isFinite(Number(companyId))) {
    sessionStorage.removeItem(DASHBOARD_SELECTED_COMPANY_KEY);
    return;
  }
  sessionStorage.setItem(DASHBOARD_SELECTED_COMPANY_KEY, String(Number(companyId)));
}

export function readDashboardSelectedCompanyId() {
  const saved = sessionStorage.getItem(DASHBOARD_SELECTED_COMPANY_KEY);
  if (saved == null || saved === "") return null;
  const id = Number(saved);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Cross-page Group / Company filter snapshot from sessionStorage. */
export function readPersistedDashboardGcFilter() {
  const selectedGroupRaw = sessionStorage.getItem(DASHBOARD_GROUP_FILTER_KEY);
  const selectedGroup = selectedGroupRaw ? String(selectedGroupRaw).trim().toUpperCase() : null;
  const savedCompanyId = readDashboardSelectedCompanyId();
  const groupOnly = isDashboardGroupOnlyMode() && savedCompanyId == null;
  const groupAllMode = isDashboardGroupAllMode() && savedCompanyId == null && !groupOnly;
  const groupsAllMode = isDashboardGroupsAllMode() && !groupOnly;
  const sidebarAnchorGroup = groupsAllMode ? readGroupsAllSidebarGroup() : null;
  return {
    selectedGroup: groupsAllMode ? null : selectedGroup,
    sidebarAnchorGroup,
    companyId: groupOnly || groupAllMode ? null : savedCompanyId,
    groupOnly,
    groupAllMode,
    groupsAllMode,
  };
}

/** UserList / Dashboard share group pills — clear opt-out when a group is persisted. */
export function reconcileDashboardGroupFilterOptOutFromPersisted() {
  if (typeof sessionStorage === "undefined") return false;
  const { selectedGroup } = readPersistedDashboardGcFilter();
  if (!selectedGroup) return false;
  const hadOptOut = sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1";
  if (hadOptOut) sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY);
  return hadOptOut;
}

export function dashboardGcFiltersEqual(a, b) {
  if (!a || !b) return false;
  const ga = a.selectedGroup ? String(a.selectedGroup).trim().toUpperCase() : null;
  const gb = b.selectedGroup ? String(b.selectedGroup).trim().toUpperCase() : null;
  const ca = a.companyId != null && a.companyId !== "" ? Number(a.companyId) : null;
  const cb = b.companyId != null && b.companyId !== "" ? Number(b.companyId) : null;
  return (
    ga === gb &&
    ca === cb &&
    Boolean(a.groupOnly) === Boolean(b.groupOnly) &&
    Boolean(a.groupAllMode) === Boolean(b.groupAllMode) &&
    Boolean(a.groupsAllMode) === Boolean(b.groupsAllMode)
  );
}

/** Stable key for deduping sidebar applies (group / company / group-only / category flags). */
export function dashboardSidebarFilterSignature(filter) {
  if (!filter || typeof filter !== "object") return "";
  const g = filter.selectedGroup ? String(filter.selectedGroup).trim().toUpperCase() : "";
  const cid =
    filter.companyId != null && filter.companyId !== "" ? Number(filter.companyId) : null;
  const groupOnly = Boolean(filter.groupOnly);
  const hg = filter.hasGambling != null ? (filter.hasGambling ? 1 : 0) : "-";
  const hb = filter.hasBank != null ? (filter.hasBank ? 1 : 0) : "-";
  return `${g}|${cid ?? ""}|${groupOnly ? 1 : 0}|${hg}|${hb}`;
}

/** Drop stale layout broadcasts when the user has already changed Group / Company again. */
export function dashboardFilterEventMatchesPersisted(detail) {
  if (!detail || typeof detail !== "object") return true;
  const p = readPersistedDashboardGcFilter();
  const eg = detail.selectedGroup ? String(detail.selectedGroup).trim().toUpperCase() : null;
  if (eg !== p.selectedGroup) return false;
  const ecid =
    detail.companyId != null && detail.companyId !== "" ? Number(detail.companyId) : null;
  const pcid = p.companyId != null && p.companyId !== "" ? Number(p.companyId) : null;
  if (ecid !== pcid) return false;
  const eventGroupOnly =
    detail.groupOnly != null
      ? Boolean(detail.groupOnly)
      : ecid == null && isDashboardGroupOnlyMode();
  return eventGroupOnly === Boolean(p.groupOnly);
}

/**
 * Ignore out-of-order PHP session payloads (e.g. C168 sync finishing after user switched to AP group-only).
 */
export function shouldApplySessionToSidebar(sessionData, filter = readPersistedDashboardGcFilter()) {
  if (!sessionData || typeof sessionData !== "object") return false;
  const sid = Number(sessionData.tenant_id);
  if (!Number.isFinite(sid) || sid <= 0) return false;

  const code = String(sessionData.tenant_code ?? "")
    .trim()
    .toUpperCase();

  if (filter.groupOnly && filter.selectedGroup) {
    if (code === "C168") return false;
    const gid = String(filter.selectedGroup).trim().toUpperCase();
    return code === gid;
  }

  if (filter.groupsAllMode && filter.sidebarAnchorGroup) {
    return false;
  }

  const expectedId =
    filter.companyId != null && filter.companyId !== "" ? Number(filter.companyId) : null;
  if (expectedId != null && Number.isFinite(expectedId)) {
    return sid === expectedId;
  }

  return true;
}

/**
 * Whether current_user / session payload matches filter for updating sidebar expiry.
 * Group-only: require group-entity session (AP/IG), not a subsidiary row (e.g. 95, C168).
 */
export function shouldRefreshExpiryFromSession(sessionData, filter = readPersistedDashboardGcFilter()) {
  if (!sessionData || typeof sessionData !== "object") return false;
  const sid = Number(sessionData.tenant_id);
  if (!Number.isFinite(sid) || sid <= 0) return false;

  const code = String(sessionData.tenant_code ?? "")
    .trim()
    .toUpperCase();

  if (filter.groupOnly && filter.selectedGroup) {
    if (code === "C168") return false;
    const gid = String(filter.selectedGroup).trim().toUpperCase();
    return code === gid;
  }

  const expectedId =
    filter.companyId != null && filter.companyId !== "" ? Number(filter.companyId) : null;
  if (expectedId != null && Number.isFinite(expectedId)) {
    return sid === expectedId;
  }

  return true;
}

/** Remove stale `company_id` from the address bar (Admin/Account bookmarked URLs). */
export function stripCompanyIdFromUrl() {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("company_id")) return;
    url.searchParams.delete("company_id");
    const qs = url.searchParams.toString();
    window.history.replaceState(null, "", qs ? `${url.pathname}?${qs}` : url.pathname);
  } catch {
    /* ignore */
  }
}

/**
 * Persist Group / Company filter for cross-page SPA navigation (call on user action only).
 * Cleared company → group-only until user picks a company again.
 */
export function persistDashboardFilterState(selectedGroup, companyId, options = {}) {
  const noCompany = companyId == null || companyId === "";
  const allowGroupOnly = options.allowGroupOnly !== false;
  const companyAllMode = options.companyAllMode === true;

  if (selectedGroup) {
    persistDashboardGroupFilter(selectedGroup);
    persistDashboardGroupsAllMode(false);
  }

  if (noCompany) {
    if (companyAllMode) {
      persistDashboardGroupOnlyMode(false);
      persistDashboardGroupAllMode(true);
      persistDashboardSelectedCompany(null);
      if (options.groupsAllMode === true) {
        persistDashboardGroupsAllMode(true);
      } else if (options.groupsAllMode === false) {
        persistDashboardGroupsAllMode(false);
      }
      stripCompanyIdFromUrl();
      return;
    }
    if (!allowGroupOnly) return;
    persistDashboardGroupAllMode(false);
    persistDashboardGroupOnlyMode(true);
    persistDashboardSelectedCompany(null);
    stripCompanyIdFromUrl();
    return;
  }

  persistDashboardGroupOnlyMode(false);
  persistDashboardGroupAllMode(false);
  if (options.groupsAllMode === true) {
    persistDashboardGroupsAllMode(true);
  } else if (options.groupsAllMode === false || selectedGroup) {
    persistDashboardGroupsAllMode(false);
  }
  persistDashboardSelectedCompany(companyId);
}

/**
 * Standard SPA boot: URL company → persisted subsidiary (group login may have one) → session/default.
 * Group-only applies only when session flag is set and no saved company id exists.
 */
export function resolveGcFilterBootCompanyId({
  urlCompanyId = null,
  sessionCompanyId = null,
  defaultRowId = null,
} = {}) {
  const persisted = readPersistedDashboardGcFilter();

  const urlNum =
    urlCompanyId != null && urlCompanyId !== "" ? Number(urlCompanyId) : Number.NaN;
  if (Number.isFinite(urlNum) && urlNum > 0) {
    return {
      companyId: urlNum,
      selectedGroup: persisted.selectedGroup,
      groupOnly: false,
    };
  }

  if (persisted.groupOnly) {
    return {
      companyId: null,
      selectedGroup: persisted.selectedGroup,
      groupOnly: true,
      groupAllMode: false,
    };
  }

  if (persisted.groupAllMode) {
    return {
      companyId: null,
      selectedGroup: persisted.groupsAllMode ? null : persisted.selectedGroup,
      groupOnly: false,
      groupAllMode: true,
      groupsAllMode: persisted.groupsAllMode,
    };
  }

  if (persisted.groupsAllMode) {
    return {
      companyId: persisted.groupAllMode ? null : persisted.companyId,
      selectedGroup: null,
      groupOnly: false,
      groupAllMode: persisted.groupAllMode,
      groupsAllMode: true,
    };
  }

  if (persisted.companyId != null) {
    return {
      companyId: persisted.companyId,
      selectedGroup: persisted.selectedGroup,
      groupOnly: false,
      groupAllMode: false,
      groupsAllMode: false,
    };
  }

  const fallback = resolveBootCompanyId({
    urlCompanyId: null,
    sessionCompanyId,
    defaultRowId,
  });

  return {
    companyId: fallback,
    selectedGroup: persisted.selectedGroup,
    groupOnly: fallback == null && isDashboardGroupOnlyMode(),
  };
}

/** Boot helper: explicit URL company wins; otherwise honour group-only + saved id. */
export function resolveBootCompanyId({ urlCompanyId, sessionCompanyId, defaultRowId } = {}) {
  const urlNum =
    urlCompanyId != null && urlCompanyId !== "" ? Number(urlCompanyId) : Number.NaN;
  if (Number.isFinite(urlNum) && urlNum > 0) return urlNum;
  const saved = readDashboardSelectedCompanyId();
  if (saved != null) {
    persistDashboardGroupOnlyMode(false);
    return saved;
  }
  if (isDashboardGroupOnlyMode()) return null;
  return resolveInitialCompanyId(sessionCompanyId ?? defaultRowId ?? null);
}

/** @deprecated Use {@link persistDashboardFilterState} */
export function syncDashboardGroupOnlyFromFilter(selectedGroup, companyId) {
  persistDashboardFilterState(selectedGroup, companyId);
}

/** Company id for page boot: group-only → null; else saved id, then PHP/fallback. */
export function resolveInitialCompanyId(fallbackCompanyId) {
  const saved = readDashboardSelectedCompanyId();
  if (saved != null) return saved;
  if (isDashboardGroupOnlyMode()) return null;
  if (fallbackCompanyId == null || fallbackCompanyId === "") return null;
  const id = Number(fallbackCompanyId);
  return Number.isFinite(id) ? id : null;
}

/**
 * Owner id for domain `groups` table (group-level expiry in Domain settings).
 */
export function resolveOwnerIdForGroupsCache(me) {
  if (!me || typeof me !== "object") return null;
  const role = String(me.role ?? "")
    .trim()
    .toLowerCase();
  if (role !== "owner") return null;
  const id = Number(me.real_owner_id ?? me.user_id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** In-memory cache: group_code → { group_code, expiration_date, ... } */
let ownerGroupsCache = null;
let ownerGroupsInflight = null;

export function clearOwnerGroupsCache() {
  ownerGroupsCache = null;
  ownerGroupsInflight = null;
}

export function hasOwnerGroupsCache() {
  return ownerGroupsCache instanceof Map && ownerGroupsCache.size >= 0;
}

export function findOwnerGroupByCode(groupCode) {
  if (!(ownerGroupsCache instanceof Map)) return undefined;
  const g = String(groupCode ?? "")
    .trim()
    .toUpperCase();
  if (!g) return null;
  return ownerGroupsCache.get(g) ?? null;
}

function setOwnerGroupsCache(rows) {
  if (!Array.isArray(rows)) {
    ownerGroupsCache = null;
    return;
  }
  const map = new Map();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const code = String(row.group_code ?? row.group_id ?? "")
      .trim()
      .toUpperCase();
    if (code) map.set(code, row);
  }
  ownerGroupsCache = map;
}

/** Fetch owner groups (Domain `groups` table) — one request per session. */
export async function fetchOwnerGroupsAll(me, options = {}) {
  const ownerId = resolveOwnerIdForGroupsCache(me);
  if (!ownerId) {
    setOwnerGroupsCache([]);
    return [];
  }
  const { signal } = options;
  if (ownerGroupsCache instanceof Map) return [...ownerGroupsCache.values()];
  if (!ownerGroupsInflight) {
    ownerGroupsInflight = fetch(buildApiUrl("api/domain/domain_api.php"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      signal,
      body: JSON.stringify({ action: "get_groups", owner_id: ownerId }),
    })
      .then(async (res) => {
        const json = await res.json();
        const groups = Array.isArray(json?.data?.groups) ? json.data.groups : [];
        setOwnerGroupsCache(groups);
        ownerGroupsInflight = null;
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("eazycount:owner-groups-loaded"));
        }
        return groups;
      })
      .catch((err) => {
        ownerGroupsInflight = null;
        throw err;
      });
  }
  return ownerGroupsInflight;
}

/**
 * Group-only sidebar expiry — never use a subsidiary row (e.g. 95 under IG).
 * Prefers Domain `groups` table, then legacy group-entity company row.
 * @returns {string|null|undefined} undefined when caches are not ready yet.
 */
export function resolveGroupExpirationDate(groupCode) {
  const g = String(groupCode ?? "")
    .trim()
    .toUpperCase();
  if (!g) return undefined;

  if (ownerGroupsCache instanceof Map) {
    const fromGroups = ownerGroupsCache.get(g);
    return fromGroups?.expiration_date ?? null;
  }

  const rows = getCachedOwnerCompanies();
  if (rows?.length) {
    const entities = companiesGroupEntityList(rows, g);
    if (entities.length > 0) {
      return entities[0]?.expiration_date ?? null;
    }
    return null;
  }

  return undefined;
}

function seedCompanySessionFlagsFromOwnerRows(rows) {
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    const id = Number(row?.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (peekCompanySessionFlags(id)) continue;
    const flags = resolveCompanyCategoryFlagsFromRow(row);
    if (!flags) continue;
    rememberCompanySessionFlags({
      company_id: id,
      company_code: row.company_id,
      has_gambling: flags.hasGambling,
      has_bank: flags.hasBank,
    });
  }
}

/**
 * Sidebar Games/Bank flags for a group tab.
 * Aggregates gambling from group row / subsidiaries so Data Capture stays visible on IG.
 * Bank (bankprocess maintenance) is company-scoped — omit unless `includeBank` (Company "All").
 *
 * @param {{ includeBank?: boolean }} [options]
 */
export function resolveGroupCategoryFlagsForSidebar(groupCode, options = {}) {
  const includeBank = options.includeBank === true;
  const g = String(groupCode ?? "")
    .trim()
    .toUpperCase();
  if (!g) return null;

  if (ownerGroupsCache instanceof Map) {
    const groupRow = ownerGroupsCache.get(g);
    if (groupRow && Array.isArray(groupRow.permissions) && groupRow.permissions.length) {
      const hasGambling = permissionsIncludeGames(groupRow.permissions);
      const hasBank = includeBank && permissionsIncludeBank(groupRow.permissions);
      if (hasGambling || hasBank) {
        return { hasGambling, hasBank };
      }
    }
  }

  const companies = getCachedOwnerCompanies();
  if (!companies?.length) return null;

  let hasGambling = false;
  let hasBank = false;

  const anchor = pickGroupAnchorCompany(companies, g);
  if (anchor?.id) {
    const anchorFlags = peekCompanySessionFlags(Number(anchor.id));
    if (anchorFlags) {
      hasGambling = hasGambling || Boolean(anchorFlags.has_gambling);
      if (includeBank) {
        hasBank = hasBank || Boolean(anchorFlags.has_bank);
      }
    }
  }

  for (const row of companiesNativeInGroupList(companies, g)) {
    const cid = Number(row.id);
    if (!Number.isFinite(cid) || cid <= 0) continue;
    const cached = peekCompanySessionFlags(cid);
    if (cached) {
      hasGambling = hasGambling || Boolean(cached.has_gambling);
      if (includeBank) {
        hasBank = hasBank || Boolean(cached.has_bank);
      }
      continue;
    }
    const fromRow = resolveCompanyCategoryFlagsFromRow(row);
    if (fromRow) {
      hasGambling = hasGambling || fromRow.hasGambling;
      if (includeBank) {
        hasBank = hasBank || fromRow.hasBank;
      }
    }
  }

  return { hasGambling, hasBank: includeBank ? hasBank : false };
}

/**
 * Resolve expiration_date for sidebar optimistic patch from owner-companies cache.
 * @returns {string|null|undefined} undefined when cache cannot resolve (skip patch).
 */
export function resolveSidebarExpirationForFilter({
  selectedGroup = null,
  companyId = null,
  expirationDate,
} = {}) {
  if (expirationDate !== undefined) return expirationDate;
  const cid =
    companyId != null && companyId !== "" && Number.isFinite(Number(companyId))
      ? Number(companyId)
      : null;
  if (cid != null && cid > 0) {
    return findOwnerCompanyById(cid)?.expiration_date ?? null;
  }
  const g = selectedGroup ? String(selectedGroup).trim().toUpperCase() : null;
  if (!g) return undefined;
  return resolveGroupExpirationDate(g);
}

/**
 * Notify layout (sidebar Process visibility) when dashboard Group / Company filter changes.
 * Process is hidden only while a group is selected with no company (see AuthenticatedLayout).
 */
export function notifyDashboardGroupFilterChanged(selectedGroup, companyId, options = {}) {
  const value = selectedGroup ? String(selectedGroup).trim().toUpperCase() : null;
  const groupOnly = options.ignoreGroupOnly === true ? false : isDashboardGroupOnlyMode();
  const cid = groupOnly
    ? null
    : companyId != null && companyId !== "" && Number.isFinite(Number(companyId))
      ? Number(companyId)
      : null;
  let companyCode = options.companyCode
    ? String(options.companyCode).trim().toUpperCase()
    : null;
  if (!companyCode && cid != null) {
    const row = findOwnerCompanyById(cid);
    const fromRow = row?.company_id ? String(row.company_id).trim().toUpperCase() : "";
    if (fromRow) companyCode = fromRow;
  }
  const cachedFlags = cid != null ? peekCompanySessionFlags(cid) : null;
  const expirationDate = resolveSidebarExpirationForFilter({
    selectedGroup: value,
    companyId: cid,
    expirationDate: options.expirationDate,
  });
  let hasGambling = options.hasGambling ?? cachedFlags?.has_gambling;
  let hasBank = options.hasBank ?? cachedFlags?.has_bank;
  const persistedFilter = readPersistedDashboardGcFilter();
  const groupAllMode =
    Boolean(persistedFilter.groupAllMode) && cid == null && !groupOnly;
  if (groupOnly && value) {
    // Group-only: keep login-scope gambling flags on sidebar; only bank is cleared.
    hasBank = false;
  } else if (groupAllMode && value) {
    const groupFlags = resolveGroupCategoryFlagsForSidebar(value, { includeBank: true });
    if (groupFlags) {
      if (hasGambling == null) hasGambling = groupFlags.hasGambling;
      if (hasBank == null) hasBank = groupFlags.hasBank;
    }
  } else if (persistedFilter.groupsAllMode && persistedFilter.sidebarAnchorGroup) {
    const groupFlags = resolveGroupsAllSidebarCategoryFlags(persistedFilter);
    if (groupFlags) {
      hasGambling = groupFlags.hasGambling;
      hasBank = groupFlags.hasBank;
    }
  }
  const persistedGroupOnly = isDashboardGroupOnlyMode() && readDashboardSelectedCompanyId() == null;
  window.dispatchEvent(
    new CustomEvent(DASHBOARD_GROUP_FILTER_EVENT, {
      detail: {
        selectedGroup: value,
        companyId: cid,
        groupOnly: persistedGroupOnly,
        companyCode: companyCode ?? cachedFlags?.company_code ?? null,
        ...(hasGambling != null ? { hasGambling: Boolean(hasGambling) } : {}),
        ...(hasBank != null ? { hasBank: Boolean(hasBank) } : {}),
        expirationDate: expirationDate !== undefined ? expirationDate : null,
      },
    })
  );
}

/** Notify options for sidebar sync when dashboard Group / Company filter changes. */
export function buildDashboardSidebarNotifyOptions(companyRow, selectedGroup, extra = {}) {
  const opts = { ...extra };
  const persisted = readPersistedDashboardGcFilter();
  const anchorGroup =
    persisted.groupsAllMode && persisted.sidebarAnchorGroup
      ? persisted.sidebarAnchorGroup
      : selectedGroup
        ? String(selectedGroup).trim().toUpperCase()
        : null;
  if (persisted.groupsAllMode && anchorGroup) {
    const groupFlags = resolveGroupsAllSidebarCategoryFlags({
      ...persisted,
      sidebarAnchorGroup: anchorGroup,
    });
    if (groupFlags) {
      opts.hasGambling = groupFlags.hasGambling;
      opts.hasBank = groupFlags.hasBank;
    }
    opts.expirationDate =
      resolveSidebarExpirationForFilter({ selectedGroup: anchorGroup, companyId: null }) ?? null;
    if (companyRow?.company_id) {
      opts.companyCode = companyRow.company_id;
    }
    return opts;
  }
  if (companyRow) {
    if (companyRow.company_id) opts.companyCode = companyRow.company_id;
    opts.expirationDate = companyRow.expiration_date ?? null;
    const id = Number(companyRow.id);
    if (Number.isFinite(id) && id > 0) {
      const cached = peekCompanySessionFlags(id);
      const fromRow = resolveCompanyCategoryFlagsFromRow(companyRow);
      if (cached) {
        opts.hasGambling = Boolean(cached.has_gambling);
        opts.hasBank = Boolean(cached.has_bank);
      } else if (fromRow) {
        opts.hasGambling = fromRow.hasGambling;
        opts.hasBank = fromRow.hasBank;
      }
    }
    return opts;
  }
  const g = selectedGroup ? String(selectedGroup).trim().toUpperCase() : null;
  if (g) {
    const includeBank = Boolean(persisted.groupAllMode) && !persisted.groupOnly;
    if (!persisted.groupOnly) {
      const groupFlags = resolveGroupCategoryFlagsForSidebar(g, { includeBank });
      if (groupFlags) {
        opts.hasGambling = groupFlags.hasGambling;
        opts.hasBank = groupFlags.hasBank;
      }
    }
    opts.expirationDate =
      resolveSidebarExpirationForFilter({ selectedGroup: g, companyId: null }) ?? null;
  }
  return opts;
}

/** Build sidebar event detail from sessionStorage (same shape as {@link notifyDashboardGroupFilterChanged}). */
export function buildDashboardFilterEventDetailFromPersisted() {
  const filter = readPersistedDashboardGcFilter();
  const selectedGroup = resolveSidebarGroupFromPersistedFilter(filter);
  const groupOnly = filter.groupOnly;
  const cid =
    groupOnly || filter.companyId == null
      ? null
      : Number.isFinite(Number(filter.companyId))
        ? Number(filter.companyId)
        : null;
  const row = cid != null ? findOwnerCompanyById(cid) : null;
  const notifyOpts = groupOnly
    ? buildDashboardSidebarNotifyOptions(null, selectedGroup)
    : {
        ...buildDashboardSidebarNotifyOptions(row, selectedGroup),
        ignoreGroupOnly: true,
      };
  const value = selectedGroup ? String(selectedGroup).trim().toUpperCase() : null;
  const effectiveCid =
    notifyOpts.ignoreGroupOnly === true
      ? cid
      : groupOnly
        ? null
        : cid;
  let companyCode = notifyOpts.companyCode
    ? String(notifyOpts.companyCode).trim().toUpperCase()
    : null;
  if (!companyCode && effectiveCid != null) {
    const fromRow = row?.company_id ? String(row.company_id).trim().toUpperCase() : "";
    if (fromRow) companyCode = fromRow;
  }
  const cachedFlags = effectiveCid != null ? peekCompanySessionFlags(effectiveCid) : null;
  const expirationDate = resolveSidebarExpirationForFilter({
    selectedGroup: value,
    companyId: effectiveCid,
    expirationDate: notifyOpts.expirationDate,
  });
  let hasGambling = notifyOpts.hasGambling ?? cachedFlags?.has_gambling;
  let hasBank = notifyOpts.hasBank ?? cachedFlags?.has_bank;
  const groupAllMode = isDashboardGroupAllMode() && effectiveCid == null && !groupOnly;
  const groupsAllSidebarFlags = resolveGroupsAllSidebarCategoryFlags(filter);
  if (groupsAllSidebarFlags) {
    hasGambling = groupsAllSidebarFlags.hasGambling;
    hasBank = groupsAllSidebarFlags.hasBank;
  } else if (groupAllMode && value) {
    const groupFlags = resolveGroupCategoryFlagsForSidebar(value, { includeBank: true });
    if (groupFlags) {
      if (hasGambling == null) hasGambling = groupFlags.hasGambling;
      if (hasBank == null) hasBank = groupFlags.hasBank;
    }
  }
  if (groupOnly) {
    hasBank = false;
  }
  return {
    selectedGroup: value,
    companyId: effectiveCid,
    groupOnly,
    groupAllMode,
    companyCode: companyCode ?? cachedFlags?.company_code ?? null,
    ...(hasGambling != null ? { hasGambling: Boolean(hasGambling) } : {}),
    ...(hasBank != null ? { hasBank: Boolean(hasBank) } : {}),
    expirationDate: expirationDate !== undefined ? expirationDate : null,
  };
}

/** Replay persisted Group / Company filter to sidebar (login notify may fire before layout mounts). */
export function replayPersistedDashboardFilterToSidebar() {
  const detail = buildDashboardFilterEventDetailFromPersisted();
  if (!detail.selectedGroup && detail.companyId == null) return;
  notifyDashboardGroupFilterChanged(detail.selectedGroup, detail.companyId, {
    ignoreGroupOnly: detail.companyId != null,
    companyCode: detail.companyCode ?? undefined,
    hasGambling: detail.hasGambling,
    hasBank: detail.hasBank,
    expirationDate: detail.expirationDate,
  });
}

export function notifyDashboardGcBootstrapReady() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DASHBOARD_GC_BOOTSTRAP_READY_EVENT));
}

/**
 * Sidebar Process: hidden in group-only mode and while company C168 is selected (payroll channel).
 */
export function shouldHideSidebarProcess(pathname, me = null) {
  if (
    pathnameIs("process-list", pathname) ||
    pathnameIs("bank-process-list", pathname) ||
    pathnameIs("games-process-list", pathname)
  ) {
    return false;
  }
  const g = sessionStorage.getItem(DASHBOARD_GROUP_FILTER_KEY);
  if (Boolean(String(g || "").trim()) && isDashboardGroupOnlyMode()) return true;
  if (me?.is_current_company_c168) return true;
  const filter = readPersistedDashboardGcFilter();
  if (!filter.groupOnly && filter.companyId != null) {
    const row = findOwnerCompanyById(filter.companyId);
    const code = row?.company_id ?? me?.company_code ?? "";
    if (String(code).trim().toUpperCase() === "C168") return true;
  }
  return false;
}

/**
 * Bankprocess maintenance is company-scoped — hidden in group-only dashboard filter (e.g. IG, no company).
 * Under group "Company All", show when any company in the group has bank permission.
 */
export function shouldShowBankprocessMaintenanceInSidebar(me) {
  const filter = readPersistedDashboardGcFilter();
  const sidebarGroup = resolveSidebarGroupFromPersistedFilter(filter);
  if (filter.groupOnly && sidebarGroup) return false;
  if (filter.groupAllMode && sidebarGroup) {
    const flags = resolveGroupCategoryFlagsForSidebar(sidebarGroup, { includeBank: true });
    return Boolean(flags?.hasBank);
  }
  return Boolean(me?.company_has_bank);
}

/** In-memory cache so report/maintenance remounts do not re-block on companies API. */
let ownerCompaniesCache = null;
let ownerCompaniesInflight = null;

export function clearOwnerCompaniesCache() {
  ownerCompaniesCache = null;
  ownerCompaniesInflight = null;
  clearOwnerGroupsCache();
}

function hasOwnerCompaniesCache() {
  return Array.isArray(ownerCompaniesCache) && ownerCompaniesCache.length > 0;
}

export function getCachedOwnerCompanies() {
  return hasOwnerCompaniesCache() ? ownerCompaniesCache : null;
}

/** Resolve owner company row from in-memory cache (sidebar optimistic updates). */
export function findOwnerCompanyById(companyId) {
  const id = Number(companyId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const rows = getCachedOwnerCompanies();
  if (!rows?.length) return null;
  return rows.find((c) => Number(c.id) === id) ?? null;
}

export function setCachedOwnerCompanies(rows) {
  if (!Array.isArray(rows)) {
    ownerCompaniesCache = null;
    return;
  }
  const normalized = rows.map(normalizeOwnerCompanyRow).filter(Boolean);
  ownerCompaniesCache = normalized.length > 0 ? normalized : null;
  seedCompanySessionFlagsFromOwnerRows(ownerCompaniesCache);
}

/** @param {() => Promise<object[]>} fetcher */
export async function loadOwnerCompaniesCached(fetcher) {
  if (hasOwnerCompaniesCache()) return ownerCompaniesCache;
  if (!ownerCompaniesInflight) {
    ownerCompaniesInflight = fetcher()
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        const normalized = list.map(normalizeOwnerCompanyRow).filter(Boolean);
        ownerCompaniesCache = normalized.length > 0 ? normalized : null;
        seedCompanySessionFlagsFromOwnerRows(ownerCompaniesCache);
        ownerCompaniesInflight = null;
        return ownerCompaniesCache || [];
      })
      .catch((err) => {
        ownerCompaniesInflight = null;
        throw err;
      });
  }
  return ownerCompaniesInflight;
}

/** Shared GET accessible tenants — one HTTP request per session (Layout prefetch + page boot). */
export async function fetchOwnerCompaniesAll(options = {}) {
  const { signal, throwOnError = false } = options;
  return loadOwnerCompaniesCached(async () => {
    const { tenants, accessibleParentTenantCodes } = await fetchAccessibleTenants({
      signal,
      all: true,
      throwOnError,
    });
    persistAccessibleGroupIdsFromApi({ accessibleParentTenantCodes });
    return tenants.map(tenantAccessibleRowToUiCompany).map(normalizeOwnerCompanyRow).filter(Boolean);
  });
}

/**
 * Normalize tenant-accessible picker rows for sidebar / filter UI.
 */
export function resolveCompanyDisplayCode(row) {
  return String(
    row?.tenant_code ?? row?.company_id ?? row?.companyId ?? row?.code ?? row?.name ?? "",
  )
    .trim()
    .toUpperCase();
}

export function normalizeOwnerCompanyRow(row) {
  if (!row || typeof row !== "object") return row;
  const tenantIdRaw = row.tenant_id ?? row.tenantId ?? row.id;
  const tenant_id = Number(tenantIdRaw);
  const tenant_code = resolveCompanyDisplayCode(row);
  const parent_tenant_code = row.parent_tenant_code ?? row.parentTenantCode ?? null;
  const native_parent_tenant_code =
    row.native_parent_tenant_code ?? row.nativeParentTenantCode ?? parent_tenant_code ?? null;
  const tenant_type = row.tenant_type ?? row.tenantType ?? null;
  const resolvedId = Number.isFinite(tenant_id) && tenant_id > 0 ? tenant_id : row.id;
  return {
    ...row,
    tenant_id: Number.isFinite(tenant_id) && tenant_id > 0 ? tenant_id : tenantIdRaw,
    tenant_code,
    company_id: tenant_code,
    parent_tenant_code,
    native_parent_tenant_code,
    group_id: row.group_id ?? row.groupId ?? parent_tenant_code ?? null,
    tenant_type,
    id: resolvedId,
  };
}

/** True when row is a group entity (AP/IG), including GROUPONLY placeholder (empty company_id). */
export function companyRowIsGroupEntityAnyShape(companyRow) {
  if (!companyRow || isVirtualGroupLinkCompanyRow(companyRow)) return false;
  const grp = normalizeCompanyGroupId(companyRow);
  if (!grp) return false;
  const code = String(
    companyRow.tenant_code ?? companyRow.company_id ?? companyRow.companyId ?? companyRow.code ?? companyRow.name ?? "",
  )
    .trim()
    .toUpperCase();
  if (code === grp) return true;
  return code === "";
}

/**
 * One pill per company code; prefer the row matching `preferredCompanyId` when duplicates exist.
 * Always merges group-entity rows (e.g. AP placeholder with empty company_id) so Transaction scope can resolve them.
 */
export function dedupeOwnerCompaniesByCode(companies, preferredCompanyId) {
  const list = filterCompaniesWithDisplayId(companies);
  const byCode = new Map();
  const norm = (v) => String(v || "").toUpperCase().trim();
  for (const comp of list) {
    const key = norm(comp.tenant_code);
    if (!key) continue;
    const existing = byCode.get(key);
    if (!existing) {
      byCode.set(key, comp);
      continue;
    }
    const existingIsCurrent = Number(existing.id) === Number(preferredCompanyId);
    const currentIsCurrent = Number(comp.id) === Number(preferredCompanyId);
    if (!existingIsCurrent && currentIsCurrent) byCode.set(key, comp);
  }
  const out = Array.from(byCode.values());
  const seenIds = new Set(out.map((c) => Number(c.id)).filter((id) => id > 0));
  for (const comp of companies || []) {
    if (!companyRowIsGroupEntityAnyShape(comp)) continue;
    const id = Number(comp.id);
    if (!Number.isFinite(id) || id <= 0 || seenIds.has(id)) continue;
    out.push(comp);
    seenIds.add(id);
  }
  return out;
}

export function normalizeCompanyGroupId(comp) {
  const raw =
    comp?.parent_tenant_code ??
    comp?.parentTenantCode ??
    comp?.group_id ??
    "";
  return String(raw).trim().toUpperCase();
}

/** Database/native group_id (not ownership-coalesced dashboard group_id). */
export function normalizeNativeCompanyGroupId(comp) {
  if (!comp) return "";
  if (isVirtualGroupLinkCompanyRow(comp)) {
    const link = comp.link_source_group
      ? String(comp.link_source_group).trim().toUpperCase()
      : "";
    if (link) return link;
  }
  const native = comp.native_group_id ?? comp.nativeGroupId;
  if (native !== undefined && native !== null) {
    return String(native).trim().toUpperCase();
  }
  return normalizeCompanyGroupId(comp);
}

/** Domain-selected company with no native group (e.g. ABC under BOSS, not AP/IG). */
export function companyRowIsIndependent(companyRow, groupIds = null) {
  if (!companyRow || isVirtualGroupLinkCompanyRow(companyRow)) return false;
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds([companyRow]);
  if (companyDisplayCodeIsGroupLabel(companyRow, gids)) return false;
  if (companyRowIsGroupEntityAnyShape(companyRow)) return false;
  return !normalizeNativeCompanyGroupId(companyRow);
}

/** True when the company row belongs to the selected group (or no group filter is active). */
export function companyBelongsToGroup(companyRow, selectedGroup) {
  if (!companyRow) return false;
  const sel = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
  if (!sel) return true;
  return normalizeCompanyGroupId(companyRow) === sel;
}

/** User explicitly picked a company that matches the current group filter. */
export function isExplicitCompanySelection(companyId, companyRow, selectedGroup) {
  const id = Number(companyId);
  if (!Number.isFinite(id) || id <= 0) return false;
  return companyBelongsToGroup(companyRow, selectedGroup);
}

/** Sorted unique non-empty group ids from company rows. */
export function sortedUniqueGroupIds(companies) {
  const set = new Set();
  for (const c of companies || []) {
    const g = normalizeCompanyGroupId(c);
    if (g) set.add(g);
  }
  return [...set].sort();
}

/**
 * Dashboard GroupID pills: company.group_id + Domain `groups` table (owner portfolio).
 */
export function resolveOwnerDashboardGroupIds(companies, me = null) {
  const set = new Set(sortedUniqueGroupIds(companies));
  const role = String(me?.role || me?.user_type || "")
    .trim()
    .toLowerCase();
  if (role === "owner" && ownerGroupsCache instanceof Map) {
    for (const code of ownerGroupsCache.keys()) {
      if (code) set.add(String(code).trim().toUpperCase());
    }
  }
  return [...set].sort();
}

export function persistDashboardGroupFilter(selectedGroup) {
  if (selectedGroup) {
    sessionStorage.setItem(DASHBOARD_GROUP_FILTER_KEY, selectedGroup);
    sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY);
  } else {
    sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_KEY);
  }
}

/** Company login: deselect group pill while keeping company (never group-only). */
export function clearDashboardGroupFilterKeepCompany(companyId, options = {}) {
  sessionStorage.setItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY, "1");
  persistDashboardGroupFilter(null);
  persistDashboardGroupOnlyMode(false);
  persistDashboardFilterState(null, companyId, { allowGroupOnly: false });
  const cid = companyId != null && companyId !== "" ? Number(companyId) : Number.NaN;
  const row =
    options.companyRow ??
    (Number.isFinite(cid) && cid > 0 ? findOwnerCompanyById(cid) : null);
  const notifyOpts = { ignoreGroupOnly: true };
  const code = options.companyCode ?? row?.company_id;
  if (code) notifyOpts.companyCode = code;
  const cached = Number.isFinite(cid) && cid > 0 ? peekCompanySessionFlags(cid) : null;
  if (cached) {
    notifyOpts.hasGambling = Boolean(cached.has_gambling);
    notifyOpts.hasBank = Boolean(cached.has_bank);
  }
  notifyDashboardGroupFilterChanged(null, Number.isFinite(cid) && cid > 0 ? cid : null, notifyOpts);
}

/**
 * Boot-time resolution (matches transaction/maintenance pages): honour session only when it matches current company's group.
 */
export function resolveInitialSelectedGroupFromSession(companies, currentCompany, loginMe = null) {
  if (sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1") {
    return null;
  }
  const savedRaw = sessionStorage.getItem(DASHBOARD_GROUP_FILTER_KEY);
  const savedGroup = savedRaw ? String(savedRaw).trim().toUpperCase() : null;
  const groups = sortedUniqueGroupIds(companies);
  let selGroup = null;

  if (loginMe?.login_scope === "group" && loginMe?.login_identifier) {
    const visible = resolveAccessibleGroupIds(loginMe, companies);
    if (savedGroup && visible.includes(savedGroup)) {
      return savedGroup;
    }
    const g = String(loginMe.login_identifier).trim().toUpperCase();
    if (visible.includes(g) || groups.includes(g)) {
      sessionStorage.setItem(DASHBOARD_GROUP_FILTER_KEY, g);
      return g;
    }
  }

  if (isDashboardGroupOnlyMode() && savedGroup && groups.includes(savedGroup)) {
    return savedGroup;
  }

  if (
    savedGroup &&
    groups.includes(savedGroup) &&
    (!isCompanyLogin(loginMe) || canUseGroupOnlyMode(loginMe))
  ) {
    return savedGroup;
  }

  if (
    savedGroup &&
    groups.includes(savedGroup) &&
    currentCompany?.group_id &&
    normalizeCompanyGroupId(currentCompany) === savedGroup
  ) {
    selGroup = savedGroup;
  } else if (savedGroup && !groups.includes(savedGroup)) {
    sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_KEY);
    sessionStorage.removeItem(DASHBOARD_GROUP_ONLY_KEY);
    sessionStorage.removeItem(DASHBOARD_SELECTED_COMPANY_KEY);
  }
  if (!selGroup && currentCompany?.group_id?.trim()) {
    selGroup = normalizeCompanyGroupId(currentCompany);
    sessionStorage.setItem(DASHBOARD_GROUP_FILTER_KEY, selGroup);
  }
  return selGroup;
}

export function filterCompaniesWithDisplayId(companies) {
  return (companies || []).filter((c) => c?.tenant_code && String(c.tenant_code).trim() !== "");
}

/**
 * Default company when switching GroupID. Company login must never stay empty.
 * Prefers login company code, then current selection, then first in group.
 */
export function pickDefaultCompanyForGroup(companies, groupId, options = {}) {
  const {
    me = null,
    preferredCompanyId = null,
    preferredCompanyCode = null,
    nativeOnly = false,
    groupEntityOnly = false,
  } = options;
  const list = groupEntityOnly
    ? companiesGroupEntityList(companies, groupId)
    : nativeOnly
      ? companiesNativeInGroupList(companies, groupId)
      : companiesInGroupList(companies, groupId);
  if (!list.length) return null;

  const loginCode =
    preferredCompanyCode || (me ? getLoginIdentifier(me) : null);
  if (loginCode) {
    const code = String(loginCode).trim().toUpperCase();
    const byLogin = list.find(
      (c) => String(c.company_id || "").trim().toUpperCase() === code
    );
    if (byLogin) return byLogin;
  }

  if (preferredCompanyId != null) {
    const byId = list.find((c) => Number(c.id) === Number(preferredCompanyId));
    if (byId) return byId;
  }

  return list[0] ?? null;
}

/** Virtual row from group_ownership merge (shown under another group_id). */
export function isVirtualGroupLinkCompanyRow(c) {
  const ls = c?.link_source_group ?? c?.linkSourceGroup;
  return ls != null && String(ls).trim() !== "";
}

/** Per-company view_group for API access (linked companies under AP/IG, etc.). */
/** Prefer group-entity row for session anchor (AP/IG), not first subsidiary in list order. */
export function pickGroupAnchorCompany(companies, gid) {
  if (!gid) return null;
  const entities = companiesGroupEntityList(companies, gid);
  if (entities.length > 0) return entities[0];
  const list = companiesInGroupList(companies, gid);
  return list[0] ?? null;
}

export function resolveViewGroupForCompany(companyRow, fallbackGroup = null) {
  if (!companyRow) {
    return fallbackGroup ? String(fallbackGroup).trim().toUpperCase() : null;
  }
  const link = companyRow.link_source_group
    ? String(companyRow.link_source_group).trim().toUpperCase()
    : "";
  if (link) return link;
  const native = companyRow.group_id
    ? String(companyRow.group_id).trim().toUpperCase()
    : "";
  if (native) return native;
  return fallbackGroup ? String(fallbackGroup).trim().toUpperCase() : null;
}

/** Companies visible under a group tab, including group_ownership virtual rows (for API access / linked earnings). */
export function companiesInGroupList(companies, gid) {
  if (!gid) {
    return filterCompaniesWithDisplayId(companies).filter((c) => !normalizeCompanyGroupId(c));
  }
  const g = String(gid).trim().toUpperCase();
  return filterCompaniesWithDisplayId(companies).filter((c) => {
    if (normalizeCompanyGroupId(c) === g) return true;
    const linkSrc = c.link_source_group
      ? String(c.link_source_group).trim().toUpperCase()
      : "";
    return linkSrc === g;
  });
}

/**
 * Companies natively in a group (database group_id only).
 * Excludes virtual link rows — not for group-only entity scope (use companiesGroupEntityList).
 */
export function companiesNativeInGroupList(companies, gid) {
  const gids = sortedUniqueGroupIds(companies);
  if (!gid) {
    return filterCompaniesWithDisplayId(companies).filter((c) =>
      companyRowIsIndependent(c, gids),
    );
  }
  const g = String(gid).trim().toUpperCase();
  return filterCompaniesWithDisplayId(companies).filter((c) => {
    if (isVirtualGroupLinkCompanyRow(c)) return false;
    return normalizeNativeCompanyGroupId(c) === g;
  });
}

/**
 * Group entity only (e.g. AP itself) — not subsidiaries such as C168 under group_id AP.
 * Matches company_id === group code, or GROUPONLY placeholder (empty company_id, group_id set).
 */
export function companiesGroupEntityList(companies, gid) {
  if (!gid) return [];
  const g = String(gid).trim().toUpperCase();
  return (companies || []).filter((c) => {
    if (!c || isVirtualGroupLinkCompanyRow(c)) return false;
    const code = String(c.company_id ?? c.companyId ?? c.code ?? "").trim().toUpperCase();
    const grp = normalizeCompanyGroupId(c);
    if (code === g) return true;
    return code === "" && grp === g;
  });
}

export function companyRowIsGroupEntity(companyRow, groupId) {
  const g = String(groupId || "").trim().toUpperCase();
  if (!g || !companyRow) return false;
  if (isVirtualGroupLinkCompanyRow(companyRow)) return false;
  const code = String(
    companyRow.tenant_code ?? companyRow.company_id ?? companyRow.companyId ?? companyRow.code ?? companyRow.name ?? "",
  )
    .trim()
    .toUpperCase();
  if (code === g) return true;
  return code === "" && normalizeCompanyGroupId(companyRow) === g;
}

/** Display code equals a group label (AP, IG, …) — belongs on GroupID row only, not Company. */
export function companyDisplayCodeIsGroupLabel(companyRow, groupIds) {
  const code = String(companyRow?.company_id ?? companyRow?.companyId ?? companyRow?.code ?? "")
    .trim()
    .toUpperCase();
  if (!code) return false;
  const ids = groupIds?.length ? groupIds : [];
  const set = new Set(ids.map((g) => String(g).trim().toUpperCase()).filter(Boolean));
  return set.has(code);
}

/**
 * Company filter strip: drop group labels and group-entity rows (incl. virtual link duplicates).
 * @param {string[]|null} [groupIds] — visible group pills; defaults to {@link sortedUniqueGroupIds}
 */
export function excludeGroupLabelsFromCompanyPicker(companies, groupIds = null) {
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds(companies);
  return (companies || []).filter((c) => {
    if (companyDisplayCodeIsGroupLabel(c, gids)) return false;
    if (companyRowIsGroupEntityAnyShape(c)) return false;
    return true;
  });
}

/** Companies shown in the Company row when a GroupID is selected (Dashboard-aligned). */
export function companiesForCompanyPicker(companies, selectedGroup, groupIds = null) {
  const list = selectedGroup
    ? companiesNativeInGroupList(companies, selectedGroup)
    : companiesNativeInGroupList(companies, null);
  return excludeGroupLabelsFromCompanyPicker(list, groupIds);
}

/** Subsidiary company row (Process / Account pills) — not group entity or group-id label. */
export function isSubsidiaryCompanyRow(companyRow, groupIds = null) {
  if (!companyRow) return false;
  const id = Number(companyRow.id);
  if (!Number.isFinite(id) || id <= 0) return false;
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds([companyRow]);
  if (companyDisplayCodeIsGroupLabel(companyRow, gids)) return false;
  if (companyRowIsGroupEntityAnyShape(companyRow)) return false;
  return true;
}

/** First selectable subsidiary under a group (never AP/IG group-entity row). */
export function pickDefaultSubsidiaryForGroup(companies, groupId, options = {}) {
  const g = String(groupId || "").trim().toUpperCase();
  if (!g) return null;
  const gids = sortedUniqueGroupIds(companies);
  const pick = pickDefaultCompanyForGroup(companies, g, { ...options, nativeOnly: true });
  if (pick && isSubsidiaryCompanyRow(pick, gids)) return pick;
  const list = excludeGroupLabelsFromCompanyPicker(companiesNativeInGroupList(companies, g), gids);
  return list[0] ?? null;
}

/** Only use PHP session company as anchor preference when it belongs to the active group tab. */
export function resolvePreferredCompanyIdForGroupAnchor(companies, groupId, sessionCompanyId) {
  const g = String(groupId || "").trim().toUpperCase();
  if (!g) return null;
  const cid = sessionCompanyId != null ? Number(sessionCompanyId) : Number.NaN;
  if (!Number.isFinite(cid) || cid <= 0) return null;
  const row = (companies || []).find((c) => Number(c.id) === cid);
  if (!row) return null;
  const native = normalizeCompanyGroupId(row);
  const link = row.link_source_group
    ? String(row.link_source_group).trim().toUpperCase()
    : "";
  if (native === g || link === g) return cid;
  return null;
}

/** When switching Group pills, keep the same company code in the target group when possible. */
export function resolveCompanyPickWhenSwitchingGroup(companies, targetGroupId, currentCompanyId) {
  const g = String(targetGroupId || "").trim().toUpperCase();
  const cid = Number(currentCompanyId);
  if (!g) return null;

  if (Number.isFinite(cid) && cid > 0) {
    const row = (companies || []).find((c) => Number(c.id) === cid);
    if (row) {
      const native = normalizeCompanyGroupId(row);
      const link = row.link_source_group
        ? String(row.link_source_group).trim().toUpperCase()
        : "";
      if (native === g || link === g) return row;
      const code = String(row.company_id || "").trim().toUpperCase();
      // Do not carry C168 (or group entity label) into another group's subsidiary pick.
      if (code && code !== "C168" && code !== g) {
        const match = companiesInGroupList(companies, g).find(
          (c) => String(c.company_id || "").trim().toUpperCase() === code,
        );
        if (match) return match;
      }
    }
  }

  if (g === "AP") {
    const c168InGroup = companiesInGroupList(companies, g).find(
      (c) => String(c.company_id || "").trim().toUpperCase() === "C168",
    );
    if (c168InGroup) return c168InGroup;
  }

  return pickDefaultSubsidiaryForGroup(companies, g, { preferredCompanyId: null });
}

/**
 * Boot company for Process / Bank Process: never group-entity id (e.g. -301 / AP row).
 * Prefers saved subsidiary, then first subsidiary in the active group.
 */
export function resolveSubsidiaryBootCompanyId(
  companies,
  { urlCompanyId, sessionCompanyId, selectedGroup = null, loginMe = null } = {},
) {
  const list = companies || [];
  const groupIds = sortedUniqueGroupIds(list);
  const groupKey =
    (selectedGroup ? String(selectedGroup).trim().toUpperCase() : "") ||
    (loginMe?.login_scope === "group" && loginMe?.login_identifier
      ? String(loginMe.login_identifier).trim().toUpperCase()
      : "");

  const acceptId = (rawId) => {
    const id = Number(rawId);
    if (!Number.isFinite(id) || id <= 0) return null;
    const row = list.find((c) => Number(c.id) === id);
    return isSubsidiaryCompanyRow(row, groupIds) ? id : null;
  };

  let id = acceptId(
    resolveBootCompanyId({
      urlCompanyId,
      sessionCompanyId: null,
      defaultRowId: null,
    }),
  );
  if (id == null) id = acceptId(sessionCompanyId);
  if (id == null && !isDashboardGroupOnlyMode()) {
    id = acceptId(readDashboardSelectedCompanyId());
  }

  if (id == null && groupKey) {
    const pick = pickDefaultSubsidiaryForGroup(list, groupKey, {
      me: loginMe,
      preferredCompanyId: readDashboardSelectedCompanyId(),
    });
    if (pick?.id != null) id = Number(pick.id);
  }

  if (id == null) {
    const any = excludeGroupLabelsFromCompanyPicker(filterCompaniesWithDisplayId(list), groupIds);
    if (any[0]?.id != null) id = Number(any[0].id);
  }

  return id != null && Number.isFinite(id) && id > 0 ? id : null;
}

/** Independent (ungrouped) companies for the Company picker when GroupID is cleared. */
export function independentCompaniesForPicker(companies, groupIds = null) {
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds(companies);
  return excludeGroupLabelsFromCompanyPicker(companiesNativeInGroupList(companies, null), gids);
}

/**
 * All subsidiaries under visible groups (AP, IG, …) for Company picker when GroupID is "All".
 * Excludes independent companies.
 */
export function allGroupedCompaniesForPicker(companies, groupIds = null) {
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds(companies);
  const seen = new Set();
  const merged = [];
  for (const gid of gids) {
    for (const row of companiesNativeInGroupList(companies, gid)) {
      const id = Number(row?.id);
      if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
      seen.add(id);
      merged.push(row);
    }
  }
  return excludeGroupLabelsFromCompanyPicker(merged, gids);
}

function isExcludedFromGroupAggregate(companyRow, groupIds = null, options = {}) {
  if (!companyRow) return true;
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds([companyRow]);
  const { allowC168 = false } = options || {};
  if (!isSubsidiaryCompanyRow(companyRow, gids)) return true;
  const code = String(companyRow.company_id ?? companyRow.companyId ?? "")
    .trim()
    .toUpperCase();
  if (!allowC168 && code === "C168") return true;
  if (companyRowIsIndependent(companyRow, gids)) return true;
  return false;
}

/** Subsidiaries to merge when Company row "All" is active under a group tab (IG/AP). */
export function resolveGroupAllMergeCompanyList(companies, selectedGroup, groupIds = null) {
  const g = String(selectedGroup || "").trim().toUpperCase();
  if (!g) return [];
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds(companies);
  return companiesForCompanyPicker(companies, g, gids).filter(
    (c) => !isExcludedFromGroupAggregate(c, gids, { allowC168: false }),
  );
}

/** Subsidiaries to merge when GroupID "All" + Company "All" aggregate every visible group. */
export function resolveGroupsAllMergeCompanyList(companies, groupIds = null) {
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds(companies);
  return allGroupedCompaniesForPicker(companies, gids).filter(
    (c) => !isExcludedFromGroupAggregate(c, gids, { allowC168: true }),
  );
}

/**
 * Resolve a grouped company row for GroupID "All" contexts that still pick a subsidiary
 * (e.g. other pages). Dashboard Group All aggregate leaves company unset instead.
 */
export function resolveCompanyWhenPickingAllGroups(companies, currentCompanyId, groupIds = null) {
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds(companies);
  const grouped = allGroupedCompaniesForPicker(companies, gids);
  if (!grouped.length) return null;
  const cid = currentCompanyId != null ? Number(currentCompanyId) : Number.NaN;
  if (Number.isFinite(cid) && cid > 0) {
    const inPicker = grouped.find((c) => Number(c.id) === cid);
    if (inPicker) return inPicker;
  }
  return grouped[0] ?? null;
}

/**
 * When closing an active GroupID pill: keep the current company if it is independent,
 * otherwise activate the first independent company in picker order.
 */
export function resolveCompanyWhenClosingGroup(companies, currentCompanyId, groupIds = null) {
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds(companies);
  const independents = independentCompaniesForPicker(companies, gids);
  if (!independents.length) return null;
  const cid = currentCompanyId != null ? Number(currentCompanyId) : Number.NaN;
  if (Number.isFinite(cid) && cid > 0) {
    const currentRow = (companies || []).find((c) => Number(c.id) === cid);
    if (currentRow && companyRowIsIndependent(currentRow, gids)) {
      const inPicker = independents.find((c) => Number(c.id) === cid);
      if (inPicker) return inPicker;
    }
  }
  return independents[0] ?? null;
}

/**
 * Legacy group-button click: toggle off → independent companies + first independent active;
 * select group → first company in that group active.
 * @returns {{ selectedGroup: string|null, companyToActivate: object|null }}
 */
export function applySharedGroupButtonClick({ clickedGroupId, currentSelectedGroup, companies }) {
  const gid = String(clickedGroupId || "").trim().toUpperCase();
  const groupIds = sortedUniqueGroupIds(companies);

  if (currentSelectedGroup === gid) {
    const first = resolveCompanyWhenClosingGroup(companies, null, groupIds);
    return { selectedGroup: null, companyToActivate: first };
  }

  const inGroup = companiesNativeInGroupList(companies, gid);
  const first = excludeGroupLabelsFromCompanyPicker(inGroup, groupIds)[0] ?? inGroup[0] ?? null;
  return { selectedGroup: gid, companyToActivate: first };
}

/**
 * Whether a company row should be visible for the shared filter strip (when group strip is shown).
 * @param {"follow"|"all"|"ungrouped"} [groupViewMode="follow"] — same semantics as User List `groupFilterKind`.
 */
export function isCompanyVisibleForSharedFilter(comp, selectedGroup, hideGroupFilter, groupViewMode = "follow") {
  if (hideGroupFilter) return true;
  if (groupViewMode === "all") return true;
  const g = normalizeCompanyGroupId(comp);
  if (groupViewMode === "ungrouped") return !g;
  if (!selectedGroup) return !g;
  return g === selectedGroup;
}

/** Process List / Account List 同款：All 模式下按 group 排序展示全部公司 */
export function sortCompaniesForAllGroupView(companies, groupIds) {
  const list = [...(companies || [])];
  const groupOrder = new Map((groupIds || []).map((gid, idx) => [String(gid).toUpperCase(), idx]));
  return list.sort((a, b) => {
    const ga = normalizeCompanyGroupId(a);
    const gb = normalizeCompanyGroupId(b);
    const ra = groupOrder.has(ga) ? groupOrder.get(ga) : Number.MAX_SAFE_INTEGER;
    const rb = groupOrder.has(gb) ? groupOrder.get(gb) : Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return String(a.company_id || "").localeCompare(String(b.company_id || ""), undefined, { numeric: true });
  });
}

/** Maintenance 各页公司 pill 可见性（对齐 Process List groupFilterKind 语义） */
export function filterMaintenanceVisibleCompanies(
  companies,
  { groupFilterKind = "follow", selectedGroup = null, groupIds = [], preferredCompanyId = null } = {},
) {
  const list = dedupeOwnerCompaniesByCode(companies, preferredCompanyId);
  const gids = groupIds.length ? groupIds : sortedUniqueGroupIds(list);

  if (groupFilterKind === "all") {
    return sortCompaniesForAllGroupView(list, gids);
  }
  if (groupFilterKind === "ungrouped") {
    return list.filter((c) => !normalizeCompanyGroupId(c));
  }

  const sel = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
  if (gids.length === 0) return list;
  if (!sel) {
    const ung = list.filter((c) => !normalizeCompanyGroupId(c));
    return ung.length ? ung : list;
  }
  const inG = list.filter(
    (c) => !isVirtualGroupLinkCompanyRow(c) && normalizeCompanyGroupId(c) === sel
  );
  return inG.length ? inG : list;
}

/** All 按钮：在 all ↔ ungrouped 间切换（与 Process List 一致） */
export function toggleGroupFilterKind(current) {
  return current === "all" ? "ungrouped" : "all";
}

/**
 * Full legacy group-button behaviour: update filter + session, optionally switch active company.
 * @param {(comp: object) => Promise<void>|void} params.switchCompany receives full company row ({ id, company_id, group_id, … }).
 */
export async function applySharedGroupClickWithCompanySwitch({
  clickedGroupId,
  currentSelectedGroup,
  companies,
  currentCompanyId,
  setSelectedGroup,
  switchCompany,
}) {
  const { selectedGroup: nextGroup, companyToActivate } = applySharedGroupButtonClick({
    clickedGroupId,
    currentSelectedGroup,
    companies,
  });
  persistDashboardGroupFilter(nextGroup);
  setSelectedGroup(nextGroup);
  if (companyToActivate && Number(companyToActivate.id) !== Number(currentCompanyId)) {
    await switchCompany(companyToActivate);
  }
}
