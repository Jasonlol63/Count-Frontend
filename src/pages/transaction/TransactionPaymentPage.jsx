import { useLayoutEffect, useMemo, useEffect, useCallback, useRef } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
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
import { getRoleClass } from "./lib/transactionPaymentLogic.js";
import "../../../public/css/report-outlined-fields.css";
import "../../../public/css/transaction.css";
import "../../../public/css/userlist.css";
import { useLoginLang } from "../../utils/i18n/useLoginLang.js";
import { getTransactionText, TRANSACTION_I18N } from "../../translateFile/pages/transactionTranslate.js";
import { transactionScopeApiParams, transactionScopeCacheKey } from "./lib/transactionScope.js";
import { clearInlineScrollLock } from "../../utils/layout/clearInlineScrollLock.js";
import { spaPath } from "../../utils/routing/pageRoutes.js";

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

export default function TransactionPaymentPage() {
  const [searchParams] = useSearchParams();
  if (isPaymentHistoryView(searchParams)) {
    return <TransactionPaymentHistoryPage />;
  }
  return <TransactionPaymentPageMain />;
}

function TransactionPaymentPageMain() {
  const location = useLocation();
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

  // 3. Form Logic
  const formSearchRef = useRef(null);
  const onFormSearch = useCallback((opts) => {
    if (formSearchRef.current) formSearchRef.current(opts);
  }, []);

  const form = useTransactionForm({
    todayDmy,
    pushToast,
    onSearch: onFormSearch,
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
    loading,
    forbidden,
    canApproveContra,
    refreshContraInboxBadge: ui.refreshContraInboxBadge,
    initialSearchDoneRef: search.initialSearchDoneRef,
  });

  const applyTransactionBodyClasses = useCallback(() => {
    document.body.classList.remove(...ROUTE_BODY_CLASSES_TO_CLEAR, "bg");
    document.body.classList.add("dashboard-page", "transaction-page");
    clearInlineScrollLock();
  }, []);

  useLayoutEffect(() => {
    applyTransactionBodyClasses();
    return () => {
      document.body.classList.remove("transaction-page", "page-ready");
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
    (opts) => ui.onApproveContra(opts.transactionId, scopeApi, search.runSearch),
    [ui.onApproveContra, scopeApi, search.runSearch],
  );

  const onRejectContra = useCallback(
    (opts) => ui.onRejectContra(opts.transactionId, scopeApi),
    [ui.onRejectContra, scopeApi],
  );

  if (forbidden) {
    return <Navigate to={spaPath("dashboard")} replace />;
  }

  const booting = loading || !filterSnapshot;
  const scopeCacheKey = transactionScopeCacheKey(transactionScope);
  const scopeDataPending = Boolean(
    filterSnapshot && scopeCacheKey && data.currencyScopeBundle?.scopeKey !== scopeCacheKey,
  );
  const tablesLoading = search.searchLoading || scopeDataPending;
  const tablesVisible = search.tablesVisible || Boolean(filterSnapshot);

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

      <main className={`transaction-main${booting ? " transaction-main--booting" : ""}`}>
        {booting && !search.rawSearchData ? (
          <div className="transaction-boot-loading" aria-live="polite" aria-busy="true">
            {m.loadingData}
          </div>
        ) : null}
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
            currencyRowsOrdered={currencyRowsOrdered}
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
            onSearch={onSearch}
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
            m={m}
            t={t}
          />
        </div>

        <TransactionTablesSection
          tablesVisible={tablesVisible}
          searchLoading={tablesLoading}
          tp={search.tablePresentation}
          searchState={search.searchState}
          getRoleClass={getRoleClass}
          fallbackRoleClass={singleCategoryFallbackRoleClass}
          openHistory={(row) =>
            ui.onViewHistory(row, search.effectiveDateFrom, search.effectiveDateTo, scopeApi, {
              selectedCurrencies: search.selectedCurrencies,
              showAllCurrencies: search.showAllCurrencies,
            })
          }
          handleBalanceCellClick={form.handleBalanceCellClick}
          m={m}
          t={t}
        />
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
