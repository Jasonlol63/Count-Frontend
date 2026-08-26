import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMemberText, translateMemberApiMessage } from "../../translateFile/pages/memberTranslate.js";
import {
  MINI_GRID_SHELL_CCY,
  applyCurrencyAllToggle,
  applyCurrencyToggle,
  formatPaymentHistoryMoney,
  getAvailableCurrencies,
  computeMiniGridTotals,
  getMemberMiniGridCurrencies,
  getOrderedMiniGridAccounts,
  groupHistoryForDisplay,
  listMiniGridBalanceFetchPairs,
  applyDefaultWLGridSelection,
  getWlGridIncludedAccountIds,
  hasWlGridSelectedAccounts,
  saveWLGridSelection,
  sanitizeCurrencySelection,
} from "./memberPageHelpers.js";
import {
  fetchMemberAccountCurrencyRows,
  fetchMemberBatchAccountCurrencies,
  fetchMemberCurrencySummaryRows,
  fetchMemberHistoryRows,
  fetchMemberLinkedAccounts,
  fetchMemberMiniGridBalances,
} from "./memberWinLossApi.js";
import { persistCurrencyDisplayOrder, readCurrencyDisplayOrder } from "../../utils/company/currencyDisplayOrder.js";
import { switchSessionTenant } from "../../utils/auth/authApi.js";
import { useRealtimeDomain } from "../../lib/realtime/useRealtimeDomain.js";
import { REALTIME_DOMAINS } from "../../lib/realtime/realtimeEvents.js";

function hasTenant(tenantId) {
  return Number(tenantId) > 0;
}

export function useMemberWinLoss({ showNotification, lang }) {
  const t = useCallback((key, params) => getMemberText(lang, key, params), [lang]);
  const notifyApi = useCallback(
    (message, type, fallbackKey, params = {}) => {
      showNotification(translateMemberApiMessage(lang, message, fallbackKey, params), type);
    },
    [lang, showNotification],
  );
  const [loginRootAccountId, setLoginRootAccountId] = useState(0);
  const [viewAccountId, setViewAccountId] = useState(0);
  const [tenantId, setTenantId] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [linkedAccounts, setLinkedAccounts] = useState([]);
  const [wlGridSelectedIds, setWlGridSelectedIds] = useState([]);
  const [linkedAccountCurrenciesMap, setLinkedAccountCurrenciesMap] = useState(() => new Map());
  const [linkedCurrenciesLoaded, setLinkedCurrenciesLoaded] = useState(false);
  const [ownedCurrencies, setOwnedCurrencies] = useState([]);
  const [currencySummary, setCurrencySummary] = useState([]);
  const [currencyOrder, setCurrencyOrder] = useState([]);
  const [isAllSelected, setIsAllSelected] = useState(true);
  const [selectedCurrencies, setSelectedCurrencies] = useState([]);
  const [historyRows, setHistoryRows] = useState([]);
  const [tableDisplayContext, setTableDisplayContext] = useState({
    isAllSelected: true,
    selectedCurrencies: [],
    currencyOrder: [],
  });
  const [loadingTable, setLoadingTable] = useState(false);
  const [linkedDataReady, setLinkedDataReady] = useState(false);
  const [miniGridShell, setMiniGridShell] = useState(true);
  const [miniGridLoading, setMiniGridLoading] = useState(false);
  const [miniGridBalances, setMiniGridBalances] = useState(() => new Map());
  const [miniGridTotals, setMiniGridTotals] = useState(() => new Map());
  const [miniGridHint, setMiniGridHint] = useState("");

  const currencySortOrderRef = useRef({});
  const summaryAbortRef = useRef(null);
  const historyAbortRef = useRef(null);
  const gridAbortRef = useRef(null);
  const searchSeqRef = useRef(0);
  const viewCacheRef = useRef(new Map());
  const linkedAccountsRef = useRef(linkedAccounts);
  linkedAccountsRef.current = linkedAccounts;
  const performMemberSearchRef = useRef(null);
  const loginRootAccountIdRef = useRef(loginRootAccountId);
  loginRootAccountIdRef.current = loginRootAccountId;
  const wlGridSelectedIdsRef = useRef(wlGridSelectedIds);
  wlGridSelectedIdsRef.current = wlGridSelectedIds;
  const miniGridBalancesRef = useRef(miniGridBalances);
  miniGridBalancesRef.current = miniGridBalances;

  const buildViewCacheKey = useCallback(
    (viewId, tid, from, to, useAll, useSelected) =>
      [
        Number(viewId) || 0,
        Number(tid) || 0,
        String(from || ""),
        String(to || ""),
        useAll ? "all" : "sel",
        useAll ? "" : (useSelected || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean).join(","),
      ].join("|"),
    [],
  );

  const linkedAccountCurrenciesMapRef = useRef(linkedAccountCurrenciesMap);
  linkedAccountCurrenciesMapRef.current = linkedAccountCurrenciesMap;

  const loadCurrencyOrder = useCallback((tid) => {
    setCurrencyOrder(readCurrencyDisplayOrder(tid) || []);
  }, []);

  const loadOwnedCurrencies = useCallback(async (accountId, tid) => {
    if (!accountId || !hasTenant(tid)) {
      setOwnedCurrencies([]);
      return;
    }
    // Already covered by the linked-accounts batch (viewAccountId is always one of
    // linkedAccounts when there's an Account Link) — no need for a second request.
    if (linkedCurrenciesLoaded && linkedAccountCurrenciesMap.has(Number(accountId))) {
      const codes = linkedAccountCurrenciesMap.get(Number(accountId));
      const list = [...codes].map((code) => ({ code, currency_id: currencySortOrderRef.current[code] || null }));
      setOwnedCurrencies(list);
      return;
    }
    try {
      const rows = await fetchMemberAccountCurrencyRows(accountId);
      const list = rows.map((r) => ({ code: r.currency_code, currency_id: r.currency_id }));
      list.forEach((o) => {
        if (o.currency_id && !currencySortOrderRef.current[o.code]) {
          currencySortOrderRef.current[o.code] = o.currency_id;
        }
      });
      setOwnedCurrencies(list);
    } catch {
      setOwnedCurrencies([]);
    }
  }, [linkedCurrenciesLoaded, linkedAccountCurrenciesMap]);

  const loadLinkedCurrenciesMap = useCallback(async (accounts, tid) => {
    const ids = accounts.map((a) => Number(a.id)).filter(Boolean);
    if (!ids.length || !hasTenant(tid)) {
      setLinkedAccountCurrenciesMap(new Map());
      setLinkedCurrenciesLoaded(true);
      return;
    }
    setLinkedCurrenciesLoaded(false);
    try {
      const map = await fetchMemberBatchAccountCurrencies(ids, currencySortOrderRef);
      setLinkedAccountCurrenciesMap(map);
    } catch {
      setLinkedAccountCurrenciesMap(new Map());
    } finally {
      setLinkedCurrenciesLoaded(true);
    }
  }, []);

  const fetchLinkedAccountsForAccount = useCallback(async (accountId, tid) => {
    if (!accountId || !hasTenant(tid)) return [];
    return fetchMemberLinkedAccounts();
  }, []);

  const loadLinkedAccounts = useCallback(
    async (rootId, tid) => {
      if (!rootId || !hasTenant(tid)) {
        setLinkedAccounts([]);
        setWlGridSelectedIds([]);
        setLinkedAccountCurrenciesMap(new Map());
        setLinkedCurrenciesLoaded(true);
        setLinkedDataReady(true);
        return;
      }
      try {
        const list = await fetchLinkedAccountsForAccount(rootId, tid);
        setLinkedAccounts(list);
        const linkedIds = list.map((a) => Number(a.id)).filter(Boolean);
        const selectedIds = applyDefaultWLGridSelection(linkedIds, tid, rootId);
        wlGridSelectedIdsRef.current = selectedIds;
        setWlGridSelectedIds(selectedIds);
        await loadLinkedCurrenciesMap(list, tid);
      } catch {
        setLinkedAccounts([]);
        setWlGridSelectedIds([]);
        setLinkedAccountCurrenciesMap(new Map());
        setLinkedCurrenciesLoaded(true);
      } finally {
        setLinkedDataReady(true);
      }
    },
    [fetchLinkedAccountsForAccount, loadLinkedCurrenciesMap],
  );

  const availableCurrencies = useMemo(
    () =>
      getAvailableCurrencies({
        linkedCurrenciesLoaded,
        linkedAccountCurrenciesMap,
        wlGridSelectedIds,
        linkedAccounts,
        ownedCurrencies,
        currencySummary,
        currencySortOrder: currencySortOrderRef.current,
        currencyDisplayOrder: currencyOrder,
      }),
    [
      linkedCurrenciesLoaded,
      linkedAccountCurrenciesMap,
      wlGridSelectedIds,
      linkedAccounts,
      ownedCurrencies,
      currencySummary,
      currencyOrder,
    ],
  );

  const miniGridCurrencies = useMemo(
    () => getMemberMiniGridCurrencies(availableCurrencies, isAllSelected, selectedCurrencies),
    [availableCurrencies, isAllSelected, selectedCurrencies],
  );

  const showMiniRail = linkedAccounts.length > 0 && miniGridCurrencies.length > 0;

  const miniGridDisplayCurrencies = useMemo(() => {
    if (miniGridShell) return MINI_GRID_SHELL_CCY;
    if (miniGridCurrencies.length > 0) return miniGridCurrencies;
    if (availableCurrencies.length > 0) {
      return isAllSelected
        ? availableCurrencies
        : availableCurrencies.filter((c) => selectedCurrencies.includes(c));
    }
    return MINI_GRID_SHELL_CCY;
  }, [miniGridShell, miniGridCurrencies, availableCurrencies, isAllSelected, selectedCurrencies]);

  const miniGridAccounts = useMemo(
    () =>
      getOrderedMiniGridAccounts(
        linkedAccounts,
        wlGridSelectedIds,
        miniGridShell ? MINI_GRID_SHELL_CCY : miniGridCurrencies,
        linkedAccountCurrenciesMap,
        linkedCurrenciesLoaded,
      ),
    [
      linkedAccounts,
      wlGridSelectedIds,
      miniGridShell,
      miniGridCurrencies,
      linkedAccountCurrenciesMap,
      linkedCurrenciesLoaded,
    ],
  );

  const miniGridHasSelection = useMemo(
    () => hasWlGridSelectedAccounts(linkedAccounts, wlGridSelectedIds),
    [linkedAccounts, wlGridSelectedIds],
  );

  const groupedRows = useMemo(
    () =>
      groupHistoryForDisplay(
        historyRows,
        tableDisplayContext.isAllSelected,
        tableDisplayContext.selectedCurrencies,
        tableDisplayContext.currencyOrder,
      ),
    [historyRows, tableDisplayContext],
  );

  const commitTableDisplayContext = useCallback((useAll, useSelected, history, currencyOrderHint = []) => {
    const orderHint = Array.isArray(currencyOrderHint) ? currencyOrderHint : [];
    const fromHistory = [
      ...new Set(
        (Array.isArray(history) ? history : [])
          .map((row) => String(row?.currency || "").trim())
          .filter(Boolean),
      ),
    ];
    const currencyOrder = useAll
      ? (orderHint.length ? orderHint : fromHistory)
      : [...useSelected];
    setTableDisplayContext({
      isAllSelected: useAll,
      selectedCurrencies: [...useSelected],
      currencyOrder,
    });
  }, []);

  const syncMiniGridTotalsAndHint = useCallback(
    (gridCurrencies) => {
      const orderUpper = (gridCurrencies || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean);
      if (!linkedAccounts.length || !orderUpper.length) {
        setMiniGridTotals(new Map());
        setMiniGridHint("");
        return;
      }
      if (!hasWlGridSelectedAccounts(linkedAccounts, wlGridSelectedIdsRef.current)) {
        setMiniGridTotals(new Map());
        setMiniGridHint("");
        return;
      }
      const orderedAccounts = getOrderedMiniGridAccounts(
        linkedAccounts,
        wlGridSelectedIdsRef.current,
        orderUpper,
        linkedAccountCurrenciesMap,
        linkedCurrenciesLoaded,
      );
      if (linkedCurrenciesLoaded && !orderedAccounts.length) {
        setMiniGridTotals(new Map());
        setMiniGridHint(
          orderUpper.length > 1
            ? t("noAccountsHoldCurrencies")
            : t("noAccountsHoldCurrency", { currency: orderUpper[0] }),
        );
        return;
      }
      setMiniGridHint("");
      setMiniGridTotals(
        computeMiniGridTotals(
          miniGridBalancesRef.current,
          orderUpper,
          orderedAccounts,
          linkedAccountCurrenciesMap,
          linkedCurrenciesLoaded,
        ),
      );
    },
    [linkedAccounts, linkedAccountCurrenciesMap, linkedCurrenciesLoaded, t],
  );

  const fetchMissingMiniGridBalances = useCallback(
    async (seq, gridCurrencies, fromDate, toDate, tid) => {
      if (!linkedAccounts.length || !fromDate || !toDate || !hasTenant(tid)) return;
      const orderUpper = (gridCurrencies || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean);
      if (!orderUpper.length) return;
      const orderedAccounts = getOrderedMiniGridAccounts(
        linkedAccounts,
        wlGridSelectedIdsRef.current,
        orderUpper,
        linkedAccountCurrenciesMap,
        linkedCurrenciesLoaded,
      );
      const missing = listMiniGridBalanceFetchPairs(
        orderedAccounts,
        orderUpper,
        linkedAccountCurrenciesMap,
        linkedCurrenciesLoaded,
        miniGridBalancesRef.current,
      );
      if (!missing.length) return;

      if (gridAbortRef.current) gridAbortRef.current.abort();
      gridAbortRef.current = new AbortController();
      const signal = gridAbortRef.current.signal;

      try {
        const missingIds = [...new Set(missing.map(({ id }) => id))];
        const missingCurrencies = [...new Set(missing.map(({ cu }) => cu))];
        const fetched = await fetchMemberMiniGridBalances({
          accountIds: missingIds,
          currencyCodes: missingCurrencies,
          dateFrom: fromDate,
          dateTo: toDate,
          signal,
        });
        if (seq !== searchSeqRef.current) return;
        setMiniGridBalances((prev) => {
          const next = new Map(prev);
          fetched.forEach((dec, key) => next.set(key, dec));
          miniGridBalancesRef.current = next;
          return next;
        });
        setMiniGridShell(false);
        syncMiniGridTotalsAndHint(gridCurrencies);
      } catch (e) {
        if (e?.name === "AbortError") return;
        if (seq !== searchSeqRef.current) return;
      }
    },
    [linkedAccounts, linkedAccountCurrenciesMap, linkedCurrenciesLoaded, syncMiniGridTotalsAndHint],
  );

  const refreshMiniGrid = useCallback(
    async (seq, gridCurrencies, fromDate, toDate, viewId, tid) => {
      if (seq === searchSeqRef.current) setMiniGridLoading(true);
      try {
        if (!linkedAccounts.length || !fromDate || !toDate || !viewId || !hasTenant(tid)) {
          setMiniGridBalances(new Map());
          miniGridBalancesRef.current = new Map();
          setMiniGridTotals(new Map());
          setMiniGridHint("");
          return;
        }
        const orderUpper = (gridCurrencies || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean);
        if (!orderUpper.length) {
          setMiniGridBalances(new Map());
          miniGridBalancesRef.current = new Map();
          setMiniGridTotals(new Map());
          setMiniGridHint("");
          return;
        }
        if (!hasWlGridSelectedAccounts(linkedAccounts, wlGridSelectedIdsRef.current)) {
          setMiniGridBalances(new Map());
          miniGridBalancesRef.current = new Map();
          setMiniGridTotals(new Map());
          setMiniGridHint("");
          setMiniGridShell(false);
          return;
        }
        const orderedAccounts = getOrderedMiniGridAccounts(
          linkedAccounts,
          wlGridSelectedIdsRef.current,
          orderUpper,
          linkedAccountCurrenciesMap,
          linkedCurrenciesLoaded,
        );
        if (linkedCurrenciesLoaded && !orderedAccounts.length) {
          setMiniGridBalances(new Map());
          miniGridBalancesRef.current = new Map();
          setMiniGridTotals(new Map());
          setMiniGridHint(
            orderUpper.length > 1
              ? t("noAccountsHoldCurrencies")
              : t("noAccountsHoldCurrency", { currency: orderUpper[0] }),
          );
          return;
        }
        setMiniGridHint("");
        if (gridAbortRef.current) gridAbortRef.current.abort();
        gridAbortRef.current = new AbortController();
        const signal = gridAbortRef.current.signal;
        const missing = listMiniGridBalanceFetchPairs(
          orderedAccounts,
          orderUpper,
          linkedAccountCurrenciesMap,
          linkedCurrenciesLoaded,
          miniGridBalancesRef.current,
        );
        const missingIds = [...new Set(missing.map(({ id }) => id))];
        const missingCurrencies = [...new Set(missing.map(({ cu }) => cu))];
        const fetched = missingIds.length
          ? await fetchMemberMiniGridBalances({
              accountIds: missingIds,
              currencyCodes: missingCurrencies,
              dateFrom: fromDate,
              dateTo: toDate,
              signal,
            })
          : new Map();
        if (seq !== searchSeqRef.current) return;
        const balanceMap = new Map(miniGridBalancesRef.current);
        fetched.forEach((dec, key) => balanceMap.set(key, dec));
        miniGridBalancesRef.current = balanceMap;
        setMiniGridBalances(balanceMap);
        setMiniGridTotals(
          computeMiniGridTotals(
            balanceMap,
            orderUpper,
            orderedAccounts,
            linkedAccountCurrenciesMap,
            linkedCurrenciesLoaded,
          ),
        );
        setMiniGridShell(false);
      } catch (e) {
        if (e?.name === "AbortError") return;
        if (seq !== searchSeqRef.current) return;
        setMiniGridBalances(new Map());
        miniGridBalancesRef.current = new Map();
        setMiniGridTotals(new Map());
        setMiniGridHint(translateMemberApiMessage(lang, e?.message, "couldNotLoadGrid"));
      } finally {
        if (seq === searchSeqRef.current) setMiniGridLoading(false);
      }
    },
    [linkedAccounts, linkedAccountCurrenciesMap, linkedCurrenciesLoaded, lang, t],
  );

  const finishHistoryFetch = useCallback(
    (seq) => {
      if (seq === searchSeqRef.current) setLoadingTable(false);
    },
    [],
  );

  const fetchMemberHistory = useCallback(
    async (seq = searchSeqRef.current, selectionOverride = null) => {
      if (!viewAccountId || !hasTenant(tenantId) || !dateFrom || !dateTo) return;
      if (historyAbortRef.current) historyAbortRef.current.abort();
      historyAbortRef.current = new AbortController();
      const signal = historyAbortRef.current.signal;

      let useAll = selectionOverride?.isAllSelected ?? isAllSelected;
      let useSelected = selectionOverride?.selectedCurrencies ?? selectedCurrencies;
      // Lets a caller (e.g. persistCurrencyOrder, right after a drag reorder) hand in the
      // freshly known order instead of relying on `availableCurrencies` — which, being a
      // useMemo over state set moments earlier in the same tick, would still be stale here.
      const orderHint = selectionOverride?.currencyOrder ?? availableCurrencies;
      if (!useAll && (!useSelected?.length)) {
        setHistoryRows([]);
        commitTableDisplayContext(false, [], [], orderHint);
        finishHistoryFetch(seq);
        const gridCur = getMemberMiniGridCurrencies(orderHint, false, []);
        void refreshMiniGrid(seq, gridCur, dateFrom, dateTo, viewAccountId, tenantId);
        return;
      }
      const cacheKey = buildViewCacheKey(viewAccountId, tenantId, dateFrom, dateTo, useAll, useSelected);
      const targetCurrencies = useAll ? orderHint : [...useSelected];

      try {
        const history = await fetchMemberHistoryRows({
          accountId: viewAccountId,
          dateFrom,
          dateTo,
          currencyCodes: useAll ? [] : targetCurrencies,
          signal,
        });
        if (seq !== searchSeqRef.current) return;
        setHistoryRows(history);
        commitTableDisplayContext(useAll, useSelected, history, orderHint);
        viewCacheRef.current.set(cacheKey, {
          historyRows: history,
          tableDisplayContext: {
            isAllSelected: useAll,
            selectedCurrencies: [...(useSelected || [])],
            currencyOrder: (Array.isArray(orderHint) && orderHint.length ? orderHint : []).slice(),
          },
        });
        finishHistoryFetch(seq);
        showNotification(t("queryCompleted"), "success");
      } catch (e) {
        if (e?.name === "AbortError") return;
        if (seq !== searchSeqRef.current) return;
        setHistoryRows([]);
        commitTableDisplayContext(useAll, useSelected, [], orderHint);
        notifyApi(e?.message, "info", "noDataInRange");
        finishHistoryFetch(seq);
      }
      const gridCur = getMemberMiniGridCurrencies(orderHint, useAll, useSelected);
      void refreshMiniGrid(seq, gridCur, dateFrom, dateTo, viewAccountId, tenantId);
    },
    [
      viewAccountId,
      tenantId,
      dateFrom,
      dateTo,
      isAllSelected,
      selectedCurrencies,
      availableCurrencies,
      refreshMiniGrid,
      finishHistoryFetch,
      showNotification,
      notifyApi,
      commitTableDisplayContext,
      buildViewCacheKey,
      t,
    ],
  );

  const hasFallbackCurrencySources = useCallback(() => {
    if (ownedCurrencies.length > 0) return true;
    if (!linkedCurrenciesLoaded) return false;
    const included = getWlGridIncludedAccountIds(linkedAccounts, wlGridSelectedIds);
    for (const accountId of included) {
      const codes = linkedAccountCurrenciesMap.get(Number(accountId));
      if (codes?.size) return true;
    }
    return false;
  }, [
    ownedCurrencies,
    linkedCurrenciesLoaded,
    linkedAccountCurrenciesMap,
    linkedAccounts,
    wlGridSelectedIds,
  ]);

  const fetchMemberSummary = useCallback(
    async (seq = searchSeqRef.current) => {
      if (!viewAccountId || !hasTenant(tenantId) || !dateFrom || !dateTo) return false;
      if (summaryAbortRef.current) summaryAbortRef.current.abort();
      summaryAbortRef.current = new AbortController();
      try {
        const rows = await fetchMemberCurrencySummaryRows({
          tenantId,
          accountId: viewAccountId,
          dateFrom,
          dateTo,
          signal: summaryAbortRef.current.signal,
        });
        if (seq !== searchSeqRef.current) return false;
        currencySortOrderRef.current = { ...currencySortOrderRef.current };
        setCurrencySummary(rows);
        return true;
      } catch (e) {
        if (e?.name === "AbortError") return false;
        if (seq !== searchSeqRef.current) return false;
        setCurrencySummary([]);
        if (!hasFallbackCurrencySources()) {
          notifyApi(e?.message, "error", "failedLoadCurrencyData");
        }
        return false;
      }
    },
    [viewAccountId, tenantId, dateFrom, dateTo, hasFallbackCurrencySources, notifyApi],
  );

  const performMemberSearch = useCallback(async () => {
    if (!viewAccountId || !hasTenant(tenantId) || !dateFrom || !dateTo) return;
    searchSeqRef.current += 1;
    const seq = searchSeqRef.current;
    const preKey = buildViewCacheKey(
      viewAccountId,
      tenantId,
      dateFrom,
      dateTo,
      isAllSelected,
      selectedCurrencies,
    );
    const cached = viewCacheRef.current.get(preKey);
    if (cached?.historyRows) {
      setHistoryRows(cached.historyRows);
      if (cached.tableDisplayContext) setTableDisplayContext(cached.tableDisplayContext);
      setLoadingTable(false);
    } else {
      setLoadingTable(true);
    }
    // Keep mini grid smooth too. We still refresh in background below.
    setMiniGridLoading(!cached);
    if (!cached) {
      const emptyBalances = new Map();
      miniGridBalancesRef.current = emptyBalances;
      setMiniGridBalances(emptyBalances);
      setMiniGridTotals(new Map());
      setMiniGridHint("");
      setMiniGridShell(true);
    }
    try {
      // /api/transaction/search is only a fallback currency source for when
      // owned/linked accounts produce no currencies at all — skip it whenever
      // availableCurrencies (the thing that actually matters, incl. for the mini
      // grid) is already non-empty. Checking availableCurrencies directly (not a
      // proxy like ownedCurrencies alone) avoids skipping while the mini grid's
      // own currency list is still empty.
      if (!availableCurrencies.length) {
        await fetchMemberSummary(seq);
        if (seq !== searchSeqRef.current) return;
      }
      loadCurrencyOrder(tenantId);
      await fetchMemberHistory(seq);
    } finally {
      if (seq === searchSeqRef.current) {
        setLoadingTable(false);
      }
    }
  }, [
    viewAccountId,
    tenantId,
    dateFrom,
    dateTo,
    isAllSelected,
    selectedCurrencies,
    availableCurrencies,
    fetchMemberSummary,
    fetchMemberHistory,
    loadCurrencyOrder,
    buildViewCacheKey,
  ]);

  performMemberSearchRef.current = performMemberSearch;

  useRealtimeDomain(REALTIME_DOMAINS.LEDGER, () => {
    void performMemberSearchRef.current?.();
  }, { enabled: Boolean(viewAccountId && hasTenant(tenantId) && dateFrom && dateTo) });

  const initSession = useCallback((u, tid, from, to) => {
    const loginId = Number(u.member_login_account_id || u.user_id) || 0;
    const viewId = Number(u.member_winloss_view_account_id || u.winloss_view_account_id || u.user_id) || 0;
    setLoginRootAccountId(loginId);
    setViewAccountId(viewId);
    setTenantId(Number(tid) || 0);
    setDateFrom(from);
    setDateTo(to);
  }, []);

  const reloadLinkedChain = useCallback(
    async (rootId, tid) => {
      setLinkedDataReady(false);
      await loadLinkedAccounts(rootId, tid);
    },
    [loadLinkedAccounts],
  );

  const switchCompany = useCallback(
    async (nextTenantId, tenantLabel) => {
      const nextId = Number(nextTenantId);
      if (!nextId || nextId === Number(tenantId)) return;
      try {
        const { ok, json } = await switchSessionTenant(nextId);
        if (!ok || !json?.success) throw new Error(json?.message || t("failedSwitchCompany"));
        setTenantId(nextId);
        showNotification(t("switchedToCompany", { label: tenantLabel || nextId }), "success");
        await reloadLinkedChain(loginRootAccountId, nextId);
        await loadOwnedCurrencies(viewAccountId, nextId);
      } catch (e) {
        notifyApi(e?.message, "error", "failedSwitchCompany");
      }
    },
    [tenantId, loginRootAccountId, viewAccountId, reloadLinkedChain, loadOwnedCurrencies, notifyApi, showNotification, t],
  );

  const switchAccount = useCallback(
    async (nextAccountId, code, name) => {
      const newId = Number(nextAccountId);
      if (!newId || newId === Number(viewAccountId)) return;
      setViewAccountId(newId);
      showNotification(t("switchedToAccount", { label: code || name || newId }), "success");
      await loadOwnedCurrencies(newId, tenantId);
    },
    [viewAccountId, tenantId, loadOwnedCurrencies, showNotification, t],
  );

  const persistCurrencyOrder = useCallback(
    (nextOrder) => {
      persistCurrencyDisplayOrder(tenantId, nextOrder);
      setCurrencyOrder(nextOrder);
      setIsAllSelected(true);
      setSelectedCurrencies([]);
      showNotification(t("currencyOrderSaved"), "success");
      // Pass nextOrder straight through — `availableCurrencies` won't reflect the new
      // order until after this render commits, so relying on it here would redisplay
      // the table in the old order even though the pills/mini grid already show the new one.
      void fetchMemberHistory(searchSeqRef.current, {
        isAllSelected: true,
        selectedCurrencies: [],
        currencyOrder: nextOrder,
      });
    },
    [tenantId, fetchMemberHistory, showNotification, t],
  );

  const applyWlGridSelection = useCallback(
    (ids) => {
      wlGridSelectedIdsRef.current = ids;
      setWlGridSelectedIds(ids);
      saveWLGridSelection(ids, tenantId, loginRootAccountId);
      if (!ids.length) {
        setMiniGridBalances(new Map());
        miniGridBalancesRef.current = new Map();
        setMiniGridTotals(new Map());
        setMiniGridHint("");
        setMiniGridShell(false);
      }
      const pool = linkedAccountsRef.current;
      const nextAvailable = getAvailableCurrencies({
        linkedCurrenciesLoaded,
        linkedAccountCurrenciesMap,
        wlGridSelectedIds: ids,
        linkedAccounts: pool,
        ownedCurrencies,
        currencySummary,
        currencySortOrder: currencySortOrderRef.current,
        currencyDisplayOrder: currencyOrder,
      });
      const sanitized = sanitizeCurrencySelection(
        nextAvailable,
        isAllSelected,
        selectedCurrencies,
        linkedCurrenciesLoaded,
        linkedAccountCurrenciesMap,
        ids,
        pool,
      );
      setIsAllSelected(sanitized.isAllSelected);
      setSelectedCurrencies(sanitized.selectedCurrencies);
      const gridCur = getMemberMiniGridCurrencies(
        nextAvailable,
        sanitized.isAllSelected,
        sanitized.selectedCurrencies,
      );
      syncMiniGridTotalsAndHint(gridCur);
      void fetchMissingMiniGridBalances(searchSeqRef.current, gridCur, dateFrom, dateTo, tenantId);
    },
    [
      tenantId,
      loginRootAccountId,
      linkedCurrenciesLoaded,
      linkedAccountCurrenciesMap,
      ownedCurrencies,
      currencySummary,
      currencyOrder,
      isAllSelected,
      selectedCurrencies,
      dateFrom,
      dateTo,
      syncMiniGridTotalsAndHint,
      fetchMissingMiniGridBalances,
    ],
  );

  const onCurrencyAll = useCallback(() => {
    const next = applyCurrencyAllToggle(availableCurrencies, isAllSelected);
    setIsAllSelected(next.isAllSelected);
    setSelectedCurrencies(next.selectedCurrencies);
    fetchMemberHistory(searchSeqRef.current, next);
  }, [availableCurrencies, isAllSelected, fetchMemberHistory]);

  const onCurrencyToggle = useCallback(
    (code) => {
      const next = applyCurrencyToggle(availableCurrencies, isAllSelected, selectedCurrencies, code);
      setIsAllSelected(next.isAllSelected);
      setSelectedCurrencies(next.selectedCurrencies);
      fetchMemberHistory(searchSeqRef.current, next);
    },
    [availableCurrencies, isAllSelected, selectedCurrencies, fetchMemberHistory],
  );

  useEffect(() => {
    if (!availableCurrencies.length) {
      setIsAllSelected(true);
      setSelectedCurrencies([]);
      return;
    }
    const sanitized = sanitizeCurrencySelection(
      availableCurrencies,
      isAllSelected,
      selectedCurrencies,
      linkedCurrenciesLoaded,
      linkedAccountCurrenciesMap,
      wlGridSelectedIds,
      linkedAccounts,
    );
    setIsAllSelected((prev) => (prev === sanitized.isAllSelected ? prev : sanitized.isAllSelected));
    setSelectedCurrencies((prev) => {
      const next = sanitized.selectedCurrencies;
      if (prev.length === next.length && prev.every((c, i) => c === next[i])) return prev;
      return next;
    });
  }, [
    availableCurrencies,
    linkedCurrenciesLoaded,
    linkedAccountCurrenciesMap,
    wlGridSelectedIds,
    linkedAccounts,
    isAllSelected,
    selectedCurrencies,
  ]);

  useEffect(() => {
    if (loginRootAccountId && hasTenant(tenantId)) {
      reloadLinkedChain(loginRootAccountId, tenantId);
    }
  }, [loginRootAccountId, tenantId, reloadLinkedChain]);

  useEffect(() => {
    // Wait for the linked-accounts batch (linkedDataReady) so, when there's a link,
    // loadOwnedCurrencies can reuse it instead of racing it with a duplicate single-account call.
    if (linkedDataReady && viewAccountId && hasTenant(tenantId)) {
      loadOwnedCurrencies(viewAccountId, tenantId);
    }
  }, [linkedDataReady, viewAccountId, tenantId, loadOwnedCurrencies]);

  useEffect(() => {
    if (!linkedDataReady || !viewAccountId || !hasTenant(tenantId) || !dateFrom || !dateTo) return undefined;

    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await performMemberSearchRef.current?.();
    })();

    return () => {
      cancelled = true;
      if (summaryAbortRef.current) summaryAbortRef.current.abort();
      if (historyAbortRef.current) historyAbortRef.current.abort();
      if (gridAbortRef.current) gridAbortRef.current.abort();
    };
  }, [linkedDataReady, viewAccountId, tenantId, dateFrom, dateTo]);

  return {
    loginRootAccountId,
    viewAccountId,
    tenantId,
    // Back-compat alias for MemberPage.jsx / PaymentHistoryExportPdfModal — Company and Group are
    // both just a tenantId on the Spring side, there is no separate group scope any more.
    companyId: tenantId,
    setTenantId,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    linkedAccounts,
    wlGridSelectedIds,
    linkedAccountCurrenciesMap,
    linkedCurrenciesLoaded,
    isAllSelected,
    selectedCurrencies,
    availableCurrencies,
    miniGridCurrencies,
    miniGridDisplayCurrencies,
    miniGridShell,
    miniGridLoading,
    miniGridBalances,
    miniGridTotals,
    miniGridHint,
    miniGridAccounts,
    miniGridHasSelection,
    showMiniRail,
    groupedRows,
    loadingTable,
    initSession,
    switchCompany,
    switchAccount,
    persistCurrencyOrder,
    applyWlGridSelection,
    onCurrencyAll,
    onCurrencyToggle,
    performMemberSearch,
    fetchMemberHistory,
    formatPaymentHistoryMoney,
  };
}
