import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { flushSync } from "react-dom";
import { isCancelledError, useQueryClient } from "@tanstack/react-query";
import {
  TRANSACTION_CURRENCY_FILTER_KEY_PREFIX,
  TX_LIST_INVALIDATE_LS_KEY,
  TX_LIST_INVALIDATE_HANDLED_KEY,
  buildTransactionSearchQueryFilters,
  filterTransactionTableRows,
  applySummaryWinLossDisplayTolerance,
  buildTxListSessionKey,
  calculateTotals,
  countDisplayedRows,
  normalizeRateRowsByCrDr,
  applyTypeSearchAccountFilter,
  hasSubmitFocusByCurrency,
  getSubmitFocusAccountIdsForCurrency,
  readTransactionCurrencyFilterState,
  pickTransactionDefaultCurrency,
  readTxListFromSessionStorage,
  sortByRole,
  applyOptimisticSubmitBalancePatch,
  sanitizeSearchApiData,
  mergeSearchApiDataList,
} from "../lib/transactionPaymentLogic.js";
import {
  searchTransactions as searchTransactionsApi,
  fetchTypeAccountSearch,
  fetchTypeTransactionSearch,
  saveUserCurrencyOrder,
  transactionQueryKeys,
} from "../lib/transactionApi.js";
import { buildOptimisticSubmitDeltas } from "../lib/transactionSubmitHelpers.js";
import { getTxSearchCache, setTxSearchCache, clearTxSearchCache } from "../../../utils/transaction/transactionSearchCache.js";
import {
  buildDefaultSearchApiParams,
  buildTransactionSearchRequestKey,
} from "../lib/transactionScopePrefetch.js";
import {
  buildDashboardCurrencyScopeKey,
  notifyDashboardCurrencyFilterChanged,
} from "../../../utils/company/sharedCompanyFilter.js";

/** Type Search uses Capture Date + search_api period metrics (not all-time grid API). */
const PERIOD_TYPE_SEARCH_TYPES = new Set(["CONTRA", "PAYMENT", "CLAIM", "CLEAR", "RATE", "ADJUSTMENT", "PROFIT"]);

const INITIAL_TRANSACTION_SEARCH_STATE = {
  showName: false,
  showCaptureOnly: false,
  showPaymentOnly: false,
  showZeroBalance: false,
};

function syncCaptureDateDom(dateDmy) {
  const d = String(dateDmy || "").trim();
  if (!d) return;
  const df = document.getElementById("date_from");
  const dt = document.getElementById("date_to");
  if (df) df.value = d;
  if (dt) dt.value = d;
  window.MaintenanceDateRangePicker?.refreshInputsDisplay?.({
    dateFromId: "date_from",
    dateToId: "date_to",
    displayId: "date-range-display",
  });
}
import { persistCurrencyDisplayOrder } from "../../../utils/company/currencyDisplayOrder.js";
import { useCrossPageCurrencySync } from "../../../utils/company/useCrossPageCurrencySync.js";
import {
  transactionScopeApiParams,
  transactionScopeCacheCompanyKey,
  transactionScopeCacheKey,
  transactionScopeIsReady,
  resolveTransactionCurrencyOrderCompanyId,
} from "../lib/transactionScope.js";

export function useTransactionSearch({
  filterSnapshot,
  transactionScope,
  currencyScopeBundle,
  todayDmy,
  pushToast,
  txType,
  currencyRowsOrdered,
  setCurrencyRowsOrdered,
  m,
  t,
}) {
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [searchState, setSearchState] = useState({ ...INITIAL_TRANSACTION_SEARCH_STATE });
  const [showAllCurrencies, setShowAllCurrencies] = useState(false);
  const [selectedCurrencies, setSelectedCurrencies] = useState([]);
  /** Block cross-page currency sync when All or multi-select is active (empty currentCode would re-apply MYR etc.). */
  const suppressCrossPageCurrencyRef = useRef(false);
  /** Until user changes currency, keep MYR default on cold boot (ignore dashboard cross-page SGD etc.). */
  const bootCurrencyDefaultRef = useRef(true);
  const coldBootCurrencyAppliedRef = useRef(false);
  /** Snapshot of selected currencies immediately before entering All — restored when All is toggled off. */
  const currenciesBeforeAllRef = useRef([]);
  const [rawSearchData, setRawSearchData] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [tablesVisible, setTablesVisible] = useState(false);
  /** Right-side type search mode (server filters account list via type_account_ids). */
  const [typeSearchActive, setTypeSearchActive] = useState(false);
  const [typeSearchAccountIds, setTypeSearchAccountIds] = useState([]);
  const [typeSearchFormType, setTypeSearchFormType] = useState(null);
  /** Post-submit focused rows per currency: { MYR: [ids], SGD: [ids] } on current capture range. */
  const [submitFocusByCurrency, setSubmitFocusByCurrency] = useState({});
  const [submitFocusRangeKey, setSubmitFocusRangeKey] = useState(null);
  /** Capture ranges left while in submit-focus — returning runs full Type Search (scheme A). */
  const submitFocusLeftRangeKeysRef = useRef(new Set());

  const queryClient = useQueryClient();
  const latestRunTokenRef = useRef(0);
  const lastCompletedSearchKeyRef = useRef("");
  const lastCompletedSearchTsRef = useRef(0);
  const categoryChangedByUserRef = useRef(false);
  const initialSearchDoneRef = useRef(false);
  const lastSearchCommitMsRef = useRef(0);
  const runSearchRef = useRef(null);
  const autoSearchTimerRef = useRef(null);
  /** Tracks last server-side filter chips; null until after first search commit (avoids duplicate fetch on mount). */
  const prevServerSideFiltersRef = useRef(null);
  /** After a real company switch, skip one blocking "Loading data" overlay (still fetch in background). */
  const suppressBlockingOverlayOnceRef = useRef(false);
  const prevScopeKeyForSearchRef = useRef(null);
  /** Capture Date 变更后触发搜索；与「仅首次拉数」的 initial effect 分离，避免 initialSearchDoneRef 为 true 时改日期不请求 */
  const prevCaptureDateRangeKeyRef = useRef(null);
  const lastInitialSearchKeyRef = useRef("");
  const earlyCurrencyScopeRef = useRef(null);
  const [categoryOpen, setCategoryOpen] = useState(false);

  const categoryAllCheckboxRef = useRef(null);
  const effectiveDateFrom = dateFrom || todayDmy;
  const effectiveDateTo = dateTo || todayDmy;
  const effectiveDateRangeText = `${effectiveDateFrom} - ${effectiveDateTo}`;
  const captureRangeKey = `${effectiveDateFrom}|${effectiveDateTo}`;
  const submitFocusActive =
    hasSubmitFocusByCurrency(submitFocusByCurrency) && submitFocusRangeKey === captureRangeKey;
  const listPresentationModeActive = typeSearchActive || submitFocusActive;
  const selectedCurrenciesKey = selectedCurrencies.map((c) => String(c || "").toUpperCase()).join(",");
  const scopeViewGroup = transactionScope?.viewGroup ?? null;
  const scopeReady = transactionScopeIsReady(transactionScope);
  const scopeApi = useMemo(() => transactionScopeApiParams(transactionScope), [transactionScope]);
  const scopeCacheCompanyKey = transactionScopeCacheCompanyKey(transactionScope);
  const orderCompanyId = useMemo(
    () =>
      resolveTransactionCurrencyOrderCompanyId(
        transactionScope,
        filterSnapshot?.snapCompaniesAll || filterSnapshot?.snapCompanies,
      ),
    [transactionScope, filterSnapshot?.snapCompanies, filterSnapshot?.snapCompaniesAll],
  );

  const persistCurrencyFilter = useCallback((companyId, showAll, sel, scopeGroup = null) => {
    if (!companyId) return;
    try {
      localStorage.setItem(
        TRANSACTION_CURRENCY_FILTER_KEY_PREFIX + companyId,
        JSON.stringify({ showAll: !!showAll, currencies: [...(sel || [])] }),
      );
      if (!showAll && sel?.length >= 1) {
        const scopeKey =
          buildDashboardCurrencyScopeKey({
            companyId: /^\d+$/.test(String(companyId)) ? Number(companyId) : null,
            selectedGroup: scopeGroup,
          }) || String(companyId);
        notifyDashboardCurrencyFilterChanged(sel[sel.length - 1], scopeKey);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCategory = useCallback(() => setCategoryOpen((v) => !v), []);

  const onCategoryAllChange = useCallback((checked) => {
    if (!checked) return;
    categoryChangedByUserRef.current = true;
    setSelectedCategories([]);
  }, []);

  const toggleCategoryValue = useCallback((value) => {
    const v = String(value || "").toUpperCase().trim();
    categoryChangedByUserRef.current = true;
    setSelectedCategories((prev) => {
      const set = new Set(prev.map((x) => String(x).toUpperCase()));
      if (set.has(v)) set.delete(v);
      else set.add(v);
      return [...set];
    });
  }, []);

  const removeCategoryTag = useCallback((categoryValue) => {
    const v = String(categoryValue || "").toUpperCase().trim();
    setSelectedCategories((prev) => prev.filter((x) => String(x).toUpperCase() !== v));
    // Trigger search after state update
    categoryChangedByUserRef.current = true;
  }, []);

  const scheduleAutoSearch = useCallback(({ isInitialLoad = false, delayMs = 260, forceRefresh = false } = {}) => {
    if (autoSearchTimerRef.current) clearTimeout(autoSearchTimerRef.current);
    autoSearchTimerRef.current = setTimeout(() => {
      autoSearchTimerRef.current = null;
      void runSearchRef.current?.({
        silent: true,
        notifyErrors: true,
        showBlockingOverlay: false,
        isInitialLoad,
        forceRefresh,
      });
    }, delayMs);
  }, []);

  const txCurrencyCodes = useMemo(
    () =>
      (currencyRowsOrdered || [])
        .map((r) => String(r.code || "").toUpperCase().trim())
        .filter(Boolean),
    [currencyRowsOrdered],
  );

  const notifySingleCurrencyIfNeeded = useCallback(
    (codes) => {
      if (!Array.isArray(codes) || codes.length !== 1) return;
      const scopeKey =
        buildDashboardCurrencyScopeKey({
          companyId:
            transactionScope?.scopeCompanyId > 0 ? transactionScope.scopeCompanyId : null,
          selectedGroup: transactionScope?.selectedGroup ?? scopeViewGroup,
        }) || String(scopeCacheCompanyKey);
      notifyDashboardCurrencyFilterChanged(codes[0], scopeKey);
    },
    [
      scopeCacheCompanyKey,
      transactionScope?.selectedGroup,
      transactionScope?.scopeCompanyId,
      scopeViewGroup,
    ],
  );

  const toggleAllCurrenciesBtn = useCallback(() => {
    if (txCurrencyCodes.length < 2) return;
    bootCurrencyDefaultRef.current = false;
    if (showAllCurrencies) {
      const avail = new Set(txCurrencyCodes);
      const restored = currenciesBeforeAllRef.current
        .map((c) => String(c || "").toUpperCase().trim())
        .filter((c) => c && avail.has(c));
      const nextSel =
        restored.length > 0 ? restored : txCurrencyCodes[0] ? [txCurrencyCodes[0]] : [];

      suppressCrossPageCurrencyRef.current = nextSel.length !== 1;
      setShowAllCurrencies(false);
      setSelectedCurrencies(nextSel);
      persistCurrencyFilter(scopeCacheCompanyKey, false, nextSel, transactionScope?.selectedGroup);
      notifySingleCurrencyIfNeeded(nextSel);
      scheduleAutoSearch();
      return;
    }

    currenciesBeforeAllRef.current = selectedCurrencies
      .map((c) => String(c || "").toUpperCase().trim())
      .filter(Boolean);
    suppressCrossPageCurrencyRef.current = true;
    setShowAllCurrencies(true);
    setSelectedCurrencies([]);
    persistCurrencyFilter(scopeCacheCompanyKey, true, [], transactionScope?.selectedGroup);
    scheduleAutoSearch();
  }, [
    showAllCurrencies,
    selectedCurrencies,
    txCurrencyCodes,
    scopeCacheCompanyKey,
    persistCurrencyFilter,
    scheduleAutoSearch,
    transactionScope?.selectedGroup,
    notifySingleCurrencyIfNeeded,
  ]);

  /** All 仅在两种及以上货币时可用；仅一种时退出 All 并选中该货币。 */
  useEffect(() => {
    if (txCurrencyCodes.length >= 2 || !showAllCurrencies) return;
    const code = txCurrencyCodes[0];
    setShowAllCurrencies(false);
    setSelectedCurrencies(code ? [code] : []);
    persistCurrencyFilter(
      scopeCacheCompanyKey,
      false,
      code ? [code] : [],
      transactionScope?.selectedGroup,
    );
    if (code) notifySingleCurrencyIfNeeded([code]);
    scheduleAutoSearch();
  }, [
    txCurrencyCodes,
    showAllCurrencies,
    scopeCacheCompanyKey,
    transactionScope?.selectedGroup,
    persistCurrencyFilter,
    notifySingleCurrencyIfNeeded,
    scheduleAutoSearch,
  ]);

  suppressCrossPageCurrencyRef.current =
    showAllCurrencies || selectedCurrencies.length !== 1;

  const applyCrossPageCurrency = useCallback(
    (code) => {
      if (bootCurrencyDefaultRef.current) return;
      const c = String(code || "").toUpperCase().trim();
      if (!c || suppressCrossPageCurrencyRef.current) return;
      setShowAllCurrencies(false);
      setSelectedCurrencies([c]);
      persistCurrencyFilter(
        scopeCacheCompanyKey,
        false,
        [c],
        transactionScope?.selectedGroup,
      );
      scheduleAutoSearch();
    },
    [
      scopeCacheCompanyKey,
      persistCurrencyFilter,
      scheduleAutoSearch,
      transactionScope?.selectedGroup,
    ],
  );

  useCrossPageCurrencySync({
    enabled: txCurrencyCodes.length > 0 && scopeReady,
    companyId:
      transactionScope?.scopeCompanyId > 0
        ? transactionScope.scopeCompanyId
        : null,
    selectedGroup: transactionScope?.selectedGroup ?? scopeViewGroup,
    availableCodes: txCurrencyCodes,
    currentCode: selectedCurrencies.length === 1 ? selectedCurrencies[0] : "",
    onApplyCode: applyCrossPageCurrency,
    suppressRef: suppressCrossPageCurrencyRef,
    respectEmptyRef: suppressCrossPageCurrencyRef,
  });

  const toggleCurrencyBtn = useCallback(
    (code) => {
      bootCurrencyDefaultRef.current = false;
      const c = String(code || "").toUpperCase().trim();
      if (!c) return;

      const set = new Set(selectedCurrencies.map((x) => String(x || "").toUpperCase().trim()));
      if (set.has(c)) {
        set.delete(c);
      } else {
        set.add(c);
      }
      const nextSel = [...set];
      const nextShowAll = false;

      // Set before notify/state — cross-page listener runs synchronously and would collapse multi-select.
      suppressCrossPageCurrencyRef.current = nextShowAll || nextSel.length !== 1;

      setShowAllCurrencies(nextShowAll);
      setSelectedCurrencies(nextSel);
      persistCurrencyFilter(scopeCacheCompanyKey, nextShowAll, nextSel, transactionScope?.selectedGroup);
      notifySingleCurrencyIfNeeded(nextSel);
      scheduleAutoSearch();
    },
    [
      selectedCurrencies,
      scopeCacheCompanyKey,
      persistCurrencyFilter,
      scheduleAutoSearch,
      transactionScope?.selectedGroup,
      notifySingleCurrencyIfNeeded,
    ],
  );

  const onCurrencyDragStart = useCallback((code) => {
    window.__dragging_currency_code = code;
  }, []);

  const onCurrencyDropOn = useCallback(
    async (targetCode) => {
      const sourceCode = window.__dragging_currency_code;
      delete window.__dragging_currency_code;
      if (!sourceCode || sourceCode === targetCode) return;

      const list = [...currencyRowsOrdered];
      const sIdx = list.findIndex((x) => x.code === sourceCode);
      const tIdx = list.findIndex((x) => x.code === targetCode);
      if (sIdx === -1 || tIdx === -1) return;

      const [moved] = list.splice(sIdx, 1);
      list.splice(tIdx, 0, moved);

      setCurrencyRowsOrdered(list);
      const codes = list.map((x) => String(x.code || x.currency || "").trim().toUpperCase()).filter(Boolean);
      if (orderCompanyId != null) {
        persistCurrencyDisplayOrder(orderCompanyId, codes);
      }
      try {
        await saveUserCurrencyOrder(codes, {
          companyId: orderCompanyId ?? undefined,
        });
        if (orderCompanyId != null) {
          await queryClient.invalidateQueries({
            queryKey: [...transactionQueryKeys.userCurrencyOrder(), orderCompanyId],
          });
        }
      } catch {
        /* localStorage already updated */
      }
    },
    [currencyRowsOrdered, setCurrencyRowsOrdered, orderCompanyId, queryClient],
  );

  useEffect(() => {
    if (!categoryOpen) return;
    const close = (e) => {
      if (e.target.closest?.(".category-dropdown")) return;
      setCategoryOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [categoryOpen]);

  // Category-only auto search (currency toggles call scheduleAutoSearch directly; they are not gated by this ref).
  useEffect(() => {
    if (!categoryChangedByUserRef.current) return;
    categoryChangedByUserRef.current = false;
    if (!scopeReady) return;
    if (!effectiveDateFrom || !effectiveDateTo) return;
    if (!showAllCurrencies && selectedCurrencies.length === 0) return;
    scheduleAutoSearch();
  }, [
    selectedCategories,
    scopeReady,
    effectiveDateFrom,
    effectiveDateTo,
    effectiveDateRangeText,
    showAllCurrencies,
    selectedCurrencies,
    scheduleAutoSearch,
  ]);

  // Show 0 balance / Payment Only / Win-Loss Only 均影响 API 参数或组合范围，切换后必须重搜。
  useEffect(() => {
    if (!initialSearchDoneRef.current) return;
    if (!scopeReady) return;
    if (!effectiveDateFrom || !effectiveDateTo) return;
    if (!showAllCurrencies && selectedCurrencies.length === 0) return;

    const current = {
      showPaymentOnly: searchState.showPaymentOnly,
      showCaptureOnly: searchState.showCaptureOnly,
      showZeroBalance: searchState.showZeroBalance,
    };

    if (prevServerSideFiltersRef.current === null) {
      prevServerSideFiltersRef.current = current;
      return;
    }

    const prev = prevServerSideFiltersRef.current;
    const zeroBalanceChanged = prev.showZeroBalance !== current.showZeroBalance;
    const filtersChanged =
      zeroBalanceChanged ||
      prev.showPaymentOnly !== current.showPaymentOnly ||
      prev.showCaptureOnly !== current.showCaptureOnly;

    prevServerSideFiltersRef.current = current;

    if (!filtersChanged) return;

    scheduleAutoSearch({ delayMs: 80, forceRefresh: zeroBalanceChanged });
  }, [
    searchState.showPaymentOnly,
    searchState.showCaptureOnly,
    searchState.showZeroBalance,
    scopeReady,
    effectiveDateFrom,
    effectiveDateTo,
    showAllCurrencies,
    selectedCurrenciesKey,
    scheduleAutoSearch,
  ]);

  const saveTxListToSession = useCallback(
    (data) => {
      try {
        const queryFilters = buildTransactionSearchQueryFilters(searchState);
        const key = buildTxListSessionKey({
          companyId: scopeCacheCompanyKey,
          dateFrom: effectiveDateFrom,
          dateTo: effectiveDateTo,
          selectedCategories,
          showInactive: queryFilters.showInactiveForQuery,
          showCaptureOnly: queryFilters.showCaptureOnlyForQuery,
          hideZeroBalance: queryFilters.hideZeroBalanceForQuery,
          showAllCurrencies,
          selectedCurrencies,
        });
        if (!key || !data) return;
        const ts = Date.now();
        const wrap = JSON.stringify({ v: 2, savedAt: ts, data });
        if (wrap.length > 1800000) return;
        sessionStorage.setItem(key, wrap);
        lastSearchCommitMsRef.current = ts;
      } catch {
        /* quota */
      }
    },
    [
      scopeCacheCompanyKey,
      effectiveDateFrom,
      effectiveDateTo,
      selectedCategories,
      searchState.showPaymentOnly,
      searchState.showCaptureOnly,
      searchState.showZeroBalance,
      showAllCurrencies,
      selectedCurrencies,
    ],
  );

  const runSearch = useCallback(
    async ({
      silent = false,
      isInitialLoad = false,
      forceRefresh = false,
      notifyErrors: notifyErrorsOpt,
      showBlockingOverlay: showBlockingOverlayOpt,
      searchStateOverride = null,
      typeAccountIdsOverride = undefined,
      typeSearchFormTypeOverride = undefined,
      typeSearchOverride = undefined,
      dateFromOverride = undefined,
      dateToOverride = undefined,
      selectedCategoriesOverride = undefined,
      showAllCurrenciesOverride = undefined,
      selectedCurrenciesOverride = undefined,
    } = {}) => {
      const cid = scopeCacheCompanyKey;
      const notifyErr = notifyErrorsOpt !== undefined ? notifyErrorsOpt : !silent;
      const queryDateFrom = String(dateFromOverride ?? effectiveDateFrom ?? "").trim();
      const queryDateTo = String(dateToOverride ?? effectiveDateTo ?? "").trim();
      const effectiveCategories = selectedCategoriesOverride ?? selectedCategories;
      const effectiveShowAll = showAllCurrenciesOverride ?? showAllCurrencies;
      const effectiveSelectedCurrencies = selectedCurrenciesOverride ?? selectedCurrencies;
      if (!scopeReady || !cid) return;
      if (!queryDateFrom || !queryDateTo) {
        pushToast(m.pleaseSelectDateRange, "error");
        return;
      }
      if (!effectiveShowAll && effectiveSelectedCurrencies.length === 0) {
        setRawSearchData(null);
        setTablesVisible(false);
        pushToast(m.pleaseSelectAtLeastOneCurrency, "info");
        return;
      }

      const effectiveSearchState = searchStateOverride ?? searchState;
      let activeTypeSearch =
        typeSearchOverride === true || (typeSearchOverride !== false && typeSearchActive);
      if (typeSearchOverride !== true && typeSearchActive) {
        setTypeSearchActive(false);
        setTypeSearchFormType(null);
        setTypeSearchAccountIds([]);
        activeTypeSearch = false;
      }
      const accountIdsForType =
        typeAccountIdsOverride !== undefined
          ? typeAccountIdsOverride
          : activeTypeSearch
            ? typeSearchAccountIds
            : [];
      const presentationFormType = typeSearchFormTypeOverride ?? typeSearchFormType ?? txType;

      const categoryParam =
        effectiveCategories.length > 0 && !effectiveCategories.includes("")
          ? [...effectiveCategories].sort().join(",")
          : "";
      const singleSelectedCurrency =
        !effectiveShowAll && effectiveSelectedCurrencies.length === 1
          ? String(effectiveSelectedCurrencies[0] || "").toUpperCase()
          : "";

      const queryFilters = buildTransactionSearchQueryFilters(effectiveSearchState);
      const { showInactiveForQuery, showCaptureOnlyForQuery, hideZeroBalanceForQuery } = queryFilters;
      const hideZeroForApi = activeTypeSearch ? false : hideZeroBalanceForQuery;

      const requestKey = buildTransactionSearchRequestKey({
        scopeCacheCompanyKey: cid,
        dateFrom: queryDateFrom,
        dateTo: queryDateTo,
        categoryParam,
        showInactive: showInactiveForQuery,
        showCaptureOnly: showCaptureOnlyForQuery,
        hideZeroBalance: hideZeroForApi,
        showAllCurrencies: effectiveShowAll,
        selectedCurrencies: effectiveSelectedCurrencies,
        typeSearch: activeTypeSearch,
        typeAccountIds: accountIdsForType,
        typeSearchFormType: activeTypeSearch ? presentationFormType : "",
      });

      if (!isInitialLoad && !forceRefresh && lastCompletedSearchKeyRef.current === requestKey && Date.now() - lastCompletedSearchTsRef.current < 1200) {
        return;
      }

      const sessionKey = buildTxListSessionKey({
        companyId: cid,
        dateFrom: queryDateFrom,
        dateTo: queryDateTo,
        selectedCategories: effectiveCategories,
        showInactive: showInactiveForQuery,
        showCaptureOnly: showCaptureOnlyForQuery,
        hideZeroBalance: hideZeroForApi,
        showAllCurrencies: effectiveShowAll,
        selectedCurrencies: effectiveSelectedCurrencies,
      });

      if (forceRefresh) {
        clearTxSearchCache();
        try {
          if (sessionKey) sessionStorage.removeItem(sessionKey);
        } catch {
          /* ignore */
        }
        await queryClient.invalidateQueries({ queryKey: transactionQueryKeys.searchRoot() });
      }

      let instantData = null;
      if (!forceRefresh) {
        instantData =
          getTxSearchCache(requestKey) ?? (sessionKey ? readTxListFromSessionStorage(sessionKey) : null);
      }

      let blockOverlay = showBlockingOverlayOpt !== undefined ? showBlockingOverlayOpt : !silent;
      // Never suppress the tables loading indicator when we have nothing to paint —
      // isInitialLoad / company-switch suppress used to leave a silent blank under slow nets.
      const hasExistingData = Boolean(instantData || rawSearchData);
      if (showBlockingOverlayOpt === undefined) {
        if ((isInitialLoad || suppressBlockingOverlayOnceRef.current) && hasExistingData) {
          blockOverlay = false;
        }
      }
      if (suppressBlockingOverlayOnceRef.current) {
        suppressBlockingOverlayOnceRef.current = false;
      }

      const runToken = ++latestRunTokenRef.current;

      if (instantData) {
        setRawSearchData(instantData);
        const instantRows =
          (instantData.left_table?.length || 0) + (instantData.right_table?.length || 0);
        setTablesVisible(instantRows > 0);
      }

      let didSetBlockingLoading = false;
      const showLoadingIndicator = blockOverlay && !hasExistingData;
      if (showLoadingIndicator) {
        setSearchLoading(true);
        didSetBlockingLoading = true;
      }
      if (!instantData) {
        setTablesVisible((prev) => (showLoadingIndicator || prev ? true : prev));
      }

      const subsidiarySearch =
        scopeApi.subsidiaryAccountsOnly ||
        (scopeApi.companyId != null && Number(scopeApi.companyId) > 0);
      const paramsBase = {
        ...scopeApi,
        // Search must not send view_group when drilling into a subsidiary — backend would treat it as group ledger.
        viewGroup: subsidiarySearch ? undefined : scopeApi.viewGroup,
        groupId: subsidiarySearch ? undefined : scopeApi.groupId,
        groupAggregate: subsidiarySearch ? undefined : scopeApi.groupAggregate,
        subsidiaryAccountsOnly: subsidiarySearch ? true : scopeApi.subsidiaryAccountsOnly,
        dateFrom: queryDateFrom,
        dateTo: queryDateTo,
        showInactive: showInactiveForQuery,
        showCaptureOnly: showCaptureOnlyForQuery,
        hideZeroBalance: hideZeroForApi,
        categories: effectiveCategories.length > 0 ? effectiveCategories : undefined,
        currencyCodes:
          !effectiveShowAll && effectiveSelectedCurrencies.length > 0 ? effectiveSelectedCurrencies : undefined,
        typeSearch: activeTypeSearch,
        typeAccountIds: activeTypeSearch ? accountIdsForType : undefined,
        typeSearchFormType: activeTypeSearch ? presentationFormType : undefined,
      };

      const fetchSearch = (params) =>
        queryClient.fetchQuery({
          queryKey: transactionQueryKeys.search(params),
          queryFn: ({ signal }) => searchTransactionsApi({ ...params, signal }),
          // forceRefresh (e.g. right after submit): bypass React Query staleTime so the
          // table reflects the new transaction immediately instead of returning cached data.
          staleTime: forceRefresh ? 0 : 5 * 60_000,
          gcTime: 15 * 60_000,
        });

      const commitQuiet = (data) => {
        const cleaned = sanitizeSearchApiData(data);
        setRawSearchData(cleaned);
        setTxSearchCache(requestKey, cleaned);
        saveTxListToSession(cleaned);
        lastCompletedSearchKeyRef.current = requestKey;
        lastCompletedSearchTsRef.current = Date.now();
        const displayed = countDisplayedRows(cleaned, effectiveSearchState, presentationFormType, activeTypeSearch);
        setTablesVisible(displayed > 0);
        if (!silent && displayed > 0) {
          pushToast(t("searchCompletedFoundRecords", { displayed }), "success");
        }
      };

      try {
        let currentData = null;
        if (transactionScope?.mode === "aggregate" && transactionScope.mergeCompanyIds?.length) {
          const results = await Promise.all(
            transactionScope.mergeCompanyIds.map((cid) =>
              fetchSearch({
                ...paramsBase,
                companyId: cid,
                viewGroup: scopeViewGroup || undefined,
                groupId: undefined,
              }),
            ),
          );
          if (latestRunTokenRef.current !== runToken) return;
          const payloads = results.filter((r) => r?.success && r?.data).map((r) => r.data);
          if (!payloads.length) {
            if (notifyErr) pushToast(m.searchFailed, "error");
            return;
          }
          currentData = mergeSearchApiDataList(payloads);
        } else {
          const result = await fetchSearch(paramsBase);
          if (latestRunTokenRef.current !== runToken) return;
          if (!result?.success || !result?.data) {
            if (notifyErr) {
              pushToast(result?.message || result?.error || m.searchFailed, "error");
            }
            return;
          }
          currentData = result.data;
        }
        const leftRows = Array.isArray(currentData.left_table) ? currentData.left_table : [];
        const rightRows = Array.isArray(currentData.right_table) ? currentData.right_table : [];
        const totalAccounts = leftRows.length + rightRows.length;

        if (singleSelectedCurrency && totalAccounts === 0) {
          const fallback = await fetchSearch({
            ...paramsBase,
            currencyCodes: undefined,
          });
          if (latestRunTokenRef.current !== runToken) return;
          if (fallback?.success && fallback?.data) {
            const fbLeft = (fallback.data.left_table || []).filter(
              (row) => String(row?.currency || "").toUpperCase() === singleSelectedCurrency,
            );
            const fbRight = (fallback.data.right_table || []).filter(
              (row) => String(row?.currency || "").toUpperCase() === singleSelectedCurrency,
            );
            currentData = {
              ...fallback.data,
              left_table: fbLeft,
              right_table: fbRight,
              totals: {
                left: calculateTotals(fbLeft),
                right: calculateTotals(fbRight),
                summary: applySummaryWinLossDisplayTolerance(calculateTotals([...fbLeft, ...fbRight])),
              },
            };
          }
        } else if (effectiveSearchState.showCaptureOnly && totalAccounts === 0) {
          const fallback = await fetchSearch({
            ...paramsBase,
            showCaptureOnly: false,
          });
          if (latestRunTokenRef.current !== runToken) return;
          if (fallback?.success && fallback?.data?.totals) {
            currentData = {
              ...currentData,
              totals: fallback.data.totals,
            };
          }
        }

        if (latestRunTokenRef.current !== runToken) return;
        commitQuiet(currentData);
      } catch (e) {
        if (e?.name === "AbortError" || isCancelledError(e)) return;
        console.error(e);
        if (notifyErr) pushToast(t("searchFailedWithMessage", { message: e.message }), "error");
      } finally {
        if (didSetBlockingLoading) setSearchLoading(false);
      }
    },
    [
      scopeReady,
      scopeApi,
      scopeCacheCompanyKey,
      effectiveDateFrom,
      effectiveDateTo,
      showAllCurrencies,
      selectedCurrencies,
      selectedCategories,
      searchState,
      pushToast,
      saveTxListToSession,
      queryClient,
      txType,
      typeSearchActive,
      typeSearchAccountIds,
      typeSearchFormType,
      rawSearchData,
      m,
      t,
    ],
  );
  runSearchRef.current = runSearch;

  const runTypeSearch = useCallback(
    async (formTxType, opts = {}) => {
      const {
        dateFrom: dateFromOverride,
        dateTo: dateToOverride,
        silent = false,
        preserveSearchState = false,
        forceRefresh = false,
      } = opts;
      const normalizedType = String(formTxType || "").toUpperCase().trim();
      if (!normalizedType) return;

      setSubmitFocusByCurrency({});
      setSubmitFocusRangeKey(null);

      if (!preserveSearchState) {
        const clearedState = {
          showName: false,
          showPaymentOnly: false,
          showCaptureOnly: false,
          showZeroBalance: false,
        };
        setSearchState((prev) => ({ ...prev, ...clearedState }));
      }

      if (!scopeReady || !scopeCacheCompanyKey) return;
      const queryDateFrom = String(dateFromOverride ?? effectiveDateFrom ?? "").trim();
      const queryDateTo = String(dateToOverride ?? effectiveDateTo ?? "").trim();
      if (!queryDateFrom || !queryDateTo) {
        pushToast(m.pleaseSelectDateRange, "error");
        return;
      }
      if (!showAllCurrencies && selectedCurrencies.length === 0) {
        pushToast(m.pleaseSelectAtLeastOneCurrency, "info");
        return;
      }

      setSearchLoading(true);
      try {
        if (forceRefresh) {
          // Only invalidate React Query search roots — do not wipe in-memory/session company grids.
          await queryClient.invalidateQueries({ queryKey: transactionQueryKeys.searchRoot() });
        }

        const subsidiarySearch =
          scopeApi.subsidiaryAccountsOnly ||
          (scopeApi.companyId != null && Number(scopeApi.companyId) > 0);
        const currencyCodes =
          !showAllCurrencies && selectedCurrencies.length > 0
            ? selectedCurrencies.map((c) => String(c || "").toUpperCase().trim()).filter(Boolean)
            : undefined;
        const scopeParams = {
          ...scopeApi,
          viewGroup: subsidiarySearch ? undefined : scopeApi.viewGroup,
          groupId: subsidiarySearch ? undefined : scopeApi.groupId,
          groupAggregate: subsidiarySearch ? undefined : scopeApi.groupAggregate,
          subsidiaryAccountsOnly: subsidiarySearch ? true : scopeApi.subsidiaryAccountsOnly,
        };

        let payload = null;
        let typeAccountIds = [];

        if (PERIOD_TYPE_SEARCH_TYPES.has(normalizedType)) {
          typeAccountIds = await fetchTypeAccountSearch({
            ...scopeParams,
            transactionType: normalizedType,
          });
          if (typeAccountIds.length === 0) {
            setTypeSearchActive(true);
            setTypeSearchFormType(normalizedType);
            setTypeSearchAccountIds([]);
            setRawSearchData({ left_table: [], right_table: [], totals: null });
            setTablesVisible(false);
            return;
          }

          const categoryParam =
            selectedCategories.length > 0 && !selectedCategories.includes("")
              ? [...selectedCategories].sort().join(",")
              : undefined;
          const result = await searchTransactionsApi({
            ...scopeParams,
            dateFrom: queryDateFrom,
            dateTo: queryDateTo,
            showInactive: false,
            showCaptureOnly: false,
            hideZeroBalance: false,
            categories: categoryParam ? categoryParam.split(",") : undefined,
            currencyCodes,
            typeSearch: true,
            typeAccountIds,
            typeSearchFormType: normalizedType,
          });
          if (!result?.success || !result?.data) {
            pushToast(result?.message || result?.error || m.searchFailed, "error");
            return;
          }
          payload = result.data;
        } else {
          payload = await fetchTypeTransactionSearch({
            ...scopeParams,
            transactionType: normalizedType,
            currencyCodes,
          });
          if (!payload) {
            pushToast(m.searchFailed, "error");
            return;
          }
        }

        const cleaned = sanitizeSearchApiData(payload);
        setTypeSearchActive(true);
        setTypeSearchFormType(normalizedType);
        setTypeSearchAccountIds(typeAccountIds);
        setRawSearchData(cleaned);

        const displayed =
          (cleaned.left_table?.length || 0) + (cleaned.right_table?.length || 0);
        setTablesVisible(displayed > 0);
        if (!silent && displayed > 0) {
          pushToast(t("searchCompletedFoundRecords", { displayed }), "success");
        }
      } catch (e) {
        if (e?.name === "AbortError" || isCancelledError(e)) return;
        console.error(e);
        pushToast(t("searchFailedWithMessage", { message: e.message }), "error");
      } finally {
        setSearchLoading(false);
      }
    },
    [
      scopeReady,
      scopeCacheCompanyKey,
      scopeApi,
      effectiveDateFrom,
      effectiveDateTo,
      showAllCurrencies,
      selectedCurrencies,
      selectedCategories,
      pushToast,
      m,
      t,
      queryClient,
    ],
  );

  /** After successful submit/approval: keep capture date; show union of submitted account rows. */
  const applySubmitFocusAndRefresh = useCallback(
    async ({
      accountIds,
      submitCurrency,
      amount,
      txType: submitTxType,
      toAccountId,
      fromAccountId,
    } = {}) => {
      const ids = [...new Set((accountIds || []).map((id) => Number(id)).filter((id) => id > 0))];
      if (ids.length === 0) return;
      if (!scopeReady || !scopeCacheCompanyKey) return;
      if (!effectiveDateFrom || !effectiveDateTo) return;

      const rangeKey = `${effectiveDateFrom}|${effectiveDateTo}`;
      const currencyCode = String(submitCurrency || "").toUpperCase().trim();

      let currencyOverrides = {};
      if (currencyCode && !showAllCurrencies) {
        const current = selectedCurrencies
          .map((c) => String(c || "").toUpperCase().trim())
          .filter(Boolean);
        const alreadySelected = current.includes(currencyCode);

        if (!alreadySelected) {
          const merged = [...current, currencyCode];
          const order = (currencyRowsOrdered || [])
            .map((r) => String(r.code || "").toUpperCase().trim())
            .filter(Boolean);
          const nextSel = merged.sort((a, b) => {
            const ia = order.indexOf(a);
            const ib = order.indexOf(b);
            if (ia === -1 && ib === -1) return a.localeCompare(b);
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
          });

          suppressCrossPageCurrencyRef.current = nextSel.length !== 1;
          setShowAllCurrencies(false);
          setSelectedCurrencies(nextSel);
          persistCurrencyFilter(scopeCacheCompanyKey, false, nextSel, transactionScope?.selectedGroup);
          if (nextSel.length === 1) {
            notifySingleCurrencyIfNeeded(nextSel);
          }
          currencyOverrides = {
            showAllCurrenciesOverride: false,
            selectedCurrenciesOverride: nextSel,
          };
        }
      }

      // Paint focused rows + optimistic balances before the network refresh.
      flushSync(() => {
        setTypeSearchActive(false);
        setTypeSearchFormType(null);
        setTypeSearchAccountIds([]);

        if (currencyCode) {
          setSubmitFocusByCurrency((prev) => {
            const base = submitFocusRangeKey === rangeKey ? { ...prev } : {};
            const existing = Array.isArray(base[currencyCode]) ? base[currencyCode] : [];
            base[currencyCode] = [...new Set([...existing, ...ids])];
            return base;
          });
        }
        setSubmitFocusRangeKey(rangeKey);
        submitFocusLeftRangeKeysRef.current.delete(rangeKey);

        const deltas = buildOptimisticSubmitDeltas({
          txType: submitTxType,
          amount,
          toAccountId,
          fromAccountId,
        });
        if (deltas.length > 0 && currencyCode) {
          let didPatch = false;
          setRawSearchData((prev) => {
            const patched = applyOptimisticSubmitBalancePatch(prev, {
              currency: currencyCode,
              deltas,
            });
            if (patched && patched !== prev) {
              didPatch = true;
              return patched;
            }
            return prev;
          });
          if (didPatch) setTablesVisible(true);
        }
      });

      setSearchLoading(true);
      try {
        // forceRefresh already clears caches + invalidates; avoid a second round-trip here.
        await runSearch({
          forceRefresh: true,
          silent: true,
          typeSearchOverride: false,
          ...currencyOverrides,
        });
      } finally {
        setSearchLoading(false);
      }
    },
    [
      scopeReady,
      scopeCacheCompanyKey,
      effectiveDateFrom,
      effectiveDateTo,
      submitFocusRangeKey,
      showAllCurrencies,
      selectedCurrencies,
      currencyRowsOrdered,
      persistCurrencyFilter,
      transactionScope?.selectedGroup,
      notifySingleCurrencyIfNeeded,
      runSearch,
    ],
  );

  /** Exit Type Search / submit-focus and restore the default transaction page view (today + default filters). */
  const exitTypeSearchAndRefresh = useCallback(async () => {
    if (!typeSearchActive && !submitFocusActive) return;
    if (!scopeReady || !scopeCacheCompanyKey) return;

    const today = String(todayDmy || "").trim();
    if (!today) return;

    const codes = (currencyRowsOrdered || [])
      .map((r) => String(r.code || "").toUpperCase().trim())
      .filter(Boolean);
    const defaultCode = pickTransactionDefaultCurrency(codes);
    const defaultSel =
      defaultCode && codes.includes(defaultCode) ? [defaultCode] : codes[0] ? [codes[0]] : [];
    if (defaultSel.length === 0) return;

    setSearchLoading(true);
    try {
      setTypeSearchActive(false);
      setTypeSearchFormType(null);
      setTypeSearchAccountIds([]);
      setSubmitFocusByCurrency({});
      setSubmitFocusRangeKey(null);
      submitFocusLeftRangeKeysRef.current.clear();
      setSearchState({ ...INITIAL_TRANSACTION_SEARCH_STATE });
      setSelectedCategories([]);
      categoryChangedByUserRef.current = false;
      setDateFrom(today);
      setDateTo(today);
      syncCaptureDateDom(today);
      prevCaptureDateRangeKeyRef.current = `${today}|${today}`;
      prevServerSideFiltersRef.current = {
        showPaymentOnly: false,
        showCaptureOnly: false,
        showZeroBalance: false,
      };
      suppressCrossPageCurrencyRef.current = false;
      bootCurrencyDefaultRef.current = true;
      setShowAllCurrencies(false);
      setSelectedCurrencies(defaultSel);
      persistCurrencyFilter(scopeCacheCompanyKey, false, defaultSel, transactionScope?.selectedGroup);

      lastInitialSearchKeyRef.current = "";
      clearTxSearchCache();
      await queryClient.invalidateQueries({ queryKey: transactionQueryKeys.searchRoot() });

      await runSearch({
        forceRefresh: true,
        silent: false,
        typeSearchOverride: false,
        dateFromOverride: today,
        dateToOverride: today,
        searchStateOverride: { ...INITIAL_TRANSACTION_SEARCH_STATE },
        selectedCategoriesOverride: [],
        showAllCurrenciesOverride: false,
        selectedCurrenciesOverride: defaultSel,
      });
    } finally {
      setSearchLoading(false);
    }
  }, [
    typeSearchActive,
    submitFocusActive,
    scopeReady,
    scopeCacheCompanyKey,
    todayDmy,
    currencyRowsOrdered,
    persistCurrencyFilter,
    transactionScope?.selectedGroup,
    queryClient,
    runSearch,
  ]);

  useEffect(() => {
    return () => {
      if (autoSearchTimerRef.current) {
        clearTimeout(autoSearchTimerRef.current);
        autoSearchTimerRef.current = null;
      }
      queryClient.cancelQueries({ queryKey: transactionQueryKeys.searchRoot() });
    };
  }, [queryClient]);

  useEffect(() => {
    if (!showAllCurrencies && selectedCurrencies.length === 0) {
      setRawSearchData(null);
      setTablesVisible(false);
    }
  }, [showAllCurrencies, selectedCurrencies]);

  const baseRowsPresentation = useMemo(() => {
    if (!rawSearchData) {
      return {
        hasData: false,
        baseLeft: [],
        baseRight: [],
      };
    }
    // rawSearchData is already sanitized on commit/replay; avoid duplicate dedupe pass.
    const rawLeft = Array.isArray(rawSearchData.left_table) ? rawSearchData.left_table : [];
    const rawRight = Array.isArray(rawSearchData.right_table) ? rawSearchData.right_table : [];
    let viewLeft = rawLeft;
    let viewRight = rawRight;
    const multiCurrencyView = showAllCurrencies || selectedCurrencies.length > 1;
    if (submitFocusActive && !multiCurrencyView) {
      const singleCode = String(selectedCurrencies[0] || "").toUpperCase().trim();
      const focusIds = getSubmitFocusAccountIdsForCurrency(submitFocusByCurrency, singleCode);
      if (focusIds.length > 0) {
        const focusSet = new Set(focusIds);
        const focused = applyTypeSearchAccountFilter(rawLeft, rawRight, focusSet);
        viewLeft = focused.left;
        viewRight = focused.right;
      }
    }
    if (typeSearchActive) {
      return {
        hasData: true,
        baseLeft: viewLeft,
        baseRight: viewRight,
      };
    }
    const presentationTxType = typeSearchFormType || txType;
    const norm = normalizeRateRowsByCrDr(viewLeft, viewRight, presentationTxType === "RATE");
    return {
      hasData: true,
      baseLeft: sortByRole(norm.leftRows),
      baseRight: sortByRole(norm.rightRows),
    };
  }, [
    rawSearchData,
    txType,
    typeSearchFormType,
    typeSearchActive,
    submitFocusActive,
    submitFocusByCurrency,
    showAllCurrencies,
    selectedCurrencies,
  ]);

  const tablePresentation = useMemo(() => {
    if (!rawSearchData) {
      return {
        mode: "none",
        defaultLeft: [],
        defaultRight: [],
        totalsLeft: calculateTotals([]),
        totalsRight: calculateTotals([]),
        totalsSummary: applySummaryWinLossDisplayTolerance(calculateTotals([])),
        grouped: [],
        singleCurrencyTitle: null,
      };
    }
    const filtered = filterTransactionTableRows(baseRowsPresentation.baseLeft, baseRowsPresentation.baseRight, {
      showZeroBalance: listPresentationModeActive ? true : searchState.showZeroBalance,
      showPaymentOnly: listPresentationModeActive ? false : searchState.showPaymentOnly,
      showCaptureOnly: listPresentationModeActive ? false : searchState.showCaptureOnly,
    });
    const sortedLeft = filtered.left;
    const sortedRight = filtered.right;
    const totalsLeft = calculateTotals(sortedLeft);
    const totalsRight = calculateTotals(sortedRight);
    const totalsSummary = applySummaryWinLossDisplayTolerance(calculateTotals([...sortedLeft, ...sortedRight]));

    const multi = showAllCurrencies || selectedCurrencies.length > 1;
    const codesOrdered = currencyRowsOrdered.map((c) => String(c.code || "").toUpperCase().trim()).filter(Boolean);

    if (!multi) {
      const title =
        selectedCurrencies.length === 1 ? `Currency: ${selectedCurrencies[0]}` : null;
      return {
        mode: "default",
        defaultLeft: sortedLeft,
        defaultRight: sortedRight,
        totalsLeft,
        totalsRight,
        totalsSummary,
        grouped: [],
        singleCurrencyTitle: title,
      };
    }

    const groupedMap = {};
    const pushRow = (row, side) => {
      const cur = row.currency || "UNKNOWN";
      if (!groupedMap[cur]) groupedMap[cur] = { left: [], right: [] };
      groupedMap[cur][side].push(row);
    };
    sortedLeft.forEach((row) => pushRow(row, "left"));
    sortedRight.forEach((row) => pushRow(row, "right"));

    let orderedCurrs = [];
    codesOrdered.forEach((code) => {
      if (groupedMap[code]) orderedCurrs.push(code);
    });
    Object.keys(groupedMap).forEach((code) => {
      if (!orderedCurrs.includes(code)) orderedCurrs.push(code);
    });

    const activeCodes = rawSearchData.active_currency_codes;
    if (searchState.showZeroBalance && Array.isArray(activeCodes) && activeCodes.length > 0) {
      const activeSet = new Set(activeCodes.map((c) => String(c || "").toUpperCase()));
      orderedCurrs = orderedCurrs.filter((code) => activeSet.has(String(code || "").toUpperCase()));
    }

    if (!showAllCurrencies && selectedCurrencies.length > 1) {
      const selSet = new Set(selectedCurrencies.map((x) => String(x || "").toUpperCase().trim()));
      orderedCurrs = orderedCurrs.filter((code) => selSet.has(String(code || "").toUpperCase()));
    }

    const grouped = orderedCurrs.map((currency) => {
      let gl = groupedMap[currency]?.left || [];
      let gr = groupedMap[currency]?.right || [];
      if (submitFocusActive) {
        const focusIds = getSubmitFocusAccountIdsForCurrency(submitFocusByCurrency, currency);
        if (focusIds.length > 0) {
          const focusSet = new Set(focusIds);
          const focused = applyTypeSearchAccountFilter(gl, gr, focusSet);
          gl = focused.left;
          gr = focused.right;
        }
      }
      const l = sortByRole(gl);
      const r = sortByRole(gr);
      const tL = calculateTotals(l);
      const tR = calculateTotals(r);
      const tS = applySummaryWinLossDisplayTolerance(calculateTotals([...l, ...r]));
      return { currency, left: l, right: r, totalsLeft: tL, totalsRight: tR, totalsSummary: tS };
    });

    if (grouped.length === 0 && (sortedLeft.length > 0 || sortedRight.length > 0)) {
      const title =
        selectedCurrencies.length === 1 ? `Currency: ${selectedCurrencies[0]}` : null;
      return {
        mode: "default",
        defaultLeft: sortedLeft,
        defaultRight: sortedRight,
        totalsLeft,
        totalsRight,
        totalsSummary,
        grouped: [],
        singleCurrencyTitle: title,
      };
    }

    return {
      mode: "grouped",
      defaultLeft: [],
      defaultRight: [],
      totalsLeft,
      totalsRight,
      totalsSummary,
      grouped,
      singleCurrencyTitle: null,
    };
  }, [
    rawSearchData,
    baseRowsPresentation,
    searchState,
    listPresentationModeActive,
    showAllCurrencies,
    selectedCurrencies,
    currencyRowsOrdered,
    submitFocusActive,
    submitFocusByCurrency,
  ]);

  useEffect(() => {
    if (!typeSearchActive) return;
    if (searchState.showPaymentOnly || searchState.showCaptureOnly || searchState.showZeroBalance) {
      setTypeSearchActive(false);
      setTypeSearchAccountIds([]);
      setTypeSearchFormType(null);
      void runSearchRef.current?.({ forceRefresh: true, silent: false, typeSearchOverride: false });
    }
  }, [
    searchState.showPaymentOnly,
    searchState.showCaptureOnly,
    searchState.showZeroBalance,
    typeSearchActive,
  ]);

  /** 切换 scope（含 group/company 模式）：中止旧请求、清空列表，后台重搜。 */
  const scopeKey = transactionScopeCacheKey(transactionScope) || null;

  /** Cold boot: pre-select MYR before metadata returns so initial search can start early. */
  useLayoutEffect(() => {
    if (!scopeReady || !scopeCacheCompanyKey || !scopeKey) return;
    if (earlyCurrencyScopeRef.current === scopeKey) return;
    earlyCurrencyScopeRef.current = scopeKey;

    if (coldBootCurrencyAppliedRef.current) return;
    // Group-only ledger: wait for scoped account currencies — do not default MYR.
    if (transactionScope?.mode === "group") return;

    coldBootCurrencyAppliedRef.current = true;

    const defaultCode = pickTransactionDefaultCurrency(["MYR"]);
    if (!defaultCode) return;
    setShowAllCurrencies(false);
    setSelectedCurrencies([defaultCode]);
  }, [scopeReady, scopeCacheCompanyKey, scopeKey, transactionScope?.mode]);

  useEffect(() => {
    const prev = prevScopeKeyForSearchRef.current;
    const scopeChanged = prev != null && prev !== scopeKey;

    if (scopeKey == null) {
      if (prev != null) {
        suppressBlockingOverlayOnceRef.current = true;
        prevCaptureDateRangeKeyRef.current = null;
        prevServerSideFiltersRef.current = null;
        setRawSearchData(null);
        setSearchLoading(false);
        lastCompletedSearchKeyRef.current = "";
        try {
          latestRunTokenRef.current += 1;
          queryClient.cancelQueries({ queryKey: transactionQueryKeys.searchRoot() });
        } catch {
          /* ignore */
        }
      }
      prevScopeKeyForSearchRef.current = null;
      return;
    }

    if (scopeChanged) {
      earlyCurrencyScopeRef.current = null;
      currenciesBeforeAllRef.current = [];
      prevCaptureDateRangeKeyRef.current = null;
      prevServerSideFiltersRef.current = null;
      setSubmitFocusByCurrency({});
      setSubmitFocusRangeKey(null);
      submitFocusLeftRangeKeysRef.current.clear();
      setSearchLoading(false);
      lastCompletedSearchKeyRef.current = "";

      const date = effectiveDateFrom || todayDmy;
      const { currencyPrefs, requestKey } = buildDefaultSearchApiParams(transactionScope, {
        dateFrom: date,
        dateTo: effectiveDateTo || date,
      });
      const instantReplay =
        getTxSearchCache(requestKey) ??
        (() => {
          try {
            const sessionKey = buildTxListSessionKey({
              companyId: scopeCacheCompanyKey,
              dateFrom: date,
              dateTo: effectiveDateTo || date,
              selectedCategories: [],
              showInactive: false,
              showCaptureOnly: false,
              hideZeroBalance: true,
              showAllCurrencies: currencyPrefs.showAll,
              selectedCurrencies: currencyPrefs.currencies,
            });
            return sessionKey ? readTxListFromSessionStorage(sessionKey) : null;
          } catch {
            return null;
          }
        })();

      if (instantReplay) {
        setRawSearchData(instantReplay);
        const replayRows =
          (instantReplay.left_table?.length || 0) + (instantReplay.right_table?.length || 0);
        setTablesVisible(replayRows > 0);
        suppressBlockingOverlayOnceRef.current = true;
      } else {
        // Cold scope: keep previous rows painted (stale-while-revalidate) — no Loading chrome.
        suppressBlockingOverlayOnceRef.current = true;
      }

      if (!currencyPrefs.showAll && currencyPrefs.currencies.length > 0) {
        setShowAllCurrencies(false);
        setSelectedCurrencies(currencyPrefs.currencies);
      } else if (currencyPrefs.showAll) {
        setShowAllCurrencies(true);
        setSelectedCurrencies([]);
      }

      try {
        latestRunTokenRef.current += 1;
        queryClient.cancelQueries({ queryKey: transactionQueryKeys.searchRoot() });
      } catch {
        /* ignore */
      }
    }

    prevScopeKeyForSearchRef.current = scopeKey;
    if (scopeChanged) {
      lastCompletedSearchKeyRef.current = "";
      initialSearchDoneRef.current = false;
      lastInitialSearchKeyRef.current = "";
    }
  }, [
    scopeKey,
    queryClient,
    transactionScope,
    scopeCacheCompanyKey,
    effectiveDateFrom,
    effectiveDateTo,
    todayDmy,
  ]);

  const selectedCategoriesKey = useMemo(
    () =>
      [...selectedCategories]
        .map((x) => String(x || "").toUpperCase().trim())
        .filter(Boolean)
        .sort()
        .join(","),
    [selectedCategories],
  );

  // Initial search — MYR default can run before account/currency metadata finishes.
  useEffect(() => {
    if (!scopeReady) return;
    if (!scopeKey) return;
    if (!showAllCurrencies && selectedCurrencies.length === 0) return;

    const initSearchKey = [
      scopeKey,
      showAllCurrencies ? "ALL" : selectedCurrenciesKey,
      selectedCategoriesKey,
      effectiveDateFrom,
      effectiveDateTo,
    ].join("|");

    if (lastInitialSearchKeyRef.current === initSearchKey) return;

    let hadReplay = false;
    let pendingInvalidate = false;
    try {
      const invalidateTs = parseInt(localStorage.getItem(TX_LIST_INVALIDATE_LS_KEY) || "0", 10) || 0;
      const handledTs = parseInt(sessionStorage.getItem(TX_LIST_INVALIDATE_HANDLED_KEY) || "0", 10) || 0;
      pendingInvalidate = Boolean(invalidateTs && invalidateTs > handledTs);

      const queryFilters = buildTransactionSearchQueryFilters(searchState);
      const key = buildTxListSessionKey({
        companyId: scopeCacheCompanyKey,
        dateFrom: effectiveDateFrom,
        dateTo: effectiveDateTo,
        selectedCategories,
        showInactive: queryFilters.showInactiveForQuery,
        showCaptureOnly: queryFilters.showCaptureOnlyForQuery,
        hideZeroBalance: queryFilters.hideZeroBalanceForQuery,
        showAllCurrencies,
        selectedCurrencies,
      });
      // Skip painting stale session rows when another page invalidated the list.
      const replay = !pendingInvalidate && key ? readTxListFromSessionStorage(key) : null;
      if (replay) {
        setRawSearchData(replay);
        const replayRows = (replay.left_table?.length || 0) + (replay.right_table?.length || 0);
        setTablesVisible(replayRows > 0);
        lastSearchCommitMsRef.current = Date.now();
        hadReplay = true;
      }
    } catch {
      /* ignore */
    }

    lastInitialSearchKeyRef.current = initSearchKey;
    prevServerSideFiltersRef.current = {
      showPaymentOnly: searchState.showPaymentOnly,
      showCaptureOnly: searchState.showCaptureOnly,
      showZeroBalance: searchState.showZeroBalance,
    };
    initialSearchDoneRef.current = true;
    void Promise.resolve(
      runSearchRef.current?.({
        isInitialLoad: true,
        silent: hadReplay && !pendingInvalidate,
        notifyErrors: !(hadReplay && !pendingInvalidate),
        // Never show blocking Loading overlay — keep prior/cached rows until replace.
        showBlockingOverlay: false,
        forceRefresh: pendingInvalidate,
      }),
    ).then(() => {
      if (!pendingInvalidate) return;
      try {
        const invalidateTs = parseInt(localStorage.getItem(TX_LIST_INVALIDATE_LS_KEY) || "0", 10) || 0;
        if (invalidateTs) sessionStorage.setItem(TX_LIST_INVALIDATE_HANDLED_KEY, String(invalidateTs));
      } catch {
        /* ignore */
      }
    });
  }, [
    scopeKey,
    scopeReady,
    scopeCacheCompanyKey,
    showAllCurrencies,
    selectedCurrenciesKey,
    effectiveDateFrom,
    effectiveDateTo,
    selectedCategoriesKey,
  ]);

  useEffect(() => {
    if (!scopeReady) return;
    if (!initialSearchDoneRef.current) return;
    if (!effectiveDateFrom || !effectiveDateTo) return;
    if (!showAllCurrencies && selectedCurrencies.length === 0) return;

    const key = captureRangeKey;
    const prevKey = prevCaptureDateRangeKeyRef.current;
    if (prevKey === null) {
      prevCaptureDateRangeKeyRef.current = key;
      return;
    }
    if (prevKey === key) return;

    if (submitFocusRangeKey === prevKey && hasSubmitFocusByCurrency(submitFocusByCurrency)) {
      submitFocusLeftRangeKeysRef.current.add(prevKey);
      setSubmitFocusByCurrency({});
      setSubmitFocusRangeKey(null);
      setTypeSearchActive(false);
      setTypeSearchFormType(null);
      setTypeSearchAccountIds([]);
    }

    prevCaptureDateRangeKeyRef.current = key;

    if (submitFocusLeftRangeKeysRef.current.has(key)) {
      void runTypeSearch(txType, { forceRefresh: true, silent: false });
      return;
    }

    if (submitFocusRangeKey === key && hasSubmitFocusByCurrency(submitFocusByCurrency)) {
      void runSearch({ forceRefresh: true, silent: true, typeSearchOverride: false });
      return;
    }

    if (typeSearchActive && typeSearchFormType) {
      void runTypeSearch(typeSearchFormType);
      return;
    }
    scheduleAutoSearch({
      delayMs: 120,
      forceRefresh: searchState.showZeroBalance,
    });
  }, [
    captureRangeKey,
    effectiveDateFrom,
    effectiveDateTo,
    scopeReady,
    showAllCurrencies,
    selectedCurrenciesKey,
    searchState.showZeroBalance,
    scheduleAutoSearch,
    typeSearchActive,
    typeSearchFormType,
    runTypeSearch,
    runSearch,
    txType,
    submitFocusRangeKey,
    submitFocusByCurrency,
    hasSubmitFocusByCurrency,
  ]);

  return {
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    effectiveDateFrom,
    effectiveDateTo,
    effectiveDateRangeText,
    selectedCategories,
    setSelectedCategories,
    searchState,
    setSearchState,
    showAllCurrencies,
    setShowAllCurrencies,
    selectedCurrencies,
    setSelectedCurrencies,
    rawSearchData,
    setRawSearchData,
    searchLoading,
    setSearchLoading,
    tablesVisible,
    setTablesVisible,
    runSearch,
    runTypeSearch,
    applySubmitFocusAndRefresh,
    exitTypeSearchAndRefresh,
    submitFocusActive,
    listPresentationModeActive,
    typeSearchActive,
    typeSearchFormType,
    persistCurrencyFilter,
    initialSearchDoneRef,
    lastSearchCommitMsRef,
    categoryChangedByUserRef,
    tablePresentation,
    categoryOpen,
    setCategoryOpen,
    categoryAllCheckboxRef,
    toggleCategory,
    onCategoryAllChange,
    toggleCategoryValue,
    removeCategoryTag,
    toggleAllCurrenciesBtn,
    onCurrencyDragStart,
    onCurrencyDropOn,
    toggleCurrencyBtn,
  };
}

