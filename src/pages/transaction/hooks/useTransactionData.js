import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { isCancelledError, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";
import { notifyCompanySessionUpdated } from "../../../utils/company/companySessionEvents.js";
import { spaPath } from "../../../utils/routing/pageRoutes.js";
import {
  filterCompaniesWithDisplayId,
  fetchOwnerCompaniesAll,
  getCachedOwnerCompanies,
  clearDashboardGroupFilterKeepCompany,
  DASHBOARD_GROUP_FILTER_OPT_OUT_KEY,
  notifyDashboardGroupFilterChanged,
  persistDashboardGroupFilter,
  resolveBootCompanyId,
  persistDashboardFilterState,
  persistDashboardGroupOnlyMode,
  pickDefaultSubsidiaryForGroup,
  resolveCompanyPickWhenSwitchingGroup,
  resolveCompanyWhenClosingGroup,
  resolveViewGroupForCompany,
  sortedUniqueGroupIds,
} from "../../../utils/company/sharedCompanyFilter.js";
import {
  canClearCompanySelection,
  canUseGroupOnlyMode,
  isCompanyLogin,
} from "../../../utils/company/loginScope.js";
import { syncCompanySessionApi } from "../../../utils/company/companySessionSync.js";
import { syncCompanySessionInBackground } from "../../../utils/company/companySessionSwitchCore.js";
import {
  getAccounts,
  getCategories,
  getCompanyCurrencies,
  getUserCurrencyOrder,
  transactionQueryKeys,
} from "../lib/transactionApi.js";
import { isPartnershipAuditReadOnlyLocked } from "../../../utils/audit/partnershipAuditReadOnly.js";
import { orderCurrencyRows } from "../lib/transactionPaymentLogic.js";
import { persistCurrencyDisplayOrder } from "../../../utils/company/currencyDisplayOrder.js";
import {
  resolveTransactionScope,
  transactionScopeApiParams,
  transactionScopeCacheKey,
  resolveTransactionCurrencyOrderCompanyId,
} from "../lib/transactionScope.js";
import { useGroupAnchorSessionSync } from "../../../utils/company/useGroupAnchorSessionSync.js";
import { buildTransactionCompanyStripRows } from "../lib/transactionCompanyStrip.js";
import {
  applyTransactionBootPersistence,
  buildTransactionBootSnapshot,
  mergeOwnerCompaniesIntoSnapshot,
} from "../lib/transactionBootSnapshot.js";
import {
  hydrateTransactionScopeMetadataFromCache,
  prefetchTransactionScopeBundle,
  warmTransactionCompanyHover,
} from "../lib/transactionScopePrefetch.js";

export function useTransactionData({
  todayDmy,
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { me: u, sessionReady } = useAuthSession();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [filterSnapshot, setFilterSnapshot] = useState(null);
  const [categories, setCategories] = useState([]);
  const [accountOptions, setAccountOptions] = useState([]);
  const [currencyOptions, setCurrencyOptions] = useState([]);
  /** scopeKey + rows updated atomically — restore never sees stale rows for a new company. */
  const [currencyScopeBundle, setCurrencyScopeBundle] = useState({ scopeKey: null, rows: [] });
  const filterSnapshotRef = useRef(null);
  const scopeSwitchSeqRef = useRef(0);
  const scopeCacheKeyRef = useRef("");
  const bootOnceRef = useRef(false);
  /** URL ?company_id= session sync — once per mount to avoid refresh ↔ sync loop. */
  const bootUrlSessionSyncedRef = useRef(false);
  /** Async boot completed for this user id (company list + initial session). */
  const bootAsyncDoneForUserRef = useRef(null);
  const companySessionAbortRef = useRef(null);
  const uRef = useRef(u);
  uRef.current = u;

  const authScopeKey = useMemo(
    () =>
      [
        u?.user_id ?? "",
        u?.user_type ?? "",
        Array.isArray(u?.permissions) ? u.permissions.join(",") : "",
      ].join("|"),
    [u?.user_id, u?.user_type, u?.permissions],
  );

  const commitFilterSnapshot = useCallback((nextSnap) => {
    filterSnapshotRef.current = nextSnap;
    setFilterSnapshot(nextSnap);
  }, []);

  const transactionScope = useMemo(
    () => resolveTransactionScope(filterSnapshot),
    [filterSnapshot],
  );
  const scopeCacheKey = transactionScopeCacheKey(transactionScope);
  const prevScopeCacheKeyRef = useRef(scopeCacheKey);

  useEffect(() => {
    scopeCacheKeyRef.current = scopeCacheKey;
  }, [scopeCacheKey]);

  useEffect(() => {
    filterSnapshotRef.current = filterSnapshot;
  }, [filterSnapshot]);

  useLayoutEffect(() => {
    if (prevScopeCacheKeyRef.current === scopeCacheKey) return;
    prevScopeCacheKeyRef.current = scopeCacheKey;
    scopeCacheKeyRef.current = scopeCacheKey;

    const hydrated = hydrateTransactionScopeMetadataFromCache(
      queryClient,
      transactionScope,
      filterSnapshotRef.current?.snapCompaniesAll || filterSnapshotRef.current?.snapCompanies || [],
    );
    if (hydrated) {
      setAccountOptions(hydrated.accData);
      setCurrencyScopeBundle({ scopeKey: hydrated.scopeCacheKey, rows: hydrated.ordered });
      setCurrencyOptions(hydrated.codes);
      return;
    }

    setAccountOptions([]);
    setCurrencyOptions([]);
    setCurrencyScopeBundle({ scopeKey: null, rows: [] });
  }, [scopeCacheKey, queryClient, transactionScope]);

  const setCurrencyRowsOrdered = useCallback((next) => {
    setCurrencyScopeBundle((prev) => ({
      ...prev,
      rows: typeof next === "function" ? next(prev.rows) : next,
    }));
  }, []);

  const currencyRowsOrdered = currencyScopeBundle.rows;

  const syncPickerCompanySession = useCallback(
    async (companyId, seq) => {
      const cid = Number(companyId);
      if (!Number.isFinite(cid) || cid <= 0) return;
      companySessionAbortRef.current?.abort();
      const ac = new AbortController();
      companySessionAbortRef.current = ac;
      try {
        await syncCompanySessionInBackground({
          companyId: cid,
          sessionCompanyId: u?.company_id,
          signal: ac.signal,
          layoutSilent: true,
        });
      } catch (e) {
        if (e?.name === "AbortError" || isCancelledError(e)) return;
        console.error(e);
      } finally {
        if (companySessionAbortRef.current === ac) {
          companySessionAbortRef.current = null;
        }
      }
      if (seq !== scopeSwitchSeqRef.current) return;
    },
    [u?.company_id],
  );

  useLayoutEffect(() => {
    if (!sessionReady || !u || bootOnceRef.current || filterSnapshotRef.current) return;
    if (String(u.user_type || "").toLowerCase() === "member") return;
    const perms = Array.isArray(u.permissions) ? u.permissions : [];
    const hasFull = perms.length === 0;
    const canPay = hasFull || perms.includes("payment");
    if (!canPay) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    const cached = getCachedOwnerCompanies();
    if (!cached?.length) return;
    const queryCompany = new URL(window.location.href).searchParams.get("company_id");
    const bootSnap = buildTransactionBootSnapshot(u, cached, { queryCompany });
    if (!bootSnap) return;
    bootOnceRef.current = true;
    commitFilterSnapshot(bootSnap);
    setLoading(false);
  }, [sessionReady, u, commitFilterSnapshot]);

  useEffect(() => {
    if (!sessionReady) return;
    if (!u) {
      bootOnceRef.current = false;
      bootUrlSessionSyncedRef.current = false;
      bootAsyncDoneForUserRef.current = null;
      navigate(spaPath("login"), { replace: true });
      return;
    }

    const userId = u.user_id;
    if (bootAsyncDoneForUserRef.current === userId) return;

    let cancelled = false;
    (async () => {
      try {
        if (String(u.user_type || "").toLowerCase() === "member") {
          window.location.assign(new URL(spaPath("member"), window.location.origin).href);
          return;
        }
        const perms = Array.isArray(u.permissions) ? u.permissions : [];
        const hasFull = perms.length === 0;
        const canPay = hasFull || perms.includes("payment");
        if (!canPay) {
          if (!cancelled) setForbidden(true);
          return;
        }

        const rows = await fetchOwnerCompaniesAll();
        if (cancelled) return;

        const url = new URL(window.location.href);
        const queryCompany = url.searchParams.get("company_id");

        const syncUrlCompanySessionOnce = async () => {
          if (bootUrlSessionSyncedRef.current) return;
          if (!queryCompany || !rows.some((c) => Number(c.id) === Number(queryCompany))) return;
          bootUrlSessionSyncedRef.current = true;
          const sj = await syncCompanySessionApi(queryCompany);
          if (sj?.success) notifyCompanySessionUpdated(sj.data ?? null);
        };

        if (filterSnapshotRef.current) {
          const merged = mergeOwnerCompaniesIntoSnapshot(filterSnapshotRef.current, rows, u);
          if (merged !== filterSnapshotRef.current) {
            commitFilterSnapshot(merged);
          }
          await syncUrlCompanySessionOnce();
        } else {
          let bootSnap = buildTransactionBootSnapshot(u, rows, { queryCompany });
          if (!bootSnap) return;

          if (
            bootSnap.companyId != null &&
            queryCompany &&
            rows.some((c) => Number(c.id) === Number(queryCompany))
          ) {
            const sj = await syncCompanySessionApi(queryCompany);
            bootUrlSessionSyncedRef.current = true;
            if (!sj?.success) {
              const fallbackId = u.company_id ? Number(u.company_id) : rows[0]?.id ? Number(rows[0].id) : null;
              if (fallbackId != null) {
                bootSnap = {
                  ...bootSnap,
                  companyId: fallbackId,
                  groupOnlyLedger: false,
                  displayCompanyRow:
                    bootSnap.snapCompanies?.find((c) => Number(c.id) === Number(fallbackId)) ?? null,
                };
                bootSnap.companyStripRows = buildTransactionCompanyStripRows(bootSnap, {
                  selectedGroup: bootSnap.selectedGroup,
                  companyId: fallbackId,
                  groupsAllMode: false,
                });
              }
            } else {
              notifyCompanySessionUpdated(sj.data ?? null);
            }
          }

          if (!cancelled) {
            applyTransactionBootPersistence(bootSnap);
            commitFilterSnapshot(bootSnap);
          }
        }

        if (!cancelled) {
          bootOnceRef.current = true;
          bootAsyncDoneForUserRef.current = userId;
        }
      } catch {
        if (!cancelled && !filterSnapshotRef.current) navigate(spaPath("login"), { replace: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionReady, u?.user_id, navigate, commitFilterSnapshot]);

  useEffect(() => {
    if (!sessionReady) return;
    const refreshSessionFlags = () => {
      const me = uRef.current;
      if (!me) return;
      const viewerRole = String(me.role || "").toLowerCase();
      const mutationsBlocked = isPartnershipAuditReadOnlyLocked(me);
      setFilterSnapshot((prev) => {
        if (!prev) return prev;
        if (prev.viewerRole === viewerRole && prev.mutationsBlocked === mutationsBlocked) return prev;
        return { ...prev, viewerRole, mutationsBlocked };
      });
    };
    const onCompanySession = () => {
      refreshSessionFlags();
    };
    window.addEventListener("eazycount:company-session-updated", onCompanySession);
    return () => window.removeEventListener("eazycount:company-session-updated", onCompanySession);
  }, [sessionReady]);

  useEffect(() => {
    if (loading || forbidden || !transactionScope) return;
    if (
      transactionScope.mode === "group" &&
      !canUseGroupOnlyMode(u, transactionScope.selectedGroup)
    ) {
      setAccountOptions([]);
      setCurrencyOptions([]);
      setCurrencyScopeBundle({ scopeKey: scopeCacheKey, rows: [] });
      return;
    }
    const fetchScopeKey = scopeCacheKey;
    let cancelled = false;
    const scopeApi = transactionScopeApiParams(transactionScope);
    const snapCompanies =
      filterSnapshotRef.current?.snapCompaniesAll ||
      filterSnapshotRef.current?.snapCompanies ||
      [];
    const orderCompanyId = resolveTransactionCurrencyOrderCompanyId(transactionScope, snapCompanies);
    (async () => {
      const fetchScopeAccountsAndCurrencies = async () => {
        let accData = [];
        let curRows = [];
        if (transactionScope.mode === "aggregate" && transactionScope.mergeCompanyIds?.length) {
          const ids = transactionScope.mergeCompanyIds;
          const [accResults, curResults] = await Promise.all([
            Promise.all(
              ids.map((cid) =>
                queryClient.fetchQuery({
                  queryKey: transactionQueryKeys.accounts(`${scopeCacheKey}:${cid}`),
                  queryFn: ({ signal }) => getAccounts({ companyId: cid, signal }),
                  staleTime: 60_000,
                }),
              ),
            ),
            Promise.all(
              ids.map((cid) =>
                queryClient.fetchQuery({
                  queryKey: transactionQueryKeys.companyCurrencies(`${scopeCacheKey}:${cid}`),
                  queryFn: ({ signal }) => getCompanyCurrencies({ companyId: cid, signal }),
                  staleTime: 60_000,
                }),
              ),
            ),
          ]);
          const accMap = new Map();
          for (const r of accResults) {
            for (const row of Array.isArray(r?.data) ? r.data : []) {
              const id = Number(row?.id);
              if (Number.isFinite(id) && id > 0) accMap.set(id, row);
            }
          }
          accData = [...accMap.values()];
          const curSet = new Map();
          for (const r of curResults) {
            for (const row of Array.isArray(r?.data) ? r.data : []) {
              const code = String(row?.code || row?.currency || "").toUpperCase().trim();
              if (code) curSet.set(code, row);
            }
          }
          curRows = [...curSet.values()];
        } else if (
          transactionScope.mode === "aggregate" &&
          transactionScope.aggregateGroupIds?.length
        ) {
          const gids = transactionScope.aggregateGroupIds;
          const snap = filterSnapshotRef.current?.snapCompaniesAll || filterSnapshotRef.current?.snapCompanies || [];
          const ids = filterCompaniesWithDisplayId(snap)
            .map((c) => Number(c.id))
            .filter((id) => Number.isFinite(id) && id > 0);
          const [accResults, curResults] = await Promise.all([
            Promise.all(
              gids.map((gid) =>
                queryClient.fetchQuery({
                  queryKey: transactionQueryKeys.accounts(`${scopeCacheKey}:group:${gid}`),
                  queryFn: ({ signal }) => getAccounts({ groupId: gid, signal }),
                  staleTime: 60_000,
                }),
              ),
            ),
            Promise.all(
              ids.map((cid) =>
                queryClient.fetchQuery({
                  queryKey: transactionQueryKeys.companyCurrencies(`${scopeCacheKey}:${cid}`),
                  queryFn: ({ signal }) => getCompanyCurrencies({ companyId: cid, signal }),
                  staleTime: 60_000,
                }),
              ),
            ),
          ]);
          const accMap = new Map();
          for (const r of accResults) {
            for (const row of Array.isArray(r?.data) ? r.data : []) {
              const id = Number(row?.id);
              if (Number.isFinite(id) && id > 0) accMap.set(id, row);
            }
          }
          accData = [...accMap.values()];
          const curSet = new Map();
          for (const r of curResults) {
            for (const row of Array.isArray(r?.data) ? r.data : []) {
              const code = String(row?.code || row?.currency || "").toUpperCase().trim();
              if (code) curSet.set(code, row);
            }
          }
          curRows = [...curSet.values()];
        } else {
          const [acc, cur] = await Promise.all([
            queryClient.fetchQuery({
              queryKey: transactionQueryKeys.accounts(scopeCacheKey),
              queryFn: ({ signal }) => getAccounts({ ...scopeApi, signal }),
              staleTime: 60_000,
              gcTime: 10 * 60_000,
            }),
            queryClient.fetchQuery({
              queryKey: transactionQueryKeys.companyCurrencies(scopeCacheKey),
              queryFn: ({ signal }) => getCompanyCurrencies({ ...scopeApi, signal }),
              staleTime: 60_000,
              gcTime: 10 * 60_000,
            }),
          ]);
          accData = Array.isArray(acc?.data) ? acc.data : [];
          curRows = Array.isArray(cur?.data) ? cur.data : [];
        }
        return { accData, curRows };
      };

      try {
        const categoriesPromise = queryClient.fetchQuery({
          queryKey: transactionQueryKeys.categories(),
          queryFn: () => getCategories(),
          staleTime: 5 * 60_000,
          gcTime: 30 * 60_000,
        });
        const orderPromise = orderCompanyId
          ? queryClient.fetchQuery({
              queryKey: [...transactionQueryKeys.userCurrencyOrder(), orderCompanyId],
              queryFn: ({ signal }) => getUserCurrencyOrder({ companyId: orderCompanyId, signal }),
              staleTime: 60_000,
              gcTime: 10 * 60_000,
            })
          : Promise.resolve({ success: true, data: { order: null, company_id: null } });
        const scopePromise = fetchScopeAccountsAndCurrencies();

        const [c, ord, scope] = await Promise.all([categoriesPromise, orderPromise, scopePromise]);
        if (cancelled || fetchScopeKey !== scopeCacheKeyRef.current) return;

        const roles = Array.isArray(c?.data) ? c.data : Array.isArray(c) ? c : [];
        setCategories(roles.map((r) => String(r).toUpperCase()));

        const { accData, curRows } = scope;
        const ordered = orderCurrencyRows(curRows, ord, orderCompanyId);
        const codes = ordered.map((x) => String(x.code || x.currency || "").toUpperCase().trim()).filter(Boolean);
        if (orderCompanyId && codes.length) {
          persistCurrencyDisplayOrder(orderCompanyId, codes);
        }
        setAccountOptions(accData);
        setCurrencyScopeBundle({ scopeKey: fetchScopeKey, rows: ordered });
        setCurrencyOptions([...new Set(codes)]);
      } catch {
        if (!cancelled && fetchScopeKey === scopeCacheKeyRef.current) {
          setCategories([]);
          setAccountOptions([]);
          setCurrencyOptions([]);
          setCurrencyScopeBundle({ scopeKey: null, rows: [] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, forbidden, scopeCacheKey, todayDmy, queryClient, transactionScope, authScopeKey]);

  useEffect(() => {
    if (!filterSnapshot) return;
    notifyDashboardGroupFilterChanged(filterSnapshot.selectedGroup, filterSnapshot.companyId);
  }, [filterSnapshot?.selectedGroup, filterSnapshot?.companyId]);

  useGroupAnchorSessionSync({
    companies: filterSnapshot?.snapCompanies ?? [],
    selectedGroup: filterSnapshot?.selectedGroup,
    companyId: filterSnapshot?.companyId,
    enabled: Boolean(filterSnapshot),
  });

  useEffect(() => {
    if (loading || forbidden || !filterSnapshot?.companyStripRows?.length) return;
    const strip = filterSnapshot.companyStripRows;
    const activeId = Number(filterSnapshot.companyId);
    const schedule =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback
        : (cb) => window.setTimeout(cb, 500);
    const cancel =
      typeof window.cancelIdleCallback === "function"
        ? window.cancelIdleCallback
        : window.clearTimeout;

    const idleId = schedule(() => {
      for (const row of strip) {
        if (!row?.id || Number(row.id) === activeId) continue;
        warmTransactionCompanyHover(queryClient, {
          filterSnapshot: filterSnapshotRef.current,
          company: row,
          todayDmy,
        });
      }
    });

    return () => cancel(idleId);
  }, [
    loading,
    forbidden,
    filterSnapshot?.companyId,
    filterSnapshot?.companyStripRows,
    queryClient,
    todayDmy,
  ]);

  const applyGroupOnlySelection = useCallback(async (snap, groupId) => {
    const g = String(groupId || "").trim().toUpperCase();
    if (!g || !snap) return;

    const seq = ++scopeSwitchSeqRef.current;
    const url = new URL(window.location.href);
    url.searchParams.delete("company_id");
    window.history.replaceState(null, "", url.toString());

    persistDashboardGroupFilter(g);
    const nextSnap = {
      ...snap,
      selectedGroup: g,
      companyId: null,
      groupOnlyLedger: true,
      groupFilterOptOut: false,
      displayCompanyRow: null,
      groupsAllMode: false,
      groupAllMode: false,
    };
    nextSnap.companyStripRows = buildTransactionCompanyStripRows(nextSnap, {
      selectedGroup: g,
      companyId: null,
      groupsAllMode: false,
    });
    const scope = resolveTransactionScope(nextSnap);

    persistDashboardGroupOnlyMode(true);
    persistDashboardFilterState(g, null);
    commitFilterSnapshot(nextSnap);

    if (scope?.scopeCompanyId > 0) {
      void syncPickerCompanySession(scope.scopeCompanyId, seq);
    }
  }, [commitFilterSnapshot, syncPickerCompanySession]);

  const applyCompanyGroupSelection = useCallback(
    async (snap, groupId) => {
      const g = String(groupId || "").trim().toUpperCase();
      if (!g || !snap) return;

      const seq = ++scopeSwitchSeqRef.current;
      const companies = snap.snapCompaniesAll || snap.snapCompanies || [];
      const pick =
        resolveCompanyPickWhenSwitchingGroup(companies, g, snap.companyId) ??
        pickDefaultSubsidiaryForGroup(companies, g, {
          me: u,
          preferredCompanyId: u?.company_id ?? snap.companyId,
        });
      if (!pick?.id) {
        await applyGroupOnlySelection(snap, g);
        return;
      }

      const numericCid = Number(pick.id);
      persistDashboardGroupFilter(g);
      const nextSnap = {
        ...snap,
        companyId: numericCid,
        groupOnlyLedger: false,
        selectedGroup: g,
        groupFilterOptOut: false,
        displayCompanyRow: pick,
        groupsAllMode: false,
        groupAllMode: false,
      };
      nextSnap.companyStripRows = buildTransactionCompanyStripRows(nextSnap, {
        selectedGroup: g,
        companyId: numericCid,
        groupsAllMode: false,
      });

      const url = new URL(window.location.href);
      url.searchParams.set("company_id", String(numericCid));
      window.history.replaceState(null, "", url.toString());
      persistDashboardGroupOnlyMode(false);
      persistDashboardFilterState(g, numericCid, { allowGroupOnly: false });

      void prefetchTransactionScopeBundle(queryClient, { nextSnap, todayDmy });
      commitFilterSnapshot(nextSnap);
      void syncPickerCompanySession(numericCid, seq);
    },
    [applyGroupOnlySelection, commitFilterSnapshot, queryClient, syncPickerCompanySession, todayDmy, u],
  );

  const onCompanyButtonClick = useCallback(
    (comp) => {
      const cid = comp.id;
      if (!cid) return;
      const snap = filterSnapshotRef.current;
      if (!snap) return;
      if (Number(cid) === Number(snap.companyId)) {
        const gid = comp.group_id ? String(comp.group_id).toUpperCase().trim() : snap.selectedGroup;
        if (!canUseGroupOnlyMode(u, gid || snap.selectedGroup)) return;
        void applyGroupOnlySelection(snap, gid || snap.selectedGroup);
        return;
      }

      const seq = ++scopeSwitchSeqRef.current;
      const numericCid = Number(cid);
      const gid = comp.group_id ? String(comp.group_id).toUpperCase().trim() : null;
      const nextGroup = gid || snap.selectedGroup;
      const nextGroupNorm = String(nextGroup || "").trim().toUpperCase();
      const currGroupNorm = String(snap.selectedGroup || "").trim().toUpperCase();
      const stripUnchanged =
        nextGroupNorm === currGroupNorm &&
        !snap.groupFilterOptOut &&
        Array.isArray(snap.companyStripRows) &&
        snap.companyStripRows.length > 0;
      const nextSnap = {
        ...snap,
        companyId: numericCid,
        groupOnlyLedger: false,
        selectedGroup: nextGroup || snap.selectedGroup,
        displayCompanyRow: comp,
        groupsAllMode: false,
        groupAllMode: false,
        companyStripRows: stripUnchanged
          ? snap.companyStripRows
          : buildTransactionCompanyStripRows(
              { ...snap, selectedGroup: nextGroup || snap.selectedGroup },
              {
                selectedGroup: nextGroup || snap.selectedGroup,
                companyId: numericCid,
                groupsAllMode: false,
              },
            ),
      };

      const url = new URL(window.location.href);
      url.searchParams.set("company_id", String(cid));
      window.history.replaceState(null, "", url.toString());
      if (gid) persistDashboardGroupFilter(gid);
      persistDashboardGroupOnlyMode(false);
      persistDashboardFilterState(nextGroup, numericCid);

      void prefetchTransactionScopeBundle(queryClient, { nextSnap, todayDmy });
      commitFilterSnapshot(nextSnap);
      void syncPickerCompanySession(cid, seq);
    },
    [applyGroupOnlySelection, commitFilterSnapshot, queryClient, syncPickerCompanySession, todayDmy, u],
  );

  const prefetchScopeData = useCallback(
    (nextSnap) => {
      void prefetchTransactionScopeBundle(queryClient, { nextSnap, todayDmy });
    },
    [queryClient, todayDmy],
  );

  const onWarmCompany = useCallback(
    (company) => {
      warmTransactionCompanyHover(queryClient, {
        filterSnapshot: filterSnapshotRef.current,
        company,
        todayDmy,
      });
    },
    [queryClient, todayDmy],
  );

  const deselectGroupKeepCompany = useCallback(
    async (snap) => {
      if (!snap) return;

      const seq = ++scopeSwitchSeqRef.current;
      const companies = snap.snapCompaniesAll || snap.snapCompanies || [];
      const groupIds = snap.snapGroupIds || sortedUniqueGroupIds(companies);

      persistDashboardGroupOnlyMode(false);

      const pickIndependent = resolveCompanyWhenClosingGroup(
        companies,
        snap.companyId,
        groupIds,
      );
      const nextCompanyId =
        pickIndependent?.id != null ? Number(pickIndependent.id) : null;

      const url = new URL(window.location.href);
      if (nextCompanyId != null && Number.isFinite(nextCompanyId) && nextCompanyId > 0) {
        clearDashboardGroupFilterKeepCompany(nextCompanyId);
        url.searchParams.set("company_id", String(nextCompanyId));
      } else {
        sessionStorage.setItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY, "1");
        persistDashboardGroupFilter(null);
        persistDashboardFilterState(null, null, { allowGroupOnly: false });
        notifyDashboardGroupFilterChanged(null, null);
        url.searchParams.delete("company_id");
      }
      window.history.replaceState(null, "", url.toString());

      const nextSnap = {
        ...snap,
        selectedGroup: null,
        companyId: nextCompanyId,
        groupOnlyLedger: false,
        groupFilterOptOut: true,
        displayCompanyRow: pickIndependent,
        groupsAllMode: false,
        groupAllMode: false,
      };
      nextSnap.companyStripRows = buildTransactionCompanyStripRows(nextSnap, {
        selectedGroup: null,
        companyId: nextCompanyId,
        groupsAllMode: false,
      });
      commitFilterSnapshot(nextSnap);

      if (nextCompanyId != null && Number.isFinite(nextCompanyId) && nextCompanyId > 0) {
        prefetchScopeData(nextSnap);
        void syncPickerCompanySession(nextCompanyId, seq);
      }
    },
    [commitFilterSnapshot, prefetchScopeData, syncPickerCompanySession],
  );

  const onGroupButtonClick = useCallback(
    async (gid) => {
      const snap = filterSnapshotRef.current;
      if (!snap) return;
      const g = String(gid || "").trim().toUpperCase();
      if (!g) return;

      // Re-click active group: close group and show independent companies.
      if (g === snap.selectedGroup && !snap.groupsAllMode) {
        await deselectGroupKeepCompany(snap);
        return;
      }

      const allowGroupOnly = canUseGroupOnlyMode(u, g);
      const groupOnlyActive =
        snap.companyId == null && !snap.groupsAllMode && !snap.groupAllMode;

      if (allowGroupOnly && groupOnlyActive) {
        await applyGroupOnlySelection(snap, g);
      } else {
        await applyCompanyGroupSelection(snap, g);
      }
    },
    [applyGroupOnlySelection, applyCompanyGroupSelection, deselectGroupKeepCompany, u],
  );

  const onPickAllGroups = useCallback(() => {
    const snap = filterSnapshotRef.current;
    if (!snap || snap.groupsAllMode) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("company_id");
    window.history.replaceState(null, "", url.toString());
    persistDashboardGroupFilter(null);
    persistDashboardFilterState(null, null);
    persistDashboardGroupOnlyMode(false);
    notifyDashboardGroupFilterChanged(null, null);
    setFilterSnapshot({
      ...snap,
      groupsAllMode: true,
      groupAllMode: false,
      groupOnlyLedger: false,
      selectedGroup: null,
      companyId: null,
      displayCompanyRow: null,
      companyStripRows: buildTransactionCompanyStripRows(
        { ...snap, groupsAllMode: true },
        { selectedGroup: null, companyId: null, groupsAllMode: true },
      ),
    });
  }, []);

  const onPickAllInGroup = useCallback(() => {
    const snap = filterSnapshotRef.current;
    if (!snap || (snap.groupAllMode && !snap.companyId)) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("company_id");
    window.history.replaceState(null, "", url.toString());
    persistDashboardGroupOnlyMode(false);
    persistDashboardFilterState(snap.groupsAllMode ? null : snap.selectedGroup, null);
    notifyDashboardGroupFilterChanged(snap.groupsAllMode ? null : snap.selectedGroup, null);
    setFilterSnapshot({
      ...snap,
      groupAllMode: true,
      groupOnlyLedger: false,
      companyId: null,
      displayCompanyRow: null,
      companyStripRows: buildTransactionCompanyStripRows(snap, {
        selectedGroup: snap.selectedGroup,
        companyId: null,
        groupsAllMode: snap.groupsAllMode,
      }),
    });
  }, []);

  return {
    loading,
    setLoading,
    forbidden,
    setForbidden,
    filterSnapshot,
    setFilterSnapshot,
    transactionScope,
    categories,
    setCategories,
    accountOptions,
    setAccountOptions,
    currencyOptions,
    setCurrencyOptions,
    currencyRowsOrdered,
    currencyScopeBundle,
    setCurrencyRowsOrdered,
    onGroupButtonClick,
    onCompanyButtonClick,
    onWarmCompany,
    onPickAllGroups,
    onPickAllInGroup,
    allowCompanyDeselect: canClearCompanySelection(u, filterSnapshot?.selectedGroup),
  };
}
