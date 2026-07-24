import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { removeOtherMaintenanceStylesheets, waitForStylesheet } from "../../../utils/maintenance/maintenanceStylesheets.js";
import { useMaintenanceGroupCompanyFilter } from "../shared/useMaintenanceGroupCompanyFilter.js";
import { spaPath } from "../../../utils/routing/pageRoutes.js";
import {
  runMaintenanceCompanySwitch,
  syncMaintenanceBootSidebar,
} from "../shared/maintenanceCompanySwitch.js";
import { useMaintenancePageScrollLock } from "../shared/useMaintenancePageScrollLock.js";
import {
  companiesInGroupList,
  isDashboardGroupOnlyMode,
  notifyDashboardGroupFilterChanged,
  persistDashboardFilterState,
  resolveBootCompanyId,
  resolveInitialSelectedGroupFromSession,
} from "../../../utils/company/sharedCompanyFilter.js";
import { useGroupAnchorSessionSync } from "../../../utils/company/useGroupAnchorSessionSync.js";
import { fetchOwnerCompaniesAll } from "../../../utils/company/sharedCompanyFilter.js";
import "../../../../public/css/accountCSS.css";
import "../../../../public/css/date-range-picker.css";
import "../../../../public/css/customer_report.css";
import "../../../../public/css/report-outlined-fields.css";
import "../../../../public/css/payment_maintenance.css";
import "../../../../public/css/maintenance_unified_filters.css";
import {
  fetchCompanyCurrencies,
  pickPaymentMaintenanceCurrency,
  resolvePaymentMaintenanceTenantId,
  searchPaymentData,
  deletePaymentRecords,
  updateSessionCompany,
  isPaymentMaintenanceRowSelectable,
} from "./paymentMaintenanceLogic.js";
import { notifyTransactionListInvalidated } from "../../transaction/lib/transactionPaymentLogic.js";
import { useLoginLang } from "../../../utils/i18n/useLoginLang.js";
import { getMaintenanceText, MAINTENANCE_I18N } from "../../../translateFile/pages/maintenanceTranslate.js";

// Components
import PaymentMaintenanceFilters from "./components/PaymentMaintenanceFilters.jsx";
import PaymentMaintenanceTable from "./components/PaymentMaintenanceTable.jsx";
import MaintenanceDeleteConfirmModal from "../shared/MaintenanceDeleteConfirmModal.jsx";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";

export default function PaymentMaintenancePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { me, sessionReady } = useAuthSession();
  const lang = useLoginLang();
  const m = useMemo(() => MAINTENANCE_I18N[lang] || MAINTENANCE_I18N.en, [lang]);
  const t = useCallback((key, params) => getMaintenanceText(lang, key, params), [lang]);
  useMaintenancePageScrollLock();

  // -- Boot State --
  const [bootLoading, setBootLoading] = useState(true);
  const [companies, setCompanies] = useState([]);

  // -- Filter State --
  const [companyId, setCompanyId] = useState(null);
  const [companyCode, setCompanyCode] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [transactionType, setTransactionType] = useState("");
  const [query, setQuery] = useState("");
  const [currencies, setCurrencies] = useState([]);
  const [selectedCurrency, setSelectedCurrency] = useState(null);
  
  const today = useMemo(() => new Date(), []);
  const todayDmy = useMemo(() => {
    const d = String(today.getDate()).padStart(2, "0");
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const y = today.getFullYear();
    return `${d}/${m}/${y}`;
  }, [today]);
  const [dateFrom, setDateFrom] = useState(todayDmy);
  const [dateTo, setDateTo] = useState(todayDmy);

  // -- Data State --
  const [paymentData, setPaymentData] = useState([]);
  /** 每次成功替换列表结果时递增，与 paymentDataSourceCompanyId 一起写入表格行 key */
  const [paymentListEpoch, setPaymentListEpoch] = useState(0);
  /** 当前 paymentData 所对应的已提交公司 numeric id（仅随成功搜索更新；切换公司时筛选已变但数据未回前仍为旧 id，避免行 key 误用新公司 id 复用 DOM 窜行） */
  const [paymentDataSourceCompanyId, setPaymentDataSourceCompanyId] = useState(null);
  /** 与 Capture Maintenance 一致：首次整表 Loading；之后仅顶栏细条 + 保留旧表，切换公司不卡手 */
  const [loading, setLoading] = useState(false);
  const [listSyncing, setListSyncing] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  
  // -- UI State --
  const [toasts, setToasts] = useState([]);
  const companyIdRef = useRef(null);
  const tenantKeyRef = useRef("");
  const searchSeqRef = useRef(0);
  const searchAbortRef = useRef(null);
  const initialPaymentSearchDoneRef = useRef(false);
  /** 切换公司已手动 performSearch 时跳过 useEffect 里下一轮重复请求 */
  const suppressNextSearchEffectRef = useRef(false);
  const skipMetaAfterBootRef = useRef(false);
  const followGroupRef = useRef(() => {});
  const paymentDataRef = useRef(paymentData);
  paymentDataRef.current = paymentData;
  const switchCompanyRef = useRef(async () => {});
  const onPrepareCompanySelectRef = useRef(() => {});
  const onClearCompanyRef = useRef(() => {});
  const sidebarSyncedCompanyIdRef = useRef(null);

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
  });

  /** UI Group/Company pills → single Spring tenant id (no scope / group_id API params). */
  const activeTenantId = useMemo(
    () =>
      resolvePaymentMaintenanceTenantId({
        companyId,
        selectedGroup,
        companies,
      }),
    [companyId, selectedGroup, companies],
  );

  const tenantKey = useMemo(
    () => (activeTenantId != null ? String(activeTenantId) : ""),
    [activeTenantId],
  );

  const listQueryEnabled =
    !bootLoading && activeTenantId != null && activeTenantId > 0 && Boolean(dateFrom) && Boolean(dateTo);

  const { resetAnchorSessionRef } = useGroupAnchorSessionSync({
    companies,
    selectedGroup,
    companyId,
    sessionCompanyId: me?.company_id,
    enabled: true,
  });

  useEffect(() => {
    tenantKeyRef.current = tenantKey;
  }, [tenantKey]);

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "1") {
      notify(t("operationCompletedSuccess"), "success");
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    if (params.get("error") === "1") {
      notify(t("operationFailedRetry"), "error");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [notify, t]);

  // -- Initialization --
  useEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "datacapture-page", "transaction-page");
    document.body.classList.add("dashboard-page", "maintenance-page");

    removeOtherMaintenanceStylesheets("payment_maintenance.css");

    const links = [
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap",
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css",
    ];
    links.forEach((href) => waitForStylesheet(href));

    return () => {
      searchAbortRef.current?.abort();
      document.body.classList.remove("maintenance-page");
    };
  }, []);

  // Handle sidebar company switch (payload from auth/switch-tenant)
  useEffect(() => {
    const handleSwitch = (e) => {
      const data = e?.detail;
      if (!data || typeof data !== "object") return;
      // Group-only filter (AP without subsidiary pill): anchor session may still sync C168 — do not re-select company in UI.
      if (isDashboardGroupOnlyMode()) return;
      const nextId = Number(data.company_id ?? data.companyId);
      if (!Number.isFinite(nextId) || nextId <= 0) return;
      if (nextId === Number(companyIdRef.current)) return;

      const row = companies.find((c) => Number(c.id) === nextId);
      const nextCode = String(data.company_code ?? data.companyCode ?? row?.company_id ?? "").trim();
      const newGroup = row?.group_id ? String(row.group_id).trim().toUpperCase() : selectedGroup;

      companyIdRef.current = nextId;
      setCompanyId(nextId);
      if (nextCode) setCompanyCode(nextCode);
      if (newGroup) setSelectedGroup(newGroup);
      persistDashboardFilterState(newGroup, nextId);
      setSelectedIds([]);
      setConfirmDelete(false);
    };

    window.addEventListener("eazycount:company-session-updated", handleSwitch);
    return () => window.removeEventListener("eazycount:company-session-updated", handleSwitch);
  }, [companies, selectedGroup]);

  // -- Boot Logic --
  useEffect(() => {
    if (!sessionReady || !me) return;

    let cancelled = false;
    setBootLoading(true);
    (async () => {
      try {
        const u = me;

        // Member check
        if (String(u.user_type || "").toLowerCase() === "member") {
          window.location.assign(new URL(spaPath("member"), window.location.origin).href);
          return;
        }

        // Load Companies
        const rows = await fetchOwnerCompaniesAll({ me: u });
        if (cancelled) return;
        setCompanies(rows);

        // Set Initial Company
        let initialCompanyId = resolveBootCompanyId({
          sessionCompanyId: u.company_id,
          defaultRowId: rows[0]?.id,
        });
        const currentComp =
          initialCompanyId != null
            ? rows.find((c) => Number(c.id) === initialCompanyId)
            : null;
        const bootGroup = resolveInitialSelectedGroupFromSession(rows, currentComp);
        setSelectedGroup(bootGroup);
        if (isDashboardGroupOnlyMode()) {
          setCompanyId(null);
          setCompanyCode("");
          companyIdRef.current = null;
          const anchor = bootGroup ? companiesInGroupList(rows, bootGroup)[0] : null;
          const code = anchor?.company_id ? String(anchor.company_id) : "";
          const bootTenantId = resolvePaymentMaintenanceTenantId({
            companyId: null,
            selectedGroup: bootGroup,
            companies: rows,
          });
          const currList = bootTenantId
            ? await fetchCompanyCurrencies(bootTenantId)
            : [];
          if (cancelled) return;
          setCurrencies(currList);
          setSelectedCurrency(pickPaymentMaintenanceCurrency(currList));
          if (bootGroup) sessionStorage.setItem("dashboard_group_filter", bootGroup);
          skipMetaAfterBootRef.current = true;
          return;
        }
        setCompanyId(initialCompanyId);
        companyIdRef.current = initialCompanyId;

        if (currentComp) {
          const code = currentComp.company_id || "";
          setCompanyCode(code);

          const bootTenantId = resolvePaymentMaintenanceTenantId({
            companyId: initialCompanyId,
            selectedGroup: bootGroup,
            companies: rows,
          });

          const currList = bootTenantId
            ? await fetchCompanyCurrencies(bootTenantId)
            : [];
          setCurrencies(currList);
          setSelectedCurrency(pickPaymentMaintenanceCurrency(currList));

          if (bootGroup) sessionStorage.setItem("dashboard_group_filter", bootGroup);
          skipMetaAfterBootRef.current = true;
        }

      } catch (err) {
        console.error("Boot error:", err);
        if (!cancelled) navigate(spaPath("login"), { replace: true });
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionReady, navigate, me?.user_id]);

  // Sync sidebar category flags after boot (once per company id).
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
          updateSessionCompany,
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

  // -- Load Meta Data (Permissions & Currencies) --
  useEffect(() => {
    if (bootLoading || !activeTenantId) return;
    if (skipMetaAfterBootRef.current) {
      skipMetaAfterBootRef.current = false;
      return;
    }

    let cancelled = false;
    const tenantId = activeTenantId;
    (async () => {
      try {
        const currList = await fetchCompanyCurrencies(tenantId);
        if (cancelled) return;
        setCurrencies(currList);
        setSelectedCurrency(pickPaymentMaintenanceCurrency(currList));
      } catch (err) {
        if (cancelled) return;
        console.error("Meta data load error:", err);
        notify(t("failedLoadCompanyMetadata"), "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootLoading, activeTenantId, companyCode, selectedGroup, companies, notify, t]);

  // -- Search Logic --
  /** 与 Capture Maintenance 对齐：支持 overrides.tenantId；seq + ref + Abort；首次 Loading / 之后 listSyncing 保留旧表 */
  const performSearch = useCallback(
    async (overrides = {}) => {
      const tenantId =
        overrides.tenantId != null
          ? Number(overrides.tenantId)
          : resolvePaymentMaintenanceTenantId({
              companyId: overrides.companyId ?? companyId,
              selectedGroup: overrides.selectedGroup ?? selectedGroup,
              companies,
            });
      if (!tenantId || !dateFrom || !dateTo) return;

      const searchTenantKey = String(tenantId);
      const quietRefresh = initialPaymentSearchDoneRef.current;

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
      try {
        const data = await searchPaymentData({
          tenantId,
          dateFrom,
          dateTo,
          transactionType,
          query,
          currency: overrides.currency ?? selectedCurrency,
          signal: controller.signal,
        });
        if (seq !== searchSeqRef.current) return;
        if (searchTenantKey !== tenantKeyRef.current) return;
        setPaymentListEpoch((e) => e + 1);
        setPaymentData(data);
        setPaymentDataSourceCompanyId(tenantId);
        setConfirmDelete(false);
        if (!quietRefresh) {
          if (data.length > 0) {
            notify(t("foundRecords", { n: data.length }), "success");
          } else {
            notify(t("noDataAdjustSearch"), "info");
          }
        }
      } catch (err) {
        if (err?.name === "AbortError" || seq !== searchSeqRef.current) return;
        if (searchTenantKey !== tenantKeyRef.current) return;
        notify(err.message, "error");
        setPaymentListEpoch((e) => e + 1);
        setPaymentData([]);
        setPaymentDataSourceCompanyId(null);
      } finally {
        initialPaymentSearchDoneRef.current = true;
        if (searchAbortRef.current === controller) {
          searchAbortRef.current = null;
        }
        if (seq === searchSeqRef.current) {
          setLoading(false);
          setListSyncing(false);
        }
      }
    },
    [companies, selectedGroup, companyId, dateFrom, dateTo, transactionType, query, selectedCurrency, notify, t],
  );

  // Auto-search when filters change（defer 0ms；切换公司已手动 performSearch 时跳过一轮避免重复）
  useEffect(() => {
    if (!listQueryEnabled) return;
    if (suppressNextSearchEffectRef.current) {
      suppressNextSearchEffectRef.current = false;
      return;
    }
    const h = setTimeout(() => {
      void performSearch();
    }, 0);
    return () => clearTimeout(h);
  }, [
    listQueryEnabled,
    tenantKey,
    transactionType,
    query,
    dateFrom,
    dateTo,
    selectedCurrency,
    performSearch,
  ]);

  useEffect(
    () => () => {
      searchAbortRef.current?.abort();
    },
    [],
  );

  // -- Handlers --
  const reloadTenantMeta = useCallback(async (tenantId) => {
    const tid = Number(tenantId);
    const currList =
      Number.isFinite(tid) && tid > 0 ? await fetchCompanyCurrencies(tid) : [];
    setCurrencies(currList);
    const nextCurrency = pickPaymentMaintenanceCurrency(currList);
    setSelectedCurrency(nextCurrency);
    return nextCurrency;
  }, []);

  const handleClearCompany = useCallback(
    (groupForPersist) => {
      const g = groupForPersist ?? selectedGroup;
      suppressNextSearchEffectRef.current = true;
      persistDashboardFilterState(g, null, { allowGroupOnly: true });
      resetAnchorSessionRef();
      companyIdRef.current = null;
      flushSync(() => {
        setCompanyId(null);
        setCompanyCode("");
      });
      setSelectedIds([]);
      setPaymentData([]);
      notifyDashboardGroupFilterChanged(g, null);
      void (async () => {
        try {
          const nextTenantId = resolvePaymentMaintenanceTenantId({
            companyId: null,
            selectedGroup: g,
            companies,
          });
          const nextCurrency = await reloadTenantMeta(nextTenantId);
          if (nextTenantId) {
            await performSearch({
              selectedGroup: g,
              companyId: null,
              tenantId: nextTenantId,
              currency: nextCurrency,
            });
          }
        } catch (err) {
          console.error("Meta bootstrap after clear company:", err);
        }
      })();
    },
    [companies, selectedGroup, reloadTenantMeta, performSearch, resetAnchorSessionRef],
  );

  const onPrepareCompanySelect = useCallback((c) => {
    if (!c?.id) return;
    const nextId = Number(c.id);
    const nextCode = c.company_id || "";
    const newGroup = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
    suppressNextSearchEffectRef.current = true;
    companyIdRef.current = nextId;
    setCompanyId(nextId);
    setCompanyCode(nextCode);
    setSelectedGroup(newGroup);
    persistDashboardFilterState(newGroup, nextId);
    followGroupRef.current();
    void (async () => {
      try {
        const nextCurrency = await reloadTenantMeta(nextId);
        await performSearch({
          companyId: nextId,
          selectedGroup: newGroup,
          tenantId: nextId,
          currency: nextCurrency,
        });
      } catch (err) {
        console.error("Company select meta/search:", err);
        notify(err.message || t("failedLoadCompanyMetadata"), "error");
      }
    })();
  }, [reloadTenantMeta, performSearch, notify, t]);

  onPrepareCompanySelectRef.current = onPrepareCompanySelect;

  const handleSwitchCompany = async (c) => {
    if (!c?.id) return;
    const nextId = Number(c.id);
    const nextCode = c.company_id || "";
    const newGroup = c.group_id ? String(c.group_id).toUpperCase().trim() : null;

    try {
      const { redirected } = await runMaintenanceCompanySwitch({
        companyRow: c,
        viewGroup: newGroup,
        currentPath: location.pathname,
        navigate,
        updateSessionCompany,
        onStay: async () => {
          suppressNextSearchEffectRef.current = true;
          companyIdRef.current = nextId;
          setCompanyId(nextId);
          setCompanyCode(nextCode);
          if (newGroup) setSelectedGroup(newGroup);
          persistDashboardFilterState(newGroup, nextId);

          try {
            const nextCurrency = await reloadTenantMeta(nextId);
            await performSearch({
              companyId: nextId,
              selectedGroup: newGroup,
              tenantId: nextId,
              currency: nextCurrency,
            });
          } catch (err) {
            notify(err.message || t("failedLoadCompanyMetadata"), "error");
          }
        },
      });
      if (redirected) return;
    } catch (err) {
      notify(err.message || t("switchFailed"), "error");
      navigate(spaPath("dashboard"), { replace: true });
    }
  };

  switchCompanyRef.current = handleSwitchCompany;
  onClearCompanyRef.current = handleClearCompany;

  followGroupRef.current = () => {};

  const handleCurrencySelectAll = useCallback(() => {
    setSelectedCurrency(null);
  }, []);

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const selectable = paymentDataRef.current.filter(
        (r) =>
          isPaymentMaintenanceRowSelectable(r) &&
          !(r.is_deleted === 1 || r.is_deleted === "1" || r.is_deleted === true)
      );
      if (prev.length === selectable.length && selectable.length > 0) return [];
      return selectable.map((r) => r.transaction_id);
    });
  }, []);

  const selectableRowsCount = useMemo(
    () =>
      paymentData.filter(
        (r) =>
          isPaymentMaintenanceRowSelectable(r) &&
          !(r.is_deleted === 1 || r.is_deleted === "1" || r.is_deleted === true)
      ).length,
    [paymentData]
  );
  const selectAll =
    selectedIds.length > 0 && selectedIds.length === selectableRowsCount;

  const handleDeleteClick = () => {
    if (selectedIds.length === 0) {
      notify(t("pleaseSelectOneRecord"), "error");
      return;
    }
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleteModalOpen(false);
    if (!activeTenantId) {
      notify(t("deleteFailed"), "error");
      return;
    }
    const idsToDelete = [...selectedIds];
    try {
      await deletePaymentRecords(idsToDelete, activeTenantId);
      notifyTransactionListInvalidated("payment_maintenance_delete");
      notify(t("successfullyDeletedN", { n: idsToDelete.length }), "success");
      setSelectedIds([]);
      await performSearch({ tenantId: activeTenantId });
    } catch (err) {
      notify(err.message || t("deleteFailed"), "error");
    }
  };

  const tableLoading = loading || bootLoading;

  return (
    <div className="container">
      <div className="payment-maintenance-page-root">
      <PaymentMaintenanceFilters 
        transactionType={transactionType}
        setTransactionType={setTransactionType}
        query={query}
        setQuery={setQuery}
        dateFrom={dateFrom}
        dateTo={dateTo}
        setDateFrom={setDateFrom}
        setDateTo={setDateTo}
        today={todayDmy}
        companyId={companyId}
        snapGroupIds={snapGroupIds}
        visibleCompanies={visibleCompanies}
        selectedGroup={selectedGroup}
        onGroupClick={handleGroupClick}
        onPickCompany={handlePickCompany}
        onClearCompany={handleClearCompany}
        allowClearCompany={allowClearCompany}
        onPickAllGroups={handlePickAllGroups}
        onPickAllInGroup={handlePickAllInGroup}
        groupsAllMode={groupsAllMode}
        groupAllMode={groupAllMode}
        currencies={currencies}
        selectedCurrency={selectedCurrency}
        setSelectedCurrency={setSelectedCurrency}
        onCurrencySelectAll={handleCurrencySelectAll}
        onDelete={handleDeleteClick}
        confirmDelete={confirmDelete}
        setConfirmDelete={setConfirmDelete}
        deleteDisabled={selectedIds.length === 0}
        m={m}
      />

      <div className="payment-maintenance-table-region">
        {listSyncing && (
          <div className="payment-maintenance-sync-track" aria-hidden>
            <div className="payment-maintenance-sync-bar" />
          </div>
        )}
        <PaymentMaintenanceTable
          key={`${tenantKey}:${paymentDataSourceCompanyId ?? "no-tenant"}`}
          data={paymentData}
          listEpoch={paymentListEpoch}
          rowKeyCompanyId={paymentDataSourceCompanyId ?? companyId}
          loading={tableLoading}
          listSyncing={listSyncing}
          selectedIds={selectedIds}
          toggleSelect={toggleSelect}
          toggleSelectAll={toggleSelectAll}
          selectAll={selectAll}
          m={m}
        />
      </div>
      </div>

      {/* Modal & Notifications */}
      <MaintenanceDeleteConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        count={selectedIds.length}
        t={t}
      />

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
