import { useLayoutEffect, useMemo, useEffect, useCallback, useRef, useState } from "react";
import { Navigate, useLocation, useOutletContext, useSearchParams } from "react-router-dom";
import TransactionPaymentHistoryPage from "./TransactionPaymentHistoryPage.jsx";
import { isPaymentHistoryView } from "./lib/transactionPaymentHistoryUrl.js";
import TransactionAddSection from "./components/TransactionAddSection.jsx";
import TransactionHeader from "./components/TransactionHeader.jsx";
import TransactionSearchSection from "./components/TransactionSearchSection.jsx";
import TransactionTablesSection from "./components/TransactionTablesSection.jsx";
import { formatDmy } from "./lib/transactionFormat.js";
import { useTransactionData } from "./hooks/useTransactionData.js";
import { useTransactionUI } from "./hooks/useTransactionUI.js";
import { useTransactionSearch } from "./hooks/useTransactionSearch.js";
import { useTransactionForm } from "./hooks/useTransactionForm.js";
import { useTransactionSync } from "./hooks/useTransactionSync.js";
import { useTransactionDateRange } from "./hooks/useTransactionDateRange.js";
import { useTransactionInitialization } from "./hooks/useTransactionInitialization.js";
import { installTransactionExcelCopy } from "./lib/transactionExcelCopy.js";
import {
  countTransactionPresentationRows,
  getRoleClass,
  shouldShowTransactionTablesSection,
} from "./lib/transactionPaymentLogic.js";
import "../../../public/css/report-outlined-fields.css";
import "../../../public/css/transaction.css";
import "../../../public/css/userlist.css";
import { useLoginLang } from "../../utils/i18n/useLoginLang.js";
import { getTransactionText, TRANSACTION_I18N } from "../../translateFile/pages/transactionTranslate.js";
import { transactionScopeApiParams } from "./lib/transactionScope.js";
import { clearInlineScrollLock } from "../../utils/layout/clearInlineScrollLock.js";
import { spaPath } from "../../utils/routing/pageRoutes.js";
import { consumeSidebarPageSoftRefresh } from "../../utils/routing/sidebarPageSoftRefresh.js";

const TX_CCY_STICKY_KEY = "transaction.payment.currencyRows.v1";

function readStickyCurrencyRows() {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(TX_CCY_STICKY_KEY);
    if (!raw) return [];
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function writeStickyCurrencyRows(rows) {
  if (typeof sessionStorage === "undefined" || !Array.isArray(rows) || !rows.length) return;
  try {
    sessionStorage.setItem(TX_CCY_STICKY_KEY, JSON.stringify(rows));
  } catch {
    /* quota */
  }
}

/** Cleared on mount so SPA navigation cannot leave stale route classes on `body` before paint (e.g. Process uses `useEffect`; this page uses `useLayoutEffect`, which runs first). */
const ROUTE_BODY_CLASSES_TO_CLEAR = [
  "bg",
  "account-page",
  "announcement-page",
  "datacapture-page",
  "process-page",
  "process-page--show-all",
  "process-page--bank",
  "process-page--bank-show-all",
  "maintenance-page",
  "report-page",
  "user-page",
  "user-page--show-all",
  "member-winloss-page",
];

/** Type Search opens Payment History with full account ledger (not pure-type filtered). */
const TYPE_SEARCH_FULL_ACCOUNT_LEDGER_TYPES = new Set([
  "PAYMENT",
  "CONTRA",
  "CLAIM",
  "CLEAR",
  "RATE",
  "ADJUSTMENT",
  "PROFIT",
  "ALL",
]);

export default function TransactionPaymentPage() {
  const [searchParams] = useSearchParams();
  if (isPaymentHistoryView(searchParams)) {
    return <TransactionPaymentHistoryPage />;
  }
  return <TransactionPaymentPageMain />;
}

function TransactionPaymentPageMain() {
  const location = useLocation();
  const { pageRefreshKey = 0 } = useOutletContext() || {};
  const todayDmy = useMemo(() => formatDmy(new Date()), []);
  
  // Translation
  const lang = useLoginLang();
  const m = useMemo(() => TRANSACTION_I18N[lang] || TRANSACTION_I18N.en, [lang]);
  const t = useCallback((key, params) => getTransactionText(lang, key, params), [lang]);

  // 1. UI State
  const ui = useTransactionUI();
  const { pushToast } = ui;

  // 2. Data & Auth
  const data = useTransactionData({ todayDmy });
  const { filterSnapshot, transactionScope, currencyRowsOrdered, loading, forbidden } = data;
  const scopeApi = useMemo(() => transactionScopeApiParams(transactionScope), [transactionScope]);

  // Sticky currency package so Group/Company never paint alone without Currency.
  const stickyCcyRef = useRef(readStickyCurrencyRows());
  if (currencyRowsOrdered?.length) {
    stickyCcyRef.current = currencyRowsOrdered;
    writeStickyCurrencyRows(currencyRowsOrdered);
  }
  const paintCurrencyRows =
    currencyRowsOrdered?.length > 0 ? currencyRowsOrdered : stickyCcyRef.current;
  const gcPackageReady = paintCurrencyRows.length > 0;

  // Sticky last table presentation while a new search is in flight (unified swap).
  const stickyTableRef = useRef(null);

  // 3. Form Logic
  const formSearchRef = useRef(null);
  const afterSubmitRef = useRef(async () => {});
  const onFormSearch = useCallback((opts) => {
    if (formSearchRef.current) formSearchRef.current(opts);
  }, []);

  const form = useTransactionForm({
    todayDmy,
    pushToast,
    onSearch: onFormSearch,
    onAfterSuccessfulSubmit: (opts) => afterSubmitRef.current(opts),
    refreshContraInboxBadge: ui.refreshContraInboxBadge,
    filterSnapshot,
    transactionScope,
    accountOptions: data.accountOptions,
    m,
    t,
  });

  // 4. Search Logic
  const search = useTransactionSearch({
    filterSnapshot,
    transactionScope,
    currencyScopeBundle: data.currencyScopeBundle,
    todayDmy,
    pushToast,
    txType: form.txType,
    currencyRowsOrdered,
    setCurrencyRowsOrdered: data.setCurrencyRowsOrdered,
    m,
    t,
  });
  formSearchRef.current = search.runSearch;
  afterSubmitRef.current = (opts) => search.applySubmitFocusAndRefresh(opts);

  // 5. Defaults (useLayoutEffect: must run before passive effects that call runSearch)
  useTransactionInitialization({
    loading,
    forbidden,
    filterSnapshot,
    transactionScope,
    currencyScopeBundle: data.currencyScopeBundle,
    todayDmy,
    search,
    form,
  });

  // 6. Date Range & External Libs
  useTransactionDateRange({
    loading,
    forbidden,
    filterSnapshot,
    dateFrom: search.dateFrom,
    dateTo: search.dateTo,
    setDateFrom: search.setDateFrom,
    setDateTo: search.setDateTo,
    todayDmy,
    txDate: form.txDate,
    setTxDate: form.setTxDate,
    rateDate: form.rateDate,
    setRateDate: form.setRateDate,
  });

  // Sidebar same-page re-click: force filters back to defaults (keep company/group).
  const lastHandledSoftRefreshKeyRef = useRef(0);
  useLayoutEffect(() => {
    if (!pageRefreshKey) return;
    if (!consumeSidebarPageSoftRefresh("transaction")) return;
    if (pageRefreshKey === lastHandledSoftRefreshKeyRef.current) return;
    lastHandledSoftRefreshKeyRef.current = pageRefreshKey;
    void search.resetPageFiltersToDefaults?.();
  }, [pageRefreshKey, search.resetPageFiltersToDefaults]);

  // 7. Sync & Lifecycle
  const canApproveContra = useMemo(() => {
    const role = filterSnapshot?.viewerRole;
    return ["manager", "admin", "owner"].includes(role);
  }, [filterSnapshot?.viewerRole]);

  useTransactionSync({
    filterSnapshot,
    transactionScope,
    effectiveDateFrom: search.effectiveDateFrom,
    effectiveDateTo: search.effectiveDateTo,
    selectedCategories: search.selectedCategories,
    searchState: search.searchState,
    showAllCurrencies: search.showAllCurrencies,
    selectedCurrencies: search.selectedCurrencies,
    lastSearchCommitMsRef: search.lastSearchCommitMsRef,
    runSearch: search.runSearch,
    runTypeSearch: search.runTypeSearch,
    typeSearchActive: search.typeSearchActive,
    typeSearchFormType: search.typeSearchFormType,
    submitFocusActive: search.submitFocusActive,
    loading,
    forbidden,
    canApproveContra,
    refreshContraInboxBadge: ui.refreshContraInboxBadge,
    initialSearchDoneRef: search.initialSearchDoneRef,
  });

  const applyTransactionBodyClasses = useCallback(() => {
    document.body.classList.remove(...ROUTE_BODY_CLASSES_TO_CLEAR, "bg");
    document.body.classList.add("dashboard-page");
    clearInlineScrollLock();
  }, []);

  useLayoutEffect(() => {
    applyTransactionBodyClasses();
    return () => {
      document.body.classList.remove("page-ready");
    };
  }, [applyTransactionBodyClasses]);

  /** Re-apply after company switch or stale passive cleanups (e.g. Home dashboard unmount re-adds `bg`). */
  useEffect(() => {
    applyTransactionBodyClasses();
  }, [applyTransactionBodyClasses, transactionScope?.scopeCompanyId, transactionScope?.viewGroup]);

  useEffect(() => {
    return installTransactionExcelCopy();
  }, []);

  useEffect(() => {
    window.MaintenanceDateRangePicker?.setLocaleStrings?.({
      monthLabels: m.monthsShort,
    });
  }, [lang, m]);

  /** Hooks must run every render — never after `return null` / `Navigate` (React #310). */
  const singleCategoryFallbackRoleClass = useMemo(() => {
    const raw = search.selectedCategories || [];
    const sel = raw.filter((x) => x != null && String(x).trim() !== "" && String(x).trim().toUpperCase() !== "");
    if (sel.length !== 1) return "";
    return getRoleClass(String(sel[0]));
  }, [search.selectedCategories]);

  const txWlTolBannerActive = useMemo(() => {
    try {
      return new URLSearchParams(location.search || "").get("tx_wl_tol") === "1";
    } catch {
      return false;
    }
  }, [location.search]);
  
  const periodPresets = useMemo(
    () => [
      ["today", m.today],
      ["yesterday", m.yesterday],
      ["thisWeek", m.thisWeek],
      ["lastWeek", m.lastWeek],
      ["thisMonth", m.thisMonth],
      ["lastMonth", m.lastMonth],
      ["thisYear", m.thisYear],
      ["lastYear", m.lastYear],
    ],
    [m],
  );

  const onTypeSearch = useCallback(() => {
    search.runTypeSearch(form.txType);
  }, [search.runTypeSearch, form.txType]);

  const onExitTypeSearch = useCallback(async () => {
    // Keep right form date (users often book many payments on the same day).
    await search.exitTypeSearchAndRefresh();
  }, [search.exitTypeSearchAndRefresh]);

  const onSearch = useCallback(() => {
    search.runSearch({ silent: false });
  }, [search.runSearch]);

  const toggleContraInbox = useCallback(() => {
    ui.setContraInbox((s) => ({ ...s, open: !s.open }));
  }, [ui.setContraInbox]);

  const closeContraInbox = useCallback(() => {
    ui.setContraInbox((s) => ({ ...s, open: false }));
  }, [ui.setContraInbox]);

  const refreshContraInbox = useCallback(() => {
    void ui.refreshContraInboxBadge(scopeApi);
  }, [ui.refreshContraInboxBadge, scopeApi]);

  const onApproveContra = useCallback(
    async (opts) => {
      const res = await ui.onApproveContra(opts.transactionId, scopeApi);
      if (!res?.success) return;
      const codes = [opts.toAccountCode, opts.fromAccountCode]
        .map((c) => String(c || "").trim().toUpperCase())
        .filter(Boolean);
      const accountIds = [];
      for (const code of codes) {
        const opt = (data.accountOptions || []).find((a) => {
          const aid = String(a?.account_id || a?.code || "").toUpperCase().trim();
          return aid === code;
        });
        if (opt?.id) accountIds.push(Number(opt.id));
      }
      if (accountIds.length > 0) {
        await search.applySubmitFocusAndRefresh({
          accountIds,
          submitCurrency: opts.currency,
        });
      }
    },
    [ui.onApproveContra, scopeApi, search.applySubmitFocusAndRefresh, data.accountOptions],
  );

  const onRejectContra = useCallback(
    (opts) => ui.onRejectContra(opts.transactionId, scopeApi, search.runSearch),
    [ui.onRejectContra, scopeApi, search.runSearch],
  );

  // Hold top form+filter until GC package is ready — same "dead board" idea as dashboard.
  // Must be before any early return (hooks order).
  const [surfaceReady, setSurfaceReady] = useState(gcPackageReady);
  useLayoutEffect(() => {
    if (surfaceReady) return;
    if (gcPackageReady) setSurfaceReady(true);
  }, [surfaceReady, gcPackageReady]);
  useLayoutEffect(() => {
    if (surfaceReady || loading) return undefined;
    if (!filterSnapshot) return undefined;
    const t = window.setTimeout(() => setSurfaceReady(true), 900);
    return () => window.clearTimeout(t);
  }, [surfaceReady, loading, filterSnapshot]);

  if (forbidden) {
    return <Navigate to={spaPath("dashboard")} replace />;
  }

  // Never paint Loading / empty chrome — tables appear when rows exist.
  // Keep last solid table frame during searchLoading so filter + tables flip together.
  if (countTransactionPresentationRows(search.tablePresentation) > 0) {
    stickyTableRef.current = search.tablePresentation;
  }
  const paintTablePresentation =
    search.searchLoading && stickyTableRef.current
      ? stickyTableRef.current
      : search.tablePresentation;

  const tablesVisible =
    gcPackageReady &&
    shouldShowTransactionTablesSection({
      showAllCurrencies: search.showAllCurrencies,
      selectedCurrencies: search.selectedCurrencies,
      tablePresentation: paintTablePresentation,
      searchLoading: false,
    });

  return (
    <div className="container-fluid transaction-container">
      <TransactionHeader
        canApproveContra={canApproveContra}
        contraInbox={ui.contraInbox}
        toggleContraInbox={toggleContraInbox}
        closeContraInbox={closeContraInbox}
        refreshContraInbox={refreshContraInbox}
        approveContra={onApproveContra}
        rejectContra={onRejectContra}
        scopeApi={scopeApi}
        mutationsBlocked={Boolean(filterSnapshot?.mutationsBlocked)}
        m={m}
        t={t}
      />

      <main className="transaction-main">
        {txWlTolBannerActive ? (
          <div
            className="transaction-tx-wl-tol-banner"
            style={{
              margin: "0 0 12px 0",
              padding: "10px 12px",
              background: "#fffbeb",
              border: "1px solid #f59e0b",
              borderRadius: 8,
              color: "#78350f",
              fontSize: 13,
            }}
            dangerouslySetInnerHTML={{ __html: m.toleranceBanner }}
          />
        ) : null}
        {surfaceReady ? (
          <>
            <div className="transaction-main-content">
              <TransactionSearchSection
                categoryOpen={search.categoryOpen}
                toggleCategory={search.toggleCategory}
                categories={data.categories}
                selectedCategories={search.selectedCategories}
                categoryAllCheckboxRef={search.categoryAllCheckboxRef}
                onCategoryAllChange={search.onCategoryAllChange}
                toggleCategoryValue={search.toggleCategoryValue}
                removeCategoryTag={search.removeCategoryTag}
                searchState={search.searchState}
                setSearchState={search.setSearchState}
                showAllCurrencies={search.showAllCurrencies}
                selectedCurrencies={search.selectedCurrencies}
                setSelectedCurrencies={search.setSelectedCurrencies}
                toggleAllCurrenciesBtn={search.toggleAllCurrenciesBtn}
                currencyOptions={data.currencyOptions}
                searchLoading={search.searchLoading}
                onSearch={onSearch}
                fs={filterSnapshot}
                onGroupButtonClick={data.onGroupButtonClick}
                onCompanyButtonClick={data.onCompanyButtonClick}
                onWarmCompany={data.onWarmCompany}
                onPickAllGroups={data.onPickAllGroups}
                onPickAllInGroup={data.onPickAllInGroup}
                allowCompanyDeselect={data.allowCompanyDeselect}
                currencyRowsOrdered={paintCurrencyRows}
                onCurrencyDragStart={search.onCurrencyDragStart}
                onCurrencyDropOn={search.onCurrencyDropOn}
                toggleCurrencyBtn={search.toggleCurrencyBtn}
                m={m}
                t={t}
              />

              <TransactionAddSection
                txType={form.txType}
                setTxType={form.setTxType}
                todayDmy={todayDmy}
                txDate={form.txDate}
                rateDate={form.rateDate}
                txToAccount={form.txToAccount}
                setTxToAccount={form.setTxToAccount}
                txFromAccount={form.txFromAccount}
                setTxFromAccount={form.setTxFromAccount}
                selectedCategories={search.selectedCategories}
                txCurrency={form.txCurrency}
                setTxCurrency={form.setTxCurrency}
                txAmount={form.txAmount}
                setTxAmount={form.setTxAmount}
                txRemark={form.txRemark}
                setTxRemark={form.setTxRemark}
                txConfirm={form.txConfirm}
                setTxConfirm={form.setTxConfirm}
                submitting={form.submitting}
                onSubmitTx={form.onSubmitTx}
                onTypeSearch={onTypeSearch}
                onExitTypeSearch={onExitTypeSearch}
                typeSearchActive={search.listPresentationModeActive}
                searchLoading={search.searchLoading}
                accountOptions={data.accountOptions}
                currencyOptions={data.currencyOptions}
                showStandardFromAndReverse={form.showStandardFromAndReverse}
                onReverseAccounts={form.onReverseAccounts}
                mutationsBlocked={Boolean(filterSnapshot?.mutationsBlocked)}
                rateToAccount={form.rateToAccount}
                setRateToAccount={form.setRateToAccount}
                rateFromAccount={form.rateFromAccount}
                setRateFromAccount={form.setRateFromAccount}
                rateCurrencyFrom={form.rateCurrencyFrom}
                setRateCurrencyFrom={form.setRateCurrencyFrom}
                rateCurrencyTo={form.rateCurrencyTo}
                setRateCurrencyTo={form.setRateCurrencyTo}
                rateCurrencyFromAmount={form.rateCurrencyFromAmount}
                setRateCurrencyFromAmount={form.setRateCurrencyFromAmount}
                rateExchangeRateRaw={form.rateExchangeRateRaw}
                setRateExchangeRateRaw={form.setRateExchangeRateRaw}
                rateCurrencyToAmount={form.rateCurrencyToAmount}
                onRateCurrencyRowReverse={form.onRateCurrencyRowReverse}
                rateTransferToAccount={form.rateTransferToAccount}
                setRateTransferToAccount={form.setRateTransferToAccount}
                rateTransferFromAccount={form.rateTransferFromAccount}
                setRateTransferFromAccount={form.setRateTransferFromAccount}
                rateMiddlemanAccount={form.rateMiddlemanAccount}
                setRateMiddlemanAccount={form.setRateMiddlemanAccount}
                rateMiddlemanRate={form.rateMiddlemanRate}
                setRateMiddlemanRate={form.setRateMiddlemanRate}
                rateMiddlemanAmount={form.rateMiddlemanAmount}
                rateMiddlemanInputAmount={form.rateMiddlemanInputAmount}
                setRateMiddlemanInputAmount={form.setRateMiddlemanInputAmount}
                rateMiddlemanPlatformFee={form.rateMiddlemanPlatformFee}
                setRateMiddlemanPlatformFee={form.setRateMiddlemanPlatformFee}
                m={m}
                t={t}
              />
            </div>

            <TransactionTablesSection
              tablesVisible={tablesVisible}
              searchLoading={false}
              tp={paintTablePresentation}
              searchState={search.searchState}
              listPresentationModeActive={search.listPresentationModeActive}
              getRoleClass={getRoleClass}
              fallbackRoleClass={singleCategoryFallbackRoleClass}
              openHistory={(row) =>
                ui.onViewHistory(
                  row,
                  search.effectiveDateFrom,
                  search.effectiveDateTo,
                  scopeApi,
                  {
                    selectedCurrencies: search.selectedCurrencies,
                    showAllCurrencies: search.showAllCurrencies,
                    pureTypeSearch:
                      search.typeSearchActive &&
                      !TYPE_SEARCH_FULL_ACCOUNT_LEDGER_TYPES.has(
                        String(search.typeSearchFormType || "").toUpperCase(),
                      )
                        ? search.typeSearchFormType
                        : null,
                  },
                )
              }
              handleBalanceCellClick={form.handleBalanceCellClick}
              m={m}
              t={t}
            />
          </>
        ) : null}
      </main>

      {/* Same date logic as legacy page, with Transaction-specific range picker layout. */}
      <div className="calendar-popup calendar-popup--transaction-range" id="calendar-popup" style={{ display: "none" }}>
        <div className="transaction-calendar-presets" aria-label="Period shortcuts">
          {periodPresets.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="transaction-calendar-preset"
              data-period-key={key}
              aria-pressed="false"
              onClick={(e) => {
                e.stopPropagation();
                window.selectQuickRange?.(key);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="transaction-calendar-panel">
          <div className="calendar-header">
            <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(-1); }}>
              <i className="fas fa-chevron-left" />
            </button>
            <div className="calendar-month-year" onClick={(e) => e.stopPropagation()} role="presentation">
              <button type="button" id="calendar-month-select" className="calendar-month-trigger" value="4" aria-label="Month">
                May
              </button>
              <button type="button" id="calendar-year-select" className="calendar-year-trigger" value="2026" aria-label="Year">
                2026
              </button>
            </div>
            <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(1); }}>
              <i className="fas fa-chevron-right" />
            </button>
          </div>
          <div className="calendar-weekdays">
            {m.weekdaysShort.map((d) => (
              <div key={d} className="calendar-weekday">{d}</div>
            ))}
          </div>
          <div className="calendar-days" id="calendar-days" />
        </div>
      </div>

      <div id="notificationContainer" className="transaction-notification-container" aria-live="polite">
        {ui.toast.map((t) => {
          const typeClass =
            t.type === "error"
              ? "transaction-notification-error"
              : t.type === "success"
                ? "transaction-notification-success"
                : "transaction-notification-info";
          return (
            <div key={t.id} className={`transaction-notification ${typeClass} show`} role="status">
              {t.message}
            </div>
          );
        })}
      </div>
    </div>
  );
}
