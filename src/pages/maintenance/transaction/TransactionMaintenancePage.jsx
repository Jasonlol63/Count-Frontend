import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { canAccessTransactionFormulaMaintenance } from "../../../utils/auth/sidebarPermissions.js";
import { removeOtherMaintenanceStylesheets } from "../../../utils/maintenance/maintenanceStylesheets.js";
import { ensureMaintenanceDateRangePicker } from "../../../utils/date/dateRangePicker.js";
import { useMaintenanceGroupCompanyFilter } from "../shared/useMaintenanceGroupCompanyFilter.js";
import { runMaintenanceCompanySwitch } from "../shared/maintenanceCompanySwitch.js";
import { useMaintenanceBankOnlyGuard } from "../shared/useMaintenanceBankOnlyGuard.js";
import { spaPath } from "../../../utils/routing/pageRoutes.js";
import {
  companiesInGroupList,
  getCachedOwnerCompanies,
  isDashboardGroupOnlyMode,
  persistDashboardFilterState,
  persistDashboardGroupOnlyMode,
  persistDashboardSelectedCompany,
  readPersistedDashboardGcFilter,
  readDashboardSelectedCompanyId,
  resolveBootCompanyId,
  resolveInitialSelectedGroupFromSession,
  fetchOwnerCompaniesAll,
  DASHBOARD_GROUP_FILTER_KEY,
  pickDefaultSubsidiaryForGroup,
  pickGroupAnchorCompany,
} from "../../../utils/company/sharedCompanyFilter.js";
import { useMaintenancePageScrollLock } from "../shared/useMaintenancePageScrollLock.js";
import "../../../../public/css/accountCSS.css";
import "../../../../public/css/userlist.css";
import "../../../../public/css/transaction.css";
import "../../../../public/css/date-range-picker.css";
import "../../../../public/css/customer_report.css";
import "../../../../public/css/report-outlined-fields.css";
import "../../../../public/css/transaction_maintenance.css";
import "../../../../public/css/maintenance_unified_filters.css";
import { useGroupAnchorSessionSync } from "../../../utils/company/useGroupAnchorSessionSync.js";
import {
  fetchCompanyPermissions,
  fetchProcessesForPermission,
  normalizeMaintenanceProcessFilter,
  filterTransactionMaintenancePermissions,
  pickTransactionMaintenancePermission,
  searchTransactionData,
  updateSessionCompany,
  syncTransactionMaintenanceGroupAnchorSession,
  isMaintenanceRecoverableError,
  getMaintenanceSearchUserMessage,
  bootstrapTransactionMaintenanceMeta,
} from "./transactionMaintenanceLogic.js";
import {
  resolveTransactionMaintenanceScope,
  transactionMaintenanceScopeCacheKey,
  transactionMaintenanceScopeIsReady,
  transactionMaintenanceUsesGroupProcesses,
} from "./transactionMaintenanceScope.js";
import { useLoginLang } from "../../../utils/i18n/useLoginLang.js";
import { getMaintenanceText, MAINTENANCE_I18N } from "../../../translateFile/pages/maintenanceTranslate.js";
import { formatDmyFromYmd } from "../shared/maintenanceDateHelpers.js";

// Components
import TransactionMaintenanceFilters from "./components/TransactionMaintenanceFilters.jsx";
import TransactionMaintenanceTable from "./components/TransactionMaintenanceTable.jsx";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";

function readInitialMaintenanceSelectedGroup() {
  try {
    const saved = sessionStorage.getItem(DASHBOARD_GROUP_FILTER_KEY);
    return saved ? String(saved).trim().toUpperCase() : null;
  } catch {
    return null;
  }
}

function readInitialMaintenanceCompanyId() {
  const persisted = readPersistedDashboardGcFilter();
  if (isDashboardGroupOnlyMode() || persisted.groupOnly) return null;
  const saved = readDashboardSelectedCompanyId();
  if (saved != null) return saved;
  // Group selected with no saved company → group-only UI on refresh.
  if (persisted.selectedGroup) return null;
  return null;
}

function buildMaintenanceMetaEffectKey(scopeKey, companyId, companyCode, selectedGroup) {
  return `${scopeKey}:${companyId ?? ""}:${companyCode ?? ""}:${selectedGroup ?? ""}`;
}

export default function TransactionMaintenancePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { me, sessionReady } = useAuthSession();
  const lang = useLoginLang();
  const m = useMemo(() => MAINTENANCE_I18N[lang] || MAINTENANCE_I18N.en, [lang]);
  const t = useCallback((key, params) => getMaintenanceText(lang, key, params), [lang]);
  useMaintenancePageScrollLock();

  const [companies, setCompanies] = useState(() => getCachedOwnerCompanies() || []);
  const [permissions, setPermissions] = useState([]);

  // -- Filter State --
  const [companyId, setCompanyId] = useState(readInitialMaintenanceCompanyId);
  useMaintenanceBankOnlyGuard(companyId);
  const [companyCode, setCompanyCode] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(readInitialMaintenanceSelectedGroup);
  const [selectedProcess, setSelectedProcess] = useState("");
  const [activePermission, setActivePermission] = useState("");
  
  const today = useMemo(() => new Date(), []);
  const todayDmy = useMemo(() => {
    const d = String(today.getDate()).padStart(2, "0");
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const y = today.getFullYear();
    return `${d}/${m}/${y}`;
  }, [today]);
  const [dateFrom, setDateFrom] = useState(todayDmy);
  const [dateTo, setDateTo] = useState(todayDmy);
  const dateFromRef = useRef(dateFrom);
  const dateToRef = useRef(dateTo);
  useEffect(() => {
    dateFromRef.current = dateFrom;
    dateToRef.current = dateTo;
  }, [dateFrom, dateTo]);

  const [toasts, setToasts] = useState([]);
  /** Boot finished metadata; date picker synced — avoids racing search with boot/meta fetches. */
  const [filtersReady, setFiltersReady] = useState(false);
  const [dateRangeReady, setDateRangeReady] = useState(false);
  const followGroupRef = useRef(() => {});
  const bootRunIdRef = useRef(0);
  const markAnchorSyncedRef = useRef(() => {});
  const handledMetaScopeKeyRef = useRef("");

  // -- Data State --
  const [processes, setProcesses] = useState([]);
  /** When set, meta effect reuses permissions from the last company switch instead of calling domain_api again. */
  const switchPermsCacheRef = useRef(null);
  /** Boot already loaded process/permission meta — skip duplicate meta effect on first paint. */
  const skipMetaAfterBootRef = useRef(false);
  const maintenanceAbortRef = useRef(null);
  const maintenanceSeqRef = useRef(0);
  const initialSearchDoneRef = useRef(false);
  const suppressNextSearchEffectRef = useRef(false);
  const scopeKeyRef = useRef("");
  /** Last successful search key — detect scope/filter change to drop stale rows. */
  const lastSearchQueryKeyRef = useRef("");
  /** Boot finished with scope/permission — trigger one explicit search before auto-effect. */
  const pendingBootSearchRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const firstProgressPaintRef = useRef(true);

  const [transactionData, setTransactionData] = useState([]);
  const [maintenanceDataComplete, setMaintenanceDataComplete] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [listSyncing, setListSyncing] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const processFilter = useMemo(
    () => normalizeMaintenanceProcessFilter(selectedProcess),
    [selectedProcess],
  );

  const visiblePermissions = useMemo(
    () => filterTransactionMaintenancePermissions(permissions),
    [permissions],
  );

  const switchCompanyRef = useRef(async () => {});
  const onPrepareCompanySelectRef = useRef(() => {});
  const onClearCompanyRef = useRef(() => {});

  const {
    snapGroupIds,
    visibleCompanies,
    handleGroupClick,
    handlePickCompany,
    handlePickAllGroups,
    handlePickAllInGroup,
    groupsAllMode,
    groupAllMode,
    allowClearCompany,
  } = useMaintenanceGroupCompanyFilter({
    companies,
    companyId,
    selectedGroup,
    setSelectedGroup,
    switchCompany: (c) => switchCompanyRef.current(c),
    onPrepareCompanySelect: (c) => onPrepareCompanySelectRef.current(c),
    onClearCompany: (...args) => onClearCompanyRef.current(...args),
    enableGroupAnchorSession: false,
    pillCategory: "games",
  });

  const transactionScope = useMemo(
    () =>
      resolveTransactionMaintenanceScope({
        companies,
        selectedGroup,
        companyId,
        groupsAllMode,
        groupAllMode,
      }),
    [companies, selectedGroup, companyId, groupsAllMode, groupAllMode],
  );

  const transactionScopeKey = useMemo(
    () => transactionMaintenanceScopeCacheKey(transactionScope),
    [transactionScope],
  );

  const { markAnchorSynced, resetAnchorSessionRef } = useGroupAnchorSessionSync({
    companies,
    selectedGroup,
    companyId,
    sessionCompanyId: me?.company_id,
    enabled: filtersReady,
    notifyOnSync: false,
  });
  markAnchorSyncedRef.current = markAnchorSynced;

  const notify = useCallback((message, type = "success") => {
    const id = Date.now();
    setToasts(prev => {
      if (prev.some(t => t.message === message)) return prev;
      const next = [...prev, { id, message, type }];
      if (next.length > 2) return next.slice(1);
      return next;
    });
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 2000);
  }, []);

  const listQueryEnabled = Boolean(
    filtersReady &&
    dateRangeReady &&
    transactionMaintenanceScopeIsReady(transactionScope) &&
    dateFrom &&
    dateTo,
  );

  const bootPending = !filtersReady || !dateRangeReady || !dateFrom || !dateTo;

  const listRowCount = transactionData.length;
  const searchRecoverable =
    Boolean(searchError) &&
    listRowCount === 0 &&
    isMaintenanceRecoverableError(searchError);
  const showListSkeleton =
    listRowCount === 0 &&
    (bootPending ||
      listLoading ||
      listSyncing ||
      (searchRecoverable && !recoverableExhausted));
  const recoverableRetryRef = useRef(0);
  const [recoverableExhausted, setRecoverableExhausted] = useState(false);

  const searchQueryKey = useMemo(
    () =>
      JSON.stringify([
        transactionScopeKey,
        dateFrom,
        dateTo,
        processFilter,
        activePermission || "",
      ]),
    [transactionScopeKey, dateFrom, dateTo, processFilter, activePermission],
  );

  useEffect(() => {
    recoverableRetryRef.current = 0;
    setRecoverableExhausted(false);
    setSearchError(null);
  }, [searchQueryKey]);

  useEffect(() => {
    scopeKeyRef.current = transactionScopeKey;
  }, [transactionScopeKey]);

  const performMaintenanceSearch = useCallback(
    async (overrides = {}) => {
      const effectiveScope =
        overrides.scope ??
        resolveTransactionMaintenanceScope({
          companies,
          selectedGroup: overrides.selectedGroup ?? selectedGroup,
          companyId: overrides.companyId ?? companyId,
          groupsAllMode,
          groupAllMode,
        });
      const category =
        overrides.category ??
        (activePermission ||
          pickTransactionMaintenancePermission(permissions, null) ||
          "Games");
      if (
        !transactionMaintenanceScopeIsReady(effectiveScope) ||
        !dateFrom ||
        !dateTo
      ) {
        return;
      }

      const searchScopeKey = transactionMaintenanceScopeCacheKey(effectiveScope);
      const effectiveSearchKey = JSON.stringify([
        searchScopeKey,
        dateFrom,
        dateTo,
        processFilter,
        category,
      ]);
      const filtersChanged = effectiveSearchKey !== lastSearchQueryKeyRef.current;
      if (overrides.scope || filtersChanged) {
        scopeKeyRef.current = searchScopeKey;
      }
      maintenanceAbortRef.current?.abort();
      const ac = new AbortController();
      maintenanceAbortRef.current = ac;
      const seq = ++maintenanceSeqRef.current;
      const quietRefresh = initialSearchDoneRef.current;
      firstProgressPaintRef.current = true;
      if (filtersChanged || overrides.scope) {
        if (!quietRefresh) {
          setTransactionData([]);
          setMaintenanceDataComplete(false);
          setListLoading(true);
          setListSyncing(false);
        } else {
          setListLoading(false);
          setListSyncing(true);
        }
      } else if (!quietRefresh) {
        setListLoading(true);
      } else {
        setListLoading(false);
        setListSyncing(true);
      }
      setSearchError(null);
      try {
        const rows = await searchTransactionData({
          dateFrom,
          dateTo,
          process: processFilter,
          category,
          scope: effectiveScope,
          signal: ac.signal,
          onProgress: (progressRows) => {
            if (seq !== maintenanceSeqRef.current) return;
            if (searchScopeKey !== scopeKeyRef.current) return;
            const applyProgress = () => {
              setTransactionData(progressRows);
              setMaintenanceDataComplete(false);
              if (!quietRefresh) {
                setListLoading(false);
              }
            };
            if (firstProgressPaintRef.current) {
              firstProgressPaintRef.current = false;
              flushSync(applyProgress);
            } else {
              startTransition(applyProgress);
            }
          },
        });
        if (seq !== maintenanceSeqRef.current) return;
        if (searchScopeKey !== scopeKeyRef.current) return;
        setTransactionData(rows);
        setMaintenanceDataComplete(true);
        lastSearchQueryKeyRef.current = effectiveSearchKey;
        if ((filtersChanged || overrides.scope) && !quietRefresh) {
          if (rows.length > 0) {
            notify(t("foundRecords", { n: rows.length }), "success");
          } else {
            notify(t("noDataAdjustSearch"), "info");
          }
        }
      } catch (err) {
        if (err?.name === "AbortError" || seq !== maintenanceSeqRef.current) return;
        if (searchScopeKey !== scopeKeyRef.current) return;
        setSearchError(err);
        setTransactionData([]);
        setMaintenanceDataComplete(false);
        const msg = getMaintenanceSearchUserMessage(err, {
          loadingMessage: t("searchRetrying"),
          narrowRangeMessage: t("searchRetryHint"),
        });
        if (msg && msg !== t("searchRetrying")) {
          notify(msg, "error");
        }
      } finally {
        initialSearchDoneRef.current = true;
        if (seq === maintenanceSeqRef.current) {
          setListLoading(false);
          setListSyncing(false);
        }
      }
    },
    [
      companies,
      selectedGroup,
      companyId,
      groupsAllMode,
      groupAllMode,
      dateFrom,
      dateTo,
      processFilter,
      activePermission,
      permissions,
      notify,
      t,
    ],
  );

  const runBootMaintenanceSearch = useCallback(async (pending) => {
    if (!pending?.scope || !transactionMaintenanceScopeIsReady(pending.scope)) return false;
    const category =
      pending.category ||
      pickTransactionMaintenancePermission(permissions, null) ||
      "Games";
    maintenanceAbortRef.current?.abort();
    const ac = new AbortController();
    maintenanceAbortRef.current = ac;
    const seq = ++maintenanceSeqRef.current;
    const searchScopeKey = transactionMaintenanceScopeCacheKey(pending.scope);
    scopeKeyRef.current = searchScopeKey;
    firstProgressPaintRef.current = true;
    setListLoading(true);
    setSearchError(null);
    try {
      const rows = await searchTransactionData({
        dateFrom: dateFromRef.current,
        dateTo: dateToRef.current,
        process: processFilter,
        category,
        scope: pending.scope,
        signal: ac.signal,
        onProgress: (progressRows) => {
          if (seq !== maintenanceSeqRef.current) return;
          const applyProgress = () => {
            setTransactionData(progressRows);
            setMaintenanceDataComplete(false);
            setListLoading(false);
          };
          if (firstProgressPaintRef.current) {
            firstProgressPaintRef.current = false;
            flushSync(applyProgress);
          } else {
            startTransition(applyProgress);
          }
        },
      });
      if (seq !== maintenanceSeqRef.current) return false;
      setTransactionData(rows);
      setMaintenanceDataComplete(true);
      initialSearchDoneRef.current = true;
      lastSearchQueryKeyRef.current = JSON.stringify([
        searchScopeKey,
        dateFromRef.current,
        dateToRef.current,
        processFilter,
        category,
      ]);
      return true;
    } catch (err) {
      if (err?.name === "AbortError" || seq !== maintenanceSeqRef.current) return false;
      setSearchError(err);
      setTransactionData([]);
      setMaintenanceDataComplete(false);
      initialSearchDoneRef.current = true;
      return false;
    } finally {
      if (seq === maintenanceSeqRef.current) setListLoading(false);
    }
  }, [permissions, processFilter]);

  useEffect(() => {
    if (!listQueryEnabled || !searchRecoverable) return;
    if (listLoading || listSyncing) return;
    if (recoverableRetryRef.current >= 10) {
      setRecoverableExhausted(true);
      return;
    }

    const delay = Math.min(4000, 700 * (recoverableRetryRef.current + 1));
    const timer = window.setTimeout(() => {
      recoverableRetryRef.current += 1;
      void performMaintenanceSearch();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    listQueryEnabled,
    searchRecoverable,
    recoverableExhausted,
    listLoading,
    listSyncing,
    searchQueryKey,
    performMaintenanceSearch,
  ]);

  useEffect(() => {
    if (maintenanceDataComplete && listRowCount > 0) {
      recoverableRetryRef.current = 0;
      setRecoverableExhausted(false);
    }
  }, [maintenanceDataComplete, listRowCount]);

  useEffect(() => {
    if (!filtersReady || !listQueryEnabled) return;

    if (suppressNextSearchEffectRef.current) {
      suppressNextSearchEffectRef.current = false;
      return;
    }

    if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = window.setTimeout(() => {
      searchDebounceRef.current = null;
      void performMaintenanceSearch();
    }, 180);
    return () => {
      if (searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
    };
  }, [
    filtersReady,
    listQueryEnabled,
    searchQueryKey,
    performMaintenanceSearch,
  ]);

  useEffect(
    () => () => {
      maintenanceAbortRef.current?.abort();
    },
    [],
  );

  const listStatusMessage = useMemo(() => {
    if (showListSkeleton) return t("searchRetrying");
    if (recoverableExhausted) return t("searchRetryHint");
    if (searchError && listRowCount === 0) {
      return getMaintenanceSearchUserMessage(searchError, {
        loadingMessage: t("searchRetrying"),
        narrowRangeMessage: t("searchRetryHint"),
      });
    }
    return "";
  }, [
    showListSkeleton,
    recoverableExhausted,
    searchError,
    listRowCount,
    t,
  ]);

  const showNoDataEmpty =
    listQueryEnabled &&
    !bootPending &&
    !listLoading &&
    !listSyncing &&
    maintenanceDataComplete &&
    listRowCount === 0 &&
    !showListSkeleton &&
    !listStatusMessage;

  // -- Initialization --
  useEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "datacapture-page", "transaction-page");
    document.body.classList.add("dashboard-page", "maintenance-page");

    removeOtherMaintenanceStylesheets("transaction_maintenance.css");
    ensureMaintenanceDateRangePicker();
    return () => {
      document.body.classList.remove("maintenance-page");
    };
  }, []);

  useEffect(() => {
    if (!sessionReady || !me) return;
    setDateRangeReady(true);
  }, [sessionReady, me?.user_id]);

  useEffect(() => {
    if (!sessionReady || !me) return;
    window.MaintenanceDateRangePicker?.setLocaleStrings?.({
      placeholder: t("selectDateRange"),
      selectEndDateHint: t("selectEndDate"),
      monthLabels: m.monthsShort,
    });
  }, [sessionReady, me, lang, t, m]);

  // -- Boot Logic --
  useEffect(() => {
    if (!sessionReady || !me) return;

    const runId = ++bootRunIdRef.current;
    let cancelled = false;
    setFiltersReady(false);
    handledMetaScopeKeyRef.current = "";
    initialSearchDoneRef.current = false;
    pendingBootSearchRef.current = null;

    (async () => {
      try {
        const u = me;

        // Member check
        if (String(u.user_type || "").toLowerCase() === "member") {
          window.location.assign(new URL(spaPath("member"), window.location.origin).href);
          return;
        }

        // Permissions check
        if (!canAccessTransactionFormulaMaintenance(u)) {
          navigate(spaPath("dashboard"), { replace: true });
          return;
        }

        const filtered = await fetchOwnerCompaniesAll();
        if (cancelled) return;
        setCompanies(filtered);

        // Set Initial Company
        let initialCompanyId = resolveBootCompanyId({
          sessionCompanyId: u.company_id,
          defaultRowId: filtered[0]?.id,
        });

        if (
          initialCompanyId &&
          !filtered.some((c) => Number(c.id) === initialCompanyId)
        ) {
          initialCompanyId = resolveBootCompanyId({ defaultRowId: filtered[0]?.id });
        }

        const currentComp =
          initialCompanyId != null
            ? filtered.find((c) => Number(c.id) === initialCompanyId) || null
            : null;
        const bootGroup =
          resolveInitialSelectedGroupFromSession(filtered, currentComp, u) ??
          readInitialMaintenanceSelectedGroup();
        if (bootGroup) setSelectedGroup(bootGroup);
        const persistedGc = readPersistedDashboardGcFilter();
        const initialUiCompanyId = readInitialMaintenanceCompanyId();
        const sessionGroup = readInitialMaintenanceSelectedGroup();
        const groupOnlyBoot =
          isDashboardGroupOnlyMode() ||
          persistedGc.groupOnly ||
          (bootGroup != null && initialUiCompanyId == null) ||
          (sessionGroup != null && initialUiCompanyId == null);

        const runGroupOnlyBoot = async () => {
          persistDashboardGroupOnlyMode(true);
          persistDashboardSelectedCompany(null);
          setCompanyId(null);
          setCompanyCode("");

          try {
            const synced = await syncTransactionMaintenanceGroupAnchorSession(
              filtered,
              bootGroup,
              u.company_id,
              { notify: false },
            );
            if (synced && bootGroup) {
              const anchor =
                pickDefaultSubsidiaryForGroup(filtered, bootGroup, {
                  preferredCompanyId: u.company_id,
                }) ?? pickGroupAnchorCompany(filtered, bootGroup);
              if (anchor?.id) markAnchorSyncedRef.current(bootGroup, anchor.id);
            }
          } catch (err) {
            console.error("Group anchor session sync error:", err);
          }

          const bootScope = resolveTransactionMaintenanceScope({
            companies: filtered,
            selectedGroup: bootGroup,
            companyId: null,
          });
          const meta = await bootstrapTransactionMaintenanceMeta({
            companies: filtered,
            groupId: bootGroup,
          });
          if (cancelled) return;
          const nextPerm =
            meta.activePermission ||
            pickTransactionMaintenancePermission(meta.permissions, null);
          setPermissions(meta.permissions);
          setActivePermission(nextPerm);
          pendingBootSearchRef.current = { scope: bootScope, category: nextPerm };
          try {
            const procList = bootScope
              ? await fetchProcessesForPermission(null, nextPerm, bootScope)
              : [];
            if (!cancelled) setProcesses(procList);
          } catch (err) {
            console.error("Process list load error:", err);
          }
          if (bootGroup) sessionStorage.setItem("dashboard_group_filter", bootGroup);
          skipMetaAfterBootRef.current = true;
          handledMetaScopeKeyRef.current = buildMaintenanceMetaEffectKey(
            transactionMaintenanceScopeCacheKey(bootScope),
            null,
            "",
            bootGroup,
          );
        };

        if (groupOnlyBoot) {
          await runGroupOnlyBoot();
          return;
        }

        if (initialCompanyId != null) {
          setCompanyId(initialCompanyId);
        }

        if (currentComp) {
          const code = currentComp.company_id || "";
          setCompanyCode(code);

          // Fetch permissions first to pick the correct category for downstream APIs.
          const companyPerms = await fetchCompanyPermissions(code);

          const hasGames = companyPerms.includes("Games") || companyPerms.includes("Gambling");
          const bankOnly = companyPerms.includes("Bank") && !hasGames;
          if (bankOnly) {
            navigate(spaPath("dashboard"), { replace: true });
            return;
          }
          if (!hasGames) {
            navigate(spaPath("dashboard"), { replace: true });
            return;
          }

          try {
            await updateSessionCompany(initialCompanyId);
          } catch (err) {
            console.error("Session company sync error:", err);
          }
          if (cancelled) return;

          setPermissions(companyPerms);

          const savedPerm = localStorage.getItem(`selectedPermission_${code}`);
          const initialActive = pickTransactionMaintenancePermission(companyPerms, savedPerm);
          setActivePermission(initialActive);

          const bootScope = resolveTransactionMaintenanceScope({
            companies: filtered,
            selectedGroup: bootGroup,
            companyId: initialCompanyId,
          });
          pendingBootSearchRef.current = { scope: bootScope, category: initialActive };
          try {
            const procList = await fetchProcessesForPermission(
              initialCompanyId,
              initialActive,
              bootScope,
            );
            if (!cancelled) setProcesses(procList);
          } catch (err) {
            console.error("Process list load error:", err);
          }

          // Cache permissions so the meta-effect below skips redundant API call
          switchPermsCacheRef.current = { companyCode: code, perms: companyPerms };
          skipMetaAfterBootRef.current = true;
          handledMetaScopeKeyRef.current = buildMaintenanceMetaEffectKey(
            transactionMaintenanceScopeCacheKey(
              resolveTransactionMaintenanceScope({
                companies: filtered,
                selectedGroup: bootGroup,
                companyId: initialCompanyId,
              }),
            ),
            initialCompanyId,
            code,
            bootGroup,
          );

          if (bootGroup) sessionStorage.setItem("dashboard_group_filter", bootGroup);
        } else if (bootGroup) {
          await runGroupOnlyBoot();
        }

      } catch (err) {
        console.error("Boot error:", err);
        if (!cancelled && runId === bootRunIdRef.current) navigate(spaPath("login"), { replace: true });
      } finally {
        if (!cancelled && runId === bootRunIdRef.current) {
          const pending = pendingBootSearchRef.current;
          pendingBootSearchRef.current = null;
          if (pending?.scope) {
            suppressNextSearchEffectRef.current = true;
            await runBootMaintenanceSearch(pending);
          }
          setFiltersReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionReady, navigate, me?.user_id]);

  // -- Load Meta Data (Processes & Permissions) on filter change --
  useEffect(() => {
    if (!filtersReady || !transactionMaintenanceScopeIsReady(transactionScope)) return;

    const scopeKey = buildMaintenanceMetaEffectKey(
      transactionScopeKey,
      companyId,
      companyCode,
      selectedGroup,
    );
    if (skipMetaAfterBootRef.current) {
      skipMetaAfterBootRef.current = false;
      handledMetaScopeKeyRef.current = scopeKey;
      return;
    }
    if (handledMetaScopeKeyRef.current === scopeKey) return;
    handledMetaScopeKeyRef.current = scopeKey;

    let cancelled = false;
    const scope = transactionScope;
    const cid = companyId;
    const permCode =
      companyCode ||
      (selectedGroup
        ? companiesInGroupList(companies, selectedGroup)[0]?.company_id
        : "") ||
      "";

    (async () => {
      try {
        const cached = switchPermsCacheRef.current;
        let permList;
        if (cached && cached.companyCode === permCode) {
          permList = cached.perms;
          switchPermsCacheRef.current = null;
        } else if (permCode) {
          permList = await fetchCompanyPermissions(permCode);
        } else {
          permList = filterTransactionMaintenancePermissions(["Games", "Gambling", "Bank"]);
        }
        if (cancelled) return;
        setPermissions(permList);

        const nextPerm = pickTransactionMaintenancePermission(
          permList,
          permCode ? localStorage.getItem(`selectedPermission_${permCode}`) : null,
        );
        setActivePermission(nextPerm);

        try {
          const procList = await fetchProcessesForPermission(cid, nextPerm, scope);
          if (cancelled) return;
          setProcesses(procList);
          const usesGroup = transactionMaintenanceUsesGroupProcesses(scope);
          setSelectedProcess((prev) => {
            const filter = normalizeMaintenanceProcessFilter(prev);
            if (!filter) return "";
            if (usesGroup) {
              return procList.some((p) => String(p.id) === String(filter)) ? filter : "";
            }
            return procList.some((p) => String(p.process_name) === filter) ? filter : "";
          });
        } catch (err) {
          if (cancelled) return;
          console.error("Process list load error:", err);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Meta data load error:", err);
        notify(t("failedLoadMetaData"), "error");
        setActivePermission((prev) =>
          prev || pickTransactionMaintenancePermission(["Games", "Gambling", "Bank"], null),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    filtersReady,
    transactionScope,
    transactionScopeKey,
    companyId,
    companyCode,
    selectedGroup,
    companies,
    notify,
    t,
  ]);

  // -- Handlers --
  const handleDateRangeChange = useCallback((start, end) => {
    const nextFrom = formatDmyFromYmd(start);
    const nextTo = formatDmyFromYmd(end);
    if (!nextFrom || !nextTo) return;
    if (nextFrom === dateFrom && nextTo === dateTo) return;
    const quietRefresh = initialSearchDoneRef.current;
    if (!quietRefresh) {
      setTransactionData([]);
      setMaintenanceDataComplete(false);
      setListLoading(true);
      setListSyncing(false);
    } else {
      setListLoading(false);
      setListSyncing(true);
    }
    setSearchError(null);
    setDateFrom(nextFrom);
    setDateTo(nextTo);
  }, [dateFrom, dateTo]);

  const handleClearCompany = useCallback((groupForPersist) => {
    const g = groupForPersist ?? selectedGroup;
    const nextScope = resolveTransactionMaintenanceScope({
      companies,
      selectedGroup: g,
      companyId: null,
      groupsAllMode,
      groupAllMode,
    });
    resetAnchorSessionRef();
    switchPermsCacheRef.current = null;
    handledMetaScopeKeyRef.current = "";
    suppressNextSearchEffectRef.current = true;
    setCompanyId(null);
    setCompanyCode("");
    setSelectedProcess("");
    setTransactionData([]);
    setMaintenanceDataComplete(false);
    setListLoading(true);
    setListSyncing(false);
    persistDashboardFilterState(g, null);
    void (async () => {
      try {
        const synced = await syncTransactionMaintenanceGroupAnchorSession(
          companies,
          g,
          me?.company_id,
          { notify: false },
        );
        if (synced && g) {
          const anchor =
            pickDefaultSubsidiaryForGroup(companies, g, {
              preferredCompanyId: me?.company_id,
            }) ?? pickGroupAnchorCompany(companies, g);
          if (anchor?.id) markAnchorSyncedRef.current(g, anchor.id);
        }
        await performMaintenanceSearch({
          scope: nextScope,
          selectedGroup: g,
          companyId: null,
        });
      } catch (syncErr) {
        console.error("Group anchor session sync after clear company:", syncErr);
        await performMaintenanceSearch({
          scope: nextScope,
          selectedGroup: g,
          companyId: null,
        });
      }
    })();
  }, [
    companies,
    selectedGroup,
    groupsAllMode,
    groupAllMode,
    me?.company_id,
    resetAnchorSessionRef,
    performMaintenanceSearch,
  ]);

  const onPrepareCompanySelect = useCallback((c) => {
    if (!c?.id) return;
    const nextCompanyId = Number(c.id);
    const code = c.company_id || "";
    const newGroup = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
    switchPermsCacheRef.current = null;
    resetAnchorSessionRef();
    suppressNextSearchEffectRef.current = true;
    if (initialSearchDoneRef.current) {
      setListLoading(false);
      setListSyncing(true);
    }
    setSelectedGroup(newGroup);
    setCompanyCode(code);
    setCompanyId(nextCompanyId);
    setSelectedProcess("");
    persistDashboardFilterState(newGroup, nextCompanyId);
  }, [resetAnchorSessionRef]);

  onPrepareCompanySelectRef.current = onPrepareCompanySelect;

  const handleSwitchCompany = useCallback(async (c) => {
    if (!c?.id) return;
    const nextCompanyId = Number(c.id);
    const code = c.company_id || "";
    const newGroup = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
    const savedPerm = localStorage.getItem(`selectedPermission_${code}`);

    if (initialSearchDoneRef.current) {
      setListLoading(false);
      setListSyncing(true);
    }

    try {
      const { redirected } = await runMaintenanceCompanySwitch({
        companyRow: c,
        viewGroup: newGroup ?? null,
        currentPath: location.pathname,
        navigate,
        updateSessionCompany,
        onStay: async () => {
          const perms = await fetchCompanyPermissions(code);
          const nextActive = pickTransactionMaintenancePermission(perms, savedPerm);
          switchPermsCacheRef.current = { companyCode: code, perms };
          setActivePermission(nextActive);
          setPermissions(perms);
          handledMetaScopeKeyRef.current = "";

          try {
            const nextScope = resolveTransactionMaintenanceScope({
              companies,
              selectedGroup: newGroup,
              companyId: nextCompanyId,
              groupsAllMode,
              groupAllMode,
            });
            const procList = await fetchProcessesForPermission(nextCompanyId, nextActive, nextScope);
            setProcesses(procList);
            setSelectedProcess("");
            suppressNextSearchEffectRef.current = true;
            await performMaintenanceSearch({ scope: nextScope, category: nextActive });
          } catch (err) {
            console.error("Process list load error:", err);
            setListSyncing(false);
          }

          followGroupRef.current();
          notify(t("switchedTo", { company: c.company_id }), "success");
        },
      });
      if (redirected) {
        setListSyncing(false);
        return;
      }
    } catch (err) {
      setListSyncing(false);
      const msg = String(err?.message || "");
      if (msg.toLowerCase().includes("unauthorized permission category")) {
        navigate(spaPath("dashboard"), { replace: true });
        return;
      }
      notify(err.message || t("switchFailed"), "error");
    }
  }, [companies, groupsAllMode, groupAllMode, location.pathname, navigate, notify, performMaintenanceSearch, t]);

  switchCompanyRef.current = handleSwitchCompany;
  onClearCompanyRef.current = handleClearCompany;

  followGroupRef.current = () => {};

  const handlePermissionSwitch = (p) => {
    setActivePermission(p);
    localStorage.setItem(`selectedPermission_${companyCode}`, p);
  };

  const showTopLoadingBar = listLoading;

  return (
    <div className="container">
      {visiblePermissions.length > 1 ? (
      <div className="maintenance-header">
          <div id="maintenance-permission-filter" className="maintenance-permission-filter-header">
            <span className="maintenance-company-label">{m.category}</span>
            <div id="maintenance-permission-buttons" className="maintenance-company-buttons">
              {visiblePermissions.map(p => (
                <button 
                  key={p} 
                  type="button" 
                  className={`maintenance-company-btn ${p === activePermission ? 'active' : ''}`}
                  onClick={() => handlePermissionSwitch(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
      </div>
      ) : null}

      <div className="transaction-maintenance-page-root">
        <TransactionMaintenanceFilters 
          processes={processes}
          selectedProcess={selectedProcess}
          setSelectedProcess={setSelectedProcess}
          processValueMode={
            transactionMaintenanceUsesGroupProcesses(transactionScope) ? "id" : "processName"
          }
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateRangeChange={handleDateRangeChange}
          today={todayDmy}
          companyId={companyId}
          companies={companies}
          snapGroupIds={snapGroupIds}
          visibleCompanies={visibleCompanies}
          selectedGroup={selectedGroup}
          onGroupClick={handleGroupClick}
          onPickCompany={handlePickCompany}
          onPickAllGroups={handlePickAllGroups}
          onPickAllInGroup={handlePickAllInGroup}
          groupsAllMode={groupsAllMode}
          groupAllMode={groupAllMode}
          onClearCompany={handleClearCompany}
          allowClearCompany={allowClearCompany}
          m={m}
        />

        <div className="transaction-maintenance-table-region">
          {listSyncing && (
            <div className="transaction-maintenance-sync-track" aria-hidden>
              <div className="transaction-maintenance-sync-bar" />
            </div>
          )}
          <TransactionMaintenanceTable
            data={transactionData}
            showSkeleton={showListSkeleton && !listSyncing}
            showEmptyState={showNoDataEmpty}
            statusMessage={listStatusMessage}
            showTopLoading={showTopLoadingBar}
            topLoadingLabel={listStatusMessage || t("loading")}
            listSyncing={listSyncing}
            dataIncomplete={!maintenanceDataComplete && listRowCount > 0}
            scrollResetKey={searchQueryKey}
            m={m}
          />
        </div>
      </div>

      {/* Notifications */}
      <div id="notificationContainer" className="maintenance-notification-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`maintenance-notification maintenance-notification-${toast.type} show`}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
