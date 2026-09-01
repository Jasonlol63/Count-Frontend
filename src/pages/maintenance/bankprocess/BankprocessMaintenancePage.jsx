import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { removeOtherMaintenanceStylesheets } from "../../../utils/maintenance/maintenanceStylesheets.js";
import { injectStylesheet } from "../../../utils/core/injectStylesheet.js";
import { ensureMaintenanceDateRangePicker } from "../../../utils/date/dateRangePicker.js";
import { useMaintenanceGroupCompanyFilter } from "../shared/useMaintenanceGroupCompanyFilter.js";
import { runMaintenanceCompanySwitch, syncMaintenanceBootSidebar } from "../shared/maintenanceCompanySwitch.js";
import { useMaintenancePageScrollLock } from "../shared/useMaintenancePageScrollLock.js";
import { spaPath } from "../../../utils/routing/pageRoutes.js";
import {
  isMaintenanceGroupOnlyBoot,
  isMaintenanceSessionGroupEntityBoot,
} from "../shared/maintenanceGroupBoot.js";
import { canUseGroupOnlyMode, isGroupLogin } from "../../../utils/company/loginScope.js";
import {
  DASHBOARD_GROUP_FILTER_KEY,
  DASHBOARD_GROUP_FILTER_OPT_OUT_KEY,
  isDashboardGroupOnlyMode,
  persistDashboardFilterState,
  persistDashboardGroupOnlyMode,
  persistDashboardSelectedCompany,
  readDashboardSelectedCompanyId,
  readPersistedDashboardGcFilter,
  resolveBootCompanyId,
  resolveInitialSelectedGroupFromSession,
  clearDashboardSelectedCurrency,
} from "../../../utils/company/sharedCompanyFilter.js";
import { useCrossPageCurrencySync } from "../../../utils/company/useCrossPageCurrencySync.js";
import "../../../../public/css/accountCSS.css";
import "../../../../public/css/userlist.css";
import "../../../../public/css/date-range-picker.css";
import "../../../../public/css/customer_report.css";
import "../../../../public/css/report-outlined-fields.css";
import "../../../../public/css/bankprocess_maintenance.css";
import "../../../../public/css/maintenance_notifications.css";
import "../../../../public/css/maintenance_unified_filters.css";
import BankprocessMaintenanceFilters from "./components/BankprocessMaintenanceFilters.jsx";
import BankprocessMaintenanceTable from "./components/BankprocessMaintenanceTable.jsx";
import MaintenanceDeleteConfirmModal from "../shared/MaintenanceDeleteConfirmModal.jsx";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";
import { fetchOwnerCompaniesAll } from "../../../utils/company/sharedCompanyFilter.js";
import {
  deleteBankprocessData,
  fetchCompanyCurrencies,
  formatDmy,
  isBankprocessMaintenanceRowSelectable,
  searchBankprocessData,
  toggleBankprocessMaintenanceBatchSelection,
  updateSessionCompany,
} from "./bankprocessMaintenanceLogic.js";
import {
  mergeCurrencyCodesWithSavedOrder,
  persistCurrencyDisplayOrder,
  persistUserCurrencyDisplayOrder,
  resolveSavedCurrencyOrder,
} from "../../../utils/company/currencyDisplayOrder.js";
import { saveUserCurrencyOrder } from "../../transaction/lib/transactionApi.js";
import { notifyTransactionListInvalidated } from "../../transaction/lib/transactionPaymentLogic.js";
import { useLoginLang } from "../../../utils/i18n/useLoginLang.js";
import { getMaintenanceText, MAINTENANCE_I18N } from "../../../translateFile/pages/maintenanceTranslate.js";
import { useRealtimeDomain } from "../../../lib/realtime/useRealtimeDomain.js";
import { REALTIME_DOMAINS } from "../../../lib/realtime/realtimeEvents.js";

/** Dedupe empty-result toast (Strict Mode remount + back-to-back searches with same filters). */
const bankprocessNoDataToastKeys = new Set();
const MAX_NO_DATA_TOAST_KEYS = 64;

function consumeNoDataToastDedupeKey(key) {
  if (!key || bankprocessNoDataToastKeys.has(key)) return false;
  bankprocessNoDataToastKeys.add(key);
  while (bankprocessNoDataToastKeys.size > MAX_NO_DATA_TOAST_KEYS) {
    const first = bankprocessNoDataToastKeys.values().next().value;
    bankprocessNoDataToastKeys.delete(first);
  }
  return true;
}

/** Apply the shared cross-page order (user-global → scope) to fetched currency rows. */
function orderBankprocessCurrencyRows(list, companyId) {
  if (!Array.isArray(list) || list.length === 0) return list || [];
  const n = Number(companyId);
  const orderKey = Number.isFinite(n) && n > 0 ? n : null;
  if (orderKey == null) return list;
  const savedOrder = resolveSavedCurrencyOrder(orderKey, null);
  if (!savedOrder?.length) return list;
  const byCode = new Map(list.map((row) => [String(row?.code || "").toUpperCase(), row]));
  const codes = mergeCurrencyCodesWithSavedOrder(
    list.map((row) => row?.code),
    savedOrder,
  );
  const ordered = codes.map((code) => byCode.get(code)).filter(Boolean);
  return ordered.length ? ordered : list;
}

export default function BankprocessMaintenancePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { me, sessionReady } = useAuthSession();
  const lang = useLoginLang();
  const m = useMemo(() => MAINTENANCE_I18N[lang] || MAINTENANCE_I18N.en, [lang]);
  const t = useCallback((key, params) => getMaintenanceText(lang, key, params), [lang]);
  useMaintenancePageScrollLock();
  const [bootLoading, setBootLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [companyCode, setCompanyCode] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [currencies, setCurrencies] = useState([]);
  /** true = omit currency API param — all company currencies */
  const [allCurrenciesSelected, setAllCurrenciesSelected] = useState(false);
  const [selectedCurrencies, setSelectedCurrencies] = useState([]);
  const [currenciesReady, setCurrenciesReady] = useState(false);
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rows, setRows] = useState([]);
  const [bankprocessListEpoch, setBankprocessListEpoch] = useState(0);
  const [bankprocessDataSourceCompanyId, setBankprocessDataSourceCompanyId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [listSyncing, setListSyncing] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [datePickerScriptReady, setDatePickerScriptReady] = useState(false);
  const today = useMemo(() => formatDmy(new Date()), []);
  const currentCompanyIdRef = useRef(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const initialBankprocessSearchDoneRef = useRef(false);
  const searchSeqRef = useRef(0);
  const searchAbortRef = useRef(null);
  /** True right after the user explicitly picks "All" currencies — tells useCrossPageCurrencySync not to re-apply a persisted/default currency. */
  const userSelectedAllCurrencyRef = useRef(false);

  const notify = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => {
      if (prev.some(t => t.message === message)) return prev;
      const next = [...prev, { id, message, type }];
      return next.length > 2 ? next.slice(1) : next;
    });
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 2000);
  }, []);

  useEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "datacapture-page", "transaction-page");
    document.body.classList.add("dashboard-page", "maintenance-page");
    setDateFrom(today);
    setDateTo(today);

    const setup = async () => {
      removeOtherMaintenanceStylesheets("bankprocess_maintenance.css");
      const links = [
        "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap",
        "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css",
      ];
      await Promise.all(links.map((href) => injectStylesheet(href, { promoteToEnd: true }).catch(() => null)));
    };

    setup().catch(() => null);
    return () => {
      document.body.classList.remove("maintenance-page");
    };
  }, [today]);

  useEffect(() => {
    if (bootLoading || !me) return;
    window.MaintenanceDateRangePicker?.setLocaleStrings?.({
      placeholder: t("selectDateRange"),
      selectEndDateHint: t("selectEndDate"),
      monthLabels: m.monthsShort,
    });
  }, [bootLoading, me, lang, t, m]);

  useEffect(() => {
    if (!sessionReady || !me) return;

    let cancelled = false;
    setBootLoading(true);
    (async () => {
      try {
        const allRows = await fetchOwnerCompaniesAll({ me });
        const compRows = allRows.filter((c) => c.company_id);
        if (cancelled) return;

        const user = me;
        if (String(user.user_type || "").toLowerCase() === "member") {
          window.location.assign(new URL(spaPath("member"), window.location.origin).href);
          return;
        }
        const userPerms = Array.isArray(user.permissions) ? user.permissions : [];
        const hasFull = userPerms.length === 0;
        const canMaintenance = hasFull || userPerms.includes("maintenance");
        // Group login session is Games-only (company_has_bank=false); still allow entry to pick a Bank subsidiary.
        const allowBankPage =
          Boolean(user.company_has_bank) || canUseGroupOnlyMode(user) || isGroupLogin(user);
        if (!canMaintenance || !allowBankPage) {
          navigate(spaPath("dashboard"), { replace: true });
          return;
        }

        setCompanies(compRows);

        const groupFilterOptOut =
          typeof sessionStorage !== "undefined" &&
          sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1";
        const persistedGc = readPersistedDashboardGcFilter();
        let initialUiCompanyId = null;
        try {
          if (!(isDashboardGroupOnlyMode() || persistedGc.groupOnly)) {
            initialUiCompanyId = readDashboardSelectedCompanyId();
          }
        } catch {
          initialUiCompanyId = null;
        }
        let initialCompanyId = resolveBootCompanyId({
          sessionCompanyId: user.company_id,
          defaultRowId: compRows[0]?.id,
        });
        if (
          initialCompanyId &&
          !compRows.some((c) => Number(c.id) === Number(initialCompanyId))
        ) {
          initialCompanyId = resolveBootCompanyId({ defaultRowId: compRows[0]?.id });
        }
        if (groupFilterOptOut && initialUiCompanyId != null) {
          initialCompanyId = initialUiCompanyId;
        } else if (
          !groupFilterOptOut &&
          (isDashboardGroupOnlyMode() || persistedGc.groupOnly)
        ) {
          initialCompanyId = null;
        } else if (initialUiCompanyId != null) {
          initialCompanyId = initialUiCompanyId;
        }
        const currentComp =
          initialCompanyId != null
            ? compRows.find((c) => Number(c.id) === Number(initialCompanyId))
            : null;
        let sessionGroup = null;
        try {
          const saved = sessionStorage.getItem(DASHBOARD_GROUP_FILTER_KEY);
          sessionGroup = saved ? String(saved).trim().toUpperCase() : null;
        } catch {
          sessionGroup = null;
        }
        const bootGroup = groupFilterOptOut
          ? null
          : resolveInitialSelectedGroupFromSession(compRows, currentComp, user);
        setSelectedGroup(bootGroup);
        let groupOnlyBoot = isMaintenanceGroupOnlyBoot({
          groupFilterOptOut,
          sessionGroup: bootGroup ?? sessionGroup,
          initialUiCompanyId,
          persistedGc,
        });
        if (
          !groupOnlyBoot &&
          !groupFilterOptOut &&
          (isMaintenanceSessionGroupEntityBoot(currentComp, user) ||
            (bootGroup && initialUiCompanyId == null && canUseGroupOnlyMode(user, bootGroup)))
        ) {
          groupOnlyBoot = true;
        }
        // Bankprocess has no Group ledger — keep Group-only UI until user (or auto-pick) selects a Bank company.
        if (groupOnlyBoot || initialCompanyId == null) {
          if (groupOnlyBoot) {
            persistDashboardGroupOnlyMode(true);
            persistDashboardSelectedCompany(null);
          }
          setCompanyId(null);
          currentCompanyIdRef.current = null;
          setCompanyCode("");
          setCurrenciesReady(true);
          const effectiveGroup = bootGroup ?? sessionGroup;
          if (effectiveGroup) {
            sessionStorage.setItem("dashboard_group_filter", effectiveGroup);
          }
          return;
        }
        setCompanyId(initialCompanyId);
        currentCompanyIdRef.current = initialCompanyId;
        setCompanyCode(currentComp?.company_id || "");

        const currencyList = await fetchCompanyCurrencies(initialCompanyId).catch(() => []);
        setCurrencies(orderBankprocessCurrencyRows(currencyList, initialCompanyId));
        if (currencyList.length === 0) {
          setAllCurrenciesSelected(true);
          setSelectedCurrencies([]);
        } else {
          setAllCurrenciesSelected(false);
          const myr = currencyList.find((x) => x.code === "MYR");
          const pick = myr?.code || currencyList[0]?.code;
          setSelectedCurrencies(pick ? [pick] : []);
        }
        setCurrenciesReady(true);

        if (bootGroup) {
          sessionStorage.setItem("dashboard_group_filter", bootGroup);
        } else {
          sessionStorage.removeItem("dashboard_group_filter");
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
  }, [sessionReady, navigate, me?.user_id]);

  useEffect(() => {
    if (bootLoading || !companyId || !companies.length) return;
    const id = Number(companyId);
    if (!Number.isFinite(id) || id <= 0) return;
    if (sidebarSyncedCompanyIdRef.current === id) return;

    const row = companies.find((c) => Number(c.id) === id);
    if (!row?.id) return;

    let cancelled = false;
    sidebarSyncedCompanyIdRef.current = id;
    void (async () => {
      try {
        await syncMaintenanceBootSidebar({
          companyRow: row,
          viewGroup: selectedGroup,
          updateSessionCompany: (cid) => updateSessionCompany(Number(cid)),
          sessionCompanyId: me?.company_id,
        });
      } finally {
        if (cancelled) sidebarSyncedCompanyIdRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bootLoading, companyId, companies, selectedGroup, me?.company_id]);

  useEffect(() => {
    if (bootLoading || !companyId || !companyCode) return;
    let cancelled = false;
    setCurrenciesReady(false);
    (async () => {
      const currencyList = await fetchCompanyCurrencies(companyId).catch(() => []);
      if (cancelled) return;
      setCurrencies(orderBankprocessCurrencyRows(currencyList, companyId));
      if (currencyList.length === 0) {
        setAllCurrenciesSelected(true);
        setSelectedCurrencies([]);
      } else {
        setAllCurrenciesSelected(false);
        const myr = currencyList.find((x) => x.code === "MYR");
        const pick = myr?.code || currencyList[0]?.code;
        setSelectedCurrencies(pick ? [pick] : []);
      }
      setCurrenciesReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [bootLoading, companyId, companyCode]);

  /** 与 Payment Maintenance 一致：筛选变更自动查询；seq + abort 避免重复 toast */
  const performSearch = useCallback(async () => {
    if (!dateFrom || !dateTo) {
      notify(t("pleaseSelectDateRange"), "error");
      return;
    }
    if (!companyId) return;
    if (!currenciesReady) return;
    if (!allCurrenciesSelected && selectedCurrencies.length === 0) return;

    const searchCompanyId = Number(companyId);
    const quietRefresh = initialBankprocessSearchDoneRef.current;

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    const seq = ++searchSeqRef.current;

    if (!quietRefresh) setLoading(true);
    else {
      setLoading(false);
      setListSyncing(true);
    }
    setSelectedIds([]);

    const currencyKey = allCurrenciesSelected ? "ALL" : selectedCurrencies.slice().sort().join(",");

    try {
      const data = await searchBankprocessData({
        dateFrom,
        dateTo,
        companyId,
        currencyCodes: selectedCurrencies,
        allCurrencies: allCurrenciesSelected,
        query,
        signal: controller.signal,
      });
      if (seq !== searchSeqRef.current) return;
      if (searchCompanyId !== Number(currentCompanyIdRef.current)) return;

      setBankprocessListEpoch((e) => e + 1);
      setRows(data);
      setBankprocessDataSourceCompanyId(searchCompanyId);
      setHasSearched(true);
      setConfirmDelete(false);
      if (!quietRefresh) {
        if (data.length > 0) {
          notify(t("foundRecords", { n: data.length }), "success");
        } else {
          const dedupeKey = `${searchCompanyId}|${dateFrom}|${dateTo}|${currencyKey}|${query}|empty`;
          if (consumeNoDataToastDedupeKey(dedupeKey)) {
            notify(t("noDataAdjustSearch"), "info");
          }
        }
      }
    } catch (err) {
      if (err?.name === "AbortError" || seq !== searchSeqRef.current) return;
      if (searchCompanyId !== Number(currentCompanyIdRef.current)) return;
      setBankprocessListEpoch((e) => e + 1);
      setRows([]);
      setBankprocessDataSourceCompanyId(null);
      setHasSearched(true);
      notify(err.message || t("searchFailed"), "error");
    } finally {
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = null;
      }
      if (seq === searchSeqRef.current) {
        initialBankprocessSearchDoneRef.current = true;
        setLoading(false);
        setListSyncing(false);
      }
    }
  }, [
    dateFrom,
    dateTo,
    companyId,
    currenciesReady,
    allCurrenciesSelected,
    selectedCurrencies,
    query,
    notify,
    t,
  ]);

  useRealtimeDomain(REALTIME_DOMAINS.MAINTENANCE, () => {
    void performSearch();
  }, { enabled: !bootLoading && Boolean(companyId) && currenciesReady });

  useEffect(() => {
    if (bootLoading || !companyId || !dateFrom || !dateTo || !currenciesReady) return;
    if (!allCurrenciesSelected && selectedCurrencies.length === 0) return;
    const h = setTimeout(() => {
      void performSearch();
    }, 0);
    return () => clearTimeout(h);
  }, [
    bootLoading,
    companyId,
    currenciesReady,
    allCurrenciesSelected,
    selectedCurrencies,
    dateFrom,
    dateTo,
    query,
    performSearch,
  ]);

  useEffect(
    () => () => {
      searchAbortRef.current?.abort();
    },
    [],
  );

  const followGroupRef = useRef(() => {});

  const handleClearCompany = useCallback(() => {
    setCompanyId(null);
    setCompanyCode("");
    setSelectedIds([]);
    setRows([]);
    setHasSearched(false);
    currentCompanyIdRef.current = null;
  }, []);

  const switchCompanyRef = useRef(async () => {});
  const onPrepareCompanySelectRef = useRef(() => {});
  const sidebarSyncedCompanyIdRef = useRef(null);

  const onPrepareCompanySelect = useCallback((targetCompany) => {
    if (!targetCompany?.id) return;
    const nextId = Number(targetCompany.id);
    const newGroup = targetCompany.group_id
      ? String(targetCompany.group_id).toUpperCase().trim()
      : null;
    setCompanyId(nextId);
    setCompanyCode(targetCompany.company_id || "");
    setSelectedGroup(newGroup);
    persistDashboardFilterState(newGroup, nextId);
    currentCompanyIdRef.current = nextId;
    followGroupRef.current();
  }, []);

  onPrepareCompanySelectRef.current = onPrepareCompanySelect;

  const handleSwitchCompany = useCallback(async (targetCompany) => {
    if (!targetCompany?.id) return;
    try {
      const { redirected } = await runMaintenanceCompanySwitch({
        companyRow: targetCompany,
        viewGroup: targetCompany.group_id
          ? String(targetCompany.group_id).trim().toUpperCase()
          : selectedGroup,
        currentPath: location.pathname,
        navigate,
        updateSessionCompany: (id) => updateSessionCompany(Number(id)),
        onStay: async () => {},
      });
      if (redirected) return;
    } catch (err) {
      notify(err.message || t("switchFailed"), "error");
    }
  }, [location.pathname, navigate, notify, selectedGroup, t]);

  switchCompanyRef.current = handleSwitchCompany;

  const {
    snapGroupIds: groupedIdsFromHook,
    visibleCompanies,
    handleGroupClick: onGroupClick,
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
    onClearCompany: handleClearCompany,
    pillCategory: "bank",
  });

  followGroupRef.current = () => {};

  const groupedIds = groupedIdsFromHook;

  // 纯 Bank 组：无 Bank 公司的组不显示；当前组无公司时自动切组并选中首个 Bank 公司。
  useEffect(() => {
    if (bootLoading || !companies.length) return;

    if (visibleCompanies.length > 0) {
      const cid = Number(companyId);
      const activeOk = visibleCompanies.some((c) => Number(c.id) === cid);
      if (!activeOk) void handlePickCompany(visibleCompanies[0]);
      return;
    }

    if (!groupedIds.length) return;
    const fallbackGroup = groupedIds[0];
    if (!fallbackGroup) return;
    if (String(selectedGroup || "").trim().toUpperCase() !== fallbackGroup) {
      void onGroupClick(fallbackGroup);
    }
  }, [
    bootLoading,
    companies.length,
    groupedIds,
    visibleCompanies,
    companyId,
    selectedGroup,
    onGroupClick,
    handlePickCompany,
  ]);

  // -- Cross-page currency selection sync (Dashboard / Transaction / Reports / etc.) --
  const bankprocessCurrencyCodes = useMemo(
    () => currencies.map((row) => row?.code).filter(Boolean),
    [currencies],
  );
  const applyCrossPageCurrency = useCallback((code) => {
    userSelectedAllCurrencyRef.current = false;
    setAllCurrenciesSelected(false);
    setSelectedCurrencies([code]);
  }, []);
  const { persistSelection: persistCrossPageCurrency } = useCrossPageCurrencySync({
    enabled: bankprocessCurrencyCodes.length > 0 && Boolean(companyId),
    companyId:
      Number.isFinite(Number(companyId)) && Number(companyId) > 0 ? Number(companyId) : null,
    selectedGroup,
    availableCodes: bankprocessCurrencyCodes,
    currentCode:
      !allCurrenciesSelected && selectedCurrencies.length === 1 ? selectedCurrencies[0] : "",
    onApplyCode: applyCrossPageCurrency,
    respectEmptyRef: userSelectedAllCurrencyRef,
  });

  const toggleBankprocessCurrency = useCallback(
    (code) => {
      if (!code) return;
      userSelectedAllCurrencyRef.current = false;
      setAllCurrenciesSelected(false);
      const prev = selectedCurrencies;
      const has = prev.includes(code);
      let next;
      if (has) {
        next = prev.filter((c) => c !== code);
        next = next.length > 0 ? next : prev;
      } else {
        next = [...prev, code];
      }
      setSelectedCurrencies(next);
      // Broadcast so every page follows the currency the user just switched to.
      if (next.length >= 1) persistCrossPageCurrency(next[next.length - 1]);
      else clearDashboardSelectedCurrency();
    },
    [selectedCurrencies, persistCrossPageCurrency],
  );

  /** Drag reorder — writes the shared cross-page order so every page follows. */
  const handleCurrencyDropOn = useCallback(
    async (e, targetCode) => {
      e.preventDefault();
      const dragged = e.dataTransfer?.getData("text/plain");
      if (!dragged || !targetCode || dragged === targetCode) return;
      const list = [...currencies];
      const fromI = list.findIndex((row) => row?.code === dragged);
      const toI = list.findIndex((row) => row?.code === targetCode);
      if (fromI < 0 || toI < 0 || fromI === toI) return;
      const next = [...list];
      const [moved] = next.splice(fromI, 1);
      next.splice(toI, 0, moved);
      setCurrencies(next);
      const codes = next.map((row) => row?.code).filter(Boolean);
      persistUserCurrencyDisplayOrder(codes);
      const cid = Number(companyId);
      if (Number.isFinite(cid) && cid > 0) {
        persistCurrencyDisplayOrder(cid, codes);
        try {
          await saveUserCurrencyOrder(codes, { companyId: cid });
        } catch {
          /* localStorage already updated on drag */
        }
      }
    },
    [currencies, companyId],
  );

  const selectAllBankprocessCurrencies = useCallback(() => {
    userSelectedAllCurrencyRef.current = true;
    setAllCurrenciesSelected(true);
    setSelectedCurrencies([]);
    clearDashboardSelectedCurrency();
  }, []);

  const selectableRows = useMemo(() => rows.filter((r) => isBankprocessMaintenanceRowSelectable(r)), [rows]);

  const selectAll = selectableRows.length > 0 && selectedIds.length === selectableRows.length;

  const onToggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const selectable = rowsRef.current.filter((r) => isBankprocessMaintenanceRowSelectable(r));
      if (prev.length === selectable.length && selectable.length > 0) return [];
      return selectable.map((r) => r.transaction_id);
    });
  }, []);

  const onToggleRow = useCallback((transactionId) => {
    setSelectedIds((prev) =>
      toggleBankprocessMaintenanceBatchSelection(prev, rowsRef.current, transactionId),
    );
  }, []);

  const onDelete = async () => {
    if (selectedIds.length === 0) {
      notify(t("pleaseSelectOneRecord"), "error");
      return;
    }
    setIsDeleteModalOpen(true);
  };

  const onConfirmDelete = async () => {
    setIsDeleteModalOpen(false);
    try {
      const result = await deleteBankprocessData(selectedIds, companyId);
      notifyTransactionListInvalidated("bankprocess_maintenance_delete");
      notify(t("successfullyDeletedBankProcessN", { n: selectedIds.length }), "success");
      setSelectedIds([]);
      setConfirmDelete(false);
      void performSearch();
    } catch (err) {
      notify(err.message || t("deleteFailed"), "error");
    }
  };

  const tableLoading =
    loading ||
    bootLoading ||
    ((!currenciesReady || !hasSearched) &&
      Boolean(companyId) &&
      !initialBankprocessSearchDoneRef.current);

  return (
    <div className="bankprocess-maintenance-page-root container">
      <BankprocessMaintenanceFilters
        dateFrom={dateFrom}
        dateTo={dateTo}
        setDateFrom={setDateFrom}
        setDateTo={setDateTo}
        today={today}
        query={query}
        setQuery={setQuery}
        onSearch={performSearch}
        groupedIds={groupedIds}
        selectedGroup={selectedGroup}
        onGroupClick={onGroupClick}
        onPickCompany={handlePickCompany}
        onPickAllGroups={handlePickAllGroups}
        onPickAllInGroup={handlePickAllInGroup}
        groupsAllMode={groupsAllMode}
        groupAllMode={groupAllMode}
        companies={companies}
        visibleCompanies={visibleCompanies}
        companyId={companyId}
        currencies={currencies}
        allCurrenciesSelected={allCurrenciesSelected}
        selectedCurrencies={selectedCurrencies}
        onCurrencyToggle={toggleBankprocessCurrency}
        onCurrencySelectAll={selectAllBankprocessCurrencies}
        onCurrencyDropOn={handleCurrencyDropOn}
        confirmDelete={confirmDelete}
        setConfirmDelete={setConfirmDelete}
        selectedIds={selectedIds}
        onDelete={onDelete}
        m={m}
      />

      <div className="bankprocess-maintenance-table-region">
        {listSyncing && (
          <div className="bankprocess-maintenance-sync-track" aria-hidden>
            <div className="bankprocess-maintenance-sync-bar" />
          </div>
        )}
        <BankprocessMaintenanceTable
          key={bankprocessDataSourceCompanyId ?? companyId ?? "no-company"}
          loading={tableLoading}
          listSyncing={listSyncing}
          rows={rows}
          hasSearched={hasSearched}
          listEpoch={bankprocessListEpoch}
          rowKeyCompanyId={bankprocessDataSourceCompanyId ?? companyId}
          selectedIds={selectedIds}
          onToggleRow={onToggleRow}
          selectAll={selectAll}
          onToggleSelectAll={onToggleSelectAll}
          m={m}
        />
      </div>

      <div id="notificationContainer" className="maintenance-notification-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`maintenance-notification maintenance-notification-${toast.type} show`}>
            {toast.message}
          </div>
        ))}
      </div>

      <MaintenanceDeleteConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={onConfirmDelete}
        count={selectedIds.length}
        messageKey="deleteConfirmBankProcess"
        t={t}
      />
    </div>
  );
}
