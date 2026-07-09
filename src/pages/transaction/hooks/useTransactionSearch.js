import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { isCancelledError, useQueryClient } from "@tanstack/react-query";
import {
  TRANSACTION_CURRENCY_FILTER_KEY_PREFIX,
  TX_LIST_INVALIDATE_LS_KEY,
  applyPaymentWinLossFilters,
  applyZeroBalanceFilter,
  applySummaryWinLossDisplayTolerance,
  buildTxListSessionKey,
  calculateTotals,
  countDisplayedRows,
  normalizeRateRowsByCrDr,
  readTransactionCurrencyFilterState,
  pickTransactionDefaultCurrency,
  readTxListFromSessionStorage,
  sortByRole,
  sanitizeSearchApiData,
  mergeSearchApiDataList,
} from "../lib/transactionPaymentLogic.js";
import {
  searchTransactions as searchTransactionsApi,
  saveUserCurrencyOrder,
  transactionQueryKeys,
} from "../lib/transactionApi.js";
import { getTxSearchCache, setTxSearchCache } from "../../../utils/transaction/transactionSearchCache.js";
import { buildDefaultSearchApiParams } from "../lib/transactionScopePrefetch.js";
import {
  buildDashboardCurrencyScopeKey,
  notifyDashboardCurrencyFilterChanged,
} from "../../../utils/company/sharedCompanyFilter.js";
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
  const [searchState, setSearchState] = useState({
    showName: false,
    showCaptureOnly: false,
    showPaymentOnly: false,
    showZeroBalance: false,
  });
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

  const scheduleAutoSearch = useCallback(({ isInitialLoad = false, delayMs = 260 } = {}) => {
    if (autoSearchTimerRef.current) clearTimeout(autoSearchTimerRef.current);
    autoSearchTimerRef.current = setTimeout(() => {
      autoSearchTimerRef.current = null;
      void runSearchRef.current?.({
        silent: true,
        notifyErrors: true,
        showBlockingOverlay: false,
        isInitialLoad,
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

  // Show 0 balance 需重搜（后端 account×currency 范围变化）；Win/Loss / Payment 勾选仅前端即时过滤（取消 Payment/Win-Loss 时再拉全量）。
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
    const paymentTurnedOff = prev.showPaymentOnly && !current.showPaymentOnly;
    const captureTurnedOff = prev.showCaptureOnly && !current.showCaptureOnly;

    prevServerSideFiltersRef.current = current;

    if (!zeroBalanceChanged && !paymentTurnedOff && !captureTurnedOff) return;

    scheduleAutoSearch({ delayMs: 80 });
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
        const key = buildTxListSessionKey({
          companyId: scopeCacheCompanyKey,
          dateFrom: effectiveDateFrom,
          dateTo: effectiveDateTo,
          selectedCategories,
          showInactive: searchState.showPaymentOnly,
          showCaptureOnly: searchState.showCaptureOnly,
          hideZeroBalance: !searchState.showZeroBalance,
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
    } = {}) => {
      const cid = scopeCacheCompanyKey;
      const notifyErr = notifyErrorsOpt !== undefined ? notifyErrorsOpt : !silent;
      if (!scopeReady || !cid) return;
      if (!effectiveDateFrom || !effectiveDateTo) {
        pushToast(m.pleaseSelectDateRange, "error");
        return;
      }
      if (!showAllCurrencies && selectedCurrencies.length === 0) {
        setTablesVisible(false);
        pushToast(m.pleaseSelectAtLeastOneCurrency, "info");
        return;
      }

      const categoryParam =
        selectedCategories.length > 0 && !selectedCategories.includes("")
          ? [...selectedCategories].sort().join(",")
          : "";
      const singleSelectedCurrency =
        !showAllCurrencies && selectedCurrencies.length === 1 ? String(selectedCurrencies[0] || "").toUpperCase() : "";

      const showInactiveForQuery =
        searchState.showZeroBalance && searchState.showPaymentOnly ? false : searchState.showPaymentOnly;
      // Win/Loss Only 始终在前端 applyPaymentWinLossFilters 过滤。
      // 后端 show_capture_only=1 + hide_zero_balance=1 的 Layer 2 会误删「当日有 W/L 动账但 Balance=0」的组合行
      //（与 PHP transaction.php 勾选后仍显示此类账号的行为不一致）。
      const showCaptureOnlyForQuery = false;

      const requestKey = JSON.stringify({
        dateFrom: effectiveDateFrom,
        dateTo: effectiveDateTo,
        categoryParam,
        showInactive: showInactiveForQuery ? "1" : "0",
        showCaptureOnly: showCaptureOnlyForQuery ? "1" : "0",
        hideZero: searchState.showZeroBalance ? "0" : "1",
        companyId: cid || "",
        showAllCurrencies: !!showAllCurrencies,
        currencies: [...selectedCurrencies].sort().join(","),
      });

      if (!isInitialLoad && !forceRefresh && lastCompletedSearchKeyRef.current === requestKey && Date.now() - lastCompletedSearchTsRef.current < 1200) {
        return;
      }

      const sessionKey = buildTxListSessionKey({
        companyId: cid,
        dateFrom: effectiveDateFrom,
        dateTo: effectiveDateTo,
        selectedCategories,
        showInactive: showInactiveForQuery,
        showCaptureOnly: showCaptureOnlyForQuery,
        hideZeroBalance: !searchState.showZeroBalance,
        showAllCurrencies,
        selectedCurrencies,
      });

      let instantData = null;
      if (!forceRefresh) {
        instantData =
          getTxSearchCache(requestKey) ?? (sessionKey ? readTxListFromSessionStorage(sessionKey) : null);
      }

      let blockOverlay = showBlockingOverlayOpt !== undefined ? showBlockingOverlayOpt : !silent;
      if (isInitialLoad || suppressBlockingOverlayOnceRef.current) {
        blockOverlay = false;
        suppressBlockingOverlayOnceRef.current = false;
      }

      const runToken = ++latestRunTokenRef.current;
      await queryClient.cancelQueries({ queryKey: transactionQueryKeys.searchRoot() });

      if (instantData) {
        setRawSearchData(instantData);
        setTablesVisible(true);
      }

      let didSetBlockingLoading = false;
      const hasExistingData = Boolean(instantData || rawSearchData);
      const showLoadingIndicator = blockOverlay && !hasExistingData;
      if (showLoadingIndicator) {
        setSearchLoading(true);
        didSetBlockingLoading = true;
      }
      setTablesVisible(true);

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
        dateFrom: effectiveDateFrom,
        dateTo: effectiveDateTo,
        showInactive: showInactiveForQuery,
        showCaptureOnly: showCaptureOnlyForQuery,
        hideZeroBalance: !searchState.showZeroBalance,
        categories: selectedCategories.length > 0 ? selectedCategories : undefined,
        currencyCodes: !showAllCurrencies && selectedCurrencies.length > 0 ? selectedCurrencies : undefined,
      };

      const fetchSearch = (params) =>
        queryClient.fetchQuery({
          queryKey: transactionQueryKeys.search(params),
          queryFn: ({ signal }) => searchTransactionsApi({ ...params, signal }),
          staleTime: 5 * 60_000,
          gcTime: 15 * 60_000,
        });

      const commitQuiet = (data) => {
        const cleaned = sanitizeSearchApiData(data);
        setRawSearchData(cleaned);
        setTxSearchCache(requestKey, cleaned);
        saveTxListToSession(cleaned);
        lastCompletedSearchKeyRef.current = requestKey;
        lastCompletedSearchTsRef.current = Date.now();
        const totalAccounts = (cleaned.left_table?.length || 0) + (cleaned.right_table?.length || 0);
        const displayed = countDisplayedRows(cleaned, searchState, txType);
        if (!silent) {
          if (totalAccounts === 0) {
            pushToast(m.searchCompletedNoData, "info");
          } else if (displayed === 0 && totalAccounts > 0) {
            pushToast(t("searchReturnedRowsNoneMatch", { totalAccounts }), "info");
          } else {
            pushToast(t("searchCompletedFoundRecords", { displayed }), "success");
          }
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
        } else if (searchState.showCaptureOnly && totalAccounts === 0) {
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
      rawSearchData,
      m,
      t,
    ],
  );
  runSearchRef.current = runSearch;

  useEffect(() => {
    return () => {
      if (autoSearchTimerRef.current) {
        clearTimeout(autoSearchTimerRef.current);
        autoSearchTimerRef.current = null;
      }
      queryClient.cancelQueries({ queryKey: transactionQueryKeys.searchRoot() });
    };
  }, [queryClient]);

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
    const norm = normalizeRateRowsByCrDr(rawLeft, rawRight, txType === "RATE");
    return {
      hasData: true,
      baseLeft: sortByRole(norm.leftRows),
      baseRight: sortByRole(norm.rightRows),
    };
  }, [rawSearchData, txType]);

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
    const pf = applyPaymentWinLossFilters(baseRowsPresentation.baseLeft, baseRowsPresentation.baseRight, {
      showPaymentOnly: searchState.showPaymentOnly,
      showCaptureOnly: searchState.showCaptureOnly,
      showZeroBalance: searchState.showZeroBalance,
    });
    const z = applyZeroBalanceFilter(pf.filteredLeft, pf.filteredRight, searchState.showZeroBalance, {
      showCaptureOnly: searchState.showCaptureOnly,
      showPaymentOnly: searchState.showPaymentOnly,
    });
    const sortedLeft = z.left;
    const sortedRight = z.right;
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
      const { left: gl, right: gr } = groupedMap[currency];
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
  }, [rawSearchData, baseRowsPresentation, searchState, showAllCurrencies, selectedCurrencies, currencyRowsOrdered]);

  /** 切换 scope（含 group/company 模式）：中止旧请求、清空列表，后台重搜。 */
  const scopeKey = transactionScopeCacheKey(transactionScope) || null;

  /** Cold boot: pre-select MYR before metadata returns so initial search can start early. */
  useLayoutEffect(() => {
    if (!scopeReady || !scopeCacheCompanyKey || !scopeKey) return;
    if (earlyCurrencyScopeRef.current === scopeKey) return;
    earlyCurrencyScopeRef.current = scopeKey;

    if (coldBootCurrencyAppliedRef.current) return;
    coldBootCurrencyAppliedRef.current = true;

    const defaultCode = pickTransactionDefaultCurrency(["MYR"]);
    if (!defaultCode) return;
    setShowAllCurrencies(false);
    setSelectedCurrencies([defaultCode]);
  }, [scopeReady, scopeCacheCompanyKey, scopeKey]);

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
      suppressBlockingOverlayOnceRef.current = true;
      prevCaptureDateRangeKeyRef.current = null;
      prevServerSideFiltersRef.current = null;
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
        setTablesVisible(true);
      } else {
        setRawSearchData(null);
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
    setTablesVisible((prev) => (prev ? prev : true));
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
      searchState.showPaymentOnly ? "1" : "0",
      searchState.showCaptureOnly ? "1" : "0",
      searchState.showZeroBalance ? "1" : "0",
    ].join("|");

    if (lastInitialSearchKeyRef.current === initSearchKey) return;

    let hadReplay = false;
    try {
      const key = buildTxListSessionKey({
        companyId: scopeCacheCompanyKey,
        dateFrom: effectiveDateFrom,
        dateTo: effectiveDateTo,
        selectedCategories,
        showInactive: searchState.showPaymentOnly,
        showCaptureOnly: searchState.showCaptureOnly,
        hideZeroBalance: !searchState.showZeroBalance,
        showAllCurrencies,
        selectedCurrencies,
      });
      const replay = key ? readTxListFromSessionStorage(key) : null;
      if (replay) {
        setRawSearchData(replay);
        setTablesVisible(true);
        lastSearchCommitMsRef.current = Date.now();
        hadReplay = true;
      }
    } catch {
      /* ignore */
    }

    lastInitialSearchKeyRef.current = initSearchKey;
    initialSearchDoneRef.current = true;
    void runSearchRef.current?.({
      isInitialLoad: true,
      silent: hadReplay,
      notifyErrors: !hadReplay,
      showBlockingOverlay: false,
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
    searchState.showPaymentOnly,
    searchState.showCaptureOnly,
    searchState.showZeroBalance,
  ]);

  useEffect(() => {
    if (!scopeReady) return;
    if (!initialSearchDoneRef.current) return;
    if (!effectiveDateFrom || !effectiveDateTo) return;
    if (!showAllCurrencies && selectedCurrencies.length === 0) return;

    const key = `${effectiveDateFrom}|${effectiveDateTo}`;
    if (prevCaptureDateRangeKeyRef.current === null) {
      prevCaptureDateRangeKeyRef.current = key;
      return;
    }
    if (prevCaptureDateRangeKeyRef.current === key) return;
    prevCaptureDateRangeKeyRef.current = key;
    void runSearchRef.current?.({
      silent: true,
      notifyErrors: true,
      showBlockingOverlay: true,
    });
  }, [effectiveDateFrom, effectiveDateTo, scopeReady, showAllCurrencies, selectedCurrenciesKey]);

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

