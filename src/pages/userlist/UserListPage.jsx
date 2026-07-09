import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../../utils/company/companySessionEvents.js";
import { syncCompanySessionApi } from "../../utils/company/companySessionSync.js";
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
} from "../../utils/company/sharedCompanyFilter.js";
import { pathnameIs, spaPath } from "../../utils/routing/pageRoutes.js";
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
import { isPartnershipAuditReadOnlyLocked } from "../../utils/audit/partnershipAuditReadOnly.js";
import { assetUrl, buildApiUrl } from "../../utils/core/apiUrl.js";
import { useAuthSession } from "../../context/AuthSessionContext.jsx";
import "../../../public/css/accountCSS.css";
import "../../../public/css/userlist.css";
import "../../../public/css/admin-responsive.css";
import {
  ALL_ROLE_OPTIONS,
  PAGE_SIZE,
  PERMISSION_KEYS,
  applyUserFilters,
  computeRowCapabilities,
  formatLastLogin,
  getAvailableRolesForCreation,
  getAvailableRolesForEdit,
  getCurrentUserRolePermissions,
  getDeleteCheckboxState,
  getFinalPermissionsForCreation,
  getRoleTemplateSidebarList,
  formatRoleLabel,
  normRole,
  rowCreatedBy,
  rowIsOwnerShadow,
  rowLoginId,
  rowLastLogin,
  sortUsers,
  roleHasReadOnlyToggle,
  canInteractWithReadOnlyToggle,
  isUserModalPageReadOnlyLock,
  getUserEditFieldLocks,
  isCompanyInUserListPicker,
  readUserListGroupFilterOptOut,
  resolveUserListFetchScopeKey,
  resolveUserListInlinePickerCompanies,
  resolveUserListMutationScopeCompanyId,
  shouldLoadUserListData,
  userListHasMutationScope,
} from "./userListLogic.js";
import {
  buildAdminCreateRequest,
  buildAdminUpdateRequest,
  createAdminUser,
  deleteAdminUser,
  fetchAdminDetailByUserId,
  fetchAdminListByTenantId,
  normalizeOwnerShadowRow,
  resolveAdminCreateTenantIds,
  resolveAdminTenantIds,
  resolveListTenantId,
  toggleAdminUserStatus,
  updateAdminUser,
} from "./userListApi.js";

// Components
import UserModal from "./components/UserModal.jsx";
import UserConfirmModal from "./components/UserConfirmModal.jsx";
import { processNotificationAboveAccountZIndex, processNotificationZIndex } from "../../components/ProcessModalPortal.jsx";
import { getUserListText, translateUserListApiMessage } from "../../translateFile/pages/userListTranslate.js";
import { validateEmail } from "../../utils/input/emailValidation.js";
import { getSessionTenantId } from "../../utils/auth/sessionTenant.js";
import { resolveCompanyDisplayCode } from "../../utils/company/sharedCompanyFilter.js";

function tenantIdsFromDetail(detail) {
  const raw = detail?.tenantIds ?? detail?.tenant_ids ?? [];
  return (Array.isArray(raw) ? raw : [])
    .map(Number)
    .filter((id) => Number.isFinite(id) && id > 0);
}

function applyTenantIdsToPickerSelection(detail, {
  useDualTenantUserPicker,
  modalGroupCompanies,
  modalSubsidiaryCompanies,
  modalPickerCompanies,
  groupOnlyUserList,
  selectedGroup,
  scopeCompanyId,
}) {
  const tenantIds = tenantIdsFromDetail(detail);
  if (useDualTenantUserPicker) {
    const groupIdSet = new Set(modalGroupCompanies.map((c) => Number(c.id)));
    const companyIdSet = new Set(modalSubsidiaryCompanies.map((c) => Number(c.id)));
    return {
      groupIds: tenantIds.filter((id) => groupIdSet.has(id)),
      companyIds: tenantIds.filter((id) => companyIdSet.has(id)),
    };
  }

  const allowed = new Set(modalPickerCompanies.map((c) => Number(c.id)));
  const ids = tenantIds.filter((id) => allowed.has(id));
  if (groupOnlyUserList) {
    const defaultPick = modalPickerCompanies.find(
      (c) => String(c.group_id || "").toUpperCase() === String(selectedGroup || "").toUpperCase(),
    );
    const companyIds =
      ids.length > 0
        ? ids
        : defaultPick?.id != null
          ? [Number(defaultPick.id)]
          : modalPickerCompanies[0]
            ? [Number(modalPickerCompanies[0].id)]
            : [];
    return { groupIds: [], companyIds };
  }

  return {
    groupIds: [],
    companyIds: ids.length ? ids : modalPickerCompanies.map((c) => Number(c.id)),
  };
}

function roleBadgeClass(role) {
  return `role-${normRole(role).replace(/\s+/g, "-")}`;
}

function normalizeCompanyRow(row) {
  if (!row || typeof row !== "object") return row;
  const company_id = resolveCompanyDisplayCode(row);
  return {
    ...row,
    group_id: row.group_id ?? row.groupId ?? row.group ?? row.parent_tenant_code ?? null,
    company_id,
    tenant_code: row.tenant_code ?? company_id,
  };
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

/** Group login add/edit user: one row per accessible group (AP, IG). Prefer group-entity id; fallback to any company in group for checkbox id. */
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
    const id = entity?.id != null ? Number(entity.id) : Number.NaN;
    if (!Number.isFinite(id) || id <= 0) continue;
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
  return ids.filter((id) => Number.isFinite(id) && id > 0);
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
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [usersRaw, setUsersRaw] = useState([]);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [sortColumn, setSortColumn] = useState("loginId");
  const [sortDirection, setSortDirection] = useState("asc");
  const [selectedGroup, setSelectedGroup] = useState(null);
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
  const bootFetchedUsersKeyRef = useRef(null);
  const userListCacheRef = useRef(new Map());
  const userListFetchPendingRef = useRef(new Map());
  const userListScopeRef = useRef({
    companyId: null,
    selectedGroup: null,
    groupOnlyUserList: false,
    aggregateUserList: false,
    groupsAllMode: false,
    groupAllMode: false,
  });
  const modalCompaniesCacheRef = useRef([]);
  const modalAccessCacheRef = useRef(new Map());
  const modalAccessPendingRef = useRef(new Map());
  const modalAccessCompanyIdRef = useRef(null);
  const modalLoadSeqRef = useRef(0);
  const editUserDetailCacheRef = useRef(new Map());
  const editUserDetailPendingRef = useRef(new Map());
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
  const [roleSelectDisabled, setRoleSelectDisabled] = useState(false);
  const [loginDisabled, setLoginDisabled] = useState(false);
  const [fieldLocks, setFieldLocks] = useState({ name: false, email: false, role: false, password: false, sidebar: false, company: false });

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
    const f = applyUserFilters(usersRaw, { search, showInactive, showAll, viewerRole: currentUserRole });
    return sortUsers(f, sortColumn, sortDirection);
  }, [usersRaw, search, showInactive, showAll, currentUserRole, sortColumn, sortDirection]);

  const canCreateUser = useMemo(() => getAvailableRolesForCreation(currentUserRole).length > 0, [currentUserRole]);
  const userMutationsBlocked = useMemo(() => isPartnershipAuditReadOnlyLocked(me), [me]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE)), [filteredSorted.length]);

  /** 与顶部 chip 一致：仅「显示停用」或「显示全部」时展示批量删除勾选列（默认活跃分页不展示） */
  const showBulkDeleteColumn = showInactive || showAll;

  const pageRows = useMemo(() => {
    if (showAll) return filteredSorted;
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredSorted.slice(start, start + PAGE_SIZE);
  }, [filteredSorted, currentPage, showAll]);

  const permDisabledMap = useMemo(() => {
    const allowed = new Set(getCurrentUserRolePermissions(currentUserRole));
    const m = {};
    PERMISSION_KEYS.forEach((k) => { m[k] = currentUserRole !== "owner" && !allowed.has(k); });
    return m;
  }, [currentUserRole]);

  const syncUrl = useCallback(() => {
    const url = new URL(window.location.href);
    if (companyId) url.searchParams.set("company_id", String(companyId));
    else url.searchParams.delete("company_id");
    if (search.trim()) url.searchParams.set("search", search.trim()); else url.searchParams.delete("search");
    if (showInactive) url.searchParams.set("showInactive", "1");
    else url.searchParams.delete("showInactive");
    if (showAll) url.searchParams.set("showAll", "1");
    else url.searchParams.delete("showAll");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [companyId, search, showInactive, showAll]);

  useEffect(() => { if (!bootLoading) syncUrl(); }, [bootLoading, syncUrl]);

  useEffect(() => {
    if (!showInactive && !showAll) {
      setSelectedDeleteIds(new Set());
      setSelectAllUsers(false);
    }
  }, [showInactive, showAll]);

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

  useEffect(() => {
    document.body.classList.remove("bg");
    document.body.classList.add("user-page");
    return () => {
      document.body.classList.remove("user-page", "user-page--show-all", "bg");
      document.body.classList.add("dashboard-page");
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
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
          navigate(spaPath("dashboard"), { replace: true });
          return;
        }
        const rows = (await fetchOwnerCompaniesAll()).map(normalizeCompanyRow);
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
            sessionCompanyId: getSessionTenantId(me),
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
              preferredCompanyId: getSessionTenantId(me) ?? effectiveNum,
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
                  preferredCompanyId: getSessionTenantId(me),
                });
                effectiveNum = pick?.id != null ? Number(pick.id) : null;
              }
            }
            if (effectiveNum == null || !Number.isFinite(Number(effectiveNum))) {
              const pick = pickDefaultSubsidiaryForGroup(rows, bootGroup, {
                me,
                preferredCompanyId: getSessionTenantId(me),
              });
              if (pick?.id != null) effectiveNum = Number(pick.id);
              else if (getSessionTenantId(me) != null) effectiveNum = Number(getSessionTenantId(me));
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
                preferredCompanyId: getSessionTenantId(me),
              });
              effectiveNum = pick?.id != null ? Number(pick.id) : null;
            }
          }
          if (effectiveNum == null || !Number.isFinite(Number(effectiveNum))) {
            const pick = pickDefaultSubsidiaryForGroup(rows, bootGroup, {
              me,
              preferredCompanyId: getSessionTenantId(me),
            });
            if (pick?.id != null) effectiveNum = Number(pick.id);
            else if (getSessionTenantId(me) != null) effectiveNum = Number(getSessionTenantId(me));
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

        setCompanyId(groupOnlyBoot ? null : effectiveNum);
        setSelectedGroup(bootGroup);
        setSearch(String(url.searchParams.get("search") || ""));
        setShowInactive(url.searchParams.get("showInactive") === "1");
        setShowAll(url.searchParams.get("showAll") === "1");

        const syncCompanyId =
          effectiveNum != null && Number.isFinite(Number(effectiveNum)) ? Number(effectiveNum) : null;
        if (syncCompanyId != null && syncCompanyId !== getSessionTenantId(me)) {
          void (async () => {
            try {
              const syncJson = await syncCompanySessionApi(syncCompanyId);
              if (syncJson?.success) notifyCompanySessionUpdated(syncJson.data ?? null);
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
      bootInitializedRef.current = false;
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
      preferredCompanyId: getSessionTenantId(me),
      groupEntityOnly: true,
    });
    if (entityPick?.id != null) {
      const eid = Number(entityPick.id);
      if (Number.isFinite(eid) && eid > 0) return eid;
    }
    const fallback = pickDefaultCompanyForGroup(companies, selectedGroup, {
      me,
      preferredCompanyId: getSessionTenantId(me),
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
        preferredCompanyId: getSessionTenantId(me) ?? companyId,
      });
      const pid = pick?.id != null ? Number(pick.id) : Number.NaN;
      if (Number.isFinite(pid) && pid > 0) return pid;
    }
    const sessionId = getSessionTenantId(me) != null ? Number(getSessionTenantId(me)) : Number.NaN;
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

  const loadUsersListFromApi = useCallback(async (activeCompanyId, signal, {
    groupOnly = null,
    selectedGroup: groupOverride = null,
    scopeCompanyId: scopeCompanyIdOverride = null,
    anchorCompanyId: anchorCompanyIdOverride = null,
  } = {}) => {
    const useGroupOnly = groupOnly ?? groupOnlyUserList;
    const tenantId = resolveListTenantId({
      companyId: activeCompanyId,
      groupOnly: useGroupOnly,
      anchorCompanyId: anchorCompanyIdOverride,
      scopeCompanyId: scopeCompanyIdOverride,
    });
    if (tenantId == null) {
      throw new Error("tenantIdRequired");
    }

    let list = await fetchAdminListByTenantId(tenantId, signal);
    return list;
  }, [groupOnlyUserList]);

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

  const fetchUsers = useCallback(async (companyIdOverride = null, { silent = false, groupOnly = null, selectedGroup: groupOverride = null } = {}) => {
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
      scopeCompanyId,
      anchorCompanyId,
    });
    userListFetchPendingRef.current.set(cacheKey, loadPromise);

    try {
      const list = await loadPromise;
      if (ac.signal.aborted || fetchGen !== listFetchGenRef.current) return;
      applyUserListResult(cacheKey, list, { silent });
    } catch (e) {
      if (ac.signal.aborted || fetchGen !== listFetchGenRef.current) return;
      if (!silent) notifyApi(e?.message, "companyScopeRequired", "danger");
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
    scopeCompanyId,
    anchorCompanyId,
    applyUserListResult,
  ]);

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

    const sessionTenantId = getSessionTenantId(me);
    if (sessionTenantId === nextCompanyId) return;

    const previousCompanyId = Number(companyId) === nextCompanyId ? sessionTenantId : companyId;
    const switchGen = ++companySwitchGenRef.current;

    try {
      const json = await syncCompanySessionApi(nextCompanyId, vg);
      if (switchGen !== companySwitchGenRef.current) return;
      if (!json?.success) {
        if (previousCompanyId != null && Number(previousCompanyId) !== nextCompanyId) {
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
      if (previousCompanyId != null && Number(previousCompanyId) !== nextCompanyId) {
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
      preferredCompanyId: getSessionTenantId(me) ?? companyId,
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
          preferredCompanyId: companyId ?? getSessionTenantId(me),
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

  const fetchModalAccountsProcesses = useCallback(async (cid, force = false) => {
    const normalizedGroupId = String(selectedGroup || "").trim().toUpperCase();
    const useGroupScopedAccounts = groupOnlyUserList && normalizedGroupId !== "";
    const cacheKey = useGroupScopedAccounts ? `group:${normalizedGroupId}` : `company:${String(cid || "")}`;
    const cached = modalAccessCacheRef.current.get(cacheKey);
    if (cached && !force) {
      modalAccessCompanyIdRef.current = Number(cid);
      setModalAccounts(cached.accounts);
      setModalProcesses(cached.processes);
      setModalAccessReadyCompanyId(Number(cid));
      return cached;
    }
    const pending = modalAccessPendingRef.current.get(cacheKey);
    if (pending) {
      try {
        const next = await pending;
        modalAccessCompanyIdRef.current = Number(cid);
        setModalAccounts(next.accounts);
        setModalProcesses(next.processes);
        setModalAccessReadyCompanyId(Number(cid));
        return next;
      } catch { setModalAccounts([]); setModalProcesses([]); return { accounts: [], processes: [] }; }
    }
    try {
      const tenantId = useGroupScopedAccounts ? normalizedGroupId : cid;
      const request = Promise.all([
        fetch(buildApiUrl(`api/account/list?tenant_id=${tenantId}`), { method: "POST", credentials: "include" })
          .then(async (r) => { const j = await r.json(); return (j?.data || []).filter((a) => String(a.status || "").toLowerCase() === "active").map((a) => ({ id: a.id, account_id: a.accountId, name: String(a.name || "").trim() })); })
          .catch(() => []),
        fetch(buildApiUrl(`api/processes/processlist_api.php?company_id=${cid}&showAll=1`), { credentials: "include" })
          .then(async (r) => { const j = await r.json(); return (Array.isArray(j?.data) ? j.data : []).filter((p) => String(p.status || "").toLowerCase() === "active").map((p) => ({ id: p.id, process_id: p.process_name || p.process_id || "", description: p.description_name || p.description || "" })); })
          .catch(() => []),
      ]).then(([accs, procs]) => ({ accounts: accs, processes: procs }));
      modalAccessPendingRef.current.set(cacheKey, request);
      const next = await request;
      modalAccessCacheRef.current.set(cacheKey, next);
      modalAccessCompanyIdRef.current = Number(cid);
      setModalAccounts(next.accounts); setModalProcesses(next.processes); setModalAccessReadyCompanyId(Number(cid)); return next;
    } catch {
      const empty = { accounts: [], processes: [] };
      modalAccessCacheRef.current.set(cacheKey, cached || empty);
      modalAccessCompanyIdRef.current = Number(cid);
      setModalAccounts((cached || empty).accounts);
      setModalProcesses((cached || empty).processes);
      setModalAccessReadyCompanyId(Number(cid));
      return cached || empty;
    }
    finally { modalAccessPendingRef.current.delete(cacheKey); }
  }, [groupOnlyUserList, selectedGroup]);

  useEffect(() => {
    modalCompaniesCacheRef.current = modalPickerCompanies;
    setModalCompanies(modalPickerCompanies);
  }, [modalPickerCompanies]);

  const loadCompaniesForModal = async () => {
    try {
      const rows = (await fetchOwnerCompaniesAll()).map(normalizeCompanyRow);
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

  const fetchEditUserDetail = useCallback(async (id, scopeTenantId, force = false) => {
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
      } catch {
        return cached || null;
      }
    }
    const request = fetchAdminDetailByUserId(id, scopeTenantId).then((detail) => {
      if (!detail) throw new Error("Load user failed");
      return detail;
    });
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
  }, [markEditReady]);

  const applyEditDetail = useCallback((row, detail, accList, procList) => {
    let perms = [];
    try {
      if (detail.permissions) {
        perms =
          typeof detail.permissions === "string" ? JSON.parse(detail.permissions) : detail.permissions;
      }
    } catch {
      perms = [];
    }
    if (!Array.isArray(perms)) perms = [];
    setPermSelected(new Set(perms.map((p) => String(p).toLowerCase())));
    const readOnlyVal =
      detail.readOnly != null
        ? !!detail.readOnly
        : detail.read_only !== undefined
          ? parseInt(detail.read_only, 10) === 1
          : true;
    setForm((f) => ({ ...f, read_only: readOnlyVal }));
    let ap = null;
    let pp = null;
    try {
      const apRaw = detail.accountPermissions ?? detail.account_permissions;
      if (apRaw != null) ap = typeof apRaw === "string" ? JSON.parse(apRaw) : apRaw;
    } catch {
      ap = [];
    }
    try {
      const ppRaw = detail.processPermissions ?? detail.process_permissions;
      if (ppRaw != null) pp = typeof ppRaw === "string" ? JSON.parse(ppRaw) : ppRaw;
    } catch {
      pp = [];
    }
    setSelectedAccountIds(
      ap === null
        ? new Set(accList.map((a) => Number(a.id)))
        : new Set((Array.isArray(ap) ? ap : []).map((x) => Number(x.id || x))),
    );
    setSelectedProcessIds(
      pp === null
        ? new Set(procList.map((p) => Number(p.id)))
        : new Set((Array.isArray(pp) ? pp : []).map((x) => Number(x.id || x))),
    );
    if (currentUserRole === "admin" || currentUserRole === "owner") {
      const { groupIds, companyIds } = applyTenantIdsToPickerSelection(detail, {
        useDualTenantUserPicker,
        modalGroupCompanies,
        modalSubsidiaryCompanies,
        modalPickerCompanies,
        groupOnlyUserList,
        selectedGroup,
        scopeCompanyId,
      });
      setSelectedGroupIds(groupIds);
      setSelectedCompanyIds(companyIds);
    } else {
      setSelectedCompanyIds(scopeCompanyId ? [Number(scopeCompanyId)] : []);
      setSelectedGroupIds([]);
    }
    if (rowIsOwnerShadow(row)) {
      setPermSelected(new Set(PERMISSION_KEYS));
      setSelectedAccountIds(new Set(accList.map((a) => Number(a.id))));
      setSelectedProcessIds(new Set(procList.map((p) => Number(p.id))));
      setSelectedCompanyIds([]);
      setSelectedGroupIds([]);
    }
  }, [
    scopeCompanyId,
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
    if (!mutationScopeCompanyId) return;
    const modalCacheKey = resolveModalAccessCacheKey(mutationScopeCompanyId, groupOnlyUserList, selectedGroup);
    if (!modalAccessCacheRef.current.has(modalCacheKey)) {
      await fetchModalAccountsProcesses(mutationScopeCompanyId);
    }
    const avail = getAvailableRolesForCreation(currentUserRole);
    if (avail.length === 0) { notify(t("noPermissionCreateAccounts"), "danger"); return; }
    const loadSeq = ++modalLoadSeqRef.current;
    setIsEditMode(false); setEditingRow(null);
    setForm({ id: "", login_id: "", name: "", email: "", role: "", password: "", secondary_password: "", status: "active", read_only: true });
    setRoleSelectDisabled(false); setLoginDisabled(false);
    setFieldLocks({ name: false, email: false, role: false, password: false, sidebar: false, company: false });
    const allP = new Set(PERMISSION_KEYS.filter((k) => !permDisabledMap[k])); setPermSelected(allP);
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
          preferredCompanyId: getSessionTenantId(me) ?? companyId,
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
    void fetchModalAccountsProcesses(mutationScopeCompanyId, true).then(({ accounts: accList, processes: procList }) => {
      if (loadSeq !== modalLoadSeqRef.current) return;
      setSelectedAccountIds(new Set(accList.map((a) => Number(a.id)))); setSelectedProcessIds(new Set(procList.map((p) => Number(p.id))));
    });
  };

  const applyPermTemplate = (role, force) => {
    if (isEditMode && !force) return;
    const next = new Set();
    getRoleTemplateSidebarList(role).forEach((k) => next.add(k));
    setPermSelected(next);
    if (roleHasReadOnlyToggle(role)) {
      setForm((f) => ({ ...f, read_only: true }));
    }
  };

  const openEdit = async (row) => {
    if (userMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    if (!scopeCompanyId) return;
    if (rowIsOwnerShadow(row) && currentUserRole !== "owner") { notify(t("onlyOwnerCanEditOwner"), "danger"); return; }
    editUserDetailCacheRef.current.delete(String(row.id));
    const loadSeq = ++modalLoadSeqRef.current;
    setIsEditMode(true); setEditingRow(row);
    setForm({ id: String(row.id), login_id: rowLoginId(row), name: row.name || "", email: row.email || "", role: normRole(row.role), password: "", secondary_password: "", status: normRole(row.status) || "active", read_only: true });
    setRoleSelectDisabled(rowIsOwnerShadow(row)); setLoginDisabled(true);
    setFieldLocks(getUserEditFieldLocks(row, currentUserId, currentUserRole));
    void loadCompaniesForModal();
    setModalOpen(true);
    const editScopeTenantId = resolveListTenantId({
      companyId,
      groupOnly: groupOnlyUserList,
      anchorCompanyId,
      scopeCompanyId,
    });
    void Promise.all([
      fetchModalAccountsProcesses(scopeCompanyId, true),
      editScopeTenantId != null ? fetchEditUserDetail(row.id, editScopeTenantId, true) : Promise.resolve(null),
    ]).then(([access, detail]) => {
      if (loadSeq !== modalLoadSeqRef.current || !detail) return;
      applyEditDetail(row, detail, access.accounts, access.processes);
    });
  };

  const closeModal = () => { modalLoadSeqRef.current += 1; setModalOpen(false); setEditingRow(null); };

  const toggleUserStatus = async (row) => {
    if (userMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    const caps = computeRowCapabilities(row, currentUserId, currentUserRole);
    if (!caps.canToggleStatus) return;
    if (rowIsOwnerShadow(row)) {
      notify(t("toggleFailed"), "danger");
      return;
    }

    const scopeTenantId = resolveListTenantId({
      companyId,
      groupOnly: groupOnlyUserList,
      anchorCompanyId,
      scopeCompanyId,
    });
    if (scopeTenantId == null) return;

    try {
      const updated = await toggleAdminUserStatus({ id: row.id, scopeTenantId });
      const newStatus = updated?.status;
      if (!newStatus) {
        notify(t("toggleFailed"), "danger");
        return;
      }

      setUsersRaw((prev) => {
        const next = prev.map((u) =>
          Number(u.id) === Number(row.id) ? { ...u, ...updated, status: newStatus } : u,
        );
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
    } catch (e) {
      notifyApi(e?.message, "toggleFailed", "danger");
    }
  };

  const confirmDelete = async () => {
    if (userMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      setConfirmOpen(false);
      return;
    }
    const ids = pendingDeleteRef.current || []; pendingDeleteRef.current = []; setConfirmOpen(false);
    if (!ids.length) return;

    const scopeTenantId = resolveListTenantId({
      companyId,
      groupOnly: groupOnlyUserList,
      anchorCompanyId,
      scopeCompanyId,
    });
    if (scopeTenantId == null) return;

    const eligibleIds = ids.filter((id) => {
      const row = usersRaw.find((u) => Number(u.id) === Number(id));
      return row && !rowIsOwnerShadow(row);
    });
    if (!eligibleIds.length) {
      notify(t("apiDeleteUserFailed"), "danger");
      return;
    }

    const results = await Promise.all(
      eligibleIds.map((id) =>
        deleteAdminUser({ id, scopeTenantId })
          .then(() => ({ success: true }))
          .catch((e) => ({ success: false, message: e?.message })),
      ),
    );

    const succeededIds = eligibleIds.filter((_, index) => results[index]?.success);
    const failCount = eligibleIds.length - succeededIds.length;

    if (succeededIds.length === eligibleIds.length) {
      notify(t("deletedUsersSuccess", { count: succeededIds.length }), "success");
    } else if (succeededIds.length > 0) {
      notify(t("deletionResult", { ok: succeededIds.length, fail: failCount }), "danger");
    } else {
      notifyApi(results.find((r) => !r?.success)?.message, "apiDeleteUserFailed", "danger");
    }

    if (succeededIds.length > 0) {
      const succeededSet = new Set(succeededIds.map(Number));
      setUsersRaw((prev) => prev.filter((u) => !succeededSet.has(Number(u.id))));
      const s = userListScopeRef.current;
      const cacheKey = resolveUserListCacheKey(
        s.companyId,
        s.groupOnlyUserList,
        s.selectedGroup,
        s.aggregateUserList,
        s.groupsAllMode,
        s.groupAllMode,
      );
      if (cacheKey) {
        const cached = userListCacheRef.current.get(cacheKey);
        if (cached) {
          userListCacheRef.current.set(
            cacheKey,
            cached.filter((u) => !succeededSet.has(Number(u.id))),
          );
        }
      }
    }
    setSelectedDeleteIds(new Set());
    setSelectAllUsers(false);
    if (succeededIds.length > 0) void fetchUsers();
  };

  const saveUser = async (e) => {
    e.preventDefault();
    if (userMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    if (isUserModalPageReadOnlyLock(isEditMode, editingRow, form.role, form.read_only, currentUserId)) return;
    if (!isEditMode && !form.password.trim()) { notify(t("passwordRequired"), "danger"); return; }
    if (
      useDualTenantUserPicker &&
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
      selectedCompanyIds.length === 0
    ) {
      notify(t("groupNoneSelected"), "danger");
      return;
    }
    const emailCheck = validateEmail(form.email);
    if (!emailCheck.ok) { notify(t("invalidEmailFormat"), "danger"); return; }
    const accountPerms = Array.from(selectedAccountIds).map(id => { const a = modalAccounts.find(x => Number(x.id) === Number(id)); return { id: Number(id), account_id: a?.account_id || "" }; });
    const shouldSendProcessPermissions = useDualTenantUserPicker
      ? selectedCompanyIds.length > 0
      : !groupOnlyUserList;
    const processPerms = Array.from(selectedProcessIds).map(id => { const p = modalProcesses.find(x => Number(x.id) === Number(id)); return { id: Number(id), process_id: p?.process_id || "", description: p?.description || "" }; });
    let payload = { action: isEditMode ? "update" : "create", id: form.id || undefined, login_id: form.login_id.trim(), name: form.name.trim(), email: emailCheck.normalized, role: form.role, status: form.status };
    let saveGroupId = null;
    let saveCompanyIds = selectedCompanyIds;
    let saveGroupCodes = [];
    const shouldForceGroupScope = !useDualTenantUserPicker && groupOnlyUserList;
    if (useDualTenantUserPicker) {
      saveGroupCodes = resolveSelectedGroupCodesFromPicker(modalGroupCompanies, selectedGroupIds);
      saveCompanyIds = selectedCompanyIds;
      payload.mixed_tenant_assign = 1;
      payload.group_codes = saveGroupCodes;
      payload.company_ids = saveCompanyIds;
      if (selectedGroup) payload.group_id = String(selectedGroup).trim().toUpperCase();
      if (companyId != null) payload.company_id = Number(companyId);
    } else {
      const inferredGroupIdFromPicker = (() => {
        const selectedId = selectedCompanyIds[0] != null ? Number(selectedCompanyIds[0]) : Number.NaN;
        if (!Number.isFinite(selectedId) || selectedId <= 0) return null;
        const selectedOption = modalPickerCompanies.find((c) => Number(c.id) === selectedId);
        const gid = String(selectedOption?.group_id || "").trim().toUpperCase();
        return gid || null;
      })();
      const forceGroup = shouldForceGroupScope && !!(selectedGroup || inferredGroupIdFromPicker);
      saveGroupCodes = forceGroup
        ? resolveSelectedGroupCodesFromPicker(modalPickerCompanies, selectedCompanyIds)
        : [];
      if (forceGroup) {
        saveGroupId = String(selectedGroup || inferredGroupIdFromPicker || "").trim().toUpperCase();
        payload.group_id = saveGroupId;
        payload.group_only = 1;
        payload.group_codes = saveGroupCodes;
        saveCompanyIds = [];
      } else if (companyId != null) {
        payload.company_id = Number(companyId);
        const entityPick = pickDefaultCompanyForGroup(companies, saveGroupId, {
          me,
          preferredCompanyId: getSessionTenantId(me) ?? companyId,
          groupEntityOnly: true,
        });
        const entityId = entityPick?.id != null ? Number(entityPick.id) : Number.NaN;
        saveCompanyIds = Number.isFinite(entityId) && entityId > 0 ? [entityId] : [];
      }
    }
    if (form.password.trim()) payload.password = form.password;
    const allowSecondaryPassword = isC168Company || rowIsOwnerShadow(editingRow);
    if (allowSecondaryPassword && form.secondary_password.trim()) {
      if (!/^\d{6}$/.test(form.secondary_password.trim())) {
        notify(t("secondaryPasswordMustBe6Digits"), "danger");
        return;
      }
      payload.secondary_password = form.secondary_password.trim();
    }
    const roleForReadOnly = normRole(form.role) || normRole(editingRow?.role);
    if (roleForReadOnly && roleHasReadOnlyToggle(roleForReadOnly) && canInteractWithReadOnlyToggle(currentUserRole, roleForReadOnly)) {
      payload.read_only = form.read_only ? 1 : 0;
    }
    if (rowIsOwnerShadow(editingRow)) {
      payload.role = "owner";
    } else if (!isEditMode) {
      payload.permissions = getFinalPermissionsForCreation(form.role, Array.from(permSelected), currentUserRole);
      payload.account_permissions = accountPerms;
      if (shouldSendProcessPermissions) payload.process_permissions = processPerms;
      if ((currentUserRole === "admin" || currentUserRole === "owner") && !useDualTenantUserPicker) {
        payload.company_ids = saveCompanyIds;
      }
    } else {
      const caps = computeRowCapabilities(editingRow, currentUserId, currentUserRole);
      if (caps.isSelf || caps.isHigherLevel || caps.isSameLevel) {
        payload.account_permissions = accountPerms;
        if (shouldSendProcessPermissions) payload.process_permissions = processPerms;
      } else {
        payload.permissions = Array.from(permSelected);
        payload.account_permissions = accountPerms;
        if (shouldSendProcessPermissions) payload.process_permissions = processPerms;
      }
      if ((currentUserRole === "admin" || currentUserRole === "owner") && !fieldLocks.company && !useDualTenantUserPicker) {
        payload.company_ids = shouldForceGroupScope ? saveCompanyIds : (groupOnlyUserList ? saveCompanyIds : selectedCompanyIds);
        if (shouldForceGroupScope && saveGroupId) {
          payload.group_id = saveGroupId;
          payload.group_only = 1;
          payload.group_codes = saveGroupCodes;
        }
      }
    }
    try {
      if (!isEditMode) {
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
        if (!tenantIds.length) {
          notify(t("companyNoneSelected"), "danger");
          return;
        }
        const readOnlyForCreate =
          roleForReadOnly &&
          roleHasReadOnlyToggle(roleForReadOnly) &&
          canInteractWithReadOnlyToggle(currentUserRole, roleForReadOnly)
            ? form.read_only
            : true;
        const createRequest = buildAdminCreateRequest({
          loginId: payload.login_id,
          name: payload.name,
          email: payload.email,
          password: payload.password,
          secondaryPassword: payload.secondary_password,
          role: payload.role,
          status: payload.status,
          readOnly: readOnlyForCreate,
          permissions: payload.permissions,
          tenantIds,
          accountPermissions: payload.account_permissions,
          processPermissions: shouldSendProcessPermissions ? payload.process_permissions : undefined,
        });
        const created = await createAdminUser(createRequest);
        notifyApi("User created successfully", "saved", "success");
        closeModal();
        if (Array.isArray(saveGroupCodes) && saveGroupCodes.length > 0) {
          for (const code of saveGroupCodes) {
            userListCacheRef.current.delete(
              resolveUserListCacheKey(null, true, code, false, false, false),
            );
          }
        }
        if (!groupOnlyUserList) {
          setUsersRaw((prev) => [...prev, created]);
        }
        void fetchUsers();
        return;
      }

      if (rowIsOwnerShadow(editingRow)) {
        const res = await fetch(buildApiUrl("api/users/userlist_api.php"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!json.success) {
          notifyApi(json.message, "saveFailed", "danger");
          return;
        }
        if (form.id) {
          editUserDetailCacheRef.current.delete(String(form.id));
          setEditReadyIds((prev) => {
            const next = new Set(prev);
            next.delete(Number(form.id));
            return next;
          });
        }
        notifyApi(json.message, "saved", "success");
        closeModal();
        if (Array.isArray(saveGroupCodes) && saveGroupCodes.length > 0) {
          for (const code of saveGroupCodes) {
            userListCacheRef.current.delete(
              resolveUserListCacheKey(null, true, code, false, false, false),
            );
          }
        }
        if (json.data?.will_lose_access) {
          setUsersRaw((prev) => prev.filter((u) => Number(u.id) !== Number(form.id)));
        } else if (json.data && !groupOnlyUserList) {
          setUsersRaw((prev) =>
            prev.map((u) =>
              Number(u.id) === Number(json.data.id)
                ? { ...u, ...json.data, isOwnerShadow: rowIsOwnerShadow(u) }
                : u
            )
          );
        }
        void fetchUsers();
        return;
      }

      const scopeTenantId = resolveListTenantId({
        companyId,
        groupOnly: groupOnlyUserList,
        anchorCompanyId: mutationScopeCompanyId,
        scopeCompanyId: mutationScopeCompanyId,
      });
      if (scopeTenantId == null) {
        notify(t("companyNoneSelected"), "danger");
        return;
      }

      const caps = computeRowCapabilities(editingRow, currentUserId, currentUserRole);
      const permissionsForUpdate =
        caps.isSelf || caps.isHigherLevel || caps.isSameLevel
          ? undefined
          : Array.from(permSelected);

      let tenantIds;
      if (!fieldLocks.company) {
        tenantIds = resolveAdminTenantIds({
          useDualTenantUserPicker,
          selectedGroupIds,
          selectedCompanyIds,
          saveCompanyIds,
          shouldForceGroupScope,
          currentUserRole,
          companyId,
          mutationScopeCompanyId,
        });
        if (!tenantIds.length) {
          notify(t("companyNoneSelected"), "danger");
          return;
        }
      }

      const updateRequest = buildAdminUpdateRequest({
        id: Number(form.id),
        tenantAccessId: editingRow?.tenantAccess?.id ?? null,
        scopeTenantId,
        name: form.name.trim(),
        email: emailCheck.normalized,
        password: form.password.trim() || undefined,
        secondaryPassword: payload.secondary_password,
        role: payload.role,
        status: payload.status,
        readOnly:
          roleForReadOnly &&
          roleHasReadOnlyToggle(roleForReadOnly) &&
          canInteractWithReadOnlyToggle(currentUserRole, roleForReadOnly)
            ? form.read_only
            : undefined,
        permissions: permissionsForUpdate,
        tenantIds: tenantIds?.length ? tenantIds : undefined,
        accountPermissions: accountPerms,
        processPermissions: shouldSendProcessPermissions ? processPerms : undefined,
      });

      const updated = await updateAdminUser(updateRequest);
      if (form.id) {
        editUserDetailCacheRef.current.delete(String(form.id));
        setEditReadyIds((prev) => {
          const next = new Set(prev);
          next.delete(Number(form.id));
          return next;
        });
      }
      notifyApi("User updated successfully", "saved", "success");
      closeModal();
      if (Array.isArray(saveGroupCodes) && saveGroupCodes.length > 0) {
        for (const code of saveGroupCodes) {
          userListCacheRef.current.delete(
            resolveUserListCacheKey(null, true, code, false, false, false),
          );
        }
      }
      const lostAccess = tenantIds?.length && !tenantIds.includes(scopeTenantId);
      if (lostAccess) {
        setUsersRaw((prev) => prev.filter((u) => Number(u.id) !== Number(form.id)));
      } else if (!groupOnlyUserList) {
        setUsersRaw((prev) =>
          prev.map((u) =>
            Number(u.id) === Number(updated.id)
              ? { ...u, ...updated, isOwnerShadow: false }
              : u
          )
        );
      }
      void fetchUsers();
    } catch { notify(t("saveFailed"), "danger"); }
  };

  return (
    <>
      <div className="container">
        <div className="content">
          <div className="action-buttons-container">
            <div className="action-buttons" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                {canCreateUser ? (
                <button
                  type="button"
                  className="btn btn-add"
                  onClick={openAdd}
                  disabled={bootLoading || userMutationsBlocked || !userListHasMutationScope(mutationScopeCompanyId)}
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
                      .map((u) => String(rowLoginId(u) || u.name || u.email || u.id || "").trim())
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
          <div className={`user-table-wrapper user-list-table${showBulkDeleteColumn ? " user-table-wrapper--bulk-delete-col" : ""}`}>
            <div className="user-list-table-inner">
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
              <div className="header-item">
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
            <div className="user-cards">
              {pageRows.map((r, idx) => {
                const caps = computeRowCapabilities(r, currentUserId, currentUserRole);
                const del = getDeleteCheckboxState(r, caps);
                const editReady = caps.canEditDelete;
                return (
                  <div key={`${r.id}-${rowIsOwnerShadow(r) ? "o" : "u"}`} className={`user-card user-list-row show-card ${idx % 2 === 0 ? "row-even" : "row-odd"}`}>
                    <div className="card-item">{showAll ? idx + 1 : (currentPage - 1) * PAGE_SIZE + idx + 1}</div>
                    <div className="card-item">{rowLoginId(r)}</div>
                    <div className="card-item">{r.name}</div>
                    <div className="card-item">{r.email || "-"}</div>
                    <div className="card-item"><span className={`role-badge ${roleBadgeClass(r.role)}`}>{formatRoleLabel(r.role)}</span></div>
                    <div className="card-item"><span className={`role-badge ${normRole(r.status) === "active" ? "status-active" : "status-inactive"} ${caps.canToggleStatus && !userMutationsBlocked ? "status-clickable" : ""}`} onClick={() => !userMutationsBlocked && caps.canToggleStatus && toggleUserStatus(r)}>{String(r.status || "").toUpperCase()}</span></div>
                    <div className="card-item">{formatLastLogin(rowLastLogin(r))}</div>
                    <div className="card-item">{String(rowCreatedBy(r) || "-").toUpperCase()}</div>
                    <div className="card-item card-item--action">
                      <button className="btn btn-edit" onClick={() => openEdit(r)} disabled={!editReady || userMutationsBlocked} style={{ opacity: editReady && !userMutationsBlocked ? 1 : 0.3 }}><img src={assetUrl("images/edit.svg")} alt="Edit" /></button>
                    </div>
                    {showBulkDeleteColumn && (
                      <div className="card-item card-item--select">
                        {del.show ? (
                          <input
                            type="checkbox"
                            aria-label={t("rowDeleteCheckboxAria")}
                            disabled={del.disabled || userMutationsBlocked}
                            checked={selectedDeleteIds.has(Number(r.id))}
                            onChange={(e) =>
                              setSelectedDeleteIds((prev) => {
                                const n = new Set(prev);
                                if (e.target.checked) n.add(Number(r.id));
                                else n.delete(Number(r.id));
                                return n;
                              })}
                          />
                        ) : (
                          <span className="user-row-select-placeholder" aria-hidden="true" />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </div>
          </div>
          {!showAll && (
            <div className="pagination-container">
              <button className="pagination-btn" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>◀</button>
            <span className="pagination-info">{t("paginationOf", { page: currentPage, total: totalPages })}</span>
              <button className="pagination-btn" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>▶</button>
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
      <UserModal open={modalOpen} onClose={closeModal} isEditMode={isEditMode} editingRow={editingRow} form={form} setForm={setForm} isC168Company={isC168Company} currentUserRole={currentUserRole} currentUserId={currentUserId} roleSelectDisabled={roleSelectDisabled} loginDisabled={loginDisabled} fieldLocks={fieldLocks} permDisabledMap={permDisabledMap} permSelected={permSelected} setPermSelected={setPermSelected} modalCompanies={modalCompanies} selectedCompanyIds={selectedCompanyIds} setSelectedCompanyIds={setSelectedCompanyIds} groupPickerMode={!useDualTenantUserPicker && groupOnlyUserList} dualTenantPicker={useDualTenantUserPicker} modalGroupCompanies={modalGroupCompanies} modalSubsidiaryCompanies={modalSubsidiaryCompanies} selectedGroupIds={selectedGroupIds} setSelectedGroupIds={setSelectedGroupIds} modalAccounts={modalAccounts} selectedAccountIds={selectedAccountIds} setSelectedAccountIds={setSelectedAccountIds} modalProcesses={modalProcesses} selectedProcessIds={selectedProcessIds} setSelectedProcessIds={setSelectedProcessIds} applyPermTemplate={applyPermTemplate} onSave={saveUser} sessionMutationsBlocked={userMutationsBlocked} t={t} />
      <UserConfirmModal open={confirmOpen} message={confirmMessage} onConfirm={confirmDelete} onClose={() => setConfirmOpen(false)} confirmDisabled={userMutationsBlocked} t={t} />
    </>
  );
}
