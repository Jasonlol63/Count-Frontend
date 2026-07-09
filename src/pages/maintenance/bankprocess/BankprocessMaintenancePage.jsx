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
  isDashboardGroupOnlyMode,
  persistDashboardFilterState,
  resolveBootCompanyId,
  resolveInitialSelectedGroupFromSession,
} from "../../../utils/company/sharedCompanyFilter.js";
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
  fetchCompanyPermissions,
  formatDmy,
  isBankprocessMaintenanceRowSelectable,
  searchBankprocessData,
  toggleBankprocessMaintenanceBatchSelection,
  updateSessionCompany,
} from "./bankprocessMaintenanceLogic.js";
import { useLoginLang } from "../../../utils/i18n/useLoginLang.js";
import { getMaintenanceText, MAINTENANCE_I18N } from "../../../translateFile/pages/maintenanceTranslate.js";

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
  const [permissions, setPermissions] = useState([]);
  const [selectedPermission, setSelectedPermission] = useState("");
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
        const allRows = await fetchOwnerCompaniesAll();
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
        if (!canMaintenance || !user.company_has_bank) {
          navigate(spaPath("dashboard"), { replace: true });
          return;
        }

        setCompanies(compRows);

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
        const currentComp =
          initialCompanyId != null
            ? compRows.find((c) => Number(c.id) === Number(initialCompanyId))
            : null;
        const bootGroup = resolveInitialSelectedGroupFromSession(compRows, currentComp);
        setSelectedGroup(bootGroup);
        if (isDashboardGroupOnlyMode()) {
          setCompanyId(null);
          currentCompanyIdRef.current = null;
          setCompanyCode("");
          setCurrenciesReady(true);
          return;
        }
        setCompanyId(initialCompanyId);
        currentCompanyIdRef.current = initialCompanyId;
        setCompanyCode(currentComp?.company_id || "");
        const code = currentComp?.company_id || "";

        // Fetch initial metadata here to ensure the first query starts with the correct selectedPermission
        const [perms, currencyList] = await Promise.all([
          fetchCompanyPermissions(code),
          fetchCompanyCurrencies(initialCompanyId).catch(() => [])
        ]);

        setPermissions(perms);
        const savedPerm = localStorage.getItem(`selectedPermission_${code}`);
        if (savedPerm && perms.includes(savedPerm)) setSelectedPermission(savedPerm);
        else setSelectedPermission(perms[0] || "");

        setCurrencies(currencyList);
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
      const perms = await fetchCompanyPermissions(companyCode);
      if (cancelled) return;
      setPermissions(perms);
      const saved = localStorage.getItem(`selectedPermission_${companyCode}`);
      if (saved && perms.includes(saved)) setSelectedPermission(saved);
      else setSelectedPermission(perms[0] || "");

      const currencyList = await fetchCompanyCurrencies(companyId).catch(() => []);
      if (cancelled) return;
      setCurrencies(currencyList);
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
          const dedupeKey = `${searchCompanyId}|${dateFrom}|${dateTo}|${currencyKey}|${selectedPermission}|${query}|empty`;
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
    selectedPermission,
    query,
    notify,
    t,
  ]);

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
    selectedPermission,
    query,
    performSearch,
  ]);

  useEffect(
    () => () => {
      searchAbortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!selectedPermission || !companyCode) return;
    localStorage.setItem(`selectedPermission_${companyCode}`, selectedPermission);
  }, [selectedPermission, companyCode]);

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
        onStay: async () => {
          notify(t("switchedTo", { company: targetCompany.company_id }), "success");
        },
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

  const toggleBankprocessCurrency = useCallback((code) => {
    if (!code) return;
    setAllCurrenciesSelected(false);
    setSelectedCurrencies((prev) => {
      const has = prev.includes(code);
      if (has) {
        const next = prev.filter((c) => c !== code);
        return next.length > 0 ? next : prev;
      }
      return [...prev, code];
    });
  }, []);

  const selectAllBankprocessCurrencies = useCallback(() => {
    setAllCurrenciesSelected(true);
    setSelectedCurrencies([]);
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
      const result = await deleteBankprocessData(selectedIds);
      try {
        const ts = String(Date.now());
        localStorage.setItem("count168_tx_invalidate_ts", ts);
        window.dispatchEvent(new CustomEvent("tx-data-changed", { detail: { ts, source: "bankprocess_maintenance_delete" } }));
      } catch {
        // ignore
      }
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
        permissions={permissions}
        selectedPermission={selectedPermission}
        setSelectedPermission={setSelectedPermission}
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
