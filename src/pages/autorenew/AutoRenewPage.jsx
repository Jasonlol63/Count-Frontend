import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthSession } from "../../context/AuthSessionContext.jsx";
import { canAccessC168AutoRenew } from "../../utils/company/loginScope.js";
import { spaPath } from "../../utils/routing/pageRoutes.js";
import {
  AUTO_RENEW_PENDING_CHANGED_EVENT,
  syncAutoRenewPendingCount,
} from "../../utils/autoRenew/autoRenewPendingSync.js";
import { useLoginLang } from "../../utils/i18n/useLoginLang.js";
import { getAutoRenewText } from "../../translateFile/pages/autoRenewTranslate.js";
import { DASHBOARD_I18N } from "../../translateFile/shell/dashboardTranslate.js";
import { formatDate, formatDomainFeeDisplay2, normalizeDomainFeeSettingsFromApi } from "../domain/domainHelpers.js";
import CompanySettingsModal from "../domain/components/CompanySettingsModal.jsx";
import GroupSettingsModal from "../domain/components/GroupSettingsModal.jsx";
import DomainNotification from "../domain/components/DomainNotification.jsx";
import {
  fetchDomainFeeSettingsForAutoRenew,
  loadAutoRenewTenantSettings,
} from "./autoRenewTenantSettings.js";
import { DashboardCalendarPopup } from "../dashboard/components/DashboardCalendarPopup.jsx";
import ConfirmDeleteModal from "../../components/ConfirmDeleteModal.jsx";
import {
  approveAutoRenew,
  AUTO_RENEW_PERIODS,
  deleteAutoRenew,
  fetchAutoRenewApprovals,
  invalidateTransactionListCache,
  rejectAutoRenew,
} from "./autoRenewLogic.js";
import {
  clearAutoRenewListCache,
  consumeAutoRenewPrefetch,
  rememberAutoRenewListCache,
} from "./autoRenewRoutePrefetch.js";
import {
  useAutoRenewDateRange,
  useAutoRenewDateRangeState,
} from "./hooks/useAutoRenewDateRange.js";
import {
  AUTO_RENEW_PAGE_SIZE,
  canApproveRow,
  canDeleteRow,
  filterAutoRenewRows,
  formatRemainingForRow,
  formatSubmitterAt,
  getAutoRenewApproveDisabledReason,
  getRowDraftValues,
  paginateRows,
  periodToLabelKey,
  resolveAutoRenewDisplayPrice,
  rowStableKey,
  sortAutoRenewRows,
} from "./autoRenewPageHelpers.js";
import "../../../public/css/accountCSS.css";
import "../../../public/css/userlist.css";
import "../../../public/css/admin-responsive.css";
import "../../../public/css/auto_renew.css";
import "../../../public/css/domain.css";
import "../../../public/css/date-range-picker.css";
import "../../../public/css/date-range-picker.css";
import "../../../public/css/transaction.css";

function TabPendingBadge({ count, label }) {
  if (!count || count <= 0) return null;
  return (
    <span className="auto-renew-tab-pending-badge" aria-label={label} title={label}>
      {count}
    </span>
  );
}

function FilterChip({ active, label, count, onClick }) {
  return (
    <button type="button" className={`user-filter-chip${active ? " is-selected" : ""}`} aria-pressed={active} onClick={onClick}>
      <span className="user-filter-chip__dot" aria-hidden>
        {active ? (
          <svg className="user-filter-chip__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 12l4 4 8-8" />
          </svg>
        ) : null}
      </span>
      <span className="user-filter-chip__label">
        {label}
        {count != null ? <span className="auto-renew-chip-count">{count}</span> : null}
      </span>
    </button>
  );
}

function EmptyState({ statusFilter, searchTerm, t }) {
  const hintKey =
    searchTerm.trim() !== ""
      ? "noResults"
      : statusFilter === "approved"
        ? "emptyHintApproved"
        : statusFilter === "rejected"
          ? "emptyHintRejected"
          : statusFilter === "all"
            ? "emptyHintAll"
            : "emptyHintPending";

  return (
    <div className="auto-renew-empty-state" role="status">
      <div className="auto-renew-empty-state__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p className="auto-renew-empty-state__title">
        {searchTerm.trim() ? t("noResults") : t("emptyTitle")}
      </p>
      <p className="auto-renew-empty-state__hint">{t(hintKey)}</p>
    </div>
  );
}

const EMPTY_COUNTS = { pending: 0, approved: 0, rejected: 0, total: 0 };

function normalizeEntityListSnapshot(data) {
  return {
    rows: Array.isArray(data?.rows) ? data.rows : [],
    feeSettings: normalizeDomainFeeSettingsFromApi(data?.fee_settings),
    accounts: Array.isArray(data?.accounts) ? data.accounts : [],
    counts: data?.counts || EMPTY_COUNTS,
    canEditGlobal: Boolean(data?.can_edit),
  };
}

export default function AutoRenewPage() {
  const navigate = useNavigate();
  const { me, sessionReady } = useAuthSession();
  const lang = useLoginLang();
  const t = useCallback((key, params) => getAutoRenewText(lang, key, params), [lang]);
  const dashI18n = useMemo(() => DASHBOARD_I18N[lang === "zh" ? "zh" : "en"], [lang]);
  const [bootLoading, setBootLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const bootFetchedListKeyRef = useRef(null);
  const listFetchAbortRef = useRef(null);
  const entityTabRef = useRef("company");
  const [listRefreshing, setListRefreshing] = useState(false);
  const { dateFrom, setDateFrom, dateTo, setDateTo } = useAutoRenewDateRangeState();
  const { periodPresets } = useAutoRenewDateRange({
    me,
    ready: sessionReady && Boolean(me) && !loadError,
    i18n: dashI18n,
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,
  });
  const [entitySnapshots, setEntitySnapshots] = useState({ company: null, group: null });
  const [tabPendingCounts, setTabPendingCounts] = useState({ company: 0, group: 0 });
  const [entityTab, setEntityTab] = useState("company");
  const [statusFilter, setStatusFilter] = useState("pending");
  const tabPendingCountsRef = useRef(tabPendingCounts);
  tabPendingCountsRef.current = tabPendingCounts;
  const statusFilterRef = useRef(statusFilter);
  statusFilterRef.current = statusFilter;
  const [searchTerm, setSearchTerm] = useState("");
  const [sortColumn, setSortColumn] = useState("expiration");
  const [sortDirection, setSortDirection] = useState("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowDrafts, setRowDrafts] = useState({});
  const [busyRequestId, setBusyRequestId] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [deleteConfirmRow, setDeleteConfirmRow] = useState(null);
  const [rejectConfirmRow, setRejectConfirmRow] = useState(null);
  const [approveConfirmRow, setApproveConfirmRow] = useState(null);
  const [settingsModal, setSettingsModal] = useState(null);
  const [commLoadingKey, setCommLoadingKey] = useState(null);

  const notify = useCallback((message, type = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 2500);
  }, []);

  useEffect(() => {
    document.body.classList.remove("bg");
    document.body.classList.add("user-page", "auto-renew-page-body");
    return () => {
      document.body.classList.remove("user-page", "auto-renew-page-body", "user-page--show-all");
      document.body.classList.add("dashboard-page");
    };
  }, []);



  const showAll = statusFilter === "all";

  useEffect(() => {
    if (showAll) {
      document.body.classList.add("user-page--show-all");
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "auto" });
      });
    } else {
      document.body.classList.remove("user-page--show-all");
    }
    return () => document.body.classList.remove("user-page--show-all");
  }, [showAll]);

  const applyTabPendingCounts = useCallback((data) => {
    const tpc = data?.tab_pending_counts;
    if (!tpc) return;
    const next = {
      company: Number(tpc?.company) || 0,
      group: Number(tpc?.group) || 0,
    };
    tabPendingCountsRef.current = next;
    setTabPendingCounts(next);
  }, []);

  const storeEntityListData = useCallback(
    (entity, data, { resetDrafts = false, status = statusFilter } = {}) => {
      setEntitySnapshots((prev) => ({ ...prev, [entity]: normalizeEntityListSnapshot(data) }));
      applyTabPendingCounts(data);
      rememberAutoRenewListCache(status, { dateFrom, dateTo, entityType: entity }, data);
      if (resetDrafts && entityTabRef.current === entity) setRowDrafts({});
    },
    [applyTabPendingCounts, dateFrom, dateTo, statusFilter],
  );

  entityTabRef.current = entityTab;

  const activeSnapshot = entitySnapshots[entityTab];
  const rows = activeSnapshot?.rows ?? [];
  const feeSettings = activeSnapshot?.feeSettings ?? null;
  const counts = activeSnapshot?.counts ?? EMPTY_COUNTS;
  const canEditGlobal = Boolean(activeSnapshot?.canEditGlobal);

  const listFetchKey = useCallback(
    (status, range, entity) => `${entity}|${status}|${range?.dateFrom || ""}|${range?.dateTo || ""}`,
    [],
  );

  const invalidateListCaches = useCallback(() => {
    clearAutoRenewListCache({ dateFrom, dateTo });
  }, [dateFrom, dateTo]);

  const handleEntityTabChange = useCallback(
    (tab) => {
      if (tab === entityTab) return;
      invalidateListCaches();
      setEntitySnapshots((prev) => ({ ...prev, [tab]: null }));
      setEntityTab(tab);
      setRowDrafts({});
      bootFetchedListKeyRef.current = null;
      setListRefreshing(true);
    },
    [entityTab, invalidateListCaches],
  );

  const handleStatusFilterChange = useCallback(
    (next) => {
      if (next === statusFilter) return;
      invalidateListCaches();
      setEntitySnapshots({ company: null, group: null });
      setRowDrafts({});
      setStatusFilter(next);
      bootFetchedListKeyRef.current = null;
      setListRefreshing(true);
    },
    [invalidateListCaches, statusFilter],
  );

  const fetchList = useCallback(async ({ resetDrafts = false } = {}) => {
    listFetchAbortRef.current?.abort();
    const ac = new AbortController();
    listFetchAbortRef.current = ac;
    const requestEntity = entityTabRef.current;

    try {
      const data = await fetchAutoRenewApprovals(statusFilter, {
        dateFrom,
        dateTo,
        entityType: requestEntity,
        signal: ac.signal,
      });
      if (ac.signal.aborted) return;
      storeEntityListData(requestEntity, data, { resetDrafts });
    } catch (err) {
      if (ac.signal.aborted || err?.name === "AbortError") return;
      notify(t("loadFailed", { message: err.message }), "error");
    } finally {
      if (listFetchAbortRef.current === ac) {
        setListRefreshing(false);
      }
    }
  }, [dateFrom, dateTo, notify, statusFilter, storeEntityListData, t]);

  const refreshListAfterMutation = useCallback(async () => {
    invalidateListCaches();
    setEntitySnapshots((prev) => ({ ...prev, [entityTabRef.current]: null }));
    bootFetchedListKeyRef.current = null;
    setListRefreshing(true);
    await fetchList({ resetDrafts: true });
    void syncAutoRenewPendingCount();
  }, [fetchList, invalidateListCaches]);

  const handleSettingsSaved = useCallback(() => {
    setSettingsModal(null);
  }, []);

  const handleOpenComm = useCallback(async (row) => {
    const rowKey = rowStableKey(row);
    if (!canEditGlobal || row.is_payment_deleted || busyRequestId) return;
    if (!row.owner_id) {
      notify(t("commSettingsNotFound"), "error");
      return;
    }
    setCommLoadingKey(rowKey);
    try {
      const payload = await loadAutoRenewTenantSettings(row);
      if (!payload) {
        notify(t("commSettingsNotFound"), "error");
        return;
      }
      const draft = getRowDraftValues(row, rowDrafts);
      setSettingsModal({
        ...payload,
        sharePricePeriod: draft.period || row.period || "",
      });
    } catch (err) {
      notify(t("commSettingsLoadFailed", { message: err.message }), "error");
    } finally {
      setCommLoadingKey(null);
    }
  }, [busyRequestId, canEditGlobal, notify, rowDrafts, t]);

  useEffect(() => {
    if (!sessionReady || !me) return;

    let cancelled = false;
    setLoadError("");

    (async () => {
      if (!canAccessC168AutoRenew(me)) {
        navigate(spaPath("dashboard"), { replace: true });
        return;
      }

      try {
        const cached = consumeAutoRenewPrefetch(statusFilter, { dateFrom, dateTo, entityType: entityTab });
        const data =
          cached ||
          (await fetchAutoRenewApprovals(statusFilter, {
            dateFrom,
            dateTo,
            entityType: entityTab,
          }));
        if (cancelled) return;
        storeEntityListData(entityTab, data, { resetDrafts: true });
        bootFetchedListKeyRef.current = listFetchKey(statusFilter, { dateFrom, dateTo }, entityTab);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err.message || "load");
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [me, navigate, sessionReady]);

  useEffect(() => {
    setEntitySnapshots({ company: null, group: null });
    setRowDrafts({});
    bootFetchedListKeyRef.current = null;
    setListRefreshing(true);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (bootLoading || !sessionReady || !me) return;
    const key = listFetchKey(statusFilter, { dateFrom, dateTo }, entityTab);
    if (bootFetchedListKeyRef.current === key) {
      bootFetchedListKeyRef.current = null;
      setListRefreshing(false);
      return;
    }
    void fetchList();
  }, [bootLoading, dateFrom, dateTo, entityTab, fetchList, listFetchKey, sessionReady, statusFilter]);

  useEffect(() => {
    if (bootLoading || !sessionReady || !me) return;

    let cancelled = false;
    const prefetchEntity = (entity) =>
      fetchAutoRenewApprovals(statusFilter, { dateFrom, dateTo, entityType: entity })
        .then((data) => {
          if (cancelled) return;
          if (entity !== entityTabRef.current) {
            applyTabPendingCounts(data);
            return;
          }
          storeEntityListData(entity, data);
        })
        .catch(() => {});

    void prefetchEntity(entityTab === "company" ? "group" : "company");

    return () => {
      cancelled = true;
    };
  }, [applyTabPendingCounts, bootLoading, dateFrom, dateTo, me, sessionReady, statusFilter, storeEntityListData]);

  useEffect(() => () => listFetchAbortRef.current?.abort(), []);

  useEffect(() => {
    if (!sessionReady || !me?.has_c168_auto_renew_access) return;

    const onPendingChanged = (event) => {
      if (statusFilterRef.current !== "pending") return;
      const count = Number(event.detail?.pendingCount);
      if (!Number.isFinite(count)) return;
      const localTotal =
        (tabPendingCountsRef.current.company || 0) + (tabPendingCountsRef.current.group || 0);
      if (count === localTotal) return;
      void refreshListAfterMutation();
    };

    window.addEventListener(AUTO_RENEW_PENDING_CHANGED_EVENT, onPendingChanged);
    return () => window.removeEventListener(AUTO_RENEW_PENDING_CHANGED_EVENT, onPendingChanged);
  }, [me?.has_c168_auto_renew_access, refreshListAfterMutation, sessionReady]);

  useEffect(() => {
    setCurrentPage(1);
  }, [entityTab, searchTerm, statusFilter, sortColumn, sortDirection]);

  const tenantColumnLabel = entityTab === "group" ? t("colGroup") : t("colCompany");

  const updateDraft = useCallback((requestId, patch) => {
    setRowDrafts((prev) => ({
      ...prev,
      [requestId]: { ...(prev[requestId] || {}), ...patch },
    }));
  }, []);

  const handleApprove = useCallback((row) => {
    if (!canEditGlobal || busyRequestId) return;
    if (!canApproveRow(row, rowDrafts, feeSettings)) return;
    setApproveConfirmRow(row);
  }, [busyRequestId, canEditGlobal, feeSettings, rowDrafts]);

  const confirmApproveRow = useCallback(async () => {
    const row = approveConfirmRow;
    if (!row || !canEditGlobal || busyRequestId) return;
    if (!canApproveRow(row, rowDrafts, feeSettings)) return;

    const { period, fromAccountId, toAccountId } = getRowDraftValues(row, rowDrafts);
    setApproveConfirmRow(null);
    setBusyRequestId(row.request_id);
    try {
      await approveAutoRenew({
        requestId: row.request_id,
        period,
        fromAccountId,
        toAccountId,
      });
      notify(t("approvedSuccess"), "success");
      await refreshListAfterMutation();
    } catch (err) {
      notify(t("approveFailed", { message: err.message }), "error");
      await refreshListAfterMutation();
    } finally {
      setBusyRequestId(null);
    }
  }, [approveConfirmRow, busyRequestId, canEditGlobal, feeSettings, notify, refreshListAfterMutation, rowDrafts, t]);

  const handleReject = useCallback((row) => {
    if (!canEditGlobal || busyRequestId || row.is_payment_deleted) return;
    setRejectConfirmRow(row);
  }, [busyRequestId, canEditGlobal]);

  const confirmRejectRow = useCallback(async () => {
    const row = rejectConfirmRow;
    if (!row || !canEditGlobal || busyRequestId || row.is_payment_deleted) return;
    setRejectConfirmRow(null);

    setBusyRequestId(row.request_id);
    try {
      await rejectAutoRenew({ requestId: row.request_id });
      setRowDrafts((prev) => {
        const next = { ...prev };
        delete next[row.request_id];
        return next;
      });
      notify(t("rejectedSuccess"), "success");
      await refreshListAfterMutation();
    } catch (err) {
      notify(t("rejectFailed", { message: err.message }), "error");
      await refreshListAfterMutation();
    } finally {
      setBusyRequestId(null);
    }
  }, [busyRequestId, canEditGlobal, notify, refreshListAfterMutation, rejectConfirmRow, t]);

  const handleDelete = useCallback((row) => {
    if (!canEditGlobal || busyRequestId || !canDeleteRow(row)) return;
    setDeleteConfirmRow(row);
  }, [busyRequestId, canEditGlobal]);

  const confirmDeleteRow = useCallback(async () => {
    const row = deleteConfirmRow;
    if (!row || !canEditGlobal || busyRequestId || !canDeleteRow(row)) return;
    setDeleteConfirmRow(null);

    setBusyRequestId(row.request_id);
    try {
      await deleteAutoRenew({
        requestId: row.request_id,
        transactionId: row.transaction_id,
      });
      invalidateTransactionListCache("auto_renew_delete");
      notify(t("deletedSuccess"), "success");
      await refreshListAfterMutation();
    } catch (err) {
      notify(t("deleteFailed", { message: err.message }), "error");
      await refreshListAfterMutation();
    } finally {
      setBusyRequestId(null);
    }
  }, [busyRequestId, canEditGlobal, deleteConfirmRow, notify, refreshListAfterMutation, t]);

  const handleSort = useCallback(
    (column) => {
      setSortDirection((dir) => (sortColumn === column && dir === "asc" ? "desc" : "asc"));
      setSortColumn(column);
    },
    [sortColumn],
  );

  const filteredRows = useMemo(
    () => sortAutoRenewRows(filterAutoRenewRows(rows, { searchTerm }), sortColumn, sortDirection),
    [rows, searchTerm, sortColumn, sortDirection],
  );

  const pagination = useMemo(
    () => paginateRows(filteredRows, currentPage, AUTO_RENEW_PAGE_SIZE),
    [filteredRows, currentPage],
  );

  const displayRows = useMemo(
    () => (showAll ? filteredRows : pagination.rows),
    [showAll, filteredRows, pagination.rows],
  );

  const renderSortIcon = (column) => (
    <span className={`account-sort-icon${sortColumn === column ? ` is-active is-${sortDirection}` : ""}`} aria-hidden="true">
      <span className="account-sort-icon__up" />
      <span className="account-sort-icon__down" />
    </span>
  );

  const renderHeader = (column, label, { controlCol = false } = {}) => (
    <div
      className={`header-item header-item--with-sort-icon header-sortable${controlCol ? " auto-renew-col-control-header" : ""}`}
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
      <span className="header-item__label">{label}</span>
      {renderSortIcon(column)}
    </div>
  );

  const renderCommButton = (row) => {
    if (!canEditGlobal || row.is_payment_deleted || !row.owner_id) return null;
    const rowKey = rowStableKey(row);
    const loading = commLoadingKey === rowKey;
    return (
      <button
        type="button"
        className="auto-renew-btn auto-renew-btn-comm auto-renew-btn--sm"
        disabled={Boolean(busyRequestId) || loading}
        title={t("commTooltip")}
        onClick={() => void handleOpenComm(row)}
      >
        {loading ? t("processing") : t("comm")}
      </button>
    );
  };

  const renderStatusCell = (row) => {
    if (row.is_payment_deleted) {
      return (
        <span className="auto-renew-approval-badge is-deleted">{t("statusDeleted")}</span>
      );
    }

    if (row.status === "pending" && canEditGlobal) {
      const approveEnabled = canApproveRow(row, rowDrafts, feeSettings) && busyRequestId !== row.request_id;
      const approveDisabledReason = approveEnabled
        ? undefined
        : getAutoRenewApproveDisabledReason(row, rowDrafts, feeSettings, t);
      return (
        <div className="auto-renew-action-btns">
          <button
            type="button"
            className="auto-renew-btn auto-renew-btn-primary auto-renew-btn--sm"
            disabled={!approveEnabled}
            title={approveDisabledReason || undefined}
            onClick={() => handleApprove(row)}
          >
            {busyRequestId === row.request_id ? t("processing") : t("approve")}
          </button>
          <button
            type="button"
            className="auto-renew-btn auto-renew-btn-secondary auto-renew-btn--sm"
            disabled={busyRequestId === row.request_id}
            onClick={() => handleReject(row)}
          >
            {t("reject")}
          </button>
          {renderCommButton(row)}
        </div>
      );
    }

    if (row.status === "approved" && canDeleteRow(row) && canEditGlobal) {
      return (
        <div className="auto-renew-action-btns">
          <button
            type="button"
            className="auto-renew-btn auto-renew-btn-danger auto-renew-btn--sm"
            disabled={busyRequestId === row.request_id}
            onClick={() => handleDelete(row)}
          >
            {busyRequestId === row.request_id ? t("processing") : t("delete")}
          </button>
          {renderCommButton(row)}
        </div>
      );
    }

    const statusClass =
      row.status === "approved" ? "is-approved" : row.status === "rejected" ? "is-rejected" : "is-pending";
    const commBtn = renderCommButton(row);
    if (commBtn) {
      return (
        <div className="auto-renew-action-btns auto-renew-action-btns--with-badge">
          <span className={`auto-renew-approval-badge ${statusClass}`}>
            {t(`status${row.status.charAt(0).toUpperCase()}${row.status.slice(1)}`)}
          </span>
          {commBtn}
        </div>
      );
    }
    return (
      <span className={`auto-renew-approval-badge ${statusClass}`}>
        {t(`status${row.status.charAt(0).toUpperCase()}${row.status.slice(1)}`)}
      </span>
    );
  };

  const renderSubmitterCell = (row) => {
    const name = row.submitter || row.processed_by;
    if (!name) return <span className="auto-renew-table-muted">—</span>;
    const at = formatSubmitterAt(row.submitter_at || row.processed_at);
    return (
      <span className="auto-renew-submitter" title={at || undefined}>
        {name}
      </span>
    );
  };

  const showSubmitterColumn = statusFilter === "approved" || statusFilter === "rejected";

  if (loadError) {
    return (
      <div className="auto-renew-page">
        <div className="auto-renew-notice warn">{t("loadFailed", { message: loadError })}</div>
      </div>
    );
  }

  return (
    <>
      <div className="auto-renew-toast-wrap" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`auto-renew-toast ${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </div>

      <div className="container">
        <div className="content">
          <div className="auto-renew-page-header">
            <div className="page-tabs" role="tablist" aria-label={t("filterGroupLabel")}>
              <button
                type="button"
                role="tab"
                aria-selected={entityTab === "company"}
                className={`page-tab${entityTab === "company" ? " active" : ""}${tabPendingCounts.company > 0 ? " has-pending-badge" : ""}`}
                onClick={() => handleEntityTabChange("company")}
              >
                <span className="page-tab__label">{t("companyTab")}</span>
                <TabPendingBadge
                  count={tabPendingCounts.company}
                  label={t("tabPendingBadgeCompany", { count: tabPendingCounts.company })}
                />
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={entityTab === "group"}
                className={`page-tab${entityTab === "group" ? " active" : ""}${tabPendingCounts.group > 0 ? " has-pending-badge" : ""}`}
                onClick={() => handleEntityTabChange("group")}
              >
                <span className="page-tab__label">{t("groupTab")}</span>
                <TabPendingBadge
                  count={tabPendingCounts.group}
                  label={t("tabPendingBadgeGroup", { count: tabPendingCounts.group })}
                />
              </button>
            </div>
          </div>

          <div className="action-buttons-container">
            <div
              className="action-buttons auto-renew-toolbar-row"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <div className="auto-renew-toolbar-left">
                <div className="search-container userlist-search-bar">
                  <span className="userlist-search-bar__icon" aria-hidden="true">
                    <svg fill="currentColor" viewBox="0 0 24 24">
                      <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    className="search-input userlist-search-input"
                    placeholder={t("searchPlaceholder")}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
                  />
                </div>
                <div className="transaction-date-range-group auto-renew-date-range-group">
                  <div
                    className="date-range-picker"
                    id="date-range-picker"
                    role="button"
                    tabIndex={0}
                    aria-label={dashI18n.selectDateRange}
                  >
                    <i className="fas fa-calendar-alt" />
                    <span id="date-range-display" aria-live="polite" />
                    <i className="fas fa-chevron-down transaction-date-range-chevron" aria-hidden="true" />
                  </div>
                  <input type="hidden" id="date_from" readOnly />
                  <input type="hidden" id="date_to" readOnly />
                </div>
                <div className="userlist-filter-chips auto-renew-filter-chips" role="group" aria-label={t("filterGroupLabel")}>
                    <FilterChip
                      active={statusFilter === "pending"}
                      label={t("filterPending")}
                      count={counts.pending}
                      onClick={() => handleStatusFilterChange("pending")}
                    />
                    <FilterChip
                      active={statusFilter === "approved"}
                      label={t("filterApproved")}
                      count={counts.approved}
                      onClick={() => handleStatusFilterChange("approved")}
                    />
                    <FilterChip
                      active={statusFilter === "rejected"}
                      label={t("filterRejected")}
                      count={counts.rejected}
                      onClick={() => handleStatusFilterChange("rejected")}
                    />
                    <FilterChip
                      active={statusFilter === "all"}
                      label={t("filterShowAll")}
                      count={counts.total}
                      onClick={() => handleStatusFilterChange("all")}
                    />
                  </div>
                </div>
              </div>
            </div>

          {!canEditGlobal && (
            <div className="auto-renew-notice warn">{t("readOnlyNotice")}</div>
          )}

          <div
            className={`user-table-wrapper user-list-table auto-renew-table${showSubmitterColumn ? " auto-renew-table--with-submitter" : ""}`}
          >
            <div className="user-list-table-inner auto-renew-table-inner">
              <div className={`auto-renew-table-hscroll${listRefreshing ? " is-refreshing" : ""}`}>
                <div className="auto-renew-table-hscroll__track">
              <div className="table-header user-list-table-header auto-renew-table-header">
                {renderHeader("no", t("colNo"))}
                {renderHeader("company", tenantColumnLabel)}
                {renderHeader("name", t("colName"))}
                {renderHeader("price", t("colPrice"))}
                {renderHeader("expiration", t("colExpiration"))}
                {renderHeader("remaining", t("colRemaining"))}
                {renderHeader("period", t("colPeriod"), { controlCol: true })}
                {renderHeader("status", t("colStatus"), { controlCol: true })}
                {showSubmitterColumn ? renderHeader("submitter", t("colSubmitter")) : null}
              </div>

              <div className="user-cards auto-renew-cards" aria-busy={listRefreshing || Boolean(busyRequestId)}>
                {displayRows.length === 0 ? (
                  <EmptyState statusFilter={statusFilter} searchTerm={searchTerm} t={t} />
                ) : (
                  displayRows.map((row, idx) => {
                    const globalIdx = showAll
                      ? idx + 1
                      : (pagination.page - 1) * AUTO_RENEW_PAGE_SIZE + idx + 1;
                    const isPendingEditable = row.status === "pending" && canEditGlobal && !row.is_payment_deleted;
                    const draft = getRowDraftValues(row, rowDrafts);
                    const displayPrice = resolveAutoRenewDisplayPrice(row, rowDrafts, feeSettings);
                    const rowBusy = busyRequestId === row.request_id;
                    const rowKey = rowStableKey(row);

                    return (
                      <div
                        key={rowKey}
                        className={`user-card user-list-row auto-renew-table-row show-card ${idx % 2 === 0 ? "row-even" : "row-odd"}${row.is_payment_deleted ? " maintenance-row-deleted" : ""}`}
                      >
                        <div className="card-item auto-renew-table-muted">{globalIdx}</div>
                        <div className="card-item card-item--strong">{row.company_code}</div>
                        <div className="card-item">{row.owner_name || "-"}</div>
                        <div className="card-item">
                          {displayPrice > 0 ? formatDomainFeeDisplay2(displayPrice) : <span className="auto-renew-table-muted">—</span>}
                        </div>
                        <div className="card-item">{row.expiration_date ? formatDate(row.expiration_date) : "-"}</div>
                        <div className="card-item">
                          <span className={`auto-renew-status-badge ${row.expiration_status || "normal"}`}>
                            {formatRemainingForRow(row, t)}
                          </span>
                        </div>
                        <div className="card-item auto-renew-col-control">
                          {isPendingEditable ? (
                            <select
                              className="auto-renew-inline-select"
                              value={draft.period}
                              disabled={rowBusy}
                              onChange={(e) => updateDraft(row.request_id, { period: e.target.value })}
                            >
                              <option value="">{t("selectPeriod")}</option>
                              {AUTO_RENEW_PERIODS.map((p) => (
                                <option key={p.value} value={p.value}>
                                  {t(p.labelKey)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="auto-renew-cell-readonly">{row.period ? t(periodToLabelKey(row.period)) : "-"}</span>
                          )}
                        </div>
                        <div className="card-item auto-renew-col-control auto-renew-col-control--status">{renderStatusCell(row)}</div>
                        {showSubmitterColumn ? (
                          <div className="card-item">{renderSubmitterCell(row)}</div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
                </div>
              </div>
            </div>
          </div>

          {filteredRows.length > 0 && !showAll && (
            <div className="pagination-container">
              <button
                type="button"
                className="pagination-btn"
                disabled={pagination.page <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                aria-label={t("prevPage")}
              >
                ◀
              </button>
              <span className="pagination-info">
                {t("paginationOf", { page: pagination.page, total: pagination.totalPages })}
              </span>
              <button
                type="button"
                className="pagination-btn"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
                aria-label={t("nextPage")}
              >
                ▶
              </button>
            </div>
          )}
        </div>
      </div>

      {canAccessC168AutoRenew(me) ? (
        <DashboardCalendarPopup i18n={dashI18n} periodPresets={periodPresets} dateFrom={dateFrom} />
      ) : null}

      {deleteConfirmRow ? (
        <ConfirmDeleteModal
          open
          title={t("confirmDeleteTitle")}
          message={t("confirmDelete", { company: deleteConfirmRow.company_code })}
          cancelLabel={t("cancel")}
          confirmLabel={t("delete")}
          confirmDisabled={Boolean(busyRequestId)}
          onConfirm={() => void confirmDeleteRow()}
          onClose={() => !busyRequestId && setDeleteConfirmRow(null)}
        />
      ) : null}

      {rejectConfirmRow ? (
        <ConfirmDeleteModal
          open
          title={t("confirmRejectTitle")}
          message={t("confirmReject", { company: rejectConfirmRow.company_code })}
          cancelLabel={t("cancel")}
          confirmLabel={t("reject")}
          confirmClassName="btn confirm-action"
          confirmDisabled={Boolean(busyRequestId)}
          onConfirm={() => void confirmRejectRow()}
          onClose={() => !busyRequestId && setRejectConfirmRow(null)}
        />
      ) : null}

      {approveConfirmRow ? (
        <ConfirmDeleteModal
          open
          title={t("confirmApproveTitle")}
          message={t("confirmApprove", { company: approveConfirmRow.company_code })}
          cancelLabel={t("cancel")}
          confirmLabel={t("approve")}
          confirmClassName="btn confirm-approve"
          confirmDisabled={Boolean(busyRequestId)}
          onConfirm={() => void confirmApproveRow()}
          onClose={() => !busyRequestId && setApproveConfirmRow(null)}
        />
      ) : null}

      <DomainNotification />

      {settingsModal?.type === "company" ? (
        <CompanySettingsModal
          lang={lang}
          company={settingsModal.tenant}
          domainPeriodPrices={feeSettings}
          sessionCompanyId={me?.company_id ?? null}
          sessionCompanyCode={me?.company_code ?? null}
          excludeOwnerId={settingsModal.ownerId}
          commissionOnly
          sharePricePeriod={settingsModal.sharePricePeriod ?? ""}
          onSave={handleSettingsSaved}
          onClose={() => setSettingsModal(null)}
        />
      ) : null}

      {settingsModal?.type === "group" ? (
        <GroupSettingsModal
          lang={lang}
          group={settingsModal.tenant}
          domainPeriodPrices={feeSettings}
          sessionCompanyId={me?.company_id ?? null}
          sessionCompanyCode={me?.company_code ?? null}
          excludeOwnerId={settingsModal.ownerId}
          commissionOnly
          sharePricePeriod={settingsModal.sharePricePeriod ?? ""}
          onSave={handleSettingsSaved}
          onClose={() => setSettingsModal(null)}
        />
      ) : null}
    </>
  );
}
