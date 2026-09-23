import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchCurrentUser, logoutSession, switchSessionTenant } from "../lib/authApi.js";
import { useSyncedLoginLang, writeLoginLang } from "../lib/loginLang.js";
import {
  applyCurrencyAllToggle,
  applyCurrencyToggle,
  accountHoldsMiniGridCurrency,
  computeMiniGridTotals,
  getMemberMiniGridCurrencies,
  groupHistoryForDisplay,
  todayYmd,
} from "../lib/memberHelpers.js";
import {
  fetchMemberAccountCurrencyRows,
  fetchMemberBatchAccountCurrencies,
  fetchMemberHistoryRows,
  fetchMemberLinkedAccounts,
  fetchMemberMiniGridBalances,
} from "../lib/memberApi.js";
import { fetchOwnerCompaniesForMobile } from "../lib/tenantAccessibleApi.js";
import { getMemberText, memberText, translateMemberApiMessage } from "../translateFile/memberTranslate.js";

export function useMobileMember() {
  const navigate = useNavigate();
  const [lang, setLangState] = useSyncedLoginLang();
  const i18n = useMemo(() => memberText(lang), [lang]);
  const t = useCallback((key, params) => getMemberText(lang, key, params), [lang]);

  const [me, setMe] = useState(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
  const [loginRootAccountId, setLoginRootAccountId] = useState(0);
  const [viewAccountId, setViewAccountId] = useState(0);
  const [companyId, setCompanyId] = useState(0);
  const [groupId, setGroupId] = useState("");
  const [dateFromYmd, setDateFromYmd] = useState(() => todayYmd());
  const [dateToYmd, setDateToYmd] = useState(() => todayYmd());
  const [linkedAccounts, setLinkedAccounts] = useState([]);
  const [ownedCurrencies, setOwnedCurrencies] = useState([]);
  const [isAllSelected, setIsAllSelected] = useState(true);
  const [selectedCurrencies, setSelectedCurrencies] = useState([]);
  const [historyRows, setHistoryRows] = useState([]);
  const [tableDisplayContext, setTableDisplayContext] = useState({
    isAllSelected: true,
    selectedCurrencies: [],
    currencyOrder: [],
  });
  const [loadingTable, setLoadingTable] = useState(false);
  const [toast, setToast] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [balanceMap, setBalanceMap] = useState(() => new Map());
  const [balanceTotals, setBalanceTotals] = useState(() => new Map());
  const [balanceCurrencies, setBalanceCurrencies] = useState([]);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [linkedAccountCurrenciesMap, setLinkedAccountCurrenciesMap] = useState(() => new Map());
  const [linkedCurrenciesLoaded, setLinkedCurrenciesLoaded] = useState(false);

  const historyAbortRef = useRef(null);
  const balancesAbortRef = useRef(null);
  const toastTimer = useRef(null);
  const searchSeqRef = useRef(0);
  const balancesSeqRef = useRef(0);
  const linkedAccountsRef = useRef(linkedAccounts);
  linkedAccountsRef.current = linkedAccounts;
  const linkedCcyMapRef = useRef(linkedAccountCurrenciesMap);
  linkedCcyMapRef.current = linkedAccountCurrenciesMap;
  const linkedCcyLoadedRef = useRef(linkedCurrenciesLoaded);
  linkedCcyLoadedRef.current = linkedCurrenciesLoaded;

  const setLang = useCallback((next) => {
    setLangState(writeLoginLang(next));
  }, []);

  const notify = useCallback((message, tone = "success") => {
    if (!message) return;
    setToast({ message, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), tone === "error" ? 4000 : 2200);
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutSession();
    } finally {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  const availableCurrencies = useMemo(
    () => ownedCurrencies.map((o) => o.code).filter(Boolean),
    [ownedCurrencies],
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

  const loadOwnedCurrencies = useCallback(async (accountId) => {
    if (!accountId) {
      setOwnedCurrencies([]);
      return [];
    }
    try {
      const list = await fetchMemberAccountCurrencyRows(accountId);
      setOwnedCurrencies(list);
      return list.map((o) => o.code);
    } catch {
      setOwnedCurrencies([]);
      return [];
    }
  }, []);

  // Spring `/api/member/profile` resolves "self + every account visible via Account Link"
  // from the session directly — no account_id/company_id/group_id scope params needed.
  const loadLinkedAccounts = useCallback(async () => {
    try {
      const list = await fetchMemberLinkedAccounts();
      setLinkedAccounts(list);
      linkedAccountsRef.current = list;

      const ids = list.map((a) => Number(a.id)).filter(Boolean);
      if (!ids.length) {
        setLinkedAccountCurrenciesMap(new Map());
        linkedCcyMapRef.current = new Map();
        setLinkedCurrenciesLoaded(true);
        linkedCcyLoadedRef.current = true;
        return list;
      }
      setLinkedCurrenciesLoaded(false);
      linkedCcyLoadedRef.current = false;
      try {
        const map = await fetchMemberBatchAccountCurrencies(ids);
        setLinkedAccountCurrenciesMap(map);
        linkedCcyMapRef.current = map;
      } catch {
        setLinkedAccountCurrenciesMap(new Map());
        linkedCcyMapRef.current = new Map();
      } finally {
        setLinkedCurrenciesLoaded(true);
        linkedCcyLoadedRef.current = true;
      }
      return list;
    } catch {
      setLinkedAccounts([]);
      linkedAccountsRef.current = [];
      setLinkedAccountCurrenciesMap(new Map());
      linkedCcyMapRef.current = new Map();
      setLinkedCurrenciesLoaded(true);
      linkedCcyLoadedRef.current = true;
      return [];
    }
  }, []);

  const commitTableDisplayContext = useCallback((useAll, useSelected, history, currencyOrderHint = []) => {
    const fromHistory = [
      ...new Set(
        (Array.isArray(history) ? history : [])
          .map((row) => String(row?.currency || "").trim())
          .filter(Boolean),
      ),
    ];
    const currencyOrder = useAll
      ? currencyOrderHint.length
        ? currencyOrderHint
        : fromHistory
      : [...useSelected];
    setTableDisplayContext({
      isAllSelected: useAll,
      selectedCurrencies: [...useSelected],
      currencyOrder,
    });
  }, []);

  const refreshBalances = useCallback(
    async ({
      accounts,
      compId = companyId,
      gid = groupId,
      fromYmd = dateFromYmd,
      toYmd = dateToYmd,
      useAll = isAllSelected,
      useSelected = selectedCurrencies,
      currencyCodes = availableCurrencies,
      silent = false,
    } = {}) => {
      const orderUpper = getMemberMiniGridCurrencies(currencyCodes, useAll, useSelected);
      const list = (accounts ?? linkedAccountsRef.current ?? []).filter((a) => Number(a?.id) > 0);

      balancesSeqRef.current += 1;
      const seq = balancesSeqRef.current;
      balancesAbortRef.current?.abort();
      const ac = new AbortController();
      balancesAbortRef.current = ac;

      if (!list.length || !orderUpper.length) {
        setBalanceMap(new Map());
        setBalanceTotals(new Map());
        setBalanceCurrencies(orderUpper);
        setBalancesLoading(false);
        return;
      }

      if (!silent) setBalancesLoading(true);
      setBalanceCurrencies(orderUpper);

      const ccyMap = linkedCcyMapRef.current;
      const ccyLoaded = linkedCcyLoadedRef.current;

      try {
        const accountIds = list
          .map((acc) => Number(acc.id))
          .filter((id) => list.some((acc) => Number(acc.id) === id) && orderUpper.some((cu) => accountHoldsMiniGridCurrency(ccyMap, ccyLoaded, id, cu)));
        const nextMap = await fetchMemberMiniGridBalances({
          accountIds,
          currencyCodes: orderUpper,
          dateFrom: fromYmd,
          dateTo: toYmd,
          signal: ac.signal,
        });
        if (seq !== balancesSeqRef.current) return;
        setBalanceMap(nextMap);
        setBalanceTotals(computeMiniGridTotals(nextMap, orderUpper, list, ccyMap, ccyLoaded));
      } catch (e) {
        if (e?.name === "AbortError") return;
        if (seq !== balancesSeqRef.current) return;
        setBalanceMap(new Map());
        setBalanceTotals(new Map());
      } finally {
        if (seq === balancesSeqRef.current) setBalancesLoading(false);
      }
    },
    [
      companyId,
      groupId,
      dateFromYmd,
      dateToYmd,
      isAllSelected,
      selectedCurrencies,
      availableCurrencies,
    ],
  );

  const fetchHistory = useCallback(
    async ({
      viewId = viewAccountId,
      compId = companyId,
      gid = groupId,
      fromYmd = dateFromYmd,
      toYmd = dateToYmd,
      useAll = isAllSelected,
      useSelected = selectedCurrencies,
      currencyCodes = availableCurrencies,
      silent = false,
    } = {}) => {
      const dateFrom = fromYmd;
      const dateTo = toYmd;
      if (!viewId || !dateFrom || !dateTo) return;

      searchSeqRef.current += 1;
      const seq = searchSeqRef.current;
      historyAbortRef.current?.abort();
      const ac = new AbortController();
      historyAbortRef.current = ac;

      if (!silent) setLoadingTable(true);

      if (!useAll && !(useSelected?.length)) {
        setHistoryRows([]);
        commitTableDisplayContext(false, [], [], currencyCodes);
        setBalanceMap(new Map());
        setBalanceTotals(new Map());
        setBalanceCurrencies([]);
        if (seq === searchSeqRef.current) setLoadingTable(false);
        return;
      }

      const targetCurrencies = useAll ? currencyCodes : [...useSelected];

      try {
        // One call handles every requested currency — no more per-currency loop.
        const history = await fetchMemberHistoryRows({
          accountId: viewId,
          dateFrom,
          dateTo,
          currencyCodes: targetCurrencies,
          signal: ac.signal,
        });
        if (seq !== searchSeqRef.current) return;
        setHistoryRows(history);
        commitTableDisplayContext(useAll, useSelected, history, currencyCodes);
        if (!silent) notify(t("queryCompleted"));
        void refreshBalances({
          compId,
          gid,
          fromYmd,
          toYmd,
          useAll,
          useSelected,
          currencyCodes,
          silent: true,
        });
      } catch (e) {
        if (e?.name === "AbortError") return;
        if (seq !== searchSeqRef.current) return;
        setHistoryRows([]);
        commitTableDisplayContext(useAll, useSelected, [], currencyCodes);
        notify(translateMemberApiMessage(lang, e?.message, "couldNotLoadHistory"), "error");
      } finally {
        if (seq === searchSeqRef.current) setLoadingTable(false);
      }
    },
    [
      viewAccountId,
      companyId,
      groupId,
      dateFromYmd,
      dateToYmd,
      isAllSelected,
      selectedCurrencies,
      availableCurrencies,
      commitTableDisplayContext,
      refreshBalances,
      notify,
      lang,
      t,
    ],
  );

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const { ok, json } = await fetchCurrentUser({ signal: ac.signal });
        if (!ok || !json?.success || !json?.data) {
          navigate("/login", { replace: true });
          return;
        }
        const u = json.data;
        if (String(u.user_type || "").toLowerCase() !== "member") {
          navigate("/dashboard", { replace: true });
          return;
        }
        const loginId = Number(u.member_login_account_id || u.user_id) || 0;
        const viewId = Number(u.member_winloss_view_account_id || u.winloss_view_account_id || u.user_id) || 0;
        const gid =
          String(u?.login_scope || "").toLowerCase() === "group"
            ? String(u?.login_identifier || "").trim().toUpperCase()
            : "";
        const cid = Number(u.company_id) || 0;
        setMe(u);
        setLoginRootAccountId(loginId);
        setViewAccountId(viewId);
        setCompanyId(cid);
        setGroupId(gid);

        // Company pills: `/auth/tenant-accessible?all=1` (desktop parity — includes GROUP rows,
        // which the sheet labels via `tenant_type`). The legacy `get_account_companies` was
        // account-scoped and never returned groups.
        const companyRows = await fetchOwnerCompaniesForMobile(ac.signal);
        if (!ac.signal.aborted) {
          setCompanies(Array.isArray(companyRows) ? companyRows : []);
        }

        await loadLinkedAccounts();
        const codes = await loadOwnedCurrencies(viewId);
        if (ac.signal.aborted) return;
        setBootLoading(false);
        await fetchHistory({
          viewId,
          compId: cid,
          gid,
          currencyCodes: codes,
          silent: true,
        });
      } catch (e) {
        if (e?.name !== "AbortError") navigate("/login", { replace: true });
      } finally {
        if (!ac.signal.aborted) setBootLoading(false);
      }
    })();
    return () => {
      ac.abort();
      historyAbortRef.current?.abort();
      balancesAbortRef.current?.abort();
      clearTimeout(toastTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const switchCompany = useCallback(
    async (nextCompanyId, companyLabel) => {
      if (!nextCompanyId || Number(nextCompanyId) === Number(companyId)) return;
      try {
        const { ok, json } = await switchSessionTenant(nextCompanyId);
        if (!ok || !json?.success) throw new Error(json?.message || json?.error || t("failedSwitchCompany"));
        const cid = Number(nextCompanyId);
        setCompanyId(cid);
        setGroupId("");
        notify(t("switchedToCompany", { label: companyLabel || nextCompanyId }));
        await loadLinkedAccounts();
        const codes = await loadOwnedCurrencies(viewAccountId);
        await fetchHistory({
          compId: cid,
          gid: "",
          currencyCodes: codes,
        });
      } catch (e) {
        notify(translateMemberApiMessage(lang, e?.message, "failedSwitchCompany"), "error");
      }
    },
    [companyId, viewAccountId, loadLinkedAccounts, loadOwnedCurrencies, fetchHistory, notify, lang, t],
  );

  const switchAccount = useCallback(
    async (nextAccountId, code, name) => {
      const newId = Number(nextAccountId);
      if (!newId || newId === Number(viewAccountId)) return;
      // Which linked account the member is viewing is client state only — desktop parity
      // (`useMemberWinLoss.js` switchAccount). There is no server-side "switch account"
      // endpoint: the legacy `update_account_session_api.php` had no Spring counterpart.
      setViewAccountId(newId);
      notify(t("switchedToAccount", { label: code || name || newId }));
      try {
        const codes = await loadOwnedCurrencies(newId);
        await fetchHistory({
          viewId: newId,
          currencyCodes: codes,
        });
      } catch (e) {
        notify(translateMemberApiMessage(lang, e?.message, "failedSwitchAccount"), "error");
      }
    },
    [viewAccountId, loadOwnedCurrencies, fetchHistory, notify, lang, t],
  );

  const setCurrencyAll = useCallback(() => {
    const next = applyCurrencyAllToggle();
    setIsAllSelected(next.isAllSelected);
    setSelectedCurrencies(next.selectedCurrencies);
  }, []);

  const toggleCurrency = useCallback(
    (code) => {
      const next = applyCurrencyToggle(availableCurrencies, isAllSelected, selectedCurrencies, code);
      setIsAllSelected(next.isAllSelected);
      setSelectedCurrencies(next.selectedCurrencies);
    },
    [availableCurrencies, isAllSelected, selectedCurrencies],
  );

  const applyFilters = useCallback(
    async ({ fromYmd, toYmd, useAll, useSelected } = {}) => {
      const nextFrom = fromYmd ?? dateFromYmd;
      const nextTo = toYmd ?? dateToYmd;
      const nextAll = useAll ?? isAllSelected;
      const nextSel = useSelected ?? selectedCurrencies;
      setDateFromYmd(nextFrom);
      setDateToYmd(nextTo);
      setIsAllSelected(nextAll);
      setSelectedCurrencies(nextSel);
      await fetchHistory({
        fromYmd: nextFrom,
        toYmd: nextTo,
        useAll: nextAll,
        useSelected: nextSel,
      });
    },
    [dateFromYmd, dateToYmd, isAllSelected, selectedCurrencies, fetchHistory],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchHistory({ silent: true });
    } finally {
      setRefreshing(false);
    }
  }, [fetchHistory]);

  const viewAccount = useMemo(() => {
    const hit = linkedAccounts.find((a) => Number(a.id) === Number(viewAccountId));
    return hit || { id: viewAccountId, account_id: "", name: "" };
  }, [linkedAccounts, viewAccountId]);

  const companyCode = String(me?.company_code || me?.company_id || "").toUpperCase();
  const displayGroupId = String(me?.login_group_id || me?.login_identifier || groupId || "").toUpperCase();

  return {
    i18n,
    t,
    lang,
    setLang,
    me,
    bootLoading,
    companies,
    companyId,
    groupId,
    loginRootAccountId,
    viewAccountId,
    viewAccount,
    linkedAccounts,
    dateFromYmd,
    dateToYmd,
    setDateFromYmd,
    setDateToYmd,
    availableCurrencies,
    isAllSelected,
    selectedCurrencies,
    setCurrencyAll,
    toggleCurrency,
    groupedRows,
    loadingTable,
    toast,
    refreshing,
    balanceMap,
    balanceTotals,
    balanceCurrencies,
    balancesLoading,
    linkedAccountCurrenciesMap,
    linkedCurrenciesLoaded,
    companyCode,
    groupIdLabel: displayGroupId,
    logout,
    refresh,
    switchCompany,
    switchAccount,
    applyFilters,
    notify,
  };
}
