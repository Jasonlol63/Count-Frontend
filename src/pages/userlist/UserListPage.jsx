import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../../utils/company/companySessionEvents.js";
import { syncCompanySessionApi } from "../../utils/company/companySessionSync.js";
import { fetchTenantIdByCode } from "../../utils/company/tenantAccessibleApi.js";
import {
  clearDashboardGroupFilterKeepCompany,
  companiesGroupEntityList,
  companyRowIsGroupEntity,
  companiesInGroupList,
  dedupeOwnerCompaniesByCode,
  DASHBOARD_GROUP_FILTER_EVENT,
  DASHBOARD_GROUP_FILTER_OPT_OUT_KEY,
  filterCompaniesWithDisplayId,
  isDashboardGroupOnlyMode,
  isSubsidiaryCompanyRow,
  isVirtualGroupLinkCompanyRow,
  normalizeCompanyGroupId,
  persistDashboardGroupOnlyMode,
  persistDashboardGroupFilter,
  persistDashboardFilterState,
  persistDashboardSelectedCompany,
  readDashboardSelectedCompanyId,
  readPersistedDashboardGcFilter,
  reconcileDashboardGroupFilterOptOutFromPersisted,
  applyLoginScopeToSessionStorageIfNeeded,
  stripCompanyIdFromUrl,
  notifyDashboardGroupFilterChanged,
  pickDefaultCompanyForGroup,
  pickDefaultSubsidiaryForGroup,
  resolveCompanyWhenClosingGroup,
  resolveCompanyPickWhenSwitchingGroup,
  resolveBootCompanyId,
  resolveInitialSelectedGroupFromSession,
  sortedUniqueGroupIds,
  fetchOwnerCompaniesAll,
  getCachedOwnerCompanies,
} from "../../utils/company/sharedCompanyFilter.js";
import { pathnameIs, spaPath } from "../../utils/routing/pageRoutes.js";
import { resolveDefaultLandingPath } from "../../utils/auth/sidebarPermissions.js";
import { replaceBrowserPathOnly } from "../../utils/routing/privateBrowserUrl.js";
import {
  canClearCompanySelection,
  canUseGroupOnlyMode,
  companyLoginRequiresSubsidiaryWithGroup,
  isCompanyLogin,
  isGroupLedgerMode,
  isGroupLogin,
  getLoginIdentifier,
  resolveVisibleGroupIds,
} from "../../utils/company/loginScope.js";
import { useGcFilterWithAllModes } from "../../utils/company/useGcFilterWithAllModes.js";
import GcInlineFilterPanel from "../../components/GcInlineFilterPanel.jsx";
import { isPartnershipAuditReadOnlyLocked, isPartnershipAuditReadOnlyBlockingUserEdit } from "../../utils/audit/partnershipAuditReadOnly.js";
import { buildApiUrl } from "../../utils/core/apiUrl.js";
import { switchSessionTenant } from "../../utils/auth/authApi.js";
import { fetchAccountListByTenantId, normalizeAccountListItem } from "../account/accountListApi.js";
import {
  fetchAdminListByTenantId,
  fetchAdminDetailByUserId,
  resolveAdminTenantIds,
  buildAdminCreateRequest,
  buildAdminUpdateRequest,
  buildAdminOwnerProfileUpdateRequest,
  createAdminUser,
  updateAdminUser,
  updateAdminOwnerProfile,
  toggleAdminUserStatus,
  deleteAdminUser,
} from "./userListApi.js";
import { useAuthSession } from "../../context/AuthSessionContext.jsx";
import { useRealtimeDomain } from "../../lib/realtime/useRealtimeDomain.js";
import { REALTIME_DOMAINS } from "../../lib/realtime/realtimeEvents.js";
import "../../../public/css/accountCSS.css";
import "../../../public/css/userlist.css";
import "../../../public/css/admin-responsive.css";
import "../../../public/css/select-unified.css";
import "../../../public/css/list-badge-scale.css";
import { useAutoListPageSize } from "../../hooks/useAutoListPageSize.js";
import { PAGE_SIZE_MAX, PAGE_SIZE_MIN } from "../../constants/listPageSize.js";
import {
  ALL_ROLE_OPTIONS,
  PERMISSION_KEYS,
  applyUserFilters,
  computeRowCapabilities,
  getAvailableRolesForCreation,
  getAvailableRolesForEdit,
  getCurrentUserRolePermissions,
  getDeleteCheckboxState,
  getFinalPermissionsForCreation,
  getRoleTemplateSidebarList,
  getVisiblePermissionKeys,
  sanitizeSidebarPermissionsForRole,
  roleSupportsOwnershipPermission,
  normRole,
  sortUsers,
  roleHasReadOnlyToggle,
  canInteractWithReadOnlyToggle,
  isUserModalPageReadOnlyLock,
  getUserEditFieldLocks,
  mergeAccountPermissionsForEditor,
  buildSelfAccHeldIds,
  isAccountPermSelfHidden,
  mergeModalAccountsWithGranted,
  mergeModalProcessesWithGranted,
  shrinkAccountPermissionsForSelf,
  resolveSeeAllOrCompactPermissions,
  isCompanyInUserListPicker,
  readUserListGroupFilterOptOut,
  resolveUserListFetchScopeKey,
  resolveUserListInlinePickerCompanies,
  resolveUserListMutationScopeCompanyId,
  shouldLoadUserListData,
  userListHasMutationScope,
} from "./userListLogic.js";

// Components
import UserModal from "./components/UserModal.jsx";
import UserCardsList from "./components/UserCardsList.jsx";
import UserConfirmModal from "./components/UserConfirmModal.jsx";
import { processNotificationAboveAccountZIndex, processNotificationZIndex } from "../../components/ProcessModalPortal.jsx";
import { getUserListText, translateUserListApiMessage } from "../../translateFile/pages/userListTranslate.js";
import { validateEmail } from "../../utils/input/emailValidation.js";

function normalizeCompanyRow(row) {
  if (!row || typeof row !== "object") return row;
  return {
    ...row,
    group_id: row.group_id ?? row.groupId ?? row.group ?? null,
    company_id: row.company_id ?? row.companyId ?? row.code ?? "",
  };
}

/** Spring {@link normalizeAdminListItem} (camelCase) → the snake_case row shape this page renders/sorts/filters. */
function toLegacyAdminRow(item) {
  if (!item) return item;
  return {
    id: item.id,
    login_id: item.loginId ?? "",
    name: item.name ?? "",
    email: item.email ?? "",
    role: item.role ?? "",
    permissions: item.permissions ?? null,
    status: item.status ?? "",
    created_by: item.createdBy ?? "",
    created_at: item.createdAt ?? null,
    last_login: item.lastLogin ?? null,
    read_only: item.readOnly ? 1 : 0,
    is_owner_shadow: item.isOwnerShadow === true,
    tenant_access_id: item.tenantAccess?.id ?? null,
    scope_tenant_id: item.tenantAccess?.tenantId ?? null,
  };
}

/** Group entity (e.g. AP) row's own tenant id — companiesGroupEntityList is keyed by a single group code. */
function resolveGroupEntityTenantId(companies, groupCode) {
  if (!groupCode) return null;
  const rows = companiesGroupEntityList(companies, groupCode);
  const id = rows?.[0]?.id != null ? Number(rows[0].id) : Number.NaN;
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * Same as resolveGroupEntityTenantId, but falls back to a DB-fresh backend lookup when the group
 * isn't in the local `companies` snapshot yet (e.g. right after creating a new group, before the
 * session-wide owner-companies cache has been refreshed on this page). Self-heals without waiting
 * for a manual refresh.
 */
async function resolveGroupEntityTenantIdFresh(companies, groupCode, signal) {
  const localId = resolveGroupEntityTenantId(companies, groupCode);
  if (localId != null) return localId;
  return fetchTenantIdByCode(groupCode, { signal });
}

/** Active Process rows for the Admin ACL checklist — Spring `/api/process/process-list` (RequestBody = tenant id). */
async function fetchModalProcessOptionsByTenantId(tenantId, signal) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) return [];
  const res = await fetch(buildApiUrl("api/process/process-list"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tid),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !(json?.success === true || json?.status === "success")) return [];
  const rows = Array.isArray(json.data) ? json.data : [];
  return rows
    .map((r) => {
      const p = r?.process ?? r;
      const descs = Array.isArray(r?.processDescriptions) ? r.processDescriptions : [];
      return {
        id: p?.id,
        process_id: p?.code ?? "",
        description: descs.map((d) => d?.name).filter(Boolean).join(", "),
        status: p?.status ?? "",
      };
    })
    .filter((p) => p.id != null);
}

/** Seed from the shared owner-companies cache so the Group ID/Company toolbar row
 * doesn't render empty (then pop in) on every SPA remount, matching Acc's boot pattern. */
function readInitialCachedCompanies() {
  const cached = getCachedOwnerCompanies();
  if (!cached?.length) return [];
  return cached.map(normalizeCompanyRow);
}

function buildModalCompanyList(raw) {
  const seen = new Set();
  return (Array.isArray(raw) ? raw : []).filter((c) => {
    const key = String(c?.company_id || "").trim().toUpperCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Group login add/edit user: one row per accessible group (AP, IG). Prefer group-entity id; empty group uses synthetic negative id from groups.id. */
function syntheticEmptyGroupPickerId(groupCode, groupPk = 0) {
  const pk = Number(groupPk);
  if (Number.isFinite(pk) && pk > 0) return -Math.abs(pk);
  const g = String(groupCode || "").trim().toUpperCase();
  let h = 0;
  for (let i = 0; i < g.length; i += 1) h = (h * 31 + g.charCodeAt(i)) | 0;
  return -Math.abs(h || 1);
}

function buildModalGroupOptions(companies, me) {
  const gids = resolveVisibleGroupIds(sortedUniqueGroupIds(companies), me, companies);
  const out = [];
  const seen = new Set();
  for (const gid of gids) {
    const g = String(gid || "").trim().toUpperCase();
    if (!g || seen.has(g)) continue;
    const entities = companiesGroupEntityList(companies, g);
    const entity =
      entities.find((c) => companyRowIsGroupEntity(c, g)) ||
      pickDefaultCompanyForGroup(companies, g, { me, groupEntityOnly: true }) ||
      pickDefaultCompanyForGroup(companies, g, { me, nativeOnly: true }) ||
      pickDefaultCompanyForGroup(companies, g, { me });
    let id = entity?.id != null ? Number(entity.id) : Number.NaN;
    if (!Number.isFinite(id) || id <= 0) {
      // Phase 4 / 8: no accessible group-entity tenant row for this group — synthetic id so
      // the picker can still select group_codes. Prefer the session's own group-scope pk when
      // this is the logged-in user's own group; otherwise a stable hash of the group code.
      const pk =
        me?.login_identifier && String(me.login_identifier).toUpperCase() === g && Number(me?.login_group_scope_id) > 0
          ? Number(me.login_group_scope_id)
          : 0;
      id = syntheticEmptyGroupPickerId(g, pk);
    }
    seen.add(g);
    out.push({
      id,
      company_id: g,
      group_id: g,
    });
  }
  return out;
}

function resolveSelectedGroupCodesFromPicker(modalPickerCompanies, selectedIds) {
  const idSet = new Set(selectedIds.map(Number));
  const codes = [];
  for (const row of modalPickerCompanies) {
    if (!idSet.has(Number(row.id))) continue;
    const code = String(row.group_id || row.company_id || "").trim().toUpperCase();
    if (code && !codes.includes(code)) codes.push(code);
  }
  return codes;
}

/** Admin/owner dual picker: every assignable subsidiary + independent company (not the active Group pill). */
function buildModalSubsidiaryOptions(companies) {
  const base = filterCompaniesWithDisplayId(companies);
  return buildModalCompanyList(
    base.filter((c) => {
      const code = String(c?.company_id || "").trim().toUpperCase();
      const gid = String(c?.group_id || "").trim().toUpperCase();
      return code && !companyRowIsGroupEntity(c, gid);
    })
  );
}

function resolveGroupEntityIdsFromCodes(modalGroupCompanies, groupCodes) {
  const wanted = new Set((groupCodes || []).map((g) => String(g || "").trim().toUpperCase()).filter(Boolean));
  const ids = [];
  for (const row of modalGroupCompanies || []) {
    const code = String(row?.group_id || row?.company_id || "").trim().toUpperCase();
    if (wanted.has(code)) ids.push(Number(row.id));
  }
  return ids.filter((id) => Number.isFinite(id) && id !== 0);
}

function resolveGroupIdFromEntityCompanyId(companies, entityCompanyId) {
  const row = (companies || []).find((c) => Number(c.id) === Number(entityCompanyId));
  if (!row) return null;
  const code = String(row.company_id || "").trim().toUpperCase();
  if (code && companyRowIsGroupEntity(row, code)) return code;
  const gid = String(row.group_id || "").trim().toUpperCase();
  return gid || null;
}

function resolveUserListCacheKey(activeCompanyId, groupOnlyUserList, selectedGroup, aggregateUserList, groupsAllMode, groupAllMode) {
  if (aggregateUserList) {
    if (groupsAllMode) return "aggregate:groups-all";
    if (groupAllMode && selectedGroup) return `aggregate:group:${String(selectedGroup).trim().toUpperCase()}`;
    return "aggregate:all";
  }
  if (groupOnlyUserList && selectedGroup) {
    return `group:${String(selectedGroup).trim().toUpperCase()}`;
  }
  return `company:${String(activeCompanyId || "")}`;
}

/** Survives SPA remount (Acc/Process route-warm pattern) — avoids empty→fill flash when switching back. */
const userListModuleCache = new Map();
const userListModuleFetchPending = new Map();

function readUserListBootScopeFromSession() {
  try {
    const persisted = readPersistedDashboardGcFilter();
    const groupOnly = Boolean(persisted?.groupOnly || isDashboardGroupOnlyMode());
    const selectedGroup = persisted?.selectedGroup || null;
    const companyId = groupOnly ? null : (persisted?.companyId ?? readDashboardSelectedCompanyId());
    const cid =
      companyId != null && Number.isFinite(Number(companyId)) && Number(companyId) > 0
        ? Number(companyId)
        : null;
    return { companyId: cid, selectedGroup, groupOnly };
  } catch {
    return { companyId: null, selectedGroup: null, groupOnly: false };
  }
}

function peekUserListModuleCache(companyId, groupOnly, selectedGroup) {
  const key = resolveUserListCacheKey(companyId, groupOnly, selectedGroup, false, false, false);
  const rows = userListModuleCache.get(key);
  return Array.isArray(rows) ? rows : null;
}

function resolveModalAccessCacheKey(scopeCompanyId, groupOnlyUserList, selectedGroup) {
  const normalizedGroupId = String(selectedGroup || "").trim().toUpperCase();
  const useGroupScopedAccounts = groupOnlyUserList && normalizedGroupId !== "";
  return useGroupScopedAccounts ? `group:${normalizedGroupId}` : `company:${String(scopeCompanyId || "")}`;
}

export default function UserListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { me, sessionReady } = useAuthSession();
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const langRef = useRef(lang);
  langRef.current = lang;
  const t = useCallback((key, params) => getUserListText(lang, key, params), [lang]);
  const [bootLoading, setBootLoading] = useState(true);
  const [companies, setCompanies] = useState(() => readInitialCachedCompanies());
  const [companyId, setCompanyId] = useState(() => readUserListBootScopeFromSession().companyId);
  const [usersRaw, setUsersRaw] = useState(() => {
    const scope = readUserListBootScopeFromSession();
    return peekUserListModuleCache(scope.companyId, scope.groupOnly, scope.selectedGroup) || [];
  });
  const [search, setSearch] = useState("");
  const [showActive, setShowActive] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [sortColumn, setSortColumn] = useState("loginId");
  const [sortDirection, setSortDirection] = useState("asc");
  const [selectedGroup, setSelectedGroup] = useState(() => readUserListBootScopeFromSession().selectedGroup);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState(new Set());
  const [selectAllUsers, setSelectAllUsers] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");
  const toastTimerRef = useRef(null);
  const pendingDeleteRef = useRef(null);
  const listFetchAbortRef = useRef(null);
  const listFetchGenRef = useRef(0);
  const companySwitchGenRef = useRef(0);
  const skipCompanyFetchEffectRef = useRef(false);
  const bootFetchedUsersKeyRef = useRef((() => {
    const scope = readUserListBootScopeFromSession();
    if (!peekUserListModuleCache(scope.companyId, scope.groupOnly, scope.selectedGroup)) return null;
    return resolveUserListCacheKey(
      scope.companyId,
      scope.groupOnly,
      scope.selectedGroup,
      false,
      false,
      false,
    );
  })());
  const fetchUsersRef = useRef(null);
  const userListCacheRef = useRef(userListModuleCache);
  const userListFetchPendingRef = useRef(userListModuleFetchPending);
  const userListScopeRef = useRef((() => {
    const scope = readUserListBootScopeFromSession();
    return {
      companyId: scope.companyId,
      selectedGroup: scope.selectedGroup,
      groupOnlyUserList: scope.groupOnly,
      aggregateUserList: false,
      groupsAllMode: false,
      groupAllMode: false,
    };
  })());
  const modalCompaniesCacheRef = useRef([]);
  const modalAccessCacheRef = useRef(new Map());
  const modalAccessPendingRef = useRef(new Map());
  const modalAccessCompanyIdRef = useRef(null);
  const modalLoadSeqRef = useRef(0);
  const editUserDetailCacheRef = useRef(new Map());
  const editUserDetailPendingRef = useRef(new Map());
  const listRegionRef = useRef(null);
  const bootInitializedRef = useRef(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [form, setForm] = useState({ id: "", login_id: "", name: "", email: "", role: "", password: "", secondary_password: "", status: "active", read_only: true });
  const [permSelected, setPermSelected] = useState(() => new Set());
  const [modalCompanies, setModalCompanies] = useState([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);
  const [modalAccounts, setModalAccounts] = useState([]);
  const [modalProcesses, setModalProcesses] = useState([]);
  const [modalAccessReadyCompanyId, setModalAccessReadyCompanyId] = useState(null);
  const [editReadyIds, setEditReadyIds] = useState(() => new Set());
  const [selectedAccountIds, setSelectedAccountIds] = useState(new Set());
  const [selectedProcessIds, setSelectedProcessIds] = useState(new Set());
  const selectedAccountIdsRef = useRef(selectedAccountIds);
  const selectedProcessIdsRef = useRef(selectedProcessIds);
  const modalAccountsRef = useRef(modalAccounts);
  const modalProcessesRef = useRef(modalProcesses);
  selectedAccountIdsRef.current = selectedAccountIds;
  selectedProcessIdsRef.current = selectedProcessIds;
  modalAccountsRef.current = modalAccounts;
  modalProcessesRef.current = modalProcesses;
  const setSelectedAccountIdsSynced = useCallback((updater) => {
    setSelectedAccountIds((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      selectedAccountIdsRef.current = next instanceof Set ? next : new Set(next);
      return selectedAccountIdsRef.current;
    });
  }, []);
  const setSelectedProcessIdsSynced = useCallback((updater) => {
    setSelectedProcessIds((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      selectedProcessIdsRef.current = next instanceof Set ? next : new Set(next);
      return selectedProcessIdsRef.current;
    });
  }, []);
  /** Self-edit Acc held baseline (ids that may be re-checked). null = not self shrink mode */
  const [selfAccHeldIds, setSelfAccHeldIds] = useState(null);
  const selfAccHeldIdsRef = useRef(null);
  selfAccHeldIdsRef.current = selfAccHeldIds;
  /** Self-edit Process held baseline */
  const [selfProcessHeldIds, setSelfProcessHeldIds] = useState(null);
  const selfProcessHeldIdsRef = useRef(null);
  selfProcessHeldIdsRef.current = selfProcessHeldIds;
  const [roleSelectDisabled, setRoleSelectDisabled] = useState(false);
  const [loginDisabled, setLoginDisabled] = useState(false);
  const [fieldLocks, setFieldLocks] = useState({
    name: false,
    email: false,
    role: false,
    password: false,
    sidebar: false,
    company: false,
    account: false,
    process: false,
  });

  const handleUserListSort = useCallback((column) => {
    setSortDirection((direction) => (sortColumn === column && direction === "asc" ? "desc" : "asc"));
    setSortColumn(column);
  }, [sortColumn]);

  const renderUserListHeaderSortIcon = useCallback(
    (column) => (
      <span className={`account-sort-icon${sortColumn === column ? ` is-active is-${sortDirection}` : ""}`} aria-hidden="true">
        <span className="account-sort-icon__up" />
        <span className="account-sort-icon__down" />
      </span>
    ),
    [sortColumn, sortDirection],
  );

  const notify = useCallback((message, type = "success") => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 1800);
  }, []);

  const notifyApi = useCallback(
    (apiMessage, fallbackKey, type = "success", params = {}) => {
      notify(translateUserListApiMessage(lang, apiMessage, fallbackKey, params), type);
    },
    [lang, notify],
  );

  const currentUserId = me?.user_id ?? null;
  const currentUserRole = normRole(me?.role);

  const isC168Company = useMemo(() => {
    const c = companies.find((x) => Number(x.id) === Number(companyId));
    return c && String(c.company_id || "").toUpperCase() === "C168";
  }, [companies, companyId]);

  const allCompanyButtons = useMemo(
    () =>
      companies.filter(
        (c) => c.company_id && String(c.company_id).trim() !== "" && !isVirtualGroupLinkCompanyRow(c)
      ),
    [companies]
  );
  const groupEntityCompanies = useMemo(
    () => (selectedGroup ? companiesGroupEntityList(companies, selectedGroup) : []),
    [companies, selectedGroup],
  );
  const pickerCompanyId = companyId;
  const filteredSorted = useMemo(() => {
    const f = applyUserFilters(usersRaw, {
      search,
      showActive,
      showInactive,
      showAll,
      viewerRole: currentUserRole,
      viewerUserId: currentUserId,
    });
    return sortUsers(f, sortColumn, sortDirection);
  }, [usersRaw, search, showActive, showInactive, showAll, currentUserRole, currentUserId, sortColumn, sortDirection]);

  const canCreateUser = useMemo(() => getAvailableRolesForCreation(currentUserRole).length > 0, [currentUserRole]);
  const userMutationsBlocked = useMemo(() => isPartnershipAuditReadOnlyLocked(me), [me]);
  const isUserEditBlockedByReadOnly = useCallback(
    (row) => isPartnershipAuditReadOnlyBlockingUserEdit(me, row?.id, currentUserId),
    [me, currentUserId],
  );

  /** 仅「显示停用」模式展示批量删除勾选列；Show All 保持列结构稳定不跳变 */
  const showBulkDeleteColumn = showInactive;

  const pageSize = useAutoListPageSize({
    listRegionRef,
    enabled: !showAll,
    rowSelector: ".user-list-row",
    headerSelector: ".user-list-table-header",
    paginationSelector: ".pagination-container",
    minRows: PAGE_SIZE_MIN,
    maxRows: PAGE_SIZE_MAX,
    stableRowHeight: true,
    remeasureDeps: [
      filteredSorted.length,
      showAll,
      showActive,
      showInactive,
      search,
      lang,
      currentPage,
      bootLoading,
      companyId,
      selectedGroup,
      showBulkDeleteColumn,
    ],
  });

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredSorted.length / pageSize)),
    [filteredSorted.length, pageSize],
  );
  const effectivePage = useMemo(
    () => Math.min(Math.max(1, currentPage), totalPages),
    [currentPage, totalPages],
  );

  useEffect(() => {
    if (showAll) return;
    setCurrentPage((p) => Math.min(p, totalPages));
  }, [showAll, totalPages, pageSize]);

  const pageRows = useMemo(() => {
    if (showAll) return filteredSorted;
    const start = (effectivePage - 1) * pageSize;
    return filteredSorted.slice(start, start + pageSize);
  }, [filteredSorted, effectivePage, pageSize, showAll]);

  /** 仅满页时 grid 均分高度；末页不足一页时用紧凑行高，避免 3 条数据撑满整屏 */
  const usePagedFill = !showAll && pageRows.length > 0 && pageRows.length >= pageSize;

  const permDisabledMap = useMemo(() => {
    const allowed = new Set(getCurrentUserRolePermissions(currentUserRole));
    const m = {};
    PERMISSION_KEYS.forEach((k) => { m[k] = currentUserRole !== "owner" && !allowed.has(k); });
    return m;
  }, [currentUserRole]);

  const visiblePermissionKeys = useMemo(() => getVisiblePermissionKeys(form.role), [form.role]);

  useEffect(() => {
    if (roleSupportsOwnershipPermission(form.role)) return;
    setPermSelected((prev) => {
      if (!prev.has("ownership")) return prev;
      const next = new Set(prev);
      next.delete("ownership");
      return next;
    });
  }, [form.role]);

  const syncUrl = useCallback(() => {
    replaceBrowserPathOnly();
  }, []);

  useEffect(() => { if (!bootLoading) syncUrl(); }, [bootLoading, syncUrl]);

  useEffect(() => {
    if (!showInactive) {
      setSelectedDeleteIds(new Set());
      setSelectAllUsers(false);
    }
  }, [showInactive]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "login_lang") setLang(e.newValue === "zh" ? "zh" : "en");
    };
    const onLangUpdated = (e) => {
      const nextLang = e?.detail?.lang;
      setLang(nextLang === "zh" ? "zh" : "en");
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("eazycount:language-updated", onLangUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("eazycount:language-updated", onLangUpdated);
    };
  }, []);

  useLayoutEffect(() => {
    document.body.classList.remove("bg");
    document.body.classList.add("user-page");
    return () => {
      document.body.classList.remove("user-page", "user-page--show-all", "bg");
      // document.body.classList.add("dashboard-page");
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (showAll) document.body.classList.add("user-page--show-all");
    else document.body.classList.remove("user-page--show-all");
    return () => document.body.classList.remove("user-page--show-all");
  }, [showAll]);

  useEffect(() => {
    if (!sessionReady || !me) return;
    if (bootInitializedRef.current) return;
    bootInitializedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const perms = Array.isArray(me.permissions) ? me.permissions : [];
        if (perms.length > 0 && !perms.includes("admin")) {
          const landing = resolveDefaultLandingPath(me);
          navigate(landing || spaPath("login"), { replace: true });
          return;
        }
        const rows = (await fetchOwnerCompaniesAll({ me })).map(normalizeCompanyRow);
        if (cancelled) return;
        setCompanies(rows);
        applyLoginScopeToSessionStorageIfNeeded(me, rows);
        const modalCompanyList = buildModalCompanyList(rows);
        modalCompaniesCacheRef.current = modalCompanyList;
        setModalCompanies(modalCompanyList);
        const url = new URL(window.location.href);
        const urlCompanyId = url.searchParams.get("company_id");
        if (isCompanyLogin(me) && isDashboardGroupOnlyMode() && !canUseGroupOnlyMode(me)) {
          persistDashboardGroupOnlyMode(false);
        }

        const persistedGc = readPersistedDashboardGcFilter();
        const savedCompanyId = readDashboardSelectedCompanyId();
        let effectiveNum = persistedGc.groupOnly ? null : (persistedGc.companyId ?? savedCompanyId);
        if (
          effectiveNum == null &&
          !isDashboardGroupOnlyMode() &&
          !isGroupLogin(me) &&
          !canUseGroupOnlyMode(me)
        ) {
          effectiveNum = resolveBootCompanyId({
            urlCompanyId,
            sessionCompanyId: me.company_id,
            defaultRowId: rows[0]?.id,
          });
        }
        const urlHasCompany =
          urlCompanyId != null &&
          urlCompanyId !== "" &&
          Number.isFinite(Number(urlCompanyId)) &&
          Number(urlCompanyId) > 0;
        if (persistedGc.groupOnly || isDashboardGroupOnlyMode()) {
          effectiveNum = null;
          stripCompanyIdFromUrl();
        }
        if (effectiveNum == null && (persistedGc.groupOnly || isDashboardGroupOnlyMode())) {
          persistDashboardGroupOnlyMode(true);
        } else if (effectiveNum != null) {
          persistDashboardGroupOnlyMode(false);
        }

        const visibleGroups = resolveVisibleGroupIds(sortedUniqueGroupIds(rows), me, rows);
        const groupFilterOptOut =
          typeof sessionStorage !== "undefined" &&
          sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1";

        let bootGroup = groupFilterOptOut
          ? null
          : persistedGc.selectedGroup ||
            (isGroupLogin(me) ? getLoginIdentifier(me) : null) ||
            resolveInitialSelectedGroupFromSession(
              rows,
              effectiveNum != null
                ? rows.find((c) => Number(c.id) === Number(effectiveNum)) || null
                : null,
              me,
            );

        if (!bootGroup && effectiveNum != null && !groupFilterOptOut) {
          const bootRow = rows.find((c) => Number(c.id) === Number(effectiveNum));
          const gid = normalizeCompanyGroupId(bootRow);
          if (gid && visibleGroups.includes(gid)) {
            bootGroup = gid;
            persistDashboardGroupFilter(gid);
          }
        }
        const groupOnlyBoot =
          (isGroupLogin(me) || canUseGroupOnlyMode(me)) &&
          (isDashboardGroupOnlyMode() || persistedGc.groupOnly);
        if (!groupOnlyBoot && isCompanyLogin(me) && !canUseGroupOnlyMode(me)) {
          if (
            !bootGroup &&
            !groupFilterOptOut &&
            visibleGroups.length > 0 &&
            (effectiveNum == null || !Number.isFinite(Number(effectiveNum)))
          ) {
            bootGroup = visibleGroups[0];
          }
          const bootRow =
            effectiveNum != null ? rows.find((c) => Number(c.id) === Number(effectiveNum)) : null;
          const rowGroupIds = sortedUniqueGroupIds(rows);
          const targetGroup =
            bootGroup || normalizeCompanyGroupId(bootRow) || null;
          const needsSubsidiary =
            effectiveNum == null ||
            !Number.isFinite(Number(effectiveNum)) ||
            !isSubsidiaryCompanyRow(bootRow, rowGroupIds);
          if (needsSubsidiary && targetGroup) {
            const pick = pickDefaultSubsidiaryForGroup(rows, targetGroup, {
              me,
              preferredCompanyId: me?.company_id ?? effectiveNum,
            });
            if (pick?.id != null) {
              effectiveNum = Number(pick.id);
              bootGroup = normalizeCompanyGroupId(pick) || targetGroup;
              if (!groupFilterOptOut) persistDashboardGroupFilter(bootGroup);
            } else if (!bootGroup && !groupFilterOptOut) {
              bootGroup = targetGroup;
            }
          } else if (!bootGroup && targetGroup && !groupFilterOptOut) {
            bootGroup = targetGroup;
          }
        }

        if (bootGroup && effectiveNum != null) {
          const inGroup = companiesInGroupList(rows, bootGroup).some(
            (c) => Number(c.id) === Number(effectiveNum),
          );
          if (!inGroup) {
            effectiveNum = savedCompanyId != null ? savedCompanyId : null;
            if (effectiveNum == null) stripCompanyIdFromUrl();
          }
        }

        if (isCompanyLogin(me) && canUseGroupOnlyMode(me)) {
          if (groupOnlyBoot) {
            effectiveNum = null;
            persistDashboardGroupOnlyMode(true);
          } else {
            const groupIds = sortedUniqueGroupIds(rows);
            if (effectiveNum != null && Number.isFinite(Number(effectiveNum))) {
              const bootRow = rows.find((c) => Number(c.id) === Number(effectiveNum));
              if (!isSubsidiaryCompanyRow(bootRow, groupIds)) {
                const pick = pickDefaultSubsidiaryForGroup(rows, bootGroup || bootRow?.group_id, {
                  me,
                  preferredCompanyId: me.company_id,
                });
                effectiveNum = pick?.id != null ? Number(pick.id) : null;
              }
            }
            if (effectiveNum == null || !Number.isFinite(Number(effectiveNum))) {
              const pick = pickDefaultSubsidiaryForGroup(rows, bootGroup, {
                me,
                preferredCompanyId: me.company_id,
              });
              if (pick?.id != null) effectiveNum = Number(pick.id);
              else if (me.company_id != null) effectiveNum = Number(me.company_id);
            }
            persistDashboardGroupOnlyMode(false);
          }
          const groupFilterOptOutBoot =
            typeof sessionStorage !== "undefined" &&
            sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1";
          if (!groupOnlyBoot && bootGroup && (effectiveNum == null || !Number.isFinite(Number(effectiveNum)))) {
            bootGroup = null;
          } else if (!groupFilterOptOutBoot && bootGroup == null && effectiveNum != null) {
            const bootRow = rows.find((c) => Number(c.id) === Number(effectiveNum));
            bootGroup = normalizeCompanyGroupId(bootRow) || bootGroup;
          } else if (groupFilterOptOutBoot) {
            bootGroup = null;
          }
        } else if (isCompanyLogin(me)) {
          const groupIds = sortedUniqueGroupIds(rows);
          if (effectiveNum != null && Number.isFinite(Number(effectiveNum))) {
            const bootRow = rows.find((c) => Number(c.id) === Number(effectiveNum));
            if (!isSubsidiaryCompanyRow(bootRow, groupIds)) {
              const pick = pickDefaultSubsidiaryForGroup(rows, bootGroup || bootRow?.group_id, {
                me,
                preferredCompanyId: me.company_id,
              });
              effectiveNum = pick?.id != null ? Number(pick.id) : null;
            }
          }
          if (effectiveNum == null || !Number.isFinite(Number(effectiveNum))) {
            const pick = pickDefaultSubsidiaryForGroup(rows, bootGroup, {
              me,
              preferredCompanyId: me.company_id,
            });
            if (pick?.id != null) effectiveNum = Number(pick.id);
            else if (me.company_id != null) effectiveNum = Number(me.company_id);
          }
          persistDashboardGroupOnlyMode(false);
          const groupFilterOptOutBoot =
            typeof sessionStorage !== "undefined" &&
            sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1";
          if (bootGroup && (effectiveNum == null || !Number.isFinite(Number(effectiveNum)))) {
            bootGroup = null;
          } else if (!groupFilterOptOutBoot && bootGroup == null && effectiveNum != null) {
            const bootRow = rows.find((c) => Number(c.id) === Number(effectiveNum));
            bootGroup = normalizeCompanyGroupId(bootRow) || bootGroup;
          } else if (groupFilterOptOutBoot) {
            bootGroup = null;
          }
        }

        if (groupFilterOptOut) {
          bootGroup = null;
        }

        const bootGroupIds = sortedUniqueGroupIds(rows);
        if (
          !groupOnlyBoot &&
          effectiveNum != null &&
          !isCompanyInUserListPicker(
            {
              companies: rows,
              groupIds: bootGroupIds,
              selectedGroup: bootGroup,
              preferredCompanyId: effectiveNum,
              groupFilterOptOut,
            },
            effectiveNum,
          )
        ) {
          effectiveNum = null;
          stripCompanyIdFromUrl();
          persistDashboardSelectedCompany(null);
        }

        if (groupFilterOptOut && effectiveNum == null && !groupOnlyBoot) {
          const pick = resolveCompanyWhenClosingGroup(rows, null, bootGroupIds);
          if (pick?.id != null) effectiveNum = Number(pick.id);
        }

        const bootCompanyId = groupOnlyBoot ? null : effectiveNum;
        const bootGroupOnly = Boolean(groupOnlyBoot && bootGroup);
        setCompanyId(bootCompanyId);
        setSelectedGroup(bootGroup);
        setSearch(String(url.searchParams.get("search") || ""));
        setShowActive(url.searchParams.get("showActive") === "1");
        setShowInactive(url.searchParams.get("showInactive") === "1");
        setShowAll(url.searchParams.get("showAll") === "1");

        // Acc standard: sync scope + await list before opening boot (avoid empty→fill flash).
        userListScopeRef.current = {
          companyId: bootCompanyId,
          selectedGroup: bootGroup,
          groupOnlyUserList: bootGroupOnly,
          aggregateUserList: false,
          groupsAllMode: false,
          groupAllMode: false,
        };
        if (!cancelled && (bootGroupOnly || bootCompanyId != null) && fetchUsersRef.current) {
          const bootCacheKey = resolveUserListCacheKey(
            bootCompanyId,
            bootGroupOnly,
            bootGroup,
            false,
            false,
            false,
          );
          try {
            await fetchUsersRef.current(bootCompanyId, {
              silent: true,
              groupOnly: bootGroupOnly,
              selectedGroup: bootGroup,
              companies: rows,
            });
            if (!cancelled) bootFetchedUsersKeyRef.current = bootCacheKey;
          } catch {
            /* boot list is best-effort; post-boot effect can retry */
          }
        }

        const syncCompanyId =
          bootCompanyId != null && Number.isFinite(Number(bootCompanyId)) ? Number(bootCompanyId) : null;
        if (syncCompanyId != null && syncCompanyId !== Number(me.company_id)) {
          void (async () => {
            try {
              const { ok, json: syncJson } = await switchSessionTenant(syncCompanyId);
              if (ok && syncJson.success) notifyCompanySessionUpdated();
            } catch {
              /* boot session sync is best-effort */
            }
          })();
        }
      } catch {
        if (!cancelled) navigate(spaPath("login"), { replace: true });
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionReady, me, navigate]);

  useEffect(() => () => listFetchAbortRef.current?.abort(), []);

  const applyGroupOnlyScopeRef = useRef(null);
  const deselectGroupKeepCompanyRef = useRef(null);
  const suppressGcSyncRef = useRef(false);

  const onSwitchCompanyRef = useRef(null);

  const {
    groupIds,
    companiesForPicker,
    groupsAllMode,
    groupAllMode,
    handlePickAllGroups,
    handlePickAllInGroup,
    setGroupsAllMode,
    setGroupAllMode,
  } = useGcFilterWithAllModes({
    companies,
    companyId,
    selectedGroup,
    setSelectedGroup,
    onSelectCompany: (c) =>
      onSwitchCompanyRef.current?.(c, {
        viewGroup: userListScopeRef.current?.selectedGroup ?? selectedGroup,
      }),
    onPrepareCompanySelect: (pick) => {
      const id = Number(pick?.id);
      if (!Number.isFinite(id) || id <= 0) return;
      skipCompanyFetchEffectRef.current = true;
      persistDashboardGroupOnlyMode(false);
      flushSync(() => {
        setCompanyId(id);
        applyUserListCache(id, { groupOnly: false });
      });
    },
    onDeselectGroup: () => {
      deselectGroupKeepCompanyRef.current?.();
    },
    onClearCompany: (g) => applyGroupOnlyScopeRef.current?.(g),
    switchingCompany: false,
    preferredCompanyId: companyId,
    me,
    autoPickCompanyWhenEmpty: false,
    forceAllowGroupOnly: canUseGroupOnlyMode(me),
    broadcastFilterToLayout: false,
  });

  /** When no Group is selected, the shared picker only lists “ungrouped” rows — often empty for AP/IG-only tenants. */
  const inlineCompaniesForPicker = useMemo(
    () =>
      resolveUserListInlinePickerCompanies({
        companies,
        groupIds,
        selectedGroup,
        preferredCompanyId: companyId,
        companiesForPickerFromHook: companiesForPicker,
        groupFilterOptOut: readUserListGroupFilterOptOut(),
      }),
    [companiesForPicker, selectedGroup, companyId, companies, groupIds],
  );

  const groupOnlyUserList = useMemo(() => {
    if (groupsAllMode || groupAllMode) return false;
    return isGroupLedgerMode(me, { companyId, selectedGroup });
  }, [selectedGroup, companyId, me, groupsAllMode, groupAllMode]);

  const anchorCompanyId = useMemo(() => {
    if (!groupOnlyUserList || !selectedGroup) return null;
    const entityPick = pickDefaultCompanyForGroup(companies, selectedGroup, {
      me,
      preferredCompanyId: me?.company_id,
      groupEntityOnly: true,
    });
    if (entityPick?.id != null) {
      const eid = Number(entityPick.id);
      if (Number.isFinite(eid) && eid > 0) return eid;
    }
    const fallback = pickDefaultCompanyForGroup(companies, selectedGroup, {
      me,
      preferredCompanyId: me?.company_id,
    });
    const id = fallback?.id != null ? Number(fallback.id) : Number.NaN;
    return Number.isFinite(id) && id > 0 ? id : null;
  }, [groupOnlyUserList, selectedGroup, companies, me]);

  /** API/modal scope: selected company, group anchor, or login/default company in the active group. */
  const scopeCompanyId = useMemo(() => {
    if (companyId != null) {
      const id = Number(companyId);
      if (Number.isFinite(id) && id > 0) return id;
    }
    if (groupOnlyUserList && anchorCompanyId != null) return anchorCompanyId;
    if (selectedGroup) {
      const pick = pickDefaultCompanyForGroup(companies, selectedGroup, {
        me,
        preferredCompanyId: me?.company_id ?? companyId,
      });
      const pid = pick?.id != null ? Number(pick.id) : Number.NaN;
      if (Number.isFinite(pid) && pid > 0) return pid;
    }
    const sessionId = me?.company_id != null ? Number(me.company_id) : Number.NaN;
    return Number.isFinite(sessionId) && sessionId > 0 ? sessionId : null;
  }, [companyId, groupOnlyUserList, anchorCompanyId, selectedGroup, companies, me]);

  /** Add User: active group ledger or company pill in picker — no session-only fallback. */
  const mutationScopeCompanyId = useMemo(
    () =>
      resolveUserListMutationScopeCompanyId({
        companyId,
        selectedGroup,
        groupOnlyUserList,
        anchorCompanyId,
        groupsAllMode,
        groupAllMode,
        scopeCompanyId,
        companies,
        groupIds,
        companiesForPicker,
        groupFilterOptOut: readUserListGroupFilterOptOut(),
      }),
    [
      companyId,
      selectedGroup,
      groupOnlyUserList,
      anchorCompanyId,
      groupsAllMode,
      groupAllMode,
      scopeCompanyId,
      companies,
      groupIds,
      companiesForPicker,
    ],
  );

  /** Group-only list/add-user: group entity only (e.g. AP), not subsidiaries (e.g. C168). */
  const groupScopedModalCompanies = useMemo(() => {
    if (isGroupLogin(me) && !groupOnlyUserList) {
      return buildModalCompanyList(companies);
    }
    const base = selectedGroup ? companiesInGroupList(companies, selectedGroup) : allCompanyButtons;
    return buildModalCompanyList(base);
  }, [allCompanyButtons, companies, selectedGroup, me, groupOnlyUserList]);

  const useDualTenantUserPicker =
    currentUserRole === "admin" || currentUserRole === "owner";

  const modalGroupCompanies = useMemo(
    () => buildModalGroupOptions(companies, me),
    [companies, me]
  );

  const modalSubsidiaryCompanies = useMemo(
    () => buildModalSubsidiaryOptions(companies),
    [companies]
  );

  const modalPickerCompanies = useMemo(() => {
    if (useDualTenantUserPicker) return modalSubsidiaryCompanies;
    if (groupOnlyUserList) return buildModalGroupOptions(companies, me);
    return groupScopedModalCompanies;
  }, [
    useDualTenantUserPicker,
    modalSubsidiaryCompanies,
    groupOnlyUserList,
    companies,
    me,
    groupScopedModalCompanies,
  ]);

  const aggregateUserList = useMemo(
    () => Boolean((groupsAllMode || groupAllMode) && companyId == null),
    [groupsAllMode, groupAllMode, companyId],
  );

  userListScopeRef.current = {
    companyId,
    selectedGroup,
    groupOnlyUserList,
    aggregateUserList,
    groupsAllMode,
    groupAllMode,
  };

  const isUserListScopeKeyActive = useCallback((cacheKey) => {
    const s = userListScopeRef.current;
    const activeKey = resolveUserListCacheKey(
      s.companyId,
      s.groupOnlyUserList,
      s.selectedGroup,
      s.aggregateUserList,
      s.groupsAllMode,
      s.groupAllMode,
    );
    return activeKey === cacheKey;
  }, []);

  const applyUserListResult = useCallback(
    (cacheKey, list, { silent = false } = {}) => {
      if (!isUserListScopeKeyActive(cacheKey)) return;
      userListCacheRef.current.set(cacheKey, list);
      setUsersRaw(list);
      if (silent) {
        const nextIds = new Set(list.map((u) => Number(u.id)));
        setEditReadyIds((prev) => new Set([...prev].filter((id) => nextIds.has(id))));
        return;
      }
      editUserDetailCacheRef.current.clear();
      setEditReadyIds(new Set());
      setCurrentPage(1);
      setSelectedDeleteIds(new Set());
      setSelectAllUsers(false);
    },
    [isUserListScopeKeyActive],
  );

  const loadUsersListFromApi = useCallback(async (activeCompanyId, signal, { groupOnly = null, selectedGroup: groupOverride = null, companies: companiesOverride = null } = {}) => {
    const useGroupOnly = groupOnly ?? groupOnlyUserList;
    const activeGroup = groupOverride ?? selectedGroup;
    // Boot fetches can race the `companies` state commit — allow callers to pass a fresh list.
    const effectiveCompanies = Array.isArray(companiesOverride) ? companiesOverride : companies;

    // Spring `/api/userlist/list` is single-tenant; group/company "All" views resolve the
    // relevant tenant ids client-side and merge. The Owner shadow row no longer needs a
    // second request — AdminController already prepends it when the viewer is that tenant's Owner.
    let tenantIds = [];
    if (aggregateUserList) {
      if (groupsAllMode) {
        const resolved = await Promise.all(
          groupIds.map((code) => resolveGroupEntityTenantIdFresh(effectiveCompanies, code, signal)),
        );
        tenantIds = resolved.filter((id) => id != null);
      } else if (activeGroup) {
        tenantIds = companiesInGroupList(effectiveCompanies, activeGroup)
          .map((c) => Number(c.id))
          .filter((id) => Number.isFinite(id) && id > 0);
      }
    } else if (useGroupOnly && activeGroup) {
      const id = await resolveGroupEntityTenantIdFresh(effectiveCompanies, activeGroup, signal);
      if (id != null) tenantIds = [id];
    } else if (activeCompanyId != null) {
      const id = Number(activeCompanyId);
      if (Number.isFinite(id) && id > 0) tenantIds = [id];
    }
    tenantIds = [...new Set(tenantIds)];
    if (!tenantIds.length) return [];

    const results = await Promise.all(
      tenantIds.map((tid) => fetchAdminListByTenantId(tid, signal)),
    );
    const byId = new Map();
    for (const rows of results) {
      for (const item of rows) {
        const id = Number(item?.id);
        if (Number.isFinite(id) && id > 0 && !byId.has(id)) byId.set(id, toLegacyAdminRow(item));
      }
    }
    return [...byId.values()];
  }, [aggregateUserList, groupOnlyUserList, groupsAllMode, groupIds, companies, selectedGroup]);

  const applyUserListCache = useCallback((activeCompanyId, { groupOnly = null, selectedGroup: groupOverride = null } = {}) => {
    const useGroupOnly = groupOnly ?? groupOnlyUserList;
    const activeGroup = groupOverride ?? selectedGroup;
    const cacheKey = resolveUserListCacheKey(
      activeCompanyId,
      useGroupOnly,
      activeGroup,
      aggregateUserList,
      groupsAllMode,
      groupAllMode,
    );
    const cached = userListCacheRef.current.get(cacheKey);
    if (!cached) return false;
    setUsersRaw(cached);
    const nextIds = new Set(cached.map((u) => Number(u.id)));
    setEditReadyIds((prev) => new Set([...prev].filter((id) => nextIds.has(id))));
    return true;
  }, [groupOnlyUserList, selectedGroup, aggregateUserList, groupsAllMode, groupAllMode]);

  const fetchUsers = useCallback(async (companyIdOverride = null, { silent = false, groupOnly = null, selectedGroup: groupOverride = null, companies: companiesOverride = null } = {}) => {
    if (!me) return;
    const useGroupOnly = groupOnly ?? groupOnlyUserList;
    const activeGroup = groupOverride ?? selectedGroup;
    const activeCompanyId = companyIdOverride ?? companyId;
    if (!aggregateUserList && useGroupOnly) {
      if (!activeGroup) return;
    } else if (!aggregateUserList && activeCompanyId == null) {
      return;
    }
    const cacheKey = resolveUserListCacheKey(
      activeCompanyId,
      useGroupOnly,
      activeGroup,
      aggregateUserList,
      groupsAllMode,
      groupAllMode,
    );

    const pending = userListFetchPendingRef.current.get(cacheKey);
    if (pending) {
      try {
        const list = await pending;
        applyUserListResult(cacheKey, list, { silent });
        return;
      } catch (e) {
        if (userListFetchPendingRef.current.get(cacheKey) === pending) {
          userListFetchPendingRef.current.delete(cacheKey);
        }
        if (e?.name === "AbortError") return;
      }
    }

    listFetchAbortRef.current?.abort();
    const ac = new AbortController();
    listFetchAbortRef.current = ac;
    const fetchGen = ++listFetchGenRef.current;

    const loadPromise = loadUsersListFromApi(activeCompanyId, ac.signal, {
      groupOnly: useGroupOnly,
      selectedGroup: activeGroup,
      companies: companiesOverride,
    });
    userListFetchPendingRef.current.set(cacheKey, loadPromise);

    try {
      const list = await loadPromise;
      if (ac.signal.aborted || fetchGen !== listFetchGenRef.current) return;
      applyUserListResult(cacheKey, list, { silent });
    } catch (e) {
      if (ac.signal.aborted || fetchGen !== listFetchGenRef.current) return;
      if (!silent) notifyApi(null, "failedToLoadUsers", "danger");
    } finally {
      if (userListFetchPendingRef.current.get(cacheKey) === loadPromise) {
        userListFetchPendingRef.current.delete(cacheKey);
      }
    }
  }, [
    companyId,
    groupOnlyUserList,
    aggregateUserList,
    loadUsersListFromApi,
    me,
    notifyApi,
    selectedGroup,
    groupsAllMode,
    groupAllMode,
    applyUserListResult,
  ]);
  fetchUsersRef.current = fetchUsers;

  useRealtimeDomain(REALTIME_DOMAINS.USERS, () => {
    void fetchUsers(null, { silent: true });
  });

  const onSwitchCompany = useCallback(async (c, { viewGroup = null } = {}) => {
    const nextCompanyId = Number(c?.id);
    if (!nextCompanyId) return;

    const vg =
      viewGroup != null && String(viewGroup).trim() !== ""
        ? String(viewGroup).trim().toUpperCase()
        : String(userListScopeRef.current?.selectedGroup ?? selectedGroup ?? "").trim() || null;

    const listCacheKey = resolveUserListCacheKey(
      nextCompanyId,
      false,
      vg ?? selectedGroup,
      aggregateUserList,
      groupsAllMode,
      groupAllMode,
    );
    bootFetchedUsersKeyRef.current = listCacheKey;
    void fetchUsers(nextCompanyId, {
      silent: true,
      groupOnly: false,
      selectedGroup: vg ?? selectedGroup,
    });

    const sessionCompanyId = me?.company_id != null ? Number(me.company_id) : null;
    if (sessionCompanyId === nextCompanyId) return;

    const previousCompanyId = Number(companyId) === nextCompanyId ? sessionCompanyId : companyId;
    const switchGen = ++companySwitchGenRef.current;

    try {
      const json = await syncCompanySessionApi(nextCompanyId, vg);
      if (switchGen !== companySwitchGenRef.current) return;
      if (!json?.success) {
        if (Number(previousCompanyId) !== nextCompanyId) {
          const revertGroupOnly = previousCompanyId == null;
          skipCompanyFetchEffectRef.current = true;
          flushSync(() => {
            setCompanyId(previousCompanyId);
            if (revertGroupOnly) {
              applyUserListCache(null, { groupOnly: true });
            } else {
              applyUserListCache(previousCompanyId, { groupOnly: false });
            }
          });
          if (revertGroupOnly) {
            void fetchUsers(null, { silent: true, groupOnly: true });
          } else {
            void fetchUsers(previousCompanyId, { silent: true, groupOnly: false });
          }
        }
        notifyApi(json?.error || json?.message, "couldNotSwitchCompany", "danger");
        return;
      }
      notifyCompanySessionUpdated(json.data ?? null);
    } catch {
      if (switchGen !== companySwitchGenRef.current) return;
      if (Number(previousCompanyId) !== nextCompanyId) {
        const revertGroupOnly = previousCompanyId == null;
        skipCompanyFetchEffectRef.current = true;
        flushSync(() => {
          setCompanyId(previousCompanyId);
          if (revertGroupOnly) {
            applyUserListCache(null, { groupOnly: true });
          } else {
            applyUserListCache(previousCompanyId, { groupOnly: false });
          }
        });
        if (revertGroupOnly) {
          void fetchUsers(null, { silent: true, groupOnly: true });
        } else {
          void fetchUsers(previousCompanyId, { silent: true, groupOnly: false });
        }
      }
      notify(t("companySwitchFailed"), "danger");
    }
  }, [
    applyUserListCache,
    aggregateUserList,
    companyId,
    fetchUsers,
    groupAllMode,
    groupsAllMode,
    me,
    notify,
    notifyApi,
    selectedGroup,
    t,
  ]);

  onSwitchCompanyRef.current = onSwitchCompany;

  const userListFetchScopeKey = useMemo(() => {
    if (bootLoading) return "";
    if (
      !shouldLoadUserListData({
        companyId,
        selectedGroup,
        groupOnlyMode: groupOnlyUserList,
        groupsAllMode,
        groupAllMode,
      })
    ) {
      return "";
    }
    return resolveUserListFetchScopeKey({
      companyId,
      selectedGroup,
      groupsAllMode,
      groupAllMode,
      groupOnlyMode: groupOnlyUserList,
    });
  }, [
    bootLoading,
    companyId,
    groupAllMode,
    groupOnlyUserList,
    groupsAllMode,
    selectedGroup,
  ]);

  useEffect(() => {
    if (bootLoading || groupsAllMode || groupAllMode) return;
    if (companyId == null) return;
    if (groupOnlyUserList) return;
    if (
      isCompanyInUserListPicker(
        {
          companies,
          groupIds,
          selectedGroup,
          preferredCompanyId: companyId,
          companiesForPickerFromHook: companiesForPicker,
          groupFilterOptOut: readUserListGroupFilterOptOut(),
        },
        companyId,
      )
    ) {
      return;
    }
    skipCompanyFetchEffectRef.current = true;
    listFetchAbortRef.current?.abort();
    flushSync(() => {
      setCompanyId(null);
      setUsersRaw([]);
    });
    stripCompanyIdFromUrl();
    persistDashboardSelectedCompany(null);
  }, [
    bootLoading,
    companyId,
    companies,
    companiesForPicker,
    groupIds,
    groupsAllMode,
    groupAllMode,
    groupOnlyUserList,
    selectedGroup,
  ]);

  useEffect(() => {
    if (bootLoading) return;
    if (userListFetchScopeKey) return;
    listFetchAbortRef.current?.abort();
    setUsersRaw([]);
    bootFetchedUsersKeyRef.current = null;
  }, [bootLoading, userListFetchScopeKey]);

  useEffect(() => {
    if (!bootLoading && me && userListFetchScopeKey) {
      if (skipCompanyFetchEffectRef.current) {
        skipCompanyFetchEffectRef.current = false;
        return;
      }
      const cacheKey = resolveUserListCacheKey(
        companyId,
        groupOnlyUserList,
        selectedGroup,
        aggregateUserList,
        groupsAllMode,
        groupAllMode,
      );
      if (bootFetchedUsersKeyRef.current === cacheKey) {
        bootFetchedUsersKeyRef.current = null;
        return;
      }
      void fetchUsers();
    }
  }, [
    bootLoading,
    companyId,
    groupOnlyUserList,
    aggregateUserList,
    me,
    fetchUsers,
    selectedGroup,
    groupsAllMode,
    groupAllMode,
    userListFetchScopeKey,
  ]);

  /** Company login without Admin-assigned group must auto-pick a subsidiary when a group pill is shown. */
  useLayoutEffect(() => {
    if (bootLoading || !me) return;
    if (!selectedGroup || companyId != null) return;
    if (
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1"
    ) {
      return;
    }
    if (isGroupLogin(me) || !requiresCompanyWithGroup) {
      return;
    }
    const pick = pickDefaultSubsidiaryForGroup(companies, selectedGroup, {
      me,
      preferredCompanyId: me?.company_id ?? companyId,
    });
    if (!pick?.id) {
      if (isCompanyLogin(me) && !canUseGroupOnlyMode(me, selectedGroup)) {
        setSelectedGroup(null);
        persistDashboardGroupFilter(null);
        persistDashboardGroupOnlyMode(false);
      }
      return;
    }
    const nextId = Number(pick.id);
    skipCompanyFetchEffectRef.current = true;
    persistDashboardGroupOnlyMode(false);
    flushSync(() => {
      setCompanyId(nextId);
      applyUserListCache(nextId, { groupOnly: false, selectedGroup });
    });
    persistDashboardFilterState(selectedGroup, nextId, { allowGroupOnly: false });
    notifyDashboardGroupFilterChanged(selectedGroup, nextId);
    suppressGcSyncRef.current = true;
    void (async () => {
      try {
        await onSwitchCompanyRef.current?.(pick, { viewGroup: selectedGroup });
      } finally {
        suppressGcSyncRef.current = false;
      }
    })();
  }, [
    bootLoading,
    me,
    selectedGroup,
    companyId,
    companies,
    applyUserListCache,
  ]);

  const applyGroupOnlyScope = useCallback(
    (g) => {
      const group = String(g || selectedGroup || "")
        .trim()
        .toUpperCase();
      if (!group) return;

      persistDashboardGroupFilter(group);
      persistDashboardGroupOnlyMode(true);

      skipCompanyFetchEffectRef.current = true;
      suppressGcSyncRef.current = true;
      const groupCacheKey = resolveUserListCacheKey(null, true, group, false, false, false);
      const hadCache = userListCacheRef.current.has(groupCacheKey);
      flushSync(() => {
        setCompanyId(null);
        setGroupsAllMode(false);
        setGroupAllMode(false);
        setSelectedGroup(group);
        if (!applyUserListCache(null, { groupOnly: true, selectedGroup: group })) {
          setUsersRaw([]);
        }
      });
      persistDashboardFilterState(group, null, { allowGroupOnly: true });
      persistDashboardSelectedCompany(null);
      stripCompanyIdFromUrl();
      notifyDashboardGroupFilterChanged(group, null);
      suppressGcSyncRef.current = false;

      if (!hadCache) {
        void fetchUsers(null, { silent: false, groupOnly: true, selectedGroup: group });
      }
    },
    [
      applyUserListCache,
      fetchUsers,
      selectedGroup,
      setGroupAllMode,
      setGroupsAllMode,
    ],
  );

  applyGroupOnlyScopeRef.current = applyGroupOnlyScope;

  const deselectGroupKeepCompany = useCallback(() => {
    skipCompanyFetchEffectRef.current = true;
    suppressGcSyncRef.current = true;
    persistDashboardGroupOnlyMode(false);

    const pickIndependent = resolveCompanyWhenClosingGroup(companies, companyId, groupIds);
    const nextCompanyId = pickIndependent?.id != null ? Number(pickIndependent.id) : null;

    if (nextCompanyId != null && Number.isFinite(nextCompanyId) && nextCompanyId > 0) {
      clearDashboardGroupFilterKeepCompany(nextCompanyId);
      void (async () => {
        try {
          await onSwitchCompanyRef.current?.(pickIndependent, { viewGroup: null });
        } finally {
          suppressGcSyncRef.current = false;
        }
      })();
    } else {
      sessionStorage.setItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY, "1");
      persistDashboardGroupFilter(null);
      persistDashboardFilterState(null, null, { allowGroupOnly: false });
      notifyDashboardGroupFilterChanged(null, null);
      stripCompanyIdFromUrl();
      suppressGcSyncRef.current = false;
    }

    flushSync(() => {
      setGroupsAllMode(false);
      setGroupAllMode(false);
      setSelectedGroup(null);
      setCompanyId(nextCompanyId);
      if (nextCompanyId != null) applyUserListCache(nextCompanyId, { groupOnly: false });
      else setUsersRaw([]);
    });

    if (nextCompanyId != null) {
      void fetchUsers(nextCompanyId, { silent: true, groupOnly: false });
    }
  }, [
    applyUserListCache,
    companies,
    companyId,
    fetchUsers,
    groupIds,
    setCompanyId,
    setGroupAllMode,
    setGroupsAllMode,
  ]);

  deselectGroupKeepCompanyRef.current = deselectGroupKeepCompany;

  /** Dashboard-aligned group pill: toggle off, or pick group (+ default company). */
  const handlePickGroupUserList = useCallback(
    (gid) => {
      const g = String(gid || "").trim().toUpperCase();
      if (!g) return;
      const current = String(selectedGroup || "").trim().toUpperCase();
      const allowGroupOnly = isGroupLogin(me) || canUseGroupOnlyMode(me, g);

      if (g === current) {
        deselectGroupKeepCompany();
        return;
      }

      if (allowGroupOnly) {
        sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY);
        applyGroupOnlyScope(g);
        return;
      }

      const pick =
        resolveCompanyPickWhenSwitchingGroup(companies, g, companyId) ??
        pickDefaultSubsidiaryForGroup(companies, g, {
          me,
          preferredCompanyId: companyId ?? me?.company_id,
        });
      if (!pick?.id) return;

      const nextCompanyId = Number(pick.id);
      skipCompanyFetchEffectRef.current = true;
      suppressGcSyncRef.current = true;
      sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY);
      flushSync(() => {
        setGroupsAllMode(false);
        setGroupAllMode(false);
        setSelectedGroup(g);
        setCompanyId(nextCompanyId);
        applyUserListCache(nextCompanyId, { groupOnly: false, selectedGroup: g });
      });
      persistDashboardGroupFilter(g);
      persistDashboardGroupOnlyMode(false);
      persistDashboardFilterState(g, nextCompanyId, { allowGroupOnly: false });
      notifyDashboardGroupFilterChanged(g, nextCompanyId, {
        companyCode: String(pick.company_id || "").trim().toUpperCase(),
      });

      const listCacheKey = resolveUserListCacheKey(nextCompanyId, false, g, false, false, false);
      bootFetchedUsersKeyRef.current = listCacheKey;
      void fetchUsers(nextCompanyId, { silent: true, groupOnly: false, selectedGroup: g });
      void (async () => {
        try {
          await onSwitchCompanyRef.current?.(pick, { viewGroup: g });
        } finally {
          suppressGcSyncRef.current = false;
        }
      })();
    },
    [
      me,
      selectedGroup,
      companyId,
      companies,
      deselectGroupKeepCompany,
      applyGroupOnlyScope,
      applyUserListCache,
      fetchUsers,
      setGroupAllMode,
      setGroupsAllMode,
    ],
  );

  /** Company login without group assignment still needs a subsidiary when a group pill is shown. */
  const requiresCompanyWithGroup = companyLoginRequiresSubsidiaryWithGroup(me);

  const syncGcFilterFromSession = useCallback(() => {
    if (bootLoading || !companies.length) return;
    if (suppressGcSyncRef.current) return;

    reconcileDashboardGroupFilterOptOutFromPersisted();

    const { selectedGroup: nextGroup, companyId: nextCompanyId } = readPersistedDashboardGcFilter();
    const optOut =
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1";

    if (!nextGroup && (optOut || requiresCompanyWithGroup)) {
      const targetCompanyId =
        nextCompanyId != null && Number.isFinite(Number(nextCompanyId)) && Number(nextCompanyId) > 0
          ? Number(nextCompanyId)
          : companyId;
      const groupCleared = !selectedGroup;
      const companySynced =
        targetCompanyId == null
          ? companyId == null
          : companyId != null && Number(companyId) === Number(targetCompanyId);
      if (groupCleared && companySynced) return;

      skipCompanyFetchEffectRef.current = true;
      flushSync(() => {
        setGroupsAllMode(false);
        setGroupAllMode(false);
        setSelectedGroup(null);
        if (targetCompanyId != null) {
          setCompanyId(targetCompanyId);
          applyUserListCache(targetCompanyId, { groupOnly: false });
        }
      });
      return;
    }

    if (!nextGroup) return;

    const currentGroup = String(selectedGroup || "").trim().toUpperCase();
    const targetGroup = String(nextGroup).trim().toUpperCase();
    const groupSame = currentGroup === targetGroup;
    const companySame =
      (nextCompanyId == null && companyId == null) ||
      (nextCompanyId != null && companyId != null && Number(companyId) === Number(nextCompanyId));
    if (groupSame && companySame) return;

    const groupOnlySync =
      nextCompanyId == null &&
      (isGroupLogin(me) ? isDashboardGroupOnlyMode() : isDashboardGroupOnlyMode());

    skipCompanyFetchEffectRef.current = true;
    flushSync(() => {
      setGroupsAllMode(false);
      setGroupAllMode(false);
      setSelectedGroup(targetGroup);
      setCompanyId(nextCompanyId);
      if (nextCompanyId != null) {
        applyUserListCache(nextCompanyId, { groupOnly: false, selectedGroup: targetGroup });
      } else {
        applyUserListCache(null, { groupOnly: groupOnlySync, selectedGroup: targetGroup });
      }
    });

    if (nextCompanyId != null) {
      persistDashboardGroupOnlyMode(false);
      const pick = companies.find((c) => Number(c.id) === Number(nextCompanyId));
      if (pick) {
        suppressGcSyncRef.current = true;
        void (async () => {
          try {
            await onSwitchCompanyRef.current?.(pick, { viewGroup: targetGroup });
          } finally {
            suppressGcSyncRef.current = false;
          }
        })();
      } else {
        const cacheKey = resolveUserListCacheKey(
          nextCompanyId,
          false,
          targetGroup,
          false,
          false,
          false,
        );
        bootFetchedUsersKeyRef.current = cacheKey;
        void fetchUsers(nextCompanyId, { silent: true, groupOnly: false, selectedGroup: targetGroup });
      }
    } else if (groupOnlySync && targetGroup) {
      const groupCacheKey = resolveUserListCacheKey(null, true, targetGroup, false, false, false);
      bootFetchedUsersKeyRef.current = groupCacheKey;
      void fetchUsers(null, { silent: true, groupOnly: true, selectedGroup: targetGroup });
    }
  }, [
    applyUserListCache,
    bootLoading,
    companies,
    companyId,
    fetchUsers,
    requiresCompanyWithGroup,
    selectedGroup,
    setGroupAllMode,
    setGroupsAllMode,
  ]);

  useEffect(() => {
    if (bootLoading) return;
    const onFilterChanged = () => syncGcFilterFromSession();
    window.addEventListener(DASHBOARD_GROUP_FILTER_EVENT, onFilterChanged);
    return () => window.removeEventListener(DASHBOARD_GROUP_FILTER_EVENT, onFilterChanged);
  }, [bootLoading, syncGcFilterFromSession]);

  useEffect(() => {
    if (bootLoading) return;
    if (!pathnameIs("userlist", location.pathname)) return;
    syncGcFilterFromSession();
  }, [bootLoading, location.pathname, syncGcFilterFromSession]);

  const clearCompanyPillSelection = useCallback(
    (c) => {
      const gid = c?.group_id ? String(c.group_id).toUpperCase().trim() : null;
      const sel = String(selectedGroup || "").trim().toUpperCase();
      const g = sel || gid;
      if (!g) return;
      if (!canUseGroupOnlyMode(me, g)) return;

      skipCompanyFetchEffectRef.current = true;
      flushSync(() => {
        setCompanyId(null);
        applyUserListCache(null, { groupOnly: true, selectedGroup: g });
      });

      persistDashboardGroupFilter(g);
      persistDashboardGroupOnlyMode(true);
      persistDashboardSelectedCompany(null);
      stripCompanyIdFromUrl();
      notifyDashboardGroupFilterChanged(g, null);

      const groupCacheKey = resolveUserListCacheKey(null, true, g, false, false, false);
      if (!userListCacheRef.current.has(groupCacheKey)) {
        bootFetchedUsersKeyRef.current = groupCacheKey;
        void fetchUsers(null, { silent: true, groupOnly: true, selectedGroup: g });
      }
    },
    [applyUserListCache, fetchUsers, me, selectedGroup],
  );

  const onPickCompanyPill = useCallback(
    (c, pillActive = false) => {
      const nextCompanyId = Number(c?.id);
      if (!nextCompanyId) return;

      const gid = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
      const sel = String(selectedGroup || "").trim().toUpperCase();
      const isActive =
        pillActive || (companyId != null && Number(companyId) === nextCompanyId);
      if (isActive) {
        clearCompanyPillSelection(c);
        return;
      }

      const nextGroup = gid || null;
      const effectiveGroup = nextGroup || sel;
      skipCompanyFetchEffectRef.current = true;
      suppressGcSyncRef.current = true;
      persistDashboardGroupOnlyMode(false);
      flushSync(() => {
        setGroupsAllMode(false);
        setGroupAllMode(false);
        if (nextGroup) setSelectedGroup(nextGroup);
        else if (!isCompanyLogin(me)) setSelectedGroup(null);
        setCompanyId(nextCompanyId);
        userListScopeRef.current = {
          companyId: nextCompanyId,
          selectedGroup: effectiveGroup,
          groupOnlyUserList: false,
          aggregateUserList: false,
          groupsAllMode: false,
          groupAllMode: false,
        };
        applyUserListCache(nextCompanyId, { groupOnly: false, selectedGroup: effectiveGroup });
      });

      if (nextGroup) persistDashboardGroupFilter(nextGroup);
      else if (effectiveGroup) persistDashboardGroupFilter(effectiveGroup);
      else persistDashboardGroupFilter(null);
      persistDashboardFilterState(effectiveGroup, nextCompanyId, { allowGroupOnly: false });
      notifyDashboardGroupFilterChanged(effectiveGroup, nextCompanyId);
      void (async () => {
        try {
          await onSwitchCompany(c, { viewGroup: effectiveGroup });
        } finally {
          suppressGcSyncRef.current = false;
        }
      })();
    },
    [
      applyUserListCache,
      clearCompanyPillSelection,
      companyId,
      me,
      onSwitchCompany,
      selectedGroup,
      setGroupAllMode,
      setGroupsAllMode,
    ],
  );

  const fetchModalAccountsProcesses = useCallback(async (cid, force = false, { background = false } = {}) => {
    const normalizedGroupId = String(selectedGroup || "").trim().toUpperCase();
    const useGroupScopedAccounts = groupOnlyUserList && normalizedGroupId !== "";
    const cacheKey = useGroupScopedAccounts ? `group:${normalizedGroupId}` : `company:${String(cid || "")}`;
    const applyAccessState = (next) => {
      const commit = () => {
        modalAccessCompanyIdRef.current = Number(cid);
        setModalAccounts(next.accounts);
        setModalProcesses(next.processes);
        setModalAccessReadyCompanyId(Number(cid));
      };
      if (background) startTransition(commit);
      else commit();
    };
    const cached = modalAccessCacheRef.current.get(cacheKey);
    if (cached && !force) {
      applyAccessState(cached);
      return cached;
    }
    const pending = modalAccessPendingRef.current.get(cacheKey);
    if (pending) {
      try {
        const next = await pending;
        applyAccessState(next);
        return next;
      } catch {
        if (!background) {
          setModalAccounts([]);
          setModalProcesses([]);
        }
        return { accounts: [], processes: [] };
      }
    }
    try {
      const resolvedTenantId = useGroupScopedAccounts
        ? (Number(cid) > 0 ? Number(cid) : resolveGroupEntityTenantId(companies, normalizedGroupId))
        : (Number(cid) > 0 ? Number(cid) : null);
      const request = resolvedTenantId == null
        ? Promise.resolve({ accounts: [], processes: [] })
        : Promise.all([
            fetchAccountListByTenantId(resolvedTenantId).then((rows) => rows.map(normalizeAccountListItem)).catch(() => []),
            fetchModalProcessOptionsByTenantId(resolvedTenantId).catch(() => []),
          ]).then(([accRows, procRows]) => {
            const accs = accRows
              .filter((a) => String(a.status || "").toLowerCase() === "active")
              .map((a) => ({ id: a.id, account_id: a.account_id, name: String(a.name || "").trim() }));
            const procs = procRows
              .filter((p) => String(p.status || "").toLowerCase() === "active")
              .map((p) => ({ id: p.id, process_id: p.process_id, description: p.description }));
            return { accounts: accs, processes: procs };
          });
      modalAccessPendingRef.current.set(cacheKey, request);
      const next = await request;
      modalAccessCacheRef.current.set(cacheKey, next);
      applyAccessState(next);
      return next;
    } catch {
      const empty = { accounts: [], processes: [] };
      modalAccessCacheRef.current.set(cacheKey, cached || empty);
      applyAccessState(cached || empty);
      return cached || empty;
    }
    finally { modalAccessPendingRef.current.delete(cacheKey); }
  }, [groupOnlyUserList, selectedGroup, companies]);

  useEffect(() => {
    modalCompaniesCacheRef.current = modalPickerCompanies;
    setModalCompanies(modalPickerCompanies);
  }, [modalPickerCompanies]);

  const loadCompaniesForModal = async () => {
    try {
      const rows = (await fetchOwnerCompaniesAll({ me })).map(normalizeCompanyRow);
      // Group-only mode => choose group list.
      // Company-selected mode => choose companies visible under selected group, including linked groups (AP<->IG).
      if (groupOnlyUserList) {
        const groupOptions = buildModalGroupOptions(rows, me);
        setModalCompanies(groupOptions);
        return groupOptions;
      }
      if (modalPickerCompanies.length) {
        setModalCompanies(modalPickerCompanies);
        return modalPickerCompanies;
      }
      const base =
        useDualTenantUserPicker || isGroupLogin(me)
          ? rows
          : selectedGroup
            ? companiesInGroupList(rows, selectedGroup)
            : rows;
      const list = buildModalCompanyList(base);
      setModalCompanies(list);
      return list;
    } catch {
      setModalCompanies([]);
      return [];
    }
  };

  const markEditReady = useCallback((id) => {
    const nId = Number(id);
    if (!nId) return;
    setEditReadyIds((prev) => {
      if (prev.has(nId)) return prev;
      const next = new Set(prev);
      next.add(nId);
      return next;
    });
  }, []);

  const fetchEditUserDetail = useCallback(async (id, force = false) => {
    const cacheKey = String(id || "");
    if (!cacheKey) return null;
    const cached = editUserDetailCacheRef.current.get(cacheKey);
    if (cached && !force) {
      markEditReady(id);
      return cached;
    }
    const pending = editUserDetailPendingRef.current.get(cacheKey);
    if (pending) {
      try {
        const next = await pending;
        markEditReady(id);
        return next;
      } catch { return cached || null; }
    }
    const tenantId = scopeCompanyId != null ? Number(scopeCompanyId) : null;
    if (tenantId == null) return cached || null;
    const request = fetchAdminDetailByUserId(Number(id), tenantId);
    editUserDetailPendingRef.current.set(cacheKey, request);
    try {
      const next = await request;
      editUserDetailCacheRef.current.set(cacheKey, next);
      markEditReady(id);
      return next;
    } catch {
      return cached || null;
    } finally {
      editUserDetailPendingRef.current.delete(cacheKey);
    }
  }, [markEditReady, scopeCompanyId]);

  const applyEditDetail = useCallback((row, detail, accList, procList) => {
    let perms = [];
    try {
      perms = Array.isArray(detail.permissions)
        ? detail.permissions
        : detail.permissions
          ? JSON.parse(detail.permissions)
          : [];
    } catch { perms = []; }
    perms = sanitizeSidebarPermissionsForRole(normRole(row.role), perms.map((p) => String(p).toLowerCase()));
    setPermSelected(new Set(perms));
    setForm((f) => ({ ...f, read_only: detail.read_only !== undefined ? parseInt(detail.read_only, 10) === 1 : true }));
    let ap = null, pp = null; try { if (detail.account_permissions != null) ap = typeof detail.account_permissions === "string" ? JSON.parse(detail.account_permissions) : detail.account_permissions; } catch { ap = []; }
    try { if (detail.process_permissions != null) pp = typeof detail.process_permissions === "string" ? JSON.parse(detail.process_permissions) : detail.process_permissions; } catch { pp = []; }
    // JSON "null" parses to null → treat as unset whitelist
    const accUnset = ap === null;
    const accRows = accUnset ? null : Array.isArray(ap) ? ap : [];
    const isSelfEdit = Number(row.id) === Number(currentUserId) && !row.is_owner_shadow;
    // Self: selected = not self_hidden; held = all still-granted (incl. self_hidden) so they can re-open.
    // Superior: selected = all granted (incl. self_hidden) so Save won't revoke self-hidden Accs.
    // Do not merge full grants into the picker list (same-label / different-id ghosts).
    // Self-edit: list APIs hide self_hidden rows, so merge labeled grants back
    // (including hidden) so tiles keep names and can be re-checked.
    let modalAccList = accList;
    if (!accUnset && Array.isArray(accRows)) {
      if (isSelfEdit) {
        modalAccList = mergeModalAccountsWithGranted(accList, accRows);
        setModalAccounts(modalAccList);
        setSelectedAccountIds(
          new Set(
            accRows
              .filter((x) => !isAccountPermSelfHidden(x))
              .map((x) => Number(x.id || x))
              .filter((id) => id > 0),
          ),
        );
      } else {
        setSelectedAccountIds(new Set(accRows.map((x) => Number(x.id || x)).filter((id) => id > 0)));
      }
    } else {
      setSelectedAccountIds(new Set(accList.map((a) => Number(a.id))));
    }
    const procUnset = pp === null;
    const procRows = procUnset ? null : Array.isArray(pp) ? pp : [];
    let modalProcList = procList;
    if (!procUnset && Array.isArray(procRows)) {
      if (isSelfEdit) {
        modalProcList = mergeModalProcessesWithGranted(procList, procRows);
        setModalProcesses(modalProcList);
        setSelectedProcessIds(
          new Set(
            procRows
              .filter((x) => !isAccountPermSelfHidden(x))
              .map((x) => Number(x.id || x))
              .filter((id) => id > 0),
          ),
        );
      } else {
        setSelectedProcessIds(new Set(procRows.map((x) => Number(x.id || x)).filter((id) => id > 0)));
      }
    } else {
      setSelectedProcessIds(new Set(procList.map((p) => Number(p.id))));
    }
    if (isSelfEdit) {
      setSelfAccHeldIds(buildSelfAccHeldIds(accRows, accUnset, modalAccList.map((a) => a.id)));
      setSelfProcessHeldIds(buildSelfAccHeldIds(procRows, procUnset, modalProcList.map((p) => p.id)));
    } else {
      setSelfAccHeldIds(null);
      setSelfProcessHeldIds(null);
    }
    // Spring `AdminDTO.tenantIds` is a flat list mixing group + company tenant ids
    // (no separate group_codes/company_ids like the old PHP payload).
    const detailTenantIds = Array.isArray(detail.tenantIds)
      ? detail.tenantIds.map(Number).filter((id) => Number.isFinite(id) && id > 0)
      : [];
    if (currentUserRole === "admin" || currentUserRole === "owner") {
      if (useDualTenantUserPicker) {
        const groupTenantSet = new Set(modalGroupCompanies.map((c) => Number(c.id)));
        const subsidiarySet = new Set(modalSubsidiaryCompanies.map((c) => Number(c.id)));
        setSelectedGroupIds(detailTenantIds.filter((id) => groupTenantSet.has(id)));
        setSelectedCompanyIds(detailTenantIds.filter((id) => subsidiarySet.has(id)));
      } else if (detailTenantIds.length) {
        const allowed = new Set(modalPickerCompanies.map((c) => Number(c.id)));
        const ids = detailTenantIds.filter((id) => allowed.has(id));
        if (groupOnlyUserList) {
          const defaultPick = modalPickerCompanies.find(
            (c) => String(c.group_id || "").toUpperCase() === String(selectedGroup || "").toUpperCase()
          );
          setSelectedCompanyIds(
            ids.length
              ? ids
              : defaultPick?.id != null
                ? [Number(defaultPick.id)]
                : modalPickerCompanies[0]
                  ? [Number(modalPickerCompanies[0].id)]
                  : []
          );
        } else {
          setSelectedCompanyIds(ids.length ? ids : modalPickerCompanies.map((c) => Number(c.id)));
        }
        setSelectedGroupIds([]);
      } else {
        setSelectedCompanyIds(scopeCompanyId ? [Number(scopeCompanyId)] : []);
        setSelectedGroupIds([]);
      }
    } else {
      setSelectedCompanyIds(scopeCompanyId ? [Number(scopeCompanyId)] : []);
      setSelectedGroupIds([]);
    }
    if (row.is_owner_shadow) {
      setPermSelected(new Set(getVisiblePermissionKeys("owner")));
      setSelectedAccountIds(new Set(accList.map((a) => Number(a.id))));
      setSelectedProcessIds(new Set(procList.map((p) => Number(p.id))));
      setSelectedCompanyIds([]);
      setSelectedGroupIds([]);
      setSelfAccHeldIds(null);
      setSelfProcessHeldIds(null);
    }
  }, [
    scopeCompanyId,
    currentUserId,
    currentUserRole,
    modalPickerCompanies,
    modalGroupCompanies,
    modalSubsidiaryCompanies,
    useDualTenantUserPicker,
    groupOnlyUserList,
    selectedGroup,
  ]);

  const openAdd = async () => {
    if (userMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    const canMutate = userListHasMutationScope(mutationScopeCompanyId, {
      groupOnly: groupOnlyUserList,
      selectedGroup,
    });
    if (!canMutate) return;
    const modalCacheKey = resolveModalAccessCacheKey(
      mutationScopeCompanyId ?? `group:${String(selectedGroup || "").trim().toUpperCase()}`,
      groupOnlyUserList,
      selectedGroup,
    );
    const hadAccessCache = modalAccessCacheRef.current.has(modalCacheKey);
    if (!hadAccessCache) {
      await fetchModalAccountsProcesses(mutationScopeCompanyId);
    }
    const avail = getAvailableRolesForCreation(currentUserRole);
    if (avail.length === 0) { notify(t("noPermissionCreateAccounts"), "danger"); return; }
    const loadSeq = ++modalLoadSeqRef.current;
    setIsEditMode(false); setEditingRow(null);
    setForm({ id: "", login_id: "", name: "", email: "", role: "", password: "", secondary_password: "", status: "active", read_only: true });
    setRoleSelectDisabled(false); setLoginDisabled(false);
    setFieldLocks({
      name: false,
      email: false,
      role: false,
      password: false,
      sidebar: false,
      company: false,
      account: false,
      process: false,
    });
    const allP = new Set(getVisiblePermissionKeys("").filter((k) => !permDisabledMap[k])); setPermSelected(allP);
    void loadCompaniesForModal();
    const cachedAccess = modalAccessCacheRef.current.get(modalCacheKey);
    const currentAccess =
      Number(modalAccessCompanyIdRef.current) === Number(mutationScopeCompanyId)
        ? { accounts: modalAccounts, processes: modalProcesses }
        : null;
    const initialAccess = cachedAccess || currentAccess || { accounts: [], processes: [] };
    if (!cachedAccess && !currentAccess) { setModalAccounts([]); setModalProcesses([]); }
    setSelectedAccountIds(new Set(initialAccess.accounts.map((a) => Number(a.id)))); setSelectedProcessIds(new Set(initialAccess.processes.map((p) => Number(p.id))));
    if (currentUserRole === "admin" || currentUserRole === "owner") {
      if (useDualTenantUserPicker) {
        const defaultGroupIds = selectedGroup
          ? resolveGroupEntityIdsFromCodes(modalGroupCompanies, [selectedGroup])
          : [];
        setSelectedGroupIds(defaultGroupIds);
        setSelectedCompanyIds(companyId ? [Number(companyId)] : []);
      } else if (groupOnlyUserList) {
        const defaultGroup =
          selectedGroup && modalPickerCompanies.some((c) => String(c.group_id || "").toUpperCase() === String(selectedGroup).toUpperCase())
            ? selectedGroup
            : modalPickerCompanies[0]?.group_id;
        const pick = modalPickerCompanies.find(
          (c) => String(c.group_id || "").toUpperCase() === String(defaultGroup || "").toUpperCase()
        );
        setSelectedCompanyIds(pick?.id != null ? [Number(pick.id)] : []);
        setSelectedGroupIds([]);
      } else if (isGroupLogin(me) && selectedGroup) {
        // Group login add-user default should stay on group entity (AP/IG),
        // not whichever subsidiary company chip is currently active (e.g. 95).
        const entityPick = pickDefaultCompanyForGroup(companies, selectedGroup, {
          me,
          preferredCompanyId: me?.company_id ?? companyId,
          groupEntityOnly: true,
        });
        const entityId = entityPick?.id != null ? Number(entityPick.id) : Number.NaN;
        if (Number.isFinite(entityId) && entityId > 0) {
          setSelectedCompanyIds([entityId]);
        } else {
          setSelectedCompanyIds(companyId ? [Number(companyId)] : []);
        }
      } else {
        setSelectedCompanyIds(companyId ? [Number(companyId)] : []);
      }
    }
    setModalOpen(true);
    // Soft revalidate only when opening from cache — avoid a second main-thread grid
    // commit racing with Role clicks right after Add User.
    if (hadAccessCache) {
      const softRefresh = () => {
        void fetchModalAccountsProcesses(mutationScopeCompanyId, true, { background: true }).then(({ accounts: accList, processes: procList }) => {
          if (loadSeq !== modalLoadSeqRef.current) return;
          startTransition(() => {
            setSelectedAccountIds(new Set(accList.map((a) => Number(a.id))));
            setSelectedProcessIds(new Set(procList.map((p) => Number(p.id))));
          });
        });
      };
      if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(softRefresh, { timeout: 4000 });
      } else {
        window.setTimeout(softRefresh, 1500);
      }
    }
  };

  const applyPermTemplate = useCallback((role, force) => {
    if (isEditMode && !force) return;
    const next = new Set();
    getRoleTemplateSidebarList(role).forEach((k) => {
      if (getVisiblePermissionKeys(role).includes(k)) next.add(k);
    });
    setPermSelected(next);
    // read_only 由 Role onChange 一并写入，避免额外 setForm
  }, [isEditMode]);

  const openEdit = async (row) => {
    if (isUserEditBlockedByReadOnly(row)) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    const canMutate = userListHasMutationScope(scopeCompanyId, {
      groupOnly: groupOnlyUserList,
      selectedGroup,
    });
    if (!canMutate) return;
    if (row.is_owner_shadow && currentUserRole !== "owner") { notify(t("onlyOwnerCanEditOwner"), "danger"); return; }
    const modalCacheKey = resolveModalAccessCacheKey(
      scopeCompanyId ?? `group:${String(selectedGroup || "").trim().toUpperCase()}`,
      groupOnlyUserList,
      selectedGroup,
    );
    const cachedDetail = editUserDetailCacheRef.current.get(String(row.id));
    const loadSeq = ++modalLoadSeqRef.current;
    const cachedAccess = modalAccessCacheRef.current.get(modalCacheKey) || { accounts: modalAccounts, processes: modalProcesses };
    setIsEditMode(true); setEditingRow(row);
    setForm({ id: String(row.id), login_id: row.login_id || "", name: row.name || "", email: row.email || "", role: normRole(row.role), password: "", secondary_password: "", status: normRole(row.status) || "active", read_only: true });
    setRoleSelectDisabled(!!row.is_owner_shadow); setLoginDisabled(true);
    setFieldLocks(getUserEditFieldLocks(row, currentUserId, currentUserRole));
    void loadCompaniesForModal();
    if (cachedDetail) {
      applyEditDetail(row, cachedDetail, cachedAccess.accounts, cachedAccess.processes);
    }
    setModalOpen(true);
    void Promise.all([
      fetchModalAccountsProcesses(scopeCompanyId, true),
      fetchEditUserDetail(row.id, true),
    ]).then(([access, detail]) => {
      if (loadSeq !== modalLoadSeqRef.current || !detail) return;
      applyEditDetail(row, detail, access.accounts, access.processes);
    });
  };

  const closeModal = useCallback(() => {
    modalLoadSeqRef.current += 1;
    setModalOpen(false);
    setEditingRow(null);
    setSelfAccHeldIds(null);
    setSelfProcessHeldIds(null);
  }, []);

  const toggleUserStatus = async (row) => {
    if (userMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    const caps = computeRowCapabilities(row, currentUserId, currentUserRole);
    if (!caps.canToggleStatus) return;
    try {
      const toggleCompanyId = groupOnlyUserList ? scopeCompanyId : companyId;
      const tenantId =
        toggleCompanyId != null && Number(toggleCompanyId) > 0 ? Number(toggleCompanyId) : scopeCompanyId;
      if (tenantId == null) {
        notify(t("toggleFailed"), "danger");
        return;
      }
      const updated = await toggleAdminUserStatus({ id: row.id, scopeTenantId: tenantId });
      const newStatus = updated?.status;
      if (!newStatus) { notify(t("toggleFailed"), "danger"); return; }
      setUsersRaw((prev) => {
        const next = prev.map((u) => (Number(u.id) === Number(row.id) ? { ...u, status: newStatus } : u));
        const s = userListScopeRef.current;
        const cacheKey = resolveUserListCacheKey(
          s.companyId,
          s.groupOnlyUserList,
          s.selectedGroup,
          s.aggregateUserList,
          s.groupsAllMode,
          s.groupAllMode,
        );
        if (cacheKey) userListCacheRef.current.set(cacheKey, next);
        return next;
      });
      if (normRole(newStatus) === "active") {
        setSelectedDeleteIds((prev) => {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
      }
      notify(t("statusUpdated"), "success");
    } catch (err) { notifyApi(err?.message, "toggleFailed", "danger"); }
  };

  const confirmDelete = async () => {
    if (userMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      setConfirmOpen(false);
      return;
    }
    const ids = pendingDeleteRef.current || []; pendingDeleteRef.current = []; setConfirmOpen(false);
    if (!ids.length) return;

    const deleteTenantId = groupOnlyUserList ? scopeCompanyId : (companyId != null ? Number(companyId) : scopeCompanyId);
    if (deleteTenantId == null) {
      notify(t("apiDeleteUserFailed"), "danger");
      return;
    }

    const results = await Promise.all(
      ids.map((id) =>
        deleteAdminUser({ id, scopeTenantId: deleteTenantId })
          .then(() => ({ success: true }))
          .catch((err) => ({ success: false, message: err?.message })),
      ),
    );

    const succeededIds = ids.filter((_, index) => results[index]?.success);
    const failCount = ids.length - succeededIds.length;

    if (succeededIds.length === ids.length) {
      notify(t("deletedUsersSuccess", { count: succeededIds.length }), "success");
    } else if (succeededIds.length > 0) {
      notify(t("deletionResult", { ok: succeededIds.length, fail: failCount }), "danger");
    } else {
      notifyApi(results.find((r) => !r?.success)?.message, "apiDeleteUserFailed", "danger");
    }

    if (succeededIds.length > 0) {
      const succeededSet = new Set(succeededIds.map(Number));
      setUsersRaw((prev) => prev.filter((u) => !succeededSet.has(Number(u.id))));
    }
    setSelectedDeleteIds(new Set());
    setSelectAllUsers(false);
    if (succeededIds.length > 0) void fetchUsers();
  };

  const saveUser = async (e) => {
    e.preventDefault();
    if (isUserEditBlockedByReadOnly(editingRow)) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    if (isUserModalPageReadOnlyLock(isEditMode, editingRow, form.role, form.read_only, currentUserId)) return;
    if (!isEditMode && !form.password.trim()) { notify(t("passwordRequired"), "danger"); return; }
    if (
      useDualTenantUserPicker &&
      !editingRow?.is_owner_shadow &&
      selectedGroupIds.length === 0 &&
      selectedCompanyIds.length === 0
    ) {
      notify(t("groupCompanySelectionRequired"), "danger");
      return;
    }
    if (
      !useDualTenantUserPicker &&
      groupOnlyUserList &&
      (currentUserRole === "admin" || currentUserRole === "owner") &&
      !editingRow?.is_owner_shadow &&
      selectedCompanyIds.length === 0 &&
      !String(selectedGroup || "").trim()
    ) {
      notify(t("groupNoneSelected"), "danger");
      return;
    }
    const emailCheck = validateEmail(form.email);
    if (!emailCheck.ok) { notify(t("invalidEmailFormat"), "danger"); return; }

    const allowSecondaryPassword = isC168Company || !!editingRow?.is_owner_shadow;
    if (allowSecondaryPassword && form.secondary_password.trim() && !/^\d{6}$/.test(form.secondary_password.trim())) {
      notify(t("secondaryPasswordMustBe6Digits"), "danger");
      return;
    }

    // Owner shadow row: dedicated limited-field Spring endpoint (name/email/password only).
    if (editingRow?.is_owner_shadow) {
      try {
        const request = buildAdminOwnerProfileUpdateRequest({
          id: form.id,
          name: form.name.trim().toUpperCase(),
          email: emailCheck.normalized,
          password: form.password.trim() || undefined,
          secondaryPassword: form.secondary_password.trim() || undefined,
        });
        const updated = toLegacyAdminRow(await updateAdminOwnerProfile(request));
        editUserDetailCacheRef.current.delete(String(form.id));
        setEditReadyIds((prev) => {
          const next = new Set(prev);
          next.delete(Number(form.id));
          return next;
        });
        notify(t("saved"), "success");
        closeModal();
        setUsersRaw((prev) =>
          prev.map((u) => (Number(u.id) === Number(updated.id) ? { ...u, ...updated, is_owner_shadow: true } : u)),
        );
        void fetchUsers();
      } catch (err) {
        notifyApi(err?.message, "saveFailed", "danger");
      }
      return;
    }

    const selectedAccountIdsNow = selectedAccountIdsRef.current instanceof Set
      ? selectedAccountIdsRef.current
      : new Set(selectedAccountIds);
    const selectedProcessIdsNow = selectedProcessIdsRef.current instanceof Set
      ? selectedProcessIdsRef.current
      : new Set(selectedProcessIds);
    const modalAccountsNow = Array.isArray(modalAccountsRef.current) ? modalAccountsRef.current : modalAccounts;
    const modalProcessesNow = Array.isArray(modalProcessesRef.current) ? modalProcessesRef.current : modalProcesses;
    const accountPerms = Array.from(selectedAccountIdsNow).map((id) => ({ id: Number(id) }));
    // Group-only still has a scope company (group entity/anchor) for Process rows — allow save.
    const shouldSendProcessPermissions = useDualTenantUserPicker
      ? selectedCompanyIds.length > 0
      : (!groupOnlyUserList || (mutationScopeCompanyId != null && Number(mutationScopeCompanyId) > 0));
    const processPerms = Array.from(selectedProcessIdsNow).map((id) => ({ id: Number(id) }));

    // Tenant scope: Spring wants a single `tenantIds` list (group + company tenant ids mixed),
    // not the old PHP group_id/group_only/group_codes/company_ids/mixed_tenant_assign fields.
    const shouldForceGroupScope = !useDualTenantUserPicker && groupOnlyUserList;
    let saveCompanyIds = selectedCompanyIds;
    let saveGroupCodes = [];
    if (useDualTenantUserPicker) {
      saveGroupCodes = resolveSelectedGroupCodesFromPicker(modalGroupCompanies, selectedGroupIds);
    } else if (shouldForceGroupScope) {
      const inferredGroupIdFromPicker = (() => {
        const selectedId = selectedCompanyIds[0] != null ? Number(selectedCompanyIds[0]) : Number.NaN;
        if (!Number.isFinite(selectedId) || selectedId === 0) return null;
        const selectedOption = modalPickerCompanies.find((c) => Number(c.id) === selectedId);
        const gid = String(selectedOption?.group_id || "").trim().toUpperCase();
        return gid || null;
      })();
      const saveGroupId = String(selectedGroup || inferredGroupIdFromPicker || "").trim().toUpperCase();
      if (saveGroupId) {
        saveGroupCodes = [saveGroupId];
        const groupTenantId = resolveGroupEntityTenantId(companies, saveGroupId);
        saveCompanyIds = groupTenantId != null ? [groupTenantId] : [];
      }
    }
    const tenantIds = resolveAdminTenantIds({
      useDualTenantUserPicker,
      selectedGroupIds,
      selectedCompanyIds,
      saveCompanyIds,
      shouldForceGroupScope,
      currentUserRole,
      companyId,
      mutationScopeCompanyId,
    });

    const roleForReadOnly = normRole(form.role) || normRole(editingRow?.role);
    const readOnlyValue =
      roleForReadOnly && roleHasReadOnlyToggle(roleForReadOnly) && canInteractWithReadOnlyToggle(currentUserRole, roleForReadOnly)
        ? !!form.read_only
        : undefined;

    let permissionsValue;
    let accountPermissionsValue;
    let processPermissionsValue;
    const compactRows = (mergedRows) =>
      mergedRows.map((row) => {
        const out = { id: Number(row.id) };
        if (row?.self_hidden) out.self_hidden = true;
        return out;
      });

    if (!isEditMode) {
      permissionsValue = getFinalPermissionsForCreation(form.role, Array.from(permSelected), currentUserRole);
      // Owner Select All → null (see-all); otherwise compact id rows.
      accountPermissionsValue = resolveSeeAllOrCompactPermissions(
        {
          isSelf: false,
          editorSeesAll: currentUserRole === "owner",
          selectedIds: selectedAccountIdsNow,
          modalRows: modalAccountsNow,
        },
        accountPerms,
      );
      if (shouldSendProcessPermissions) {
        processPermissionsValue = resolveSeeAllOrCompactPermissions(
          {
            isSelf: false,
            editorSeesAll: currentUserRole === "owner",
            selectedIds: selectedProcessIdsNow,
            modalRows: modalProcessesNow,
          },
          processPerms,
        );
      }
    } else {
      const caps = computeRowCapabilities(editingRow, currentUserId, currentUserRole);
      // Always echo permSelected back, even for self/same-level/higher-level targets where the
      // checkbox UI is hidden — permSelected was loaded from resolveEffectiveSidebarPermissionCodes
      // when the modal opened, so it already reflects the current ROLE_DEFAULT/CUSTOM state. Omitting
      // the field here (as before) made the backend treat "not sent" as "reset to ROLE_DEFAULT"
      // (see AdminServiceImpl.resolvePermissionMode), which silently wiped a CUSTOM override on any
      // self-edit (e.g. changing your own password).
      permissionsValue = Array.from(permSelected);
      // Acc / Process：上级改下级，或自己关掉不想看的（self_hidden，可再开回）
      const accountLocked = !!(fieldLocks.account ?? fieldLocks.accountProcess);
      const processLocked = !!(fieldLocks.process ?? fieldLocks.accountProcess);
      const detail = editUserDetailCacheRef.current.get(String(form.id || ""));

      if (!accountLocked) {
        let existingAp = null;
        let existingUnset = true;
        try {
          if (detail && detail.account_permissions != null) {
            existingUnset = false;
            existingAp = Array.isArray(detail.account_permissions)
              ? detail.account_permissions
              : JSON.parse(detail.account_permissions);
          }
        } catch {
          existingAp = [];
          existingUnset = false;
        }
        // Only owner bypasses Acc whitelist when merging grants; partnership/audit grant within visible set.
        const editorSeesAllAccounts = currentUserRole === "owner";
        const grantableIds = editorSeesAllAccounts ? null : modalAccountsNow.map((a) => Number(a.id));
        let nextAccountPerms;
        if (caps.isSelf) {
          const heldIds = selfAccHeldIdsRef.current;
          const heldPerms =
            heldIds instanceof Set
              ? [...heldIds].map((id) => ({ id: Number(id) }))
              : existingUnset
                ? accountPerms
                : existingAp;
          nextAccountPerms = compactRows(shrinkAccountPermissionsForSelf(heldPerms, accountPerms));
        } else if (existingUnset) {
          nextAccountPerms = accountPerms;
        } else {
          nextAccountPerms = compactRows(mergeAccountPermissionsForEditor(existingAp, accountPerms, grantableIds));
        }
        accountPermissionsValue = resolveSeeAllOrCompactPermissions(
          {
            isSelf: !!caps.isSelf,
            editorSeesAll: editorSeesAllAccounts,
            selectedIds: selectedAccountIdsNow,
            modalRows: modalAccountsNow,
          },
          nextAccountPerms,
        );
      }
      if (!processLocked && shouldSendProcessPermissions) {
        let existingPp = null;
        let existingProcUnset = true;
        try {
          if (detail && detail.process_permissions != null) {
            existingProcUnset = false;
            existingPp = Array.isArray(detail.process_permissions)
              ? detail.process_permissions
              : JSON.parse(detail.process_permissions);
          }
        } catch {
          existingPp = [];
          existingProcUnset = false;
        }
        // Only owner bypasses Process whitelist when merging grants; partnership/audit grant within visible set.
        const editorSeesAllProcesses = currentUserRole === "owner";
        const grantableProcessIds = editorSeesAllProcesses ? null : modalProcessesNow.map((p) => Number(p.id));
        let nextProcessPerms;
        if (caps.isSelf) {
          const heldIds = selfProcessHeldIdsRef.current;
          const heldPerms =
            heldIds instanceof Set
              ? [...heldIds].map((id) => ({ id: Number(id) }))
              : existingProcUnset
                ? processPerms
                : existingPp;
          nextProcessPerms = compactRows(shrinkAccountPermissionsForSelf(heldPerms, processPerms));
        } else if (existingProcUnset) {
          nextProcessPerms = processPerms;
        } else {
          nextProcessPerms = compactRows(mergeAccountPermissionsForEditor(existingPp, processPerms, grantableProcessIds));
        }
        processPermissionsValue = resolveSeeAllOrCompactPermissions(
          {
            isSelf: !!caps.isSelf,
            editorSeesAll: editorSeesAllProcesses,
            selectedIds: selectedProcessIdsNow,
            modalRows: modalProcessesNow,
          },
          nextProcessPerms,
        );
      }
    }

    try {
      let saved;
      if (!isEditMode) {
        const request = buildAdminCreateRequest({
          loginId: form.login_id.trim().toUpperCase(),
          name: form.name.trim().toUpperCase(),
          email: emailCheck.normalized,
          password: form.password,
          secondaryPassword: allowSecondaryPassword ? form.secondary_password.trim() || undefined : undefined,
          role: form.role,
          status: form.status,
          readOnly: readOnlyValue,
          permissions: permissionsValue,
          tenantIds,
          accountPermissions: accountPermissionsValue,
          processPermissions: processPermissionsValue,
        });
        saved = toLegacyAdminRow(await createAdminUser(request));
      } else {
        if (scopeCompanyId == null) {
          notify(t("saveFailed"), "danger");
          return;
        }
        const request = buildAdminUpdateRequest({
          id: form.id,
          tenantAccessId: editingRow?.tenant_access_id ?? undefined,
          scopeTenantId: scopeCompanyId,
          name: form.name.trim().toUpperCase(),
          email: emailCheck.normalized,
          password: form.password.trim() || undefined,
          secondaryPassword: allowSecondaryPassword ? form.secondary_password.trim() || undefined : undefined,
          role: form.role,
          status: form.status,
          readOnly: readOnlyValue,
          permissions: permissionsValue,
          tenantIds,
          accountPermissions: accountPermissionsValue,
          processPermissions: processPermissionsValue,
        });
        saved = toLegacyAdminRow(await updateAdminUser(request));
      }

      if (isEditMode && form.id) {
        editUserDetailCacheRef.current.delete(String(form.id));
        setEditReadyIds((prev) => {
          const next = new Set(prev);
          next.delete(Number(form.id));
          return next;
        });
        // Acc whitelist may have changed — drop modal account list cache so next open is filtered.
        modalAccessCacheRef.current.clear();
      }
      notify(t("saved"), "success");
      closeModal();
      if (saveGroupCodes.length > 0) {
        for (const code of saveGroupCodes) {
          userListCacheRef.current.delete(
            resolveUserListCacheKey(null, true, code, false, false, false),
          );
        }
      }
      if (saved && !groupOnlyUserList) {
        setUsersRaw((prev) =>
          isEditMode
            ? prev.map((u) =>
                Number(u.id) === Number(saved.id)
                  ? { ...u, ...saved, is_owner_shadow: u.is_owner_shadow }
                  : u
              )
            : [...prev, { ...saved, is_owner_shadow: false }]
        );
      }
      void fetchUsers();
    } catch (err) {
      notifyApi(err?.message, "saveFailed", "danger");
    }
  };

  // 稳定引用包裹：始终调用最新 saveUser，但引用不变，使 memo 化的 UserModal 不因此重渲染。
  const saveUserRef = useRef(saveUser);
  saveUserRef.current = saveUser;
  const stableSaveUser = useCallback((e) => saveUserRef.current(e), []);

  // 弹窗打开期间冻结背后用户表 props，避免选 Role / 改权限时整表重渲（主卡顿源）。
  const userCardsPropsLive = {
    pageRows,
    effectivePage,
    pageSize,
    showAll,
    usePagedFill,
    showBulkDeleteColumn,
    selectedDeleteIds,
    setSelectedDeleteIds,
    currentUserId,
    currentUserRole,
    userMutationsBlocked,
    isUserEditBlockedByReadOnly,
    onEdit: openEdit,
    onToggleStatus: toggleUserStatus,
    t,
  };
  const userCardsPropsFrozenRef = useRef(userCardsPropsLive);
  if (!modalOpen) userCardsPropsFrozenRef.current = userCardsPropsLive;
  const userCardsProps = modalOpen ? userCardsPropsFrozenRef.current : userCardsPropsLive;

  return (
    <>
      <div className="container">
        <div className="content">
          <div className="action-buttons-container">
            <div className="action-buttons" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="action-controls-row user-toolbar-primary" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                {canCreateUser ? (
                <button
                  type="button"
                  className="btn btn-add"
                  onClick={openAdd}
                  disabled={
                    userMutationsBlocked ||
                    !userListHasMutationScope(mutationScopeCompanyId, {
                      groupOnly: groupOnlyUserList,
                      selectedGroup,
                    })
                  }
                >
                  <svg className="btn-add__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                  {t("addUser")}
                </button>
                ) : null}
                <div className="search-container userlist-search-bar">
                  <span className="userlist-search-bar__icon" aria-hidden="true">
                    <svg fill="currentColor" viewBox="0 0 24 24">
                      <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                    </svg>
                  </span>
                  <input
                    id="userlist-search-input"
                    type="text"
                    className="search-input userlist-search-input"
                    placeholder={t("searchPlaceholder")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="userlist-filter-chips" role="group">
                    <button
                      type="button"
                      className={`user-filter-chip${showAll ? " is-selected" : ""}`}
                      aria-pressed={showAll}
                      onClick={() => setShowAll((prev) => !prev)}
                    >
                      <span className="user-filter-chip__dot" aria-hidden>
                        {showAll ? (
                          <svg className="user-filter-chip__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 12l4 4 8-8" />
                          </svg>
                        ) : null}
                      </span>
                      <span className="user-filter-chip__label">{t("showAll")}</span>
                    </button>
                    <button
                      type="button"
                      className={`user-filter-chip${showActive ? " is-selected" : ""}`}
                      aria-pressed={showActive}
                      onClick={() => setShowActive((prev) => !prev)}
                    >
                      <span className="user-filter-chip__dot" aria-hidden>
                        {showActive ? (
                          <svg className="user-filter-chip__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 12l4 4 8-8" />
                          </svg>
                        ) : null}
                      </span>
                      <span className="user-filter-chip__label">{t("showActive")}</span>
                    </button>
                    <button
                      type="button"
                      className={`user-filter-chip${showInactive ? " is-selected" : ""}`}
                      aria-pressed={showInactive}
                      onClick={() => setShowInactive((prev) => !prev)}
                    >
                      <span className="user-filter-chip__dot" aria-hidden>
                        {showInactive ? (
                          <svg className="user-filter-chip__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 12l4 4 8-8" />
                          </svg>
                        ) : null}
                      </span>
                      <span className="user-filter-chip__label">{t("showInactive")}</span>
                    </button>
                </div>
              </div>
              <div className="user-toolbar-actions-right">
                <button
                  type="button"
                  className="btn btn-delete"
                  disabled={!selectedDeleteIds.size || userMutationsBlocked}
                  onClick={() => {
                    if (userMutationsBlocked) {
                      notify(t("readOnlyActionBlocked"), "danger");
                      return;
                    }
                    const ids = Array.from(selectedDeleteIds);
                    pendingDeleteRef.current = ids;
                    const selectedUserNames = usersRaw
                      .filter((u) => ids.includes(Number(u.id)))
                      .map((u) => String(u.login_id || u.name || u.email || u.id || "").trim())
                      .filter(Boolean);
                    const details = selectedUserNames.length ? `\n\n${selectedUserNames.join("\n")}` : "";
                    setConfirmMessage(`${t("deleteConfirmWithCount", { count: ids.length })}${details}`);
                    setConfirmOpen(true);
                  }}
                >
                  {t("deleteWithCount", { count: selectedDeleteIds.size })}
                </button>
              </div>
            </div>
            <GcInlineFilterPanel
              t={t}
              groupIds={groupIds}
              groupsAllMode={groupsAllMode}
              selectedGroup={selectedGroup}
              onPickAllGroups={handlePickAllGroups}
              onPickGroup={handlePickGroupUserList}
              companiesForPicker={inlineCompaniesForPicker}
              groupAllMode={groupAllMode}
              pickerCompanyId={pickerCompanyId}
              onPickAllInGroup={handlePickAllInGroup}
              onPickCompany={onPickCompanyPill}
              onClearCompanyPill={clearCompanyPillSelection}
              allowCompanyDeselect={canClearCompanySelection(me, selectedGroup)}
              switchingCompany={false}
              showAllOption={false}
            />
          </div>
          <div
            ref={listRegionRef}
            className={`user-table-wrapper user-list-table${showBulkDeleteColumn ? " user-table-wrapper--bulk-delete-col" : ""}`}
          >
            <div className="table-header user-list-table-header">
              <div
                className="header-item header-item--with-sort-icon header-sortable"
                role="button"
                tabIndex={0}
                onClick={() => handleUserListSort("no")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleUserListSort("no");
                  }
                }}
              >
                <span className="header-item__label">{t("no")}</span>
                {renderUserListHeaderSortIcon("no")}
              </div>
              <div
                className="header-item header-item--with-sort-icon header-sortable"
                role="button"
                tabIndex={0}
                onClick={() => handleUserListSort("loginId")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleUserListSort("loginId");
                  }
                }}
              >
                <span className="header-item__label">{t("loginId")}</span>
                {renderUserListHeaderSortIcon("loginId")}
              </div>
              <div
                className="header-item header-item--with-sort-icon header-sortable"
                role="button"
                tabIndex={0}
                onClick={() => handleUserListSort("name")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleUserListSort("name");
                  }
                }}
              >
                <span className="header-item__label">{t("name")}</span>
                {renderUserListHeaderSortIcon("name")}
              </div>
              <div
                className="header-item header-item--with-sort-icon header-sortable"
                role="button"
                tabIndex={0}
                onClick={() => handleUserListSort("email")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleUserListSort("email");
                  }
                }}
              >
                <span className="header-item__label">{t("email")}</span>
                {renderUserListHeaderSortIcon("email")}
              </div>
              <div
                className="header-item header-item--with-sort-icon header-sortable"
                role="button"
                tabIndex={0}
                onClick={() => handleUserListSort("role")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleUserListSort("role");
                  }
                }}
              >
                <span className="header-item__label">{t("role")}</span>
                {renderUserListHeaderSortIcon("role")}
              </div>
              <div
                className="header-item header-item--with-sort-icon header-sortable"
                role="button"
                tabIndex={0}
                onClick={() => handleUserListSort("status")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleUserListSort("status");
                  }
                }}
              >
                <span className="header-item__label">{t("status")}</span>
                {renderUserListHeaderSortIcon("status")}
              </div>
              <div
                className="header-item header-item--with-sort-icon header-sortable"
                role="button"
                tabIndex={0}
                onClick={() => handleUserListSort("lastLogin")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleUserListSort("lastLogin");
                  }
                }}
              >
                <span className="header-item__label">{t("lastLogin")}</span>
                {renderUserListHeaderSortIcon("lastLogin")}
              </div>
              <div
                className="header-item header-item--with-sort-icon header-sortable"
                role="button"
                tabIndex={0}
                onClick={() => handleUserListSort("createdBy")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleUserListSort("createdBy");
                  }
                }}
              >
                <span className="header-item__label">{t("createdBy")}</span>
                {renderUserListHeaderSortIcon("createdBy")}
              </div>
              <div className="header-item header-item--action">
                <span className="header-item__label">{t("action")}</span>
              </div>
              {showBulkDeleteColumn && (
                <div className="header-item header-item--select">
                  <input
                    type="checkbox"
                    aria-label={t("selectAllDeletableAria")}
                    checked={selectAllUsers}
                    disabled={userMutationsBlocked}
                    onChange={(e) => {
                      const on = e.target.checked;
                      const eligible = pageRows
                        .filter((r) => {
                          const c = computeRowCapabilities(r, currentUserId, currentUserRole);
                          return getDeleteCheckboxState(r, c).show;
                        })
                        .map((r) => Number(r.id));
                      setSelectedDeleteIds(on ? new Set(eligible) : new Set());
                      setSelectAllUsers(on);
                    }}
                  />
                </div>
              )}
            </div>
            <UserCardsList {...userCardsProps} />
          </div>
          {!showAll && (
            <div className="pagination-container">
              <button className="pagination-btn" disabled={effectivePage <= 1} onClick={() => setCurrentPage(p => p - 1)}>◀</button>
            <span className="pagination-info">{t("paginationOf", { page: effectivePage, total: totalPages })}</span>
              <button className="pagination-btn" disabled={effectivePage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>▶</button>
            </div>
          )}
        </div>
      </div>
      {toast && typeof document !== "undefined" && document.body
        ? createPortal(
            <div
              id="accountNotificationContainer"
              className="account-notification-container"
              style={{
                zIndex: modalOpen || confirmOpen ? processNotificationAboveAccountZIndex : processNotificationZIndex,
              }}
            >
              <div className={`account-notification account-notification-${toast.type} show`}>{toast.message}</div>
            </div>,
            document.body
          )
        : null}
      <UserModal open={modalOpen} onClose={closeModal} isEditMode={isEditMode} editingRow={editingRow} form={form} setForm={setForm} isC168Company={isC168Company} currentUserRole={currentUserRole} currentUserId={currentUserId} roleSelectDisabled={roleSelectDisabled} loginDisabled={loginDisabled} fieldLocks={fieldLocks} permDisabledMap={permDisabledMap} visiblePermissionKeys={visiblePermissionKeys} permSelected={permSelected} setPermSelected={setPermSelected} modalCompanies={modalCompanies} selectedCompanyIds={selectedCompanyIds} setSelectedCompanyIds={setSelectedCompanyIds} groupPickerMode={!useDualTenantUserPicker && groupOnlyUserList} dualTenantPicker={useDualTenantUserPicker} groupOnlyUserList={groupOnlyUserList} modalGroupCompanies={modalGroupCompanies} modalSubsidiaryCompanies={modalSubsidiaryCompanies} selectedGroupIds={selectedGroupIds} setSelectedGroupIds={setSelectedGroupIds} modalAccounts={modalAccounts} selectedAccountIds={selectedAccountIds} setSelectedAccountIds={setSelectedAccountIdsSynced} selfAccHeldIds={selfAccHeldIds} selfProcessHeldIds={selfProcessHeldIds} modalProcesses={modalProcesses} selectedProcessIds={selectedProcessIds} setSelectedProcessIds={setSelectedProcessIdsSynced} applyPermTemplate={applyPermTemplate} onSave={stableSaveUser} sessionMutationsBlocked={isUserEditBlockedByReadOnly(editingRow)} t={t} />
      <UserConfirmModal open={confirmOpen} message={confirmMessage} onConfirm={confirmDelete} onClose={() => setConfirmOpen(false)} confirmDisabled={userMutationsBlocked} t={t} />
    </>
  );
}
