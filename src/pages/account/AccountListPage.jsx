import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../../utils/company/companySessionEvents.js";
import { syncCompanySessionApi } from "../../utils/company/companySessionSync.js";
import { pathnameIs, spaPath } from "../../utils/routing/pageRoutes.js";
import { replaceBrowserPathOnly } from "../../utils/routing/privateBrowserUrl.js";
import {
  applyTenantLedgerToParams,
  resolveModalLedgerScope,
  resolvePageLedgerScope,
} from "../../utils/company/tenantLedgerParams.js";
import {
  clearDashboardGroupFilterKeepCompany,
  companiesInGroupList,
  dashboardFilterEventMatchesPersisted,
  isDashboardGroupOnlyMode,
  DASHBOARD_GROUP_FILTER_OPT_OUT_KEY,
  DASHBOARD_GROUP_FILTER_EVENT,
  notifyDashboardGroupFilterChanged,
  persistDashboardFilterState,
  readPersistedDashboardGcFilter,
  applyLoginScopeToSessionStorageIfNeeded,
  persistDashboardGroupFilter,
  persistDashboardGroupOnlyMode,
  persistDashboardSelectedCompany,
  pickDefaultCompanyForGroup,
  pickDefaultSubsidiaryForGroup,
  resolveCompanyWhenClosingGroup,
  resolveCompanyPickWhenSwitchingGroup,
  readDashboardSelectedCompanyId,
  resolveBootCompanyId,
  resolveInitialSelectedGroupFromSession,
  stripCompanyIdFromUrl,
  fetchOwnerCompaniesAll,
  getCachedOwnerCompanies,
  sortedUniqueGroupIds,
} from "../../utils/company/sharedCompanyFilter.js";
import {
  consumeAccountListRouteCache,
  resolveAccountListRouteCache,
  warmAccountListRouteCache,
} from "./accountRoutePrefetch.js";
import {
  canClearCompanySelection,
  canUseGroupOnlyMode,
  getLoginIdentifier,
  isCompanyLogin,
  isGroupLedgerMode,
  isGroupLogin,
  normalizeCompanyCode,
} from "../../utils/company/loginScope.js";
import {
  groupIdsForGroupsAllAggregate,
  useGcFilterWithAllModes,
} from "../../utils/company/useGcFilterWithAllModes.js";
import GcInlineFilterPanel from "../../components/GcInlineFilterPanel.jsx";
import { assetUrl, buildApiUrl } from "../../utils/core/apiUrl.js";
import "../../../public/css/account-list.css";
import "../../../public/css/accountCSS.css";
import "../../../public/css/userlist.css";
import "../../../public/css/list-badge-scale.css";

// Logic & Constants..
import {
  toUpper,
  normalizeAlertAmount,
  roleSortOrder,
  DEFAULT_FORM,
  getAccountModalOrderedRoles,
  getOrderedRoles,
  normalizeCompanyRow,
  isVirtualGroupLinkCompanyRow,
  buildAccountsFetchKey,
  buildAccountsUrl,
  buildGroupAccountsUrl,
  fetchMergedAccounts,
  accountListHasMutationScope,
  isCompanyInAccountListPicker,
  pickDefaultAddCurrencyIds,
  readAccountListGroupFilterOptOut,
  resolveAccountListGroupOnlyFetch,
  resolveAccountListInlinePickerCompanies,
  shouldLoadAccountListData,
  formatAccountLastLoginDate,
  formatAccountLastLoginTimeTitle,
} from "./accountLogic.js";

// Components
import AccountModal from "../../components/AccountModal.jsx";
import { processNotificationAboveAccountZIndex, processNotificationZIndex } from "../../components/ProcessModalPortal.jsx";
import {
  AccountConfirmModal,
  CurrencySettingModal,
  LinkAccountModal,
} from "./components/accountModals.jsx";
import {
  formatAccountAlertDisplay,
  formatAccountRoleDisplay,
  formatAccountStatusDisplay,
  formatCurrencyUsageDetail,
  getAccountText,
  isHistoricalOnlyCurrencyDeleteBlock,
  parseAccountsFromCurrencyDeleteMessage,
  translateAccountApiMessage,
} from "../../translateFile/pages/accountTranslate.js";
import { usePartnershipAuditReadOnlyLocked } from "../../utils/audit/partnershipAuditReadOnly.js";
import { useAuthSession } from "../../context/AuthSessionContext.jsx";
import { useAutoListPageSize } from "../../hooks/useAutoListPageSize.js";
import { PAGE_SIZE_MAX, PAGE_SIZE_MIN } from "../../constants/listPageSize.js";

function resolveAccountListCacheKey(scopeKey, searchTerm, showInactive, showAll) {
  return `${scopeKey}|${String(searchTerm || "").trim()}|${showInactive ? "1" : "0"}|${showAll ? "1" : "0"}`;
}

function accountRowVisibleAfterStatusChange(newStatus, { showInactive, showAll }) {
  const status = String(newStatus || "").toLowerCase();
  if (showAll && showInactive) return status === "inactive";
  if (showAll) return status === "active";
  if (showInactive) return status === "inactive";
  return status === "active";
}

function resolveAccountScopeKey({ companyId: cid, selectedGroup: sg, groupOnly = false }) {
  const g = String(sg || "").trim().toUpperCase();
  if (cid != null && Number(cid) > 0) {
    return g ? `company:${Number(cid)}:g:${g}` : `company:${Number(cid)}`;
  }
  if (groupOnly && g) return `group:${g}`;
  if (g) return `group:${g}`;
  return "none";
}

/** Active list scope key — must stay in sync with accountsListFetchScopeKey useMemo. */
function resolveAccountsListFetchScopeKey({
  companyId: cid,
  selectedGroup: sg,
  groupsAllMode: gAll = false,
  groupAllMode: cAll = false,
  isListScopeReady: ready = true,
  groupOnlyMode = false,
} = {}) {
  if (!ready) return "";
  if (gAll) return cAll ? "groups-all:companies-all" : "groups-all";
  if (cAll) return `group-all:${sg || ""}`;
  if (cid != null) {
    const g = sg ? String(sg).trim().toUpperCase() : "";
    return g ? `company:${cid}:g:${g}` : `company:${cid}`;
  }
  if (sg && groupOnlyMode) return `group:${sg}`;
  return "";
}

function accountRowsFingerprint(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "0";
  return rows.map((a) => Number(a.id)).join(",");
}

function readUrlCompanyId() {
  if (typeof window === "undefined") return null;
  const raw = new URL(window.location.href).searchParams.get("company_id");
  const n = raw != null && raw !== "" ? Number(raw) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function readAccountListBootGc() {
  if (typeof sessionStorage === "undefined") {
    return { selectedGroup: null, companyId: readUrlCompanyId() };
  }
  const optOut = sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1";
  const { selectedGroup, companyId, groupOnly } = readPersistedDashboardGcFilter();
  if (groupOnly || isDashboardGroupOnlyMode()) {
    return { selectedGroup: optOut ? null : selectedGroup, companyId: null };
  }
  const urlCompanyId = readUrlCompanyId();
  if (urlCompanyId != null) {
    return { selectedGroup: optOut ? null : selectedGroup, companyId: urlCompanyId };
  }
  const saved = readDashboardSelectedCompanyId();
  return {
    selectedGroup: optOut ? null : selectedGroup,
    companyId: saved ?? companyId,
  };
}

function readInitialCachedCompanies() {
  const cached = getCachedOwnerCompanies();
  if (!cached?.length) return [];
  return cached.map(normalizeCompanyRow);
}

export default function AccountListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { me: sessionMe, sessionReady } = useAuthSession();
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const langRef = useRef(lang);
  langRef.current = lang;
  const t = useCallback((key, params) => getAccountText(lang, key, params), [lang]);

  // -- Status --
  const initialCachedCompanies = useMemo(() => readInitialCachedCompanies(), []);
  const initialBootGc = useMemo(() => readAccountListBootGc(), []);
  // Always gate list fetch until boot finishes (incl. session sync). Cached companies alone are not enough.
  const [bootLoading, setBootLoading] = useState(true);

  // -- Data --
  const [accounts, setAccounts] = useState([]);
  const [companies, setCompanies] = useState(() => initialCachedCompanies);
  const [roles, setRoles] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [companyId, setCompanyId] = useState(() => initialBootGc.companyId);

  // -- Filters --
  const [searchTerm, setSearchTerm] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [sortColumn, setSortColumn] = useState("account");
  const [sortDirection, setSortDirection] = useState("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const listRegionRef = useRef(null);
  const [selectedGroup, setSelectedGroup] = useState(() => initialBootGc.selectedGroup);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState(new Set());

  // -- Modals & Forms --
  const [toast, setToast] = useState(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [forceCurrencyDeletePrompt, setForceCurrencyDeletePrompt] = useState(null);
  const [currencySettingOpen, setCurrencySettingOpen] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [isEditMode, setIsEditMode] = useState(false);
  const [initialEditCurrencyIds, setInitialEditCurrencyIds] = useState([]);
  const [linkingAccountId, setLinkingAccountId] = useState(null);
  const [linkAccountsPool, setLinkAccountsPool] = useState([]);
  const [selectedLinkedIds, setSelectedLinkedIds] = useState(new Set());
  const [linkType, setLinkType] = useState("bidirectional");
  const [linkTypeMap, setLinkTypeMap] = useState({});
  const [linkSearchTerm, setLinkSearchTerm] = useState("");

  // -- Child states --
  const [selectedCurrencyIds, setSelectedCurrencyIds] = useState([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);
  const [currencyInput, setCurrencyInput] = useState("");
  /** Add/Edit 弹窗内点 × 隐藏的货币 id（本会话），避免仅取消勾选时界面无变化 */
  const [hiddenCurrencyIds, setHiddenCurrencyIds] = useState([]);
  /** Edit 时账户真实账本 scope（group ledger vs 子公司），与顶部筛选解耦 */
  const [modalLedgerScope, setModalLedgerScope] = useState(null);
  const modalLedgerScopeRef = useRef(null);
  const syncModalLedgerScope = useCallback((scope) => {
    modalLedgerScopeRef.current = scope;
    setModalLedgerScope(scope);
  }, []);
  const [settingCurrencyId, setSettingCurrencyId] = useState(null);
  const [settingLinked, setSettingLinked] = useState(new Set());
  const [settingInitial, setSettingInitial] = useState(new Set());
  const [settingSearch, setSettingSearch] = useState("");
  const [settingRole, setSettingRole] = useState("");

  const toastTimerRef = useRef(null);
  const bootFetchedAccountsKeyRef = useRef(null);
  const postBootEmptyRetryRef = useRef(false);
  const accountListCacheRef = useRef(new Map());
  const listFetchAbortRef = useRef(null);
  const listFetchGenRef = useRef(0);
  const companySwitchGenRef = useRef(0);
  const skipCompanyFetchEffectRef = useRef(false);
  const suppressGcSyncRef = useRef(false);
  const gcFilterSwitchGenRef = useRef(0);
  const syncGcFilterInFlightRef = useRef(false);
  const syncGcFilterFromSessionRef = useRef(() => {});
  const lastAccountsFetchKeyRef = useRef("");
  const skipInitialGcSyncRef = useRef(false);
  const bootInitializedRef = useRef(false);
  const bootForUserRef = useRef(null);
  const onSwitchCompanyRef = useRef(null);
  const gcScopeRef = useRef({});
  const listFiltersRef = useRef({ showInactive: false, showAll: false, searchTerm: "" });
  const listPaginationScopeRef = useRef("");
  const accountsLenRef = useRef(0);
  listFiltersRef.current = { showInactive, showAll, searchTerm };
  accountsLenRef.current = accounts.length;

  const accountModalCurrencies = useMemo(() => {
    const hidden = new Set(hiddenCurrencyIds.map(Number));
    return currencies.filter((c) => !hidden.has(Number(c.id)));
  }, [currencies, hiddenCurrencyIds]);

  const notify = useCallback((message, type = "success") => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    const durationMs = type === "danger" ? 4000 : 1800;
    toastTimerRef.current = setTimeout(() => setToast(null), durationMs);
  }, []);

  const notifyApi = useCallback(
    (apiMessage, fallbackKey, type = "success", params = {}, apiData = null) => {
      notify(translateAccountApiMessage(lang, apiMessage, fallbackKey, params, apiData), type);
    },
    [lang, notify],
  );

  // -- CSS Loading (FOUC Fix) —
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
    document.body.classList.add("account-page");

    return () => {
      document.body.classList.remove("account-page", "account-page--show-all", "bg");
      document.body.classList.add("dashboard-page");
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (showAll) document.body.classList.add("account-page--show-all");
    else document.body.classList.remove("account-page--show-all");
    return () => document.body.classList.remove("account-page--show-all");
  }, [showAll]);

  const syncUrl = useCallback(() => {
    replaceBrowserPathOnly();
  }, []);

  const resolveGroupOnlyFetch = useCallback((gcScope) => {
    const { companyId: cid, selectedGroup: sg, groupsAllMode: gAll, groupAllMode: cAll } =
      gcScope || {};
    return resolveAccountListGroupOnlyFetch(sg, cid, gAll, cAll);
  }, []);

  const bumpGcFilterSwitchGen = useCallback(() => {
    gcFilterSwitchGenRef.current += 1;
  }, []);

  const markAccountsFetchKeyApplied = useCallback(
    (gcScope) => {
      const {
        companyId: cid,
        selectedGroup: sg,
        groupsAllMode: gAll,
        groupAllMode: cAll,
        isListScopeReady: ready,
      } = gcScope || {};
      const useGroupOnly = resolveGroupOnlyFetch(gcScope);
      const scopeKey = resolveAccountsListFetchScopeKey({
        companyId: cid,
        selectedGroup: sg,
        groupsAllMode: gAll,
        groupAllMode: cAll,
        isListScopeReady: ready,
        groupOnlyMode: useGroupOnly,
      });
      lastAccountsFetchKeyRef.current = buildAccountsFetchKey(scopeKey, searchTerm, showInactive, showAll);
    },
    [searchTerm, showInactive, showAll, resolveGroupOnlyFetch],
  );

  const resolveListPaginationScopeKey = useCallback(
    (gcScope) => {
      if (!gcScope) return "";
      return resolveAccountsListFetchScopeKey({
        companyId: gcScope.companyId,
        selectedGroup: gcScope.selectedGroup,
        groupsAllMode: gcScope.groupsAllMode,
        groupAllMode: gcScope.groupAllMode,
        isListScopeReady: gcScope.isListScopeReady ?? true,
        groupOnlyMode: resolveGroupOnlyFetch(gcScope),
      });
    },
    [resolveGroupOnlyFetch],
  );

  const resetAccountListPagination = useCallback(() => {
    setCurrentPage(1);
    setSelectedDeleteIds(new Set());
  }, []);

  const resetPaginationForGcScope = useCallback(
    (gcScope, { force = false } = {}) => {
      const scopeKey = resolveListPaginationScopeKey(gcScope);
      if (!scopeKey) return false;
      if (!force && scopeKey === listPaginationScopeRef.current) return false;
      listPaginationScopeRef.current = scopeKey;
      resetAccountListPagination();
      return true;
    },
    [resolveListPaginationScopeKey, resetAccountListPagination],
  );

  const applyAccountListResult = useCallback(
    (cacheKey, nextAccounts, { silent = false, gcScope = null } = {}) => {
      accountListCacheRef.current.set(cacheKey, nextAccounts);
      setAccounts((prev) => {
        if (silent && accountRowsFingerprint(prev) === accountRowsFingerprint(nextAccounts)) {
          return prev;
        }
        return nextAccounts;
      });
      if (!silent) {
        if (gcScope) {
          listPaginationScopeRef.current = resolveListPaginationScopeKey(gcScope);
        }
        resetAccountListPagination();
      } else if (gcScope) {
        resetPaginationForGcScope(gcScope);
      }
      if (gcScope) markAccountsFetchKeyApplied(gcScope);
    },
    [markAccountsFetchKeyApplied, resetAccountListPagination, resetPaginationForGcScope, resolveListPaginationScopeKey],
  );

  const matchesLiveListFilters = useCallback((requested) => {
    const live = listFiltersRef.current;
    return (
      live.showInactive === requested.showInactive &&
      live.showAll === requested.showAll &&
      String(live.searchTerm || "").trim() === String(requested.searchTerm || "").trim()
    );
  }, []);

  const fetchAccounts = useCallback(
    async (gcScope, { silent = false, groupOnly = null, trustRequestScope = false } = {}) => {
      const scope = gcScope || {};
      const {
        companyId: cid,
        selectedGroup: sg,
        groupsAllMode: gAll,
        groupAllMode: cAll,
        mergeCompanyIds: mergeIds = [],
        groupIds: gids = [],
        isListScopeReady: ready,
      } = scope;
      if (!ready) return;

      const requestedFilters = { showInactive, showAll, searchTerm };
      const useGroupOnly = groupOnly ?? resolveGroupOnlyFetch(scope);
      const scopeKey = resolveAccountScopeKey({
        companyId: cid,
        selectedGroup: sg,
        groupOnly: useGroupOnly,
      });
      const cacheKey = resolveAccountListCacheKey(scopeKey, searchTerm, showInactive, showAll);

      listFetchAbortRef.current?.abort();
      const ac = new AbortController();
      listFetchAbortRef.current = ac;
      const fetchGen = ++listFetchGenRef.current;

      const isStaleResponse = () =>
        ac.signal.aborted || fetchGen !== listFetchGenRef.current;

      const matchesLiveListScope = () => {
        const live = gcScopeRef.current || {};
        const liveGroupOnly = resolveGroupOnlyFetch(live);
        const liveGroup = String(live.selectedGroup || "").trim().toUpperCase();
        const reqGroup = String(sg || "").trim().toUpperCase();
        if (cid != null && Number(cid) > 0) {
          return (
            Number(live.companyId) === Number(cid) &&
            !liveGroupOnly &&
            liveGroup === reqGroup
          );
        }
        if (useGroupOnly && reqGroup) {
          return liveGroupOnly && liveGroup === reqGroup;
        }
        if (cAll) return Boolean(live.groupAllMode) && !live.companyId;
        if (gAll) return Boolean(live.groupsAllMode);
        return false;
      };

      const loadPromise = (async () => {
        let nextAccounts = [];
        if (cid) {
          const listUrl = buildAccountsUrl(cid, searchTerm, showInactive, showAll, {
            groupId: sg || null,
          });
          const res = await fetch(listUrl.toString(), {
            credentials: "include",
            signal: ac.signal,
          });
          const json = await res.json();
          if (!json.success) {
            throw new Error(json.message || "failedToLoadAccounts");
          }
          nextAccounts = Array.isArray(json?.data?.accounts) ? json.data.accounts : [];
        } else if (cAll) {
          const merged = await fetchMergedAccounts({
            companyIds: mergeIds,
            searchTerm,
            showInactive,
            showAll,
            signal: ac.signal,
          });
          if (!merged.success) {
            throw new Error(merged.message || "failedToLoadAccounts");
          }
          nextAccounts = merged.accounts;
        } else if (gAll) {
          const merged = await fetchMergedAccounts({
            groupIds: groupIdsForGroupsAllAggregate(companies, gids),
            searchTerm,
            showInactive,
            showAll,
            signal: ac.signal,
          });
          if (!merged.success) {
            throw new Error(merged.message || "failedToLoadAccounts");
          }
          nextAccounts = merged.accounts;
        } else if (useGroupOnly && sg) {
          const res = await fetch(
            buildGroupAccountsUrl(sg, searchTerm, showInactive, showAll, { groupOnly: true }).toString(),
            { credentials: "include", signal: ac.signal },
          );
          const json = await res.json();
          if (!json.success) {
            throw new Error(json.message || "failedToLoadAccounts");
          }
          nextAccounts = Array.isArray(json?.data?.accounts) ? json.data.accounts : [];
        } else {
          return null;
        }
        return nextAccounts;
      })();

      try {
        const nextAccounts = await loadPromise;
        if (isStaleResponse()) return;
        if (nextAccounts == null) return;
        if (!matchesLiveListFilters(requestedFilters)) return;
        if (!trustRequestScope && !matchesLiveListScope()) return;
        applyAccountListResult(cacheKey, nextAccounts, { silent, gcScope: scope });
      } catch (e) {
        if (isStaleResponse() || e?.name === "AbortError") return;
        if (!silent) notifyApi(e?.message, "failedToLoadAccounts", "danger");
      }
    },
    [companies, searchTerm, showInactive, showAll, applyAccountListResult, notifyApi, resolveGroupOnlyFetch, matchesLiveListFilters],
  );

  const applyAccountListCache = useCallback(
    (gcScope, { groupOnly = null } = {}) => {
      const {
        companyId: cid,
        selectedGroup: sg,
        groupsAllMode: gAll,
        groupAllMode: cAll,
      } = gcScope || {};
      const useGroupOnly = groupOnly ?? resolveGroupOnlyFetch(gcScope);
      const scopeKey = resolveAccountScopeKey({
        companyId: cid,
        selectedGroup: sg,
        groupOnly: useGroupOnly,
      });
      const cacheKey = resolveAccountListCacheKey(scopeKey, searchTerm, showInactive, showAll);
      const cached = accountListCacheRef.current.get(cacheKey);
      if (!cached) return false;
      setAccounts((prev) =>
        accountRowsFingerprint(prev) === accountRowsFingerprint(cached) ? prev : cached,
      );
      return true;
    },
    [searchTerm, showInactive, showAll, resolveGroupOnlyFetch],
  );

  const applyCacheOrClearAccounts = useCallback(
    (gcScope, options = {}) => {
      const hit = applyAccountListCache(gcScope, options);
      if (!hit && options.clearOnMiss) {
        setAccounts([]);
      }
      return hit;
    },
    [applyAccountListCache],
  );

  const applySwitchListPreview = useCallback(
    (gcScope, { groupOnly = null } = {}) => {
      resetPaginationForGcScope(gcScope, { force: true });
      const { companyId: cid, selectedGroup: sg } = gcScope || {};
      const useGroupOnly = groupOnly ?? resolveGroupOnlyFetch(gcScope);
      const scopeKey = resolveAccountScopeKey({
        companyId: cid,
        selectedGroup: sg,
        groupOnly: useGroupOnly,
      });
      const listCacheKey = resolveAccountListCacheKey(scopeKey, searchTerm, showInactive, showAll);
      const routeWarm = consumeAccountListRouteCache({
        companyId: cid,
        groupId: sg,
        search: searchTerm,
        showInactive,
        showAll,
      });
      if (Array.isArray(routeWarm) && routeWarm.length > 0) {
        accountListCacheRef.current.set(listCacheKey, routeWarm);
        setAccounts((prev) =>
          accountRowsFingerprint(prev) === accountRowsFingerprint(routeWarm) ? prev : routeWarm,
        );
        return true;
      }
      return applyAccountListCache(gcScope, { groupOnly: useGroupOnly });
    },
    [applyAccountListCache, resolveGroupOnlyFetch, resetPaginationForGcScope, searchTerm, showInactive, showAll],
  );

  const invalidateAccountListCacheForScope = useCallback(
    (gcScope, { groupOnly = null } = {}) => {
      const { companyId: cid, selectedGroup: sg, groupsAllMode: gAll, groupAllMode: cAll } = gcScope || {};
      const useGroupOnly = groupOnly ?? resolveGroupOnlyFetch(gcScope);
      const scopeKey = resolveAccountScopeKey({
        companyId: cid,
        selectedGroup: sg,
        groupOnly: useGroupOnly,
      });
      const cacheKey = resolveAccountListCacheKey(scopeKey, searchTerm, showInactive, showAll);
      accountListCacheRef.current.delete(cacheKey);
    },
    [searchTerm, showInactive, showAll, resolveGroupOnlyFetch],
  );

  const loadRoles = useCallback(async ({ companyId: cid = null, groupId = null } = {}) => {
    try {
      const url = new URL(buildApiUrl("api/editdata/editdata_api.php"));
      const gid = (groupId ?? selectedGroup)
        ? String(groupId ?? selectedGroup).trim().toUpperCase()
        : null;
      const numericCid =
        cid != null ? Number(cid) : companyId != null ? Number(companyId) : null;
      const groupOnlyFetch = Boolean(
        gid && (!Number.isFinite(numericCid) || numericCid <= 0),
      );
      if (gid) url.searchParams.set("group_id", gid);
      if (groupOnlyFetch) {
        url.searchParams.set("group_only", "1");
      } else if (Number.isFinite(numericCid) && numericCid > 0) {
        url.searchParams.set("company_id", String(numericCid));
      }
      const res = await fetch(url.toString(), { credentials: "include" });
      const json = await res.json();
      if (json?.success && Array.isArray(json?.data?.roles)) {
        setRoles(json.data.roles);
      }
    } catch {
      /* roles are optional for list; modal refetch on open */
    }
  }, [companyId, selectedGroup, sessionMe]);

  const fetchAccountsRef = useRef(fetchAccounts);
  fetchAccountsRef.current = fetchAccounts;
  const loadRolesRef = useRef(loadRoles);
  loadRolesRef.current = loadRoles;

  /** Refetch list after add/edit/delete — must pass gc scope (bare fetchAccounts() is a no-op). */
  const refreshAccountList = useCallback(
    (options = {}) => {
      const scope = gcScopeRef.current;
      if (!scope?.isListScopeReady) return;
      const groupOnly = options.groupOnly ?? resolveGroupOnlyFetch(scope);
      invalidateAccountListCacheForScope(scope, { groupOnly });
      void fetchAccounts(scope, { groupOnly, silent: options.silent ?? false });
    },
    [fetchAccounts, invalidateAccountListCacheForScope, resolveGroupOnlyFetch],
  );

  const sessionUserId = sessionMe?.user_id ?? sessionMe?.id ?? null;

  // -- Boot: show Group/Company filters as soon as companies resolve; list loads in background --
  useEffect(() => {
    if (!sessionReady || !sessionMe) return;
    const uid = sessionUserId;
    if (bootInitializedRef.current && bootForUserRef.current === uid) return;
    bootForUserRef.current = uid;
    bootInitializedRef.current = true;
    let cancelled = false;
    setBootLoading(true);

    (async () => {
      try {
        const rows = (await fetchOwnerCompaniesAll({ me: sessionMe })).map(normalizeCompanyRow);
        if (cancelled) return;

        setCompanies((prev) => {
          if (
            prev.length === rows.length &&
            prev.every((c, i) => Number(c.id) === Number(rows[i]?.id))
          ) {
            return prev;
          }
          return rows;
        });
        const urlCompanySnapshot = readUrlCompanyId();
        applyLoginScopeToSessionStorageIfNeeded(sessionMe, rows);
        if (urlCompanySnapshot != null) {
          replaceBrowserPathOnly();
        }

        const url = new URL(window.location.href);
        const urlCompanyId = url.searchParams.get("company_id");
        const urlCompanyNum =
          urlCompanyId != null && urlCompanyId !== "" ? Number(urlCompanyId) : Number.NaN;
        const hasExplicitUrlCompany = Number.isFinite(urlCompanyNum) && urlCompanyNum > 0;
        const persistedGc = readPersistedDashboardGcFilter();
        const savedCompanyId = readDashboardSelectedCompanyId();
        let initialCompanyId = persistedGc.groupOnly ? null : (persistedGc.companyId ?? savedCompanyId);
        if (persistedGc.groupOnly || isDashboardGroupOnlyMode()) {
          initialCompanyId = null;
          stripCompanyIdFromUrl();
        } else if (hasExplicitUrlCompany) {
          initialCompanyId = urlCompanyNum;
          persistDashboardGroupOnlyMode(false);
          persistDashboardSelectedCompany(urlCompanyNum);
        } else if (
          savedCompanyId != null &&
          !persistedGc.groupOnly &&
          !(canUseGroupOnlyMode(sessionMe) && isDashboardGroupOnlyMode())
        ) {
          persistDashboardGroupOnlyMode(false);
        } else if (initialCompanyId == null && !isGroupLogin(sessionMe)) {
          initialCompanyId = resolveBootCompanyId({
            urlCompanyId,
            sessionCompanyId: sessionMe.company_id,
            defaultRowId: rows[0]?.id,
          });
        }
        if (
          initialCompanyId == null &&
          (isGroupLogin(sessionMe) ||
            (canUseGroupOnlyMode(sessionMe) && (persistedGc.groupOnly || isDashboardGroupOnlyMode())))
        ) {
          persistDashboardGroupOnlyMode(true);
        }

        const initialSearchTerm = toUpper(url.searchParams.get("search") || "");
        const initialShowInactive = url.searchParams.get("showInactive") === "1";
        const initialShowAll = url.searchParams.get("showAll") === "1";

        const groupFilterOptOut =
          typeof sessionStorage !== "undefined" &&
          sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1";

        let row =
          initialCompanyId != null
            ? rows.find((c) => Number(c.id) === Number(initialCompanyId)) || null
            : null;
        let bootGroup = groupFilterOptOut
          ? null
          : persistedGc.selectedGroup ||
            (isGroupLogin(sessionMe) ? getLoginIdentifier(sessionMe) : null) ||
            resolveInitialSelectedGroupFromSession(rows, row, sessionMe);

        if (hasExplicitUrlCompany && row?.group_id && !groupFilterOptOut) {
          bootGroup = String(row.group_id).trim().toUpperCase() || bootGroup;
        }

        if (bootGroup && initialCompanyId != null && !hasExplicitUrlCompany) {
          const inGroup = companiesInGroupList(rows, bootGroup).some(
            (c) => Number(c.id) === Number(initialCompanyId),
          );
          if (!inGroup) {
            initialCompanyId = savedCompanyId != null ? savedCompanyId : null;
            row =
              initialCompanyId != null
                ? rows.find((c) => Number(c.id) === Number(initialCompanyId)) || null
                : null;
            if (initialCompanyId == null) stripCompanyIdFromUrl();
          }
        }

        if (groupFilterOptOut) {
          bootGroup = null;
        }

        const groupOnlyBoot =
          initialCompanyId == null &&
          Boolean(bootGroup) &&
          (persistedGc.groupOnly ||
            isDashboardGroupOnlyMode() ||
            canUseGroupOnlyMode(sessionMe, bootGroup));
        let resolvedCompanyId = groupOnlyBoot ? null : initialCompanyId;

        const bootGroupIds = sortedUniqueGroupIds(rows);
        if (
          !groupOnlyBoot &&
          resolvedCompanyId != null &&
          !isCompanyInAccountListPicker(
            {
              companies: rows,
              groupIds: bootGroupIds,
              selectedGroup: bootGroup,
              preferredCompanyId: resolvedCompanyId,
              groupFilterOptOut,
            },
            resolvedCompanyId,
          )
        ) {
          resolvedCompanyId = null;
          stripCompanyIdFromUrl();
          persistDashboardSelectedCompany(null);
        }

        if (groupFilterOptOut && resolvedCompanyId == null && !groupOnlyBoot) {
          const pick = resolveCompanyWhenClosingGroup(rows, null, bootGroupIds);
          if (pick?.id != null) resolvedCompanyId = Number(pick.id);
        }

        const shouldLoadList = shouldLoadAccountListData({
          companyId: resolvedCompanyId,
          selectedGroup: bootGroup,
          groupOnlyMode: groupOnlyBoot,
        });

        if (bootGroup) {
          persistDashboardGroupFilter(bootGroup);
          if (groupOnlyBoot) {
            persistDashboardGroupOnlyMode(true);
          }
        }
        if (!groupOnlyBoot && resolvedCompanyId != null) {
          persistDashboardFilterState(bootGroup, resolvedCompanyId, { allowGroupOnly: false });
        }

        setCompanyId(resolvedCompanyId);
        setSelectedGroup(bootGroup);
        setSearchTerm(initialSearchTerm);
        setShowInactive(initialShowInactive);
        setShowAll(initialShowAll);
        skipInitialGcSyncRef.current = true;
        void loadRolesRef.current({ companyId: resolvedCompanyId, groupId: bootGroup });

        const syncCompanyId =
          resolvedCompanyId != null && Number.isFinite(Number(resolvedCompanyId))
            ? Number(resolvedCompanyId)
            : null;
        const sessionViewGroup = groupFilterOptOut ? null : bootGroup;
        if (syncCompanyId != null) {
          const sessionCompanyId =
            sessionMe?.company_id != null ? Number(sessionMe.company_id) : null;
          const needsPhpSync =
            !Number.isFinite(sessionCompanyId) || sessionCompanyId !== syncCompanyId;
          if (needsPhpSync) {
            try {
              const syncJson = await syncCompanySessionApi(syncCompanyId, sessionViewGroup, {
                force: true,
              });
              if (!cancelled && syncJson?.success) {
                notifyCompanySessionUpdated(syncJson.data ?? null);
              }
            } catch {
              /* boot session sync is best-effort */
            }
          }
        }

        if (cancelled) return;

        const scopeKey = shouldLoadList
          ? resolvedCompanyId
            ? bootGroup
              ? `company:${Number(resolvedCompanyId)}:g:${String(bootGroup).trim().toUpperCase()}`
              : `company:${Number(resolvedCompanyId)}`
            : groupOnlyBoot && bootGroup
              ? `group:${bootGroup}`
              : null
          : null;
        const listCacheKey = scopeKey
          ? resolveAccountListCacheKey(scopeKey, initialSearchTerm, initialShowInactive, initialShowAll)
          : null;
        const fetchKey = scopeKey
          ? buildAccountsFetchKey(scopeKey, initialSearchTerm, initialShowInactive, initialShowAll)
          : null;

        const warmed = scopeKey
          ? await resolveAccountListRouteCache({
              companyId: groupOnlyBoot ? null : resolvedCompanyId,
              groupId: groupOnlyBoot ? bootGroup : null,
              search: initialSearchTerm,
              showInactive: initialShowInactive,
              showAll: initialShowAll,
            })
          : null;

        if (cancelled) return;

        const bootScopeBase = {
          companyId: resolvedCompanyId,
          selectedGroup: bootGroup,
          groupsAllMode: false,
          groupAllMode: false,
          mergeCompanyIds: [],
          groupIds: [],
          isListScopeReady: true,
        };
        gcScopeRef.current = {
          ...bootScopeBase,
          mergeCompanyIds: gcScopeRef.current?.mergeCompanyIds ?? [],
          groupIds: gcScopeRef.current?.groupIds ?? [],
        };

        if (Array.isArray(warmed) && warmed.length > 0 && listCacheKey && fetchKey) {
          accountListCacheRef.current.set(listCacheKey, warmed);
          setAccounts(warmed);
          bootFetchedAccountsKeyRef.current = fetchKey;
        } else if (scopeKey && fetchKey) {
          bootFetchedAccountsKeyRef.current = fetchKey;
          await fetchAccountsRef.current(bootScopeBase, {
            silent: true,
            groupOnly: groupOnlyBoot,
            trustRequestScope: true,
          });
        } else {
          setAccounts([]);
        }

        if (cancelled) return;
        if (resolvedCompanyId != null && shouldLoadList) {
          replaceBrowserPathOnly();
        }
      } catch {
        if (!cancelled) navigate(spaPath("login"));
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionReady, sessionUserId, navigate]);

  useEffect(() => () => listFetchAbortRef.current?.abort(), []);

  const allCompanyButtons = useMemo(
    () => companies.filter(c => c.company_id && String(c.company_id).trim() !== "" && !isVirtualGroupLinkCompanyRow(c)),
    [companies]
  );

  const handleClearCompany = useCallback(() => {
    setCompanyId(null);
  }, []);

  const {
    groupIds,
    companiesForPicker,
    groupsAllMode,
    groupAllMode,
    handlePickAllGroups,
    handlePickAllInGroup,
    isListScopeReady,
    mergeCompanyIds,
    setGroupsAllMode,
    setGroupAllMode,
  } = useGcFilterWithAllModes({
    companies,
    companyId,
    selectedGroup,
    setSelectedGroup,
    onSelectCompany: (c) =>
      onSwitchCompanyRef.current?.(c, {
        viewGroup: gcScopeRef.current?.selectedGroup ?? selectedGroup,
      }),
    onPrepareCompanySelect: (pick) => {
      const id = Number(pick?.id);
      if (!Number.isFinite(id) || id <= 0) return;
      const scope = gcScopeRef.current;
      skipCompanyFetchEffectRef.current = true;
      flushSync(() => {
        setCompanyId(id);
        resetPaginationForGcScope({
          companyId: id,
          selectedGroup: scope?.selectedGroup ?? selectedGroup,
          groupsAllMode: false,
          groupAllMode: false,
          mergeCompanyIds: scope?.mergeCompanyIds ?? [],
          groupIds: scope?.groupIds ?? [],
          isListScopeReady: true,
        }, { force: true });
        applyCacheOrClearAccounts({
          companyId: id,
          selectedGroup: scope?.selectedGroup ?? selectedGroup,
          groupsAllMode: false,
          groupAllMode: false,
          mergeCompanyIds: scope?.mergeCompanyIds ?? [],
          groupIds: scope?.groupIds ?? [],
          isListScopeReady: true,
        });
      });
    },
    onDeselectGroup: (cid) => {
      const scope = gcScopeRef.current;
      skipCompanyFetchEffectRef.current = true;
      flushSync(() => {
        applyCacheOrClearAccounts(
          {
            companyId: cid,
            selectedGroup: null,
            groupsAllMode: false,
            groupAllMode: false,
            mergeCompanyIds: scope?.mergeCompanyIds ?? [],
            groupIds: scope?.groupIds ?? [],
            isListScopeReady: true,
          },
          { groupOnly: false },
        );
      });
    },
    onClearCompany: handleClearCompany,
    switchingCompany: false,
    preferredCompanyId: companyId,
    me: sessionMe,
    autoPickCompanyWhenEmpty: false,
    forceAllowGroupOnly: canUseGroupOnlyMode(sessionMe),
    broadcastFilterToLayout: false,
  });

  const onSwitchCompany = useCallback(
    async (c, { viewGroup = null, fetchList = true } = {}) => {
      const nextCompanyId = Number(c?.id);
      if (!nextCompanyId) return;

      const vg =
        viewGroup != null && String(viewGroup).trim() !== ""
          ? String(viewGroup).trim().toUpperCase()
          : String(gcScopeRef.current?.selectedGroup ?? selectedGroup ?? "").trim() || null;

      const scopeKey = resolveAccountScopeKey({
        companyId: nextCompanyId,
        selectedGroup: vg,
        groupOnly: false,
      });
      const fetchKey = buildAccountsFetchKey(scopeKey, searchTerm, showInactive, showAll);
      bootFetchedAccountsKeyRef.current = fetchKey;

      const fetchScope = {
        companyId: nextCompanyId,
        selectedGroup: vg,
        groupsAllMode: false,
        groupAllMode: false,
        mergeCompanyIds: gcScopeRef.current?.mergeCompanyIds ?? [],
        groupIds: gcScopeRef.current?.groupIds ?? [],
        isListScopeReady: true,
      };

      if (fetchList) {
        void fetchAccounts(fetchScope, { silent: true, trustRequestScope: true });
      }

      const sessionCompanyId =
        sessionMe?.company_id != null ? Number(sessionMe.company_id) : null;
      if (sessionCompanyId === nextCompanyId) return;

      const switchGen = ++companySwitchGenRef.current;
      try {
        const json = await syncCompanySessionApi(nextCompanyId, vg);
        if (switchGen !== companySwitchGenRef.current) return;
        if (!json?.success) {
          notifyApi(json.message, "failedToSwitchCompany", "danger");
          return;
        }
        notifyCompanySessionUpdated(json.data ?? null);
      } catch {
        if (switchGen !== companySwitchGenRef.current) return;
        notify(t("failedToSwitchCompany"), "danger");
      }
    },
    [
      fetchAccounts,
      notify,
      notifyApi,
      searchTerm,
      showInactive,
      showAll,
      selectedGroup,
      sessionMe,
      t,
    ],
  );

  onSwitchCompanyRef.current = onSwitchCompany;

  gcScopeRef.current = {
    companyId,
    selectedGroup,
    groupsAllMode,
    groupAllMode,
    mergeCompanyIds,
    groupIds,
    isListScopeReady,
  };

  /** Group-only: still show Company pills so user can narrow scope (same as User List). */
  const inlineCompaniesForPicker = useMemo(
    () =>
      resolveAccountListInlinePickerCompanies({
        companies,
        groupIds,
        selectedGroup,
        preferredCompanyId: companyId,
        companiesForPickerFromHook: companiesForPicker,
        groupFilterOptOut: readAccountListGroupFilterOptOut(),
      }),
    [companiesForPicker, selectedGroup, companyId, companies, groupIds],
  );

  const applyGroupOnlyAccountScope = useCallback(
    (gid, { persist = true } = {}) => {
      const g = String(gid || selectedGroup || "")
        .trim()
        .toUpperCase();
      if (!g) return;

      bumpGcFilterSwitchGen();
      ++companySwitchGenRef.current;
      listFetchAbortRef.current?.abort();

      const gcScope = {
        companyId: null,
        selectedGroup: g,
        groupsAllMode: false,
        groupAllMode: false,
        mergeCompanyIds,
        groupIds,
        isListScopeReady: true,
      };

      invalidateAccountListCacheForScope(gcScope, { groupOnly: true });

      if (persist) {
        sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY);
        persistDashboardGroupFilter(g);
        persistDashboardGroupOnlyMode(true);
        persistDashboardFilterState(g, null, { allowGroupOnly: true });
        persistDashboardSelectedCompany(null);
        stripCompanyIdFromUrl();
        notifyDashboardGroupFilterChanged(g, null);
      }

      skipCompanyFetchEffectRef.current = true;
      flushSync(() => {
        setGroupsAllMode(false);
        setGroupAllMode(false);
        setSelectedGroup(g);
        setCompanyId(null);
        resetPaginationForGcScope(gcScope, { force: true });
        applySwitchListPreview(gcScope, { groupOnly: true });
      });

      lastAccountsFetchKeyRef.current = "";
      void fetchAccounts(gcScope, { silent: true, groupOnly: true });
    },
    [
      applySwitchListPreview,
      bumpGcFilterSwitchGen,
      fetchAccounts,
      groupIds,
      invalidateAccountListCacheForScope,
      mergeCompanyIds,
      resetPaginationForGcScope,
      selectedGroup,
      setGroupAllMode,
      setGroupsAllMode,
    ],
  );

  const clearCompanyPillSelection = useCallback(
    (c) => {
      const gid = c?.group_id ? String(c.group_id).toUpperCase().trim() : null;
      const sel = String(selectedGroup || "").trim().toUpperCase();
      const g = sel || gid;
      if (!g) return;
      if (!canUseGroupOnlyMode(sessionMe, g)) return;

      suppressGcSyncRef.current = true;
      applyGroupOnlyAccountScope(g, { persist: true });
      suppressGcSyncRef.current = false;
    },
    [applyGroupOnlyAccountScope, selectedGroup, sessionMe],
  );

  /** Company login without group assignment: auto-pick subsidiary when group pill has no company. */
  useLayoutEffect(() => {
    if (bootLoading || !sessionMe) return;
    if (isGroupLedgerMode(sessionMe, { companyId, selectedGroup })) return;
    if (canUseGroupOnlyMode(sessionMe, selectedGroup) && isDashboardGroupOnlyMode()) return;
    if (
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1"
    ) {
      return;
    }
    if (!isCompanyLogin(sessionMe)) return;
    if (!selectedGroup || companyId != null) return;

    const pick = pickDefaultSubsidiaryForGroup(companies, selectedGroup, {
      me: sessionMe,
      preferredCompanyId: sessionMe?.company_id ?? companyId,
    });
    if (!pick?.id) return;

    const nextId = Number(pick.id);
    const scope = gcScopeRef.current;
    skipCompanyFetchEffectRef.current = true;
    flushSync(() => {
      setCompanyId(nextId);
      applyCacheOrClearAccounts({
        companyId: nextId,
        selectedGroup,
        groupsAllMode: false,
        groupAllMode: false,
        mergeCompanyIds: scope?.mergeCompanyIds ?? [],
        groupIds: scope?.groupIds ?? [],
        isListScopeReady: true,
      });
    });
    persistDashboardGroupOnlyMode(false);
    persistDashboardFilterState(selectedGroup, nextId, { allowGroupOnly: false });
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
    sessionMe,
    selectedGroup,
    companyId,
    companies,
    applyCacheOrClearAccounts,
  ]);

  /** Company / owner login: toggle off active group pill (auto-pick independent company). */
  const deselectGroupKeepCompany = useCallback(() => {
    bumpGcFilterSwitchGen();
    skipCompanyFetchEffectRef.current = true;
    suppressGcSyncRef.current = true;
    persistDashboardGroupOnlyMode(false);

    const pickIndependent = resolveCompanyWhenClosingGroup(companies, companyId, groupIds);
    const nextCompanyId = pickIndependent?.id != null ? Number(pickIndependent.id) : null;
    const independentScope = {
      companyId: nextCompanyId,
      selectedGroup: null,
      groupsAllMode: false,
      groupAllMode: false,
      mergeCompanyIds,
      groupIds,
      isListScopeReady: true,
    };

    if (nextCompanyId != null && Number.isFinite(nextCompanyId) && nextCompanyId > 0) {
      invalidateAccountListCacheForScope(independentScope, { groupOnly: false });
    }

    flushSync(() => {
      setGroupsAllMode(false);
      setGroupAllMode(false);
      setSelectedGroup(null);
      setCompanyId(nextCompanyId);
      if (nextCompanyId != null) {
        applySwitchListPreview(independentScope, { groupOnly: false });
      } else {
        setAccounts([]);
      }
    });

    if (nextCompanyId != null && Number.isFinite(nextCompanyId) && nextCompanyId > 0) {
      clearDashboardGroupFilterKeepCompany(nextCompanyId);
      lastAccountsFetchKeyRef.current = "";
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
  }, [
    applySwitchListPreview,
    bumpGcFilterSwitchGen,
    companies,
    companyId,
    groupIds,
    invalidateAccountListCacheForScope,
    mergeCompanyIds,
    setCompanyId,
    setGroupAllMode,
    setGroupsAllMode,
  ]);

  const onPickGroupPill = useCallback(
    (gid) => {
      const g = String(gid || "").trim().toUpperCase();
      const current = String(selectedGroup || "").trim().toUpperCase();
      const allowGroupOnly = isGroupLogin(sessionMe) || canUseGroupOnlyMode(sessionMe, g);

      if (!g) return;

      if (g === current) {
        deselectGroupKeepCompany();
        return;
      }

      bumpGcFilterSwitchGen();

      if (allowGroupOnly) {
        suppressGcSyncRef.current = true;
        applyGroupOnlyAccountScope(g, { persist: true });
        suppressGcSyncRef.current = false;
        return;
      }

      const pick =
        resolveCompanyPickWhenSwitchingGroup(companies, g, companyId) ??
        pickDefaultSubsidiaryForGroup(companies, g, {
          me: sessionMe,
          preferredCompanyId: null,
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
        resetPaginationForGcScope(
          {
            companyId: nextCompanyId,
            selectedGroup: g,
            groupsAllMode: false,
            groupAllMode: false,
            mergeCompanyIds,
            groupIds,
            isListScopeReady: true,
          },
          { force: true },
        );
        applyCacheOrClearAccounts({
          companyId: nextCompanyId,
          selectedGroup: g,
          groupsAllMode: false,
          groupAllMode: false,
          mergeCompanyIds,
          groupIds,
          isListScopeReady: true,
        });
      });
      persistDashboardGroupFilter(g);
      persistDashboardGroupOnlyMode(false);
      persistDashboardFilterState(g, nextCompanyId, { allowGroupOnly: false });
      replaceBrowserPathOnly();
      void (async () => {
        try {
          await onSwitchCompanyRef.current?.(pick, { viewGroup: g });
        } finally {
          suppressGcSyncRef.current = false;
        }
      })();
    },
    [
      applyCacheOrClearAccounts,
      applyGroupOnlyAccountScope,
      bumpGcFilterSwitchGen,
      companies,
      companyId,
      deselectGroupKeepCompany,
      groupIds,
      mergeCompanyIds,
      resetPaginationForGcScope,
      sessionMe,
      selectedGroup,
      setGroupAllMode,
      setGroupsAllMode,
    ],
  );

  const warmCompanyListPrefetch = useCallback(
    (c) => {
      const cid = Number(c?.id);
      if (!Number.isFinite(cid) || cid <= 0) return;
      const gid =
        String(selectedGroup || c?.group_id || "")
          .trim()
          .toUpperCase() || null;
      warmAccountListRouteCache({
        companyId: cid,
        groupId: gid,
        search: searchTerm,
        showInactive,
        showAll,
      });
    },
    [searchTerm, showInactive, showAll, selectedGroup],
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

      bumpGcFilterSwitchGen();
      const nextGroup = gid || null;
      const effectiveGroup = nextGroup || sel || null;
      const fetchScope = {
        companyId: nextCompanyId,
        selectedGroup: effectiveGroup,
        groupsAllMode: false,
        groupAllMode: false,
        mergeCompanyIds,
        groupIds,
        isListScopeReady: true,
      };

      skipCompanyFetchEffectRef.current = true;
      suppressGcSyncRef.current = true;
      persistDashboardGroupOnlyMode(false);
      flushSync(() => {
        setGroupsAllMode(false);
        setGroupAllMode(false);
        if (nextGroup) setSelectedGroup(nextGroup);
        setCompanyId(nextCompanyId);
        gcScopeRef.current = fetchScope;
        resetPaginationForGcScope(fetchScope, { force: true });
        bootFetchedAccountsKeyRef.current = null;
        if (!applySwitchListPreview(fetchScope)) {
          setAccounts([]);
        }
      });

      replaceBrowserPathOnly();

      if (nextGroup) persistDashboardGroupFilter(nextGroup);
      else if (effectiveGroup) persistDashboardGroupFilter(effectiveGroup);
      persistDashboardFilterState(effectiveGroup, nextCompanyId, { allowGroupOnly: false });
      notifyDashboardGroupFilterChanged(effectiveGroup, nextCompanyId);

      void (async () => {
        try {
          await onSwitchCompanyRef.current?.(c, { viewGroup: effectiveGroup });
        } finally {
          suppressGcSyncRef.current = false;
        }
      })();
    },
    [
      applySwitchListPreview,
      bumpGcFilterSwitchGen,
      clearCompanyPillSelection,
      companyId,
      groupIds,
      mergeCompanyIds,
      resetPaginationForGcScope,
      selectedGroup,
      setGroupAllMode,
      setGroupsAllMode,
    ],
  );

  const syncGcFilterFromSession = useCallback(() => {
    if (bootLoading || !companies.length) return;
    if (suppressGcSyncRef.current) return;
    if (syncGcFilterInFlightRef.current) return;
    if (readUrlCompanyId() != null) return;

    const switchGenAtStart = gcFilterSwitchGenRef.current;
    syncGcFilterInFlightRef.current = true;
    try {
    const { selectedGroup: nextGroup, companyId: nextCompanyId } = readPersistedDashboardGcFilter();
    const optOut =
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1";

    if (!nextGroup && optOut) {
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
      if (switchGenAtStart !== gcFilterSwitchGenRef.current) return;

      skipCompanyFetchEffectRef.current = true;
      flushSync(() => {
        setGroupsAllMode(false);
        setGroupAllMode(false);
        setSelectedGroup(null);
        if (targetCompanyId != null) {
          setCompanyId(targetCompanyId);
          applyCacheOrClearAccounts({
            companyId: targetCompanyId,
            selectedGroup: null,
            isListScopeReady: true,
          });
        }
      });
      if (targetCompanyId != null) {
        lastAccountsFetchKeyRef.current = "";
        invalidateAccountListCacheForScope(
          {
            companyId: targetCompanyId,
            selectedGroup: null,
            groupsAllMode: false,
            groupAllMode: false,
            isListScopeReady: true,
          },
          { groupOnly: false },
        );
        void fetchAccounts(
          {
            companyId: targetCompanyId,
            selectedGroup: null,
            groupsAllMode: false,
            groupAllMode: false,
            mergeCompanyIds,
            groupIds,
            isListScopeReady: true,
          },
          { silent: true },
        );
      }
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
    if (switchGenAtStart !== gcFilterSwitchGenRef.current) return;

    if (nextCompanyId == null && targetGroup) {
      suppressGcSyncRef.current = true;
      applyGroupOnlyAccountScope(targetGroup, { persist: false });
      suppressGcSyncRef.current = false;
      return;
    }

    skipCompanyFetchEffectRef.current = true;
    flushSync(() => {
      setGroupsAllMode(false);
      setGroupAllMode(false);
      setSelectedGroup(targetGroup);
      setCompanyId(nextCompanyId);
      if (nextCompanyId != null) {
        applyCacheOrClearAccounts({
          companyId: nextCompanyId,
          selectedGroup: targetGroup,
          isListScopeReady: true,
        });
      }
    });

    if (nextCompanyId != null) {
      persistDashboardGroupOnlyMode(false);
      const pick = companies.find((c) => Number(c.id) === Number(nextCompanyId));
      if (pick) {
        skipCompanyFetchEffectRef.current = true;
        suppressGcSyncRef.current = true;
        void (async () => {
          try {
            await onSwitchCompanyRef.current?.(pick, { viewGroup: targetGroup });
          } finally {
            suppressGcSyncRef.current = false;
          }
        })();
      } else {
        skipCompanyFetchEffectRef.current = true;
        void fetchAccounts(
          { companyId: nextCompanyId, selectedGroup: targetGroup, isListScopeReady: true },
          { silent: true },
        );
      }
    }
    } finally {
      syncGcFilterInFlightRef.current = false;
    }
  }, [
    applyCacheOrClearAccounts,
    applyGroupOnlyAccountScope,
    bootLoading,
    companies,
    companyId,
    fetchAccounts,
    groupIds,
    invalidateAccountListCacheForScope,
    mergeCompanyIds,
    selectedGroup,
    setGroupAllMode,
    setGroupsAllMode,
  ]);

  syncGcFilterFromSessionRef.current = syncGcFilterFromSession;

  useEffect(() => {
    if (bootLoading) return;
    const onFilterChanged = (e) => {
      if (e?.detail && !dashboardFilterEventMatchesPersisted(e.detail)) return;
      syncGcFilterFromSessionRef.current();
    };
    window.addEventListener(DASHBOARD_GROUP_FILTER_EVENT, onFilterChanged);
    return () => window.removeEventListener(DASHBOARD_GROUP_FILTER_EVENT, onFilterChanged);
  }, [bootLoading]);

  useEffect(() => {
    if (bootLoading) return;
    if (!pathnameIs("account-list", location.pathname) && !pathnameIs("add-account", location.pathname)) return;
    if (skipInitialGcSyncRef.current) {
      skipInitialGcSyncRef.current = false;
      return;
    }
    syncGcFilterFromSessionRef.current();
  }, [bootLoading, location.pathname]);

  useEffect(() => {
    if (bootLoading || !selectedGroup) return;
    setGroupsAllMode(false);
    setGroupAllMode(false);
  }, [bootLoading, selectedGroup, setGroupsAllMode, setGroupAllMode]);

  const accountsListFetchScopeKey = useMemo(
    () =>
      bootLoading
        ? ""
        : resolveAccountsListFetchScopeKey({
            companyId,
            selectedGroup,
            groupsAllMode,
            groupAllMode,
            isListScopeReady,
            groupOnlyMode: isDashboardGroupOnlyMode(),
          }),
    [bootLoading, isListScopeReady, groupsAllMode, groupAllMode, companyId, selectedGroup],
  );

  useLayoutEffect(() => {
    if (bootLoading) return;
    const filterKey = `${String(searchTerm || "").trim()}|${showInactive ? "1" : "0"}|${showAll ? "1" : "0"}`;
    const combined = `${accountsListFetchScopeKey}|${filterKey}`;
    if (!accountsListFetchScopeKey) return;
    if (combined === listPaginationScopeRef.current) return;
    listPaginationScopeRef.current = combined;
    resetAccountListPagination();
  }, [
    bootLoading,
    accountsListFetchScopeKey,
    searchTerm,
    showInactive,
    showAll,
    resetAccountListPagination,
  ]);

  useEffect(() => {
    if (bootLoading || groupsAllMode || groupAllMode) return;
    if (companyId == null) return;
    if (isDashboardGroupOnlyMode()) return;
    if (
      isCompanyInAccountListPicker(
        {
          companies,
          groupIds,
          selectedGroup,
          preferredCompanyId: companyId,
          companiesForPickerFromHook: companiesForPicker,
          groupFilterOptOut: readAccountListGroupFilterOptOut(),
        },
        companyId,
      )
    ) {
      return;
    }
    bumpGcFilterSwitchGen();
    skipCompanyFetchEffectRef.current = true;
    listFetchAbortRef.current?.abort();
    flushSync(() => {
      setCompanyId(null);
      setAccounts([]);
    });
    stripCompanyIdFromUrl();
    persistDashboardSelectedCompany(null);
    persistDashboardFilterState(selectedGroup, null, { allowGroupOnly: false });
  }, [
    bootLoading,
    bumpGcFilterSwitchGen,
    companyId,
    companies,
    companiesForPicker,
    groupIds,
    groupsAllMode,
    groupAllMode,
    selectedGroup,
  ]);

  useEffect(() => {
    if (bootLoading) return;
    if (accountsListFetchScopeKey) return;
    if (!isListScopeReady) return;
    listFetchAbortRef.current?.abort();
    setAccounts([]);
    lastAccountsFetchKeyRef.current = "";
  }, [bootLoading, accountsListFetchScopeKey, isListScopeReady]);

  useEffect(() => {
    if (bootLoading) return;
    syncUrl();
  }, [bootLoading, syncUrl]);

  useEffect(() => {
    bootFetchedAccountsKeyRef.current = null;
  }, [showInactive, showAll, searchTerm]);

  useEffect(() => {
    if (!accountsListFetchScopeKey) return;
    const fetchKey = buildAccountsFetchKey(
      accountsListFetchScopeKey,
      searchTerm,
      showInactive,
      showAll,
    );
    if (skipCompanyFetchEffectRef.current) {
      skipCompanyFetchEffectRef.current = false;
      return;
    }
    if (bootFetchedAccountsKeyRef.current === fetchKey) {
      bootFetchedAccountsKeyRef.current = null;
      lastAccountsFetchKeyRef.current = fetchKey;
      const bootCacheHit = applyAccountListCache(gcScopeRef.current);
      if (!bootCacheHit) {
        void fetchAccounts(gcScopeRef.current, { silent: true, trustRequestScope: true });
      }
      return;
    }
    postBootEmptyRetryRef.current = false;
    const scope = gcScopeRef.current;
    const cacheHit = applyAccountListCache(scope);
    if (!cacheHit) {
      setAccounts([]);
    }
    void fetchAccounts(scope, { silent: true });
    const settleRetryTimer = window.setTimeout(() => {
      if (!matchesLiveListFilters({ showInactive, showAll, searchTerm })) return;
      if (accountsLenRef.current > 0) return;
      void fetchAccounts(gcScopeRef.current, { silent: true, trustRequestScope: true });
    }, 320);
    return () => window.clearTimeout(settleRetryTimer);
  }, [
    accountsListFetchScopeKey,
    searchTerm,
    showInactive,
    showAll,
    fetchAccounts,
    applyAccountListCache,
    matchesLiveListFilters,
  ]);

  useEffect(() => {
    if (bootLoading) {
      postBootEmptyRetryRef.current = false;
      return;
    }
    if (postBootEmptyRetryRef.current || !companyId || accounts.length > 0) return;
    const scope = gcScopeRef.current;
    if (!scope?.isListScopeReady || Number(scope.companyId) !== Number(companyId)) return;
    postBootEmptyRetryRef.current = true;
    lastAccountsFetchKeyRef.current = "";
    void fetchAccounts(scope, { silent: true, trustRequestScope: true });
  }, [bootLoading, companyId, accounts.length, fetchAccounts]);

  // -- Computed --
  const sortedAccounts = useMemo(() => {
    const arr = [...accounts];
    arr.sort((a, b) => {
      let base = 0;
      if (sortColumn === "role") {
        const ao = roleSortOrder(a.role, roles);
        const bo = roleSortOrder(b.role, roles);
        base = ao - bo;
      } else if (sortColumn === "alert") {
        base = Number(a.payment_alert || 0) - Number(b.payment_alert || 0);
      } else {
        const getValue = (account) => {
          if (sortColumn === "name") return account.name;
          if (sortColumn === "status") return account.status;
          if (sortColumn === "lastLogin") return account.last_login;
          if (sortColumn === "remark") return account.remark;
          return account.account_id;
        };
        base = String(getValue(a) || "").localeCompare(String(getValue(b) || ""), undefined, { numeric: true, sensitivity: "base" });
      }

      if (base === 0 && sortColumn !== "account") {
        base = String(a.account_id || "").localeCompare(String(b.account_id || ""), undefined, { numeric: true, sensitivity: "base" });
      }
      return sortDirection === "asc" ? base : -base;
    });
    return arr;
  }, [accounts, sortColumn, sortDirection, roles]);

  const orderedRoles = useMemo(() => {
    const merged = [...(roles || [])];
    if (form.role && String(form.role).trim()) {
      merged.push(String(form.role).trim());
    }
    return getAccountModalOrderedRoles(merged);
  }, [roles, form.role]);

  const filteredForMode = useMemo(() => {
    return sortedAccounts;
  }, [sortedAccounts]);

  const accountMutationsBlocked = usePartnershipAuditReadOnlyLocked(sessionMe);

  const pageSize = useAutoListPageSize({
    listRegionRef,
    enabled: !showAll,
    rowSelector: ".account-list-row",
    headerSelector: ".account-list-table-header",
    paginationSelector: ".account-pagination-container",
    minRows: PAGE_SIZE_MIN,
    maxRows: PAGE_SIZE_MAX,
    stableRowHeight: true,
    remeasureDeps: [
      filteredForMode.length,
      showAll,
      showInactive,
      searchTerm,
      lang,
      currentPage,
      bootLoading,
      companyId,
      selectedGroup,
      groupAllMode,
      groupsAllMode,
    ],
  });

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredForMode.length / pageSize)),
    [filteredForMode.length, pageSize],
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
    if (showAll) return filteredForMode;
    return filteredForMode.slice((effectivePage - 1) * pageSize, effectivePage * pageSize);
  }, [filteredForMode, showAll, effectivePage, pageSize]);
  const usePagedFill = !showAll && pageRows.length > 0 && pageRows.length >= pageSize;

  /** React scope (instant on pill click) — do not wait for sessionStorage group-only flag. */
  const isGroupOnlyScope = useMemo(
    () => Boolean(selectedGroup && !companyId && !groupAllMode && !groupsAllMode),
    [selectedGroup, companyId, groupAllMode, groupsAllMode],
  );
  /** No subsidiary company pill selected → group ledger APIs only (never legacy group-entity company row). */
  const groupOnlyAccountMode = isGroupOnlyScope;
  const groupPickerCompanies = useMemo(() => {
    if (!groupOnlyAccountMode) return [];
    return groupIds
      .map((gid) => {
        const groupCode = String(gid || "").trim().toUpperCase();
        if (!groupCode) return null;
        // Group picker options are group identities, not company rows.
        return { id: groupCode, company_id: groupCode, group_id: groupCode };
      })
      .filter(Boolean);
  }, [groupOnlyAccountMode, groupIds]);
  const modalPickerCompanies = useMemo(
    () => (groupOnlyAccountMode ? groupPickerCompanies : allCompanyButtons),
    [groupOnlyAccountMode, groupPickerCompanies, allCompanyButtons]
  );
  const scopeCompanyId = useMemo(() => {
    if (companyId) return Number(companyId);
    if (!groupOnlyAccountMode || !selectedGroup) return null;
    const groupCode = String(selectedGroup).trim().toUpperCase();
    const entity = allCompanyButtons.find(
      (c) => String(c.company_id || "").trim().toUpperCase() === groupCode
    );
    return entity?.id ? Number(entity.id) : null;
  }, [companyId, groupOnlyAccountMode, selectedGroup, allCompanyButtons]);

  const hasAccountMutationScope = useMemo(
    () =>
      accountListHasMutationScope(scopeCompanyId, {
        groupOnly: groupOnlyAccountMode,
        selectedGroup,
        canUseGroupLedger: canUseGroupOnlyMode(sessionMe, selectedGroup, companies),
      }),
    [scopeCompanyId, groupOnlyAccountMode, selectedGroup, sessionMe, companies],
  );

  useEffect(() => {
    if (!showInactive && !showAll) setSelectedDeleteIds(new Set());
  }, [showInactive, showAll]);

  const togglePaymentAlert = async (id) => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    try {
      const fd = new FormData(); fd.append("id", id);
      appendAccountScopeParams(fd);
      const res = await fetch(buildApiUrl("api/accounts/toggle_payment_alert_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (json.success) {
        const next = json.data?.newPaymentAlert ?? json.newPaymentAlert;
        setAccounts(prev => prev.map(a => Number(a.id) === Number(id) ? { ...a, payment_alert: next } : a));
      }
    } catch { notify(t("toggleFailed"), "danger"); }
  };

  const toggleAccountStatus = async (id) => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    try {
      const fd = new FormData(); fd.append("id", id);
      appendAccountScopeParams(fd);
      const res = await fetch(buildApiUrl("api/accounts/toggle_account_status_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (json.success) {
        const next = json.newStatus || json.data?.newStatus;
        setAccounts((prev) => {
          const updated = prev.map((a) => (Number(a.id) === Number(id) ? { ...a, status: next } : a));
          const visible = updated.filter((a) =>
            accountRowVisibleAfterStatusChange(a.status, { showInactive, showAll }),
          );
          return visible;
        });
        lastAccountsFetchKeyRef.current = "";
        refreshAccountList({ silent: true });
      }
    } catch { notify(t("toggleFailed"), "danger"); }
  };

  const pageLedgerScope = useMemo(
    () =>
      resolvePageLedgerScope({
        groupOnly: groupOnlyAccountMode,
        selectedGroup,
        companyId,
        sessionMe,
      }),
    [groupOnlyAccountMode, selectedGroup, companyId, sessionMe],
  );

  const appendAccountScopeParams = useCallback(
    (params) => {
      applyTenantLedgerToParams(params, pageLedgerScope);
    },
    [pageLedgerScope],
  );

  const appendCurrencyScopeParams = appendAccountScopeParams;

  const buildCurrencyScopePayload = useCallback((ledgerScope) => {
    const payload = {};
    const scope = ledgerScope ?? pageLedgerScope;
    if (scope.groupId) payload.group_id = scope.groupId;
    if (scope.ledger === "group") {
      payload.group_only = true;
    } else if (scope.companyId) {
      payload.company_id = scope.companyId;
    }
    return payload;
  }, [pageLedgerScope]);

  const appendModalCurrencyScopeParams = useCallback(
    (params, scopeOverride = undefined) => {
      const modalScope =
        scopeOverride !== undefined
          ? scopeOverride
          : modalLedgerScopeRef.current ?? modalLedgerScope;
      const effective = resolveModalLedgerScope(pageLedgerScope, modalScope);
      applyTenantLedgerToParams(params, effective);
    },
    [pageLedgerScope, modalLedgerScope],
  );

  const resolveActiveModalLedgerScope = useCallback(() => {
    const modal = modalLedgerScopeRef.current ?? modalLedgerScope;
    return resolveModalLedgerScope(pageLedgerScope, modal);
  }, [pageLedgerScope, modalLedgerScope]);

  const loadSelectionMeta = async (
    id,
    isEdit,
    { selectCode = null, ledgerScope = undefined, forcePageLedgerScope = false } = {},
  ) => {
    const scopeForRequest = forcePageLedgerScope
      ? undefined
      : ledgerScope !== undefined
        ? ledgerScope
        : modalLedgerScopeRef.current ?? modalLedgerScope;
    try {
      const currencyParams = new URLSearchParams({ action: "get_available_currencies" });
      if (id) currencyParams.set("account_id", String(id));
      if (forcePageLedgerScope) {
        applyTenantLedgerToParams(currencyParams, pageLedgerScope);
      } else {
        appendModalCurrencyScopeParams(currencyParams, scopeForRequest);
      }
      const [curRes, compRes] = await Promise.all([
        fetch(buildApiUrl(`api/accounts/account_currency_api.php?${currencyParams.toString()}`), { credentials: "include" }),
        fetch(buildApiUrl(`api/accounts/account_company_api.php?action=get_available_companies${id ? `&account_id=${id}` : ""}`), { credentials: "include" }),
      ]);
      const curJ = await curRes.json(); const compJ = await compRes.json();
      if (!curJ.success) {
        notifyApi(curJ.message, "loadLinksFailed", "danger");
        return;
      }
      const rows = curJ.data.map((c) => ({
        id: c.id,
        code: c.code,
        is_linked: !!c.is_linked,
        sync_source: c.sync_source,
        deletable: c.deletable !== false,
      }));
      setCurrencies(rows);
      const wantCode = selectCode ? toUpper(String(selectCode)).trim() : "";
      const matched = wantCode ? rows.find((c) => toUpper(c.code).trim() === wantCode) : null;
      if (isEdit) {
        const ids = curJ.data.filter((c) => c.is_linked).map((c) => Number(c.id));
        const base = matched ? [...new Set([...ids, Number(matched.id)])] : ids;
        setSelectedCurrencyIds(base);
        setInitialEditCurrencyIds(ids);
      } else if (matched) {
        setSelectedCurrencyIds((prev) =>
          prev.map(Number).includes(Number(matched.id)) ? prev : [...prev, Number(matched.id)],
        );
      } else {
        setSelectedCurrencyIds(pickDefaultAddCurrencyIds(curJ.data));
      }
      if (compJ.success) {
        const linked = compJ.data.filter(c => c.is_linked).map(c => Number(c.id));
        if (groupOnlyAccountMode) {
          const defaultGroupEntity =
            groupPickerCompanies.find((c) => String(c.group_id || c.company_id || "") === String(selectedGroup || "")) ||
            groupPickerCompanies[0] ||
            null;
          setSelectedCompanyIds(defaultGroupEntity?.id ? [String(defaultGroupEntity.id)] : []);
        } else {
          setSelectedCompanyIds(linked.length ? linked : companyId ? [Number(companyId)] : []);
        }
      }
    } catch { /* silent */ }
  };

  const openAdd = () => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    if (!hasAccountMutationScope) return;
    setIsEditMode(false); setForm({ ...DEFAULT_FORM, payment_alert: "0" });
    setSelectedCurrencyIds([]); setCurrencyInput("");
    setInitialEditCurrencyIds([]);
    setHiddenCurrencyIds([]);
    syncModalLedgerScope(null);
    setAddModalOpen(true);
    if (!groupOnlyAccountMode && companyId) {
      setSelectedCompanyIds([String(companyId)]);
    }
    void loadRoles({ companyId, groupId: selectedGroup });
    loadSelectionMeta(null, false);
  };

  const openCurrencySetting = () => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    if (!hasAccountMutationScope) return;
    syncModalLedgerScope(null);
    setCurrencySettingOpen(true);
    void loadSelectionMeta(null, false, { forcePageLedgerScope: true });
    if (settingCurrencyId) void loadCurrencyLinks(settingCurrencyId);
  };

  const clearCurrencySettingSelection = () => {
    setSettingCurrencyId(null);
    setSettingLinked(new Set());
    setSettingInitial(new Set());
  };

  const openEdit = async (id) => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    try {
      const detailUrl = new URL(buildApiUrl("api/accounts/getaccount_api.php"));
      detailUrl.searchParams.set("id", String(id));
      appendAccountScopeParams(detailUrl.searchParams);
      detailUrl.searchParams.set("_", String(Date.now()));
      const res = await fetch(detailUrl.toString(), {
        credentials: "include",
        cache: "no-store",
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
      const text = await res.text();
      let json;
      try {
        json = text.trim() ? JSON.parse(text) : { success: false };
      } catch {
        return notify(t("errorLoadingAccount"), "danger");
      }
      if (!json.success) return notifyApi(json.message || json.error, "failedToLoadAccount", "danger");
      const d = json.data;
      setIsEditMode(true);
      setHiddenCurrencyIds([]);
      const ledger = d.ledger_scope && typeof d.ledger_scope === "object" ? d.ledger_scope : null;
      const ledgerGroupCode = String(ledger?.group_code || "").trim().toUpperCase();
      const ledgerScopeForModal =
        ledger?.mode === "group" && ledgerGroupCode
          ? { mode: "group", group_code: ledgerGroupCode }
          : null;
      syncModalLedgerScope(ledgerScopeForModal);
      setForm({ id: d.id, account_id: toUpper(d.account_id), name: toUpper(d.name), role: d.role || "", password: d.password || "", remark: toUpper(d.remark), payment_alert: String(d.payment_alert == 1 ? "1" : "0"), alert_type: d.alert_type || d.alert_day || "", alert_start_date: d.alert_start_date || d.alert_specific_date || "", alert_amount: d.alert_amount || "" });
      await loadRoles({ companyId, groupId: selectedGroup });
      await loadSelectionMeta(id, true, { ledgerScope: ledgerScopeForModal });
      setEditModalOpen(true);
    } catch { notify(t("errorLoadingAccount"), "danger"); }
  };

  const confirmDelete = async () => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    try {
      const fd = new FormData();
      selectedDeleteIds.forEach(id => fd.append("ids[]", id));
      appendAccountScopeParams(fd);
      const res = await fetch(buildApiUrl("api/accounts/delete_accounts_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!json.success) return notifyApi(json.message, "deleteFailed", "danger");
      setConfirmDeleteOpen(false);
      setSelectedDeleteIds(new Set());
      notifyApi(json.message, "accountsDeletedSuccessfully");
      refreshAccountList();
    } catch { notify(t("deleteFailed"), "danger"); }
  };

  const saveForm = async (e) => {
    e.preventDefault();
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    if (form.payment_alert === "1" && (!form.alert_type || !form.alert_start_date)) {
      notify(t("paymentAlertRequiredFields"), "danger");
      return;
    }
    const amount = normalizeAlertAmount(form.alert_amount);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, k === "alert_amount" ? amount : (v ?? "")));
    if (!groupOnlyAccountMode && scopeCompanyId) {
      fd.set("company_id", String(scopeCompanyId));
    }
    if (!groupOnlyAccountMode && selectedCompanyIds.length) {
      fd.set("company_ids", JSON.stringify(selectedCompanyIds));
    }
    appendAccountScopeParams(fd);
    if (!isEditMode && !groupOnlyAccountMode && companyId) {
      fd.set("company_id", String(companyId));
      if (selectedCurrencyIds.length) fd.set("currency_ids", JSON.stringify(selectedCurrencyIds));
    }
    try {
      const ep = isEditMode ? "api/accounts/update_api.php" : "api/accounts/addaccountapi.php";
      const res = await fetch(buildApiUrl(ep), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!json.success) return notifyApi(json.message, "saveFailed", "danger");
      let postSaveCurrencyError = null;
      if (!isEditMode && json?.data?.id && selectedCurrencyIds.length) {
        for (const cid of selectedCurrencyIds) {
          const currencyRes = await fetch(accountCurrencyApiUrl("add_currency"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account_id: Number(json.data.id), currency_id: Number(cid) }),
            credentials: "include",
          });
          const currencyJson = await currencyRes.json();
          if (!currencyRes.ok || !currencyJson.success) {
            postSaveCurrencyError = String(currencyJson?.message || "");
            break;
          }
        }
      }
      if (isEditMode && form.id) {
        const before = new Set(initialEditCurrencyIds.map(Number));
        const after = new Set(selectedCurrencyIds.map(Number));
        const toAdd = [...after].filter((id) => !before.has(id));
        const toRemove = [...before].filter((id) => !after.has(id));
        for (const cid of toAdd) {
          const currencyRes = await fetch(accountCurrencyApiUrl("add_currency"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account_id: Number(form.id), currency_id: Number(cid) }),
            credentials: "include",
          });
          const currencyJson = await currencyRes.json();
          if (!currencyRes.ok || !currencyJson.success) {
            postSaveCurrencyError = String(currencyJson?.message || "");
            break;
          }
        }
        for (const cid of postSaveCurrencyError ? [] : toRemove) {
          const currencyRes = await fetch(accountCurrencyApiUrl("remove_currency"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account_id: Number(form.id), currency_id: Number(cid) }),
            credentials: "include",
          });
          const currencyJson = await currencyRes.json();
          if (!currencyRes.ok || !currencyJson.success) {
            postSaveCurrencyError = String(currencyJson?.message || "");
            break;
          }
        }
        setInitialEditCurrencyIds([...after]);
        if (settingCurrencyId) void loadCurrencyLinks(settingCurrencyId);
      }
      setAddModalOpen(false); setEditModalOpen(false);
      setHiddenCurrencyIds([]);
      if (postSaveCurrencyError) {
        notify(
          t("accountSavedCurrencySyncFailed", {
            detail: translateAccountApiMessage(lang, postSaveCurrencyError, "saveFailed"),
          }),
          "danger",
        );
      } else {
        notify(t("accountSavedSuccessfully"));
      }
      refreshAccountList();
    } catch { notify(t("saveFailed"), "danger"); }
  };

  const createCurrency = async () => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    const code = toUpper(currencyInput).trim(); if (!code) return;
    const existing = currencies.find((c) => toUpper(c.code).trim() === code);
    if (existing) {
      const existingId = Number(existing.id);
      setHiddenCurrencyIds((prev) => prev.filter((id) => Number(id) !== existingId));
      setSelectedCurrencyIds((prev) => (prev.map(Number).includes(existingId) ? prev : [...prev, existingId]));
      setCurrencyInput("");
      return;
    }
    try {
      const modalScope = currencySettingOpen ? pageLedgerScope : resolveActiveModalLedgerScope();
      const payload = { code, ...buildCurrencyScopePayload(modalScope) };
      const res = await fetch(buildApiUrl("api/accounts/create_currency_api.php"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), credentials: "include" });
      const json = await res.json();
      if (json.success) {
        const newId = Number(json.data.id);
        if (currencySettingOpen) {
          await loadSelectionMeta(null, false, { forcePageLedgerScope: true, selectCode: code });
        } else {
          setCurrencies((prev) => [...prev, { id: newId, code: json.data.code, is_linked: false }]);
          setSelectedCurrencyIds((prev) => (prev.map(Number).includes(newId) ? prev : [...prev, newId]));
        }
        setCurrencyInput("");
      } else {
        const msg = String(json.message || json.error || "");
        if (/already exists/i.test(msg)) {
          await loadSelectionMeta(isEditMode && form.id ? form.id : null, isEditMode, {
            selectCode: code,
            ledgerScope: currencySettingOpen ? undefined : modalLedgerScopeRef.current ?? modalLedgerScope,
            forcePageLedgerScope: currencySettingOpen,
          });
          setCurrencyInput("");
          return;
        }
        notifyApi(json.message, "createFailed", "danger");
      }
    } catch { notify(t("createFailed"), "danger"); }
  };

  const accountCurrencyApiUrl = useCallback(
    (action) => {
      const params = new URLSearchParams({ action });
      if (isEditMode && form.id) params.set("account_id", String(form.id));
      appendModalCurrencyScopeParams(params);
      return buildApiUrl(`api/accounts/account_currency_api.php?${params.toString()}`);
    },
    [appendModalCurrencyScopeParams, isEditMode, form.id],
  );

  const fetchAccountsUsingCurrency = async (currencyId, scopeOverride = undefined) => {
    try {
      const params = new URLSearchParams({
        action: "get_linked_accounts_by_currency",
        currency_id: String(currencyId),
      });
      if (scopeOverride) {
        applyTenantLedgerToParams(params, scopeOverride);
      } else {
        appendModalCurrencyScopeParams(params);
      }
      const res = await fetch(
        buildApiUrl(`api/accounts/bulk_account_currency_api.php?${params.toString()}`),
        { method: "POST", credentials: "include" },
      );
      const json = await res.json();
      if (!json.success) return [];
      const fromApi = Array.isArray(json.data?.linked_accounts) ? json.data.linked_accounts : [];
      if (fromApi.length > 0) {
        return fromApi.map((a) => ({
          id: Number(a.id),
          name: String(a.name ?? ""),
          account_id: String(a.account_id ?? ""),
        }));
      }
      const linkedIds = new Set((json.data?.linked_account_ids || []).map(Number));
      return accounts
        .filter((a) => linkedIds.has(Number(a.id)))
        .map((a) => ({
          id: Number(a.id),
          name: String(a.name ?? ""),
          account_id: String(a.account_id ?? ""),
        }));
    } catch {
      return [];
    }
  };

  const handleCurrencyDeleteBlocked = async (currencyId, json, msg) => {
    const editingAccountId = isEditMode ? Number(form.id) : 0;
    let accountsInUse = Array.isArray(json?.data?.accounts_in_use) ? json.data.accounts_in_use : [];
    if (accountsInUse.length === 0) {
      accountsInUse = await fetchAccountsUsingCurrency(currencyId);
    }
    if (accountsInUse.length === 0) {
      accountsInUse = parseAccountsFromCurrencyDeleteMessage(msg);
    }
    if (editingAccountId > 0) {
      accountsInUse = accountsInUse.filter((a) => Number(a.id) !== editingAccountId);
    }
    const apiData =
      accountsInUse.length > 0 ? { ...(json?.data || {}), accounts_in_use: accountsInUse } : json?.data ?? null;
    notifyApi(msg, "failedDeleteCurrency", "danger", {}, apiData);
  };

  const dropCurrencyFromUi = useCallback((currencyId) => {
    const id = Number(currencyId);
    setSelectedCurrencyIds((prev) => prev.filter((x) => Number(x) !== id));
    setHiddenCurrencyIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setCurrencies((prev) => prev.filter((c) => Number(c.id) !== id));
    setSettingCurrencyId((prev) => {
      if (Number(prev) === id) {
        setSettingLinked(new Set());
        setSettingInitial(new Set());
        return null;
      }
      return prev;
    });
  }, []);

  const requestCurrencyDelete = useCallback(
    async (currencyId, { force = false, scope = null } = {}) => {
      const id = Number(currencyId);
      const ledgerScope = scope ?? resolveActiveModalLedgerScope();
      const deleteUrl = new URL(buildApiUrl("api/accounts/delete_currency_api.php"));
      applyTenantLedgerToParams(deleteUrl.searchParams, ledgerScope);
      const deletePayload = { id, ...buildCurrencyScopePayload(ledgerScope) };
      if (force) deletePayload.force = true;
      const res = await fetch(deleteUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deletePayload),
        credentials: "include",
      });
      const json = await res.json();
      return {
        success: Boolean(json.success),
        json,
        msg: String(json.message || json.error || ""),
      };
    },
    [buildCurrencyScopePayload, resolveActiveModalLedgerScope],
  );

  const confirmForceCurrencyDelete = useCallback(async () => {
    const prompt = forceCurrencyDeletePrompt;
    setForceCurrencyDeletePrompt(null);
    if (!prompt?.id) return;
    try {
      const { success, msg } = await requestCurrencyDelete(prompt.id, {
        force: true,
        scope: prompt.scope ?? null,
      });
      if (success) {
        dropCurrencyFromUi(prompt.id);
        notifyApi(msg, "currencyDeleted", "success");
        return;
      }
      notifyApi(msg, "failedDeleteCurrency", "danger");
    } catch {
      notify(t("failedDeleteCurrency"), "danger");
    }
  }, [dropCurrencyFromUi, forceCurrencyDeletePrompt, notify, notifyApi, requestCurrencyDelete, t]);

  /** Delete currency from Currency Setting page (no edit-account unlink). */
  const removeSettingCurrency = async (currencyId) => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    const id = Number(currencyId);
    const currencyRow = currencies.find((c) => Number(c.id) === id);
    if (currencyRow?.deletable === false) {
      notify(t("apiCurrencySyncedFromSubsidiary"), "danger");
      return;
    }
    if (settingCurrencyId != null && Number(settingCurrencyId) === id) {
      notify(t("deselectCurrencyBeforeDelete"), "danger");
      return;
    }

    const settingScope = pageLedgerScope;
    try {
      const otherAccountsInUse = await fetchAccountsUsingCurrency(id, settingScope);
      const { success, json, msg } = await requestCurrencyDelete(id, { scope: settingScope });
      if (success) {
        dropCurrencyFromUi(id);
        notifyApi(msg, "currencyDeleted", "success");
        return;
      }
      if (isHistoricalOnlyCurrencyDeleteBlock(msg, otherAccountsInUse)) {
        const code = currencies.find((c) => Number(c.id) === id)?.code || "";
        setForceCurrencyDeletePrompt({
          id,
          code: toUpper(String(code)),
          detail: formatCurrencyUsageDetail(lang, msg),
          scope: settingScope,
        });
        return;
      }
      const apiData =
        otherAccountsInUse.length > 0
          ? { ...(json?.data || {}), accounts_in_use: otherAccountsInUse }
          : json?.data ?? null;
      await handleCurrencyDeleteBlocked(id, { ...json, data: apiData }, msg);
    } catch {
      notify(t("failedDeleteCurrency"), "danger");
    }
  };

  /** Permanently delete currency; only when deselected. Unlink from current account if still linked in DB. */
  const removeModalCurrency = async (currencyId) => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    const id = Number(currencyId);
    const currencyRow = currencies.find((c) => Number(c.id) === id);
    if (currencyRow?.deletable === false) {
      notify(t("apiCurrencySyncedFromSubsidiary"), "danger");
      return;
    }
    const accountId = isEditMode ? Number(form.id) : 0;

    if (selectedCurrencyIds.map(Number).includes(id)) {
      notify(t("deselectCurrencyBeforeDelete"), "danger");
      return;
    }

    const unlinkCurrentAccountFromCurrency = async () => {
      const wasSavedOnAccount = accountId > 0 && initialEditCurrencyIds.map(Number).includes(id);

      if (!accountId) return true;

      let needsUnlink = wasSavedOnAccount;
      if (!needsUnlink) {
        const using = await fetchAccountsUsingCurrency(id);
        needsUnlink = using.some((a) => Number(a.id) === accountId);
      }
      if (!needsUnlink) {
        if (wasSavedOnAccount) {
          setInitialEditCurrencyIds((prev) => prev.filter((x) => Number(x) !== id));
        }
        return true;
      }

      try {
        const res = await fetch(accountCurrencyApiUrl("remove_currency"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id: accountId, currency_id: id }),
          credentials: "include",
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          notifyApi(json.message, "saveFailed", "danger");
          return false;
        }
        setInitialEditCurrencyIds((prev) => prev.filter((x) => Number(x) !== id));
        setCurrencies((prev) =>
          prev.map((c) => (Number(c.id) === id ? { ...c, is_linked: false } : c)),
        );
        return true;
      } catch {
        notify(t("saveFailed"), "danger");
        return false;
      }
    };

    const unlinked = await unlinkCurrentAccountFromCurrency();
    if (!unlinked) return;

    let otherAccountsInUse = await fetchAccountsUsingCurrency(id);
    if (accountId > 0) {
      otherAccountsInUse = otherAccountsInUse.filter((a) => Number(a.id) !== accountId);
    }

    try {
      const { success, json, msg } = await requestCurrencyDelete(id);
      if (success) {
        dropCurrencyFromUi(id);
        notifyApi(msg, "currencyDeleted", "success");
        return;
      }
      if (isHistoricalOnlyCurrencyDeleteBlock(msg, otherAccountsInUse)) {
        const code = currencies.find((c) => Number(c.id) === id)?.code || "";
        setForceCurrencyDeletePrompt({
          id,
          code: toUpper(String(code)),
          detail: formatCurrencyUsageDetail(lang, msg),
        });
        return;
      }
      const apiData =
        otherAccountsInUse.length > 0
          ? { ...(json?.data || {}), accounts_in_use: otherAccountsInUse }
          : json?.data ?? null;
      await handleCurrencyDeleteBlocked(id, { ...json, data: apiData }, msg);
    } catch {
      notify(t("failedDeleteCurrency"), "danger");
    }
  };

  const loadCurrencyLinks = async (curId) => {
    try {
      const params = new URLSearchParams({ action: "get_linked_accounts_by_currency", currency_id: String(curId) });
      appendCurrencyScopeParams(params);
      const res = await fetch(buildApiUrl(`api/accounts/bulk_account_currency_api.php?${params.toString()}`), { method: "POST", credentials: "include" });
      const json = await res.json();
      const ids = new Set((json.data?.linked_account_ids || []).map(Number));
      setSettingLinked(ids); setSettingInitial(new Set(ids));
    } catch { notify(t("loadLinksFailed"), "danger"); }
  };

  const saveCurrencySetting = async () => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    const linked = [], unlinked = [];
    accounts.forEach(a => {
      const id = Number(a.id); const was = settingInitial.has(id), now = settingLinked.has(id);
      if (now && !was) linked.push(id); if (!now && was) unlinked.push(id);
    });
    try {
      const params = new URLSearchParams({ action: "bulk_update" });
      appendCurrencyScopeParams(params);
      const res = await fetch(buildApiUrl(`api/accounts/bulk_account_currency_api.php?${params.toString()}`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currency_id: settingCurrencyId, linked_account_ids: linked, unlinked_account_ids: unlinked }), credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notifyApi(json.message, "saveFailed", "danger");
      setSettingInitial(new Set(settingLinked));
      setCurrencySettingOpen(false);
      notify(t("currencySettingsSaved"));
      refreshAccountList();
      if (editModalOpen && form.id) void loadSelectionMeta(form.id, true);
    } catch { notify(t("saveFailed"), "danger"); }
  };

  const buildLinkScopePayload = useCallback(() => {
    const payload = {};
    const gid =
      (selectedGroup && String(selectedGroup).trim().toUpperCase()) ||
      (isGroupLogin(sessionMe) ? getLoginIdentifier(sessionMe) : null);
    if (gid) payload.group_id = gid;
    if (groupOnlyAccountMode) {
      payload.group_only = true;
    } else if (companyId) {
      payload.company_id = Number(companyId);
    } else if (scopeCompanyId) {
      payload.company_id = Number(scopeCompanyId);
    }
    return payload;
  }, [selectedGroup, groupOnlyAccountMode, companyId, scopeCompanyId, sessionMe]);

  const openLink = async (id) => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    try {
      if (!companyId && !(groupOnlyAccountMode && selectedGroup)) {
        return notify(t("pleaseSelectCompanyFirst"), "danger");
      }
      setLinkingAccountId(Number(id));
      setLinkType("bidirectional");
      setLinkSearchTerm("");
      const allUrl = groupOnlyAccountMode && selectedGroup
        ? buildGroupAccountsUrl(selectedGroup, "", false, true, { groupOnly: true })
        : buildAccountsUrl(companyId ?? scopeCompanyId, "", false, true);
      const linkedUrl = new URL(buildApiUrl("api/accounts/account_link_api.php"));
      linkedUrl.searchParams.set("action", "get_linked_accounts");
      linkedUrl.searchParams.set("account_id", String(id));
      const linkScope = buildLinkScopePayload();
      if (linkScope.group_id) linkedUrl.searchParams.set("group_id", String(linkScope.group_id));
      if (linkScope.group_only) linkedUrl.searchParams.set("group_only", "1");
      if (linkScope.company_id) linkedUrl.searchParams.set("company_id", String(linkScope.company_id));
      const [allRes, linkedRes] = await Promise.all([
        fetch(allUrl.toString(), { credentials: "include" }),
        fetch(linkedUrl.toString(), { credentials: "include" }),
      ]);
      const allJson = await allRes.json();
      const linkedJson = await linkedRes.json();
      const pool = Array.isArray(allJson?.data?.accounts) ? allJson.data.accounts : [];
      setLinkAccountsPool(pool);
      const types = linkedJson?.data?.link_types_map || {};
      setLinkTypeMap(types);
      const initial = new Set(
        (Array.isArray(linkedJson?.data?.accounts) ? linkedJson.data.accounts : [])
          .filter((a) => types[a.id] === "bidirectional")
          .map((a) => Number(a.id))
      );
      setSelectedLinkedIds(initial);
      setLinkModalOpen(true);
    } catch {
      notify(t("failedOpenLinkModal"), "danger");
    }
  };

  useEffect(() => {
    if (!linkModalOpen) return;
    const next = new Set(
      Object.entries(linkTypeMap)
        .filter(([, type]) => type === linkType)
        .map(([id]) => Number(id))
    );
    setSelectedLinkedIds(next);
  }, [linkType, linkTypeMap, linkModalOpen]);

  const saveLinks = async () => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    if (!linkingAccountId || (!companyId && !(groupOnlyAccountMode && selectedGroup))) return;
    try {
      const linkScope = buildLinkScopePayload();
      const refUrl = new URL(buildApiUrl("api/accounts/account_link_api.php"));
      refUrl.searchParams.set("action", "get_linked_accounts");
      refUrl.searchParams.set("account_id", String(linkingAccountId));
      if (linkScope.group_id) refUrl.searchParams.set("group_id", String(linkScope.group_id));
      if (linkScope.group_only) refUrl.searchParams.set("group_only", "1");
      if (linkScope.company_id) refUrl.searchParams.set("company_id", String(linkScope.company_id));
      const refRes = await fetch(refUrl.toString(), { credentials: "include" });
      const refJson = await refRes.json();
      if (!refJson?.success) {
        notifyApi(refJson?.message, "failedSaveAccountLinks", "danger");
        return;
      }
      const linkScopeCompanyId = Number(refJson?.data?.company_id) || Number(linkScope.company_id) || 0;
      if (!Number.isFinite(linkScopeCompanyId) || linkScopeCompanyId <= 0) {
        notify(t("pleaseSelectCompanyFirst"), "danger");
        return;
      }
      const typesMap = refJson?.data?.link_types_map || {};
      const currentTypeIds = new Set(
        (Array.isArray(refJson?.data?.accounts) ? refJson.data.accounts : [])
          .filter((a) => typesMap[a.id] === linkType)
          .map((a) => Number(a.id))
      );
      const desiredIds = new Set([...selectedLinkedIds]);
      const toAdd = [...desiredIds].filter((id) => !currentTypeIds.has(id));
      const toRemove = [...currentTypeIds].filter((id) => !desiredIds.has(id));

      for (const linkedId of toRemove) {
        await fetch(buildApiUrl("api/accounts/account_link_api.php?action=unlink_accounts"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_id_1: Number(linkingAccountId),
            account_id_2: Number(linkedId),
            company_id: linkScopeCompanyId,
            ...linkScope,
          }),
          credentials: "include",
        });
      }
      for (const linkedId of toAdd) {
        await fetch(buildApiUrl("api/accounts/account_link_api.php?action=link_accounts"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_id_1: Number(linkingAccountId),
            account_id_2: Number(linkedId),
            company_id: linkScopeCompanyId,
            ...linkScope,
            link_type: linkType,
            source_account_id: linkType === "unidirectional" ? Number(linkingAccountId) : null,
          }),
          credentials: "include",
        });
      }
      if (toAdd.length === 0 && toRemove.length === 0 && desiredIds.size > 0) {
        for (const linkedId of desiredIds) {
          await fetch(buildApiUrl("api/accounts/account_link_api.php?action=update_link_type"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              account_id_1: Number(linkingAccountId),
              account_id_2: Number(linkedId),
              company_id: linkScopeCompanyId,
              ...linkScope,
              link_type: linkType,
              source_account_id: linkType === "unidirectional" ? Number(linkingAccountId) : null,
            }),
            credentials: "include",
          });
        }
      }
      setLinkModalOpen(false);
      notify(t("accountLinksSavedSuccessfully"));
      refreshAccountList();
    } catch {
      notify(t("failedSaveAccountLinks"), "danger");
    }
  };

  const handleSort = (column) => {
    setSortDirection((direction) => (sortColumn === column && direction === "asc" ? "desc" : "asc"));
    setSortColumn(column);
  };

  const renderSortIcon = (column) => (
    <span className={`account-sort-icon${sortColumn === column ? ` is-active is-${sortDirection}` : ""}`} aria-hidden="true">
      <span className="account-sort-icon__up" />
      <span className="account-sort-icon__down" />
    </span>
  );

  const renderSortableHeader = (label, column) => (
    <div
      className="account-header-item account-header-sortable"
      role="button"
      tabIndex={0}
      onClick={() => handleSort(column)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSort(column);
        }
      }}
    >
      <span>{label}</span>
      {renderSortIcon(column)}
    </div>
  );

  return (
    <>
      <div className="container">
        <div className="content">
          <div className="action-buttons-container">
            <div className="action-buttons">
                <div className="action-controls-row account-toolbar-primary" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-add"
                  disabled={accountMutationsBlocked || !hasAccountMutationScope}
                  onClick={openAdd}
                >
                  <svg className="btn-add__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                  {t("addAccount")}
                </button>
                <div className="search-container userlist-search-bar">
                  <span className="userlist-search-bar__icon" aria-hidden="true">
                    <svg fill="currentColor" viewBox="0 0 24 24">
                      <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                    </svg>
                  </span>
                  <input
                    id="accountlist-search-input"
                    type="text"
                    className="search-input userlist-search-input"
                    placeholder={t("searchByAccountOrName")}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(toUpper(e.target.value))}
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
                <div className="user-toolbar-actions-right" style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                  <button
                    type="button"
                    className="btn btn-currency-setting"
                    disabled={accountMutationsBlocked || !hasAccountMutationScope}
                    onClick={openCurrencySetting}
                  >
                    {t("currencySetting")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-delete"
                    disabled={!selectedDeleteIds.size || accountMutationsBlocked}
                    onClick={() => setConfirmDeleteOpen(true)}
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
              onPickGroup={onPickGroupPill}
              companiesForPicker={inlineCompaniesForPicker}
              groupAllMode={groupAllMode}
              pickerCompanyId={companyId}
              onPickAllInGroup={handlePickAllInGroup}
              onPickCompany={onPickCompanyPill}
              onWarmCompany={warmCompanyListPrefetch}
              onClearCompanyPill={clearCompanyPillSelection}
              allowCompanyDeselect={canClearCompanySelection(sessionMe, selectedGroup)}
              switchingCompany={false}
              showAllOption={false}
            />
          </div>

          <div ref={listRegionRef} className="account-table-wrapper account-list-table">
            <div className="account-table-header account-list-table-header">
              <div className="account-header-item">{t("no")}</div>
              {renderSortableHeader(t("account"), "account")}
              {renderSortableHeader(t("name"), "name")}
              {renderSortableHeader(t("role"), "role")}
              {renderSortableHeader(t("alert"), "alert")}
              {renderSortableHeader(t("status"), "status")}
              {renderSortableHeader(t("lastLogin"), "lastLogin")}
              {renderSortableHeader(t("remark"), "remark")}
              <div className="account-header-item account-header-item--action">{t("action")}</div>
            </div>
            <div
              className={`account-cards${showAll ? " account-cards--show-all" : ""}${usePagedFill ? " account-cards--paged-fill" : ""}`}
              style={usePagedFill ? { "--account-list-page-size": pageSize } : undefined}
            >
              {pageRows.map((a, idx) => {
                const alertOn = String(a.payment_alert) === "1";
                const isInactive = String(a.status || "").toLowerCase() === "inactive";
                return (
                  <div className="account-card account-list-row" key={a.id}>
                    <div className="account-card-item">{showAll ? idx + 1 : (effectivePage - 1) * pageSize + idx + 1}</div>
                    <div className="account-card-item">{toUpper(a.account_id)}</div>
                    <div className="account-card-item">{toUpper(a.name)}</div>
                    <div className="account-card-item"><span className={`account-role-badge account-role-${String(a.role || "").toLowerCase().replace(/\s+/g, "-")}`}>{formatAccountRoleDisplay(t, a.role)}</span></div>
                    <div className="account-card-item">
                      <label
                        className={`account-alert-toggle${accountMutationsBlocked ? " is-disabled" : ""}`}
                        onClick={accountMutationsBlocked ? () => notify(t("readOnlyActionBlocked"), "danger") : undefined}
                      >
                        <input
                          type="checkbox"
                          className="account-alert-toggle__input"
                          checked={alertOn}
                          disabled={accountMutationsBlocked}
                          aria-label={formatAccountAlertDisplay(t, a.payment_alert)}
                          onChange={() => togglePaymentAlert(a.id)}
                        />
                        <span className="account-alert-toggle__track" aria-hidden="true">
                          <span className="account-alert-toggle__label account-alert-toggle__label--on">{t("alertOn")}</span>
                          <span className="account-alert-toggle__label account-alert-toggle__label--off">{t("alertOff")}</span>
                          <span className="account-alert-toggle__thumb" />
                        </span>
                      </label>
                    </div>
                    <div className="account-card-item"><span className={`account-role-badge ${isInactive ? "account-status-inactive" : "account-status-active"}${accountMutationsBlocked ? "" : " status-clickable"}`} onClick={accountMutationsBlocked ? () => notify(t("readOnlyActionBlocked"), "danger") : () => toggleAccountStatus(a.id)} style={accountMutationsBlocked ? { cursor: "not-allowed" } : undefined}>{formatAccountStatusDisplay(t, a.status)}</span></div>
                    <div
                      className="account-card-item"
                      title={formatAccountLastLoginTimeTitle(a.last_login) || undefined}
                    >
                      {formatAccountLastLoginDate(a.last_login)}
                    </div>
                    <div className="account-card-item">{toUpper(a.remark)}</div>
                    <div className="account-card-item account-card-item--action">
                      <div className="account-action-tools">
                        <div className="account-action-tools-bar">
                        <button type="button" className="btn btn-edit account-edit-btn" disabled={accountMutationsBlocked} onClick={() => openEdit(a.id)} aria-label={t("edit")} title={t("edit")}>
                          <img src={assetUrl("images/edit.svg")} alt={t("edit")} />
                        </button>
                        <button type="button" className="btn account-edit-btn" disabled={accountMutationsBlocked} onClick={() => openLink(a.id)} title={t("linkAccountTitle")} aria-label={t("linkAccountTitle")}>
                          <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        </button>
                        </div>
                        {isInactive && (
                          <input
                            type="checkbox"
                            disabled={accountMutationsBlocked}
                            checked={selectedDeleteIds.has(Number(a.id))}
                            onChange={(e) => setSelectedDeleteIds(prev => { const n = new Set(prev); if (e.target.checked) n.add(Number(a.id)); else n.delete(Number(a.id)); return n; })}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {!showAll && (
            <div className="account-pagination-container">
              <button className="account-pagination-btn" disabled={effectivePage <= 1} onClick={() => setCurrentPage(p => p - 1)}>◀</button>
              <span className="account-pagination-info">{t("paginationOf", { page: effectivePage, total: totalPages })}</span>
              <button className="account-pagination-btn" disabled={effectivePage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>▶</button>
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
                zIndex:
                  addModalOpen || editModalOpen || linkModalOpen || confirmDeleteOpen || currencySettingOpen
                    ? processNotificationAboveAccountZIndex
                    : processNotificationZIndex,
              }}
            >
              <div className={`account-notification account-notification-${toast.type} show`}>{toast.message}</div>
            </div>,
            document.body
          )
        : null}

      <AccountModal
        open={addModalOpen || editModalOpen}
        title={isEditMode ? t("editAccount") : t("addAccount")}
        isEditMode={isEditMode}
        form={form}
        setForm={setForm}
        orderedRoles={orderedRoles}
        currencies={accountModalCurrencies}
        companies={modalPickerCompanies}
        selectedCurrencyIds={selectedCurrencyIds}
        setSelectedCurrencyIds={setSelectedCurrencyIds}
        selectedCompanyIds={selectedCompanyIds}
        setSelectedCompanyIds={setSelectedCompanyIds}
        currencyInput={currencyInput}
        setCurrencyInput={setCurrencyInput}
        onCreateCurrency={(e) => {
          // Allow UI reuse without forcing event handling conventions.
          if (e?.preventDefault) e.preventDefault();
          createCurrency();
        }}
        onRemoveCurrency={removeModalCurrency}
        currencyDeleteOnlyWhenDeselected
        onSubmit={saveForm}
        onClose={() => {
          setAddModalOpen(false);
          setEditModalOpen(false);
          setHiddenCurrencyIds([]);
          syncModalLedgerScope(null);
        }}
        groupPickerMode={groupOnlyAccountMode}
        t={t}
      />
      <AccountConfirmModal open={confirmDeleteOpen} message={t("deleteConfirmMessage", { count: selectedDeleteIds.size })} onConfirm={confirmDelete} onClose={() => setConfirmDeleteOpen(false)} t={t} />
      <AccountConfirmModal
        modalId="forceDeleteCurrencyModal"
        open={Boolean(forceCurrencyDeletePrompt)}
        title={t("currencyInUseTitle")}
        message={
          forceCurrencyDeletePrompt
            ? t("forceDeleteCurrencyConfirm", {
                code: forceCurrencyDeletePrompt.code,
                detail: forceCurrencyDeletePrompt.detail,
              })
            : ""
        }
        confirmLabel={t("forceDeleteCurrency")}
        onConfirm={confirmForceCurrencyDelete}
        onClose={() => setForceCurrencyDeletePrompt(null)}
        t={t}
      />
      <CurrencySettingModal open={currencySettingOpen} onClose={() => setCurrencySettingOpen(false)} currencies={currencies} settingCurrencyId={settingCurrencyId} setSettingCurrencyId={setSettingCurrencyId} settingLinked={settingLinked} setSettingLinked={setSettingLinked} settingSearch={settingSearch} setSettingSearch={setSettingSearch} settingRole={settingRole} setSettingRole={setSettingRole} onLoadCurrencyLinks={loadCurrencyLinks} onClearCurrencySelection={clearCurrencySettingSelection} onSave={saveCurrencySetting} accounts={accounts} roles={roles} currencyInput={currencyInput} setCurrencyInput={setCurrencyInput} onCreateCurrency={createCurrency} onRemoveCurrency={removeSettingCurrency} t={t} />
      <LinkAccountModal open={linkModalOpen} accounts={linkAccountsPool} currentAccountId={linkingAccountId} selectedIds={selectedLinkedIds} setSelectedIds={setSelectedLinkedIds} linkType={linkType} setLinkType={setLinkType} searchTerm={linkSearchTerm} setSearchTerm={setLinkSearchTerm} onSave={saveLinks} onClose={() => setLinkModalOpen(false)} t={t} />
    </>
  );
}
