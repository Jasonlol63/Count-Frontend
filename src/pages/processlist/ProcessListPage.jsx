import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../../utils/company/companySessionEvents.js";
import { ensureCrossPageCompanySelection, syncCompanySessionApi } from "../../utils/company/companySessionSync.js";
import { spaPath } from "../../utils/routing/pageRoutes.js";
import {
  clearDashboardGroupFilterKeepCompany,
  notifyDashboardGroupFilterChanged,
  persistDashboardFilterState,
  persistDashboardGroupFilter,
  pickDefaultSubsidiaryForGroup,
  resolveCompanyPickWhenSwitchingGroup,
  resolveInitialSelectedGroupFromSession,
  resolveSubsidiaryBootCompanyId,
  fetchOwnerCompaniesAll,
  DASHBOARD_GROUP_FILTER_OPT_OUT_KEY,
} from "../../utils/company/sharedCompanyFilter.js";
import { findOwnerCompanyById } from "../../utils/company/sharedCompanyFilter.js";
import { useGroupAnchorSessionSync } from "../../utils/company/useGroupAnchorSessionSync.js";
import { isPartnershipAuditReadOnlyLocked } from "../../utils/audit/partnershipAuditReadOnly.js";
import { buildApiUrl } from "../../utils/core/apiUrl.js";
import { resolveTenantIsBankOnly } from "../bankprocesslist/lib/bankProcessHelpers.js";
import "../../../public/css/processCSS.css";
import "../../../public/css/processlist.css";
import "../../../public/css/accountCSS.css";
import "../../../public/css/userlist.css";
import {
  PAGE_SIZE,
  EMPTY_FORM,
  normalizeRows,
  applyProcessFilters,
  dedupeCompanyRowsForSwitcher,
  filterProcessPageCompanyButtons,
  resolveProcessListActiveCompanyId,
  sortProcessTableRows,
  notifyTransactionDataChanged,
  parseRemarkForForm,
  buildEditDescriptionSelection,
  dayUseIdsFromListRow,
  formatProcessDtsDisplay,
  processListCacheHasEntry,
  processListCacheHasRows,
} from "./processListHelpers.js";
import {
  fetchProcessDescriptionsByTenantId,
  addProcessDescription,
  deleteProcessDescription,
  addProcess,
  updateProcess,
  updateProcessStatus,
  deleteProcess,
} from "./processListApi.js";
import {
  fetchGamesProcessListSlice,
  prefetchBankProcessListPayload,
  resolveProcessListRouteCache,
  warmProcessListRouteCache,
} from "./processRoutePrefetch.js";
import ProcessTable from "./components/ProcessTable.jsx";
import ProcessFormModal from "./components/ProcessFormModal.jsx";
import DescriptionPickerModal from "./components/DescriptionPickerModal.jsx";
import ProcessDeleteConfirmModal from "./components/ProcessDeleteConfirmModal.jsx";
import AddProcessIcon from "./components/AddProcessIcon.jsx";
import { getProcessListText } from "../../translateFile/pages/processListTranslate.js";
import { useAuthSession } from "../../context/AuthSessionContext.jsx";
import { useC168ProcessRouteGuard } from "./useC168ProcessRouteGuard.js";

function filterSearchInput(raw) {
  return String(raw || "")
    .replace(/[^A-Z0-9 ]/gi, "")
    .toUpperCase();
}

function resolveProcessListCacheKey(companyId, debouncedSearch, showInactive, showAll) {
  return `company:${Number(companyId)}|${String(debouncedSearch || "").trim()}|${showInactive ? "1" : "0"}|${showAll ? "1" : "0"}`;
}

function processRowVisibleAfterStatusChange(newStatus, { showInactive, showAll }) {
  const status = String(newStatus || "").toLowerCase();
  if (showAll && showInactive) return status === "inactive";
  if (showAll) return status === "active";
  if (showInactive) return status === "inactive";
  return status === "active";
}

function processRowsFingerprint(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "0";
  return rows.map((r) => Number(r.id)).join(",");
}

function ProcessToastStack({ items }) {
  return (
    <div id="processNotificationContainer" className="process-notification-container">
      {items.map((t) => (
        <div
          key={t.id}
          className={`process-notification process-notification-${t.type} ${t.visible ? "show" : ""}`.trim()}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

const DEFAULT_DAYS = [
  { id: 1, day_name: "Mon" },
  { id: 2, day_name: "Tue" },
  { id: 3, day_name: "Wed" },
  { id: 4, day_name: "Thu" },
  { id: 5, day_name: "Fri" },
  { id: 6, day_name: "Sat" },
  { id: 7, day_name: "Sun" }
];

export default function ProcessListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { me: sessionMeFromLayout, sessionReady } = useAuthSession();
  useC168ProcessRouteGuard();
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const t = useCallback((key, params) => getProcessListText(lang, key, params), [lang]);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupFilterKind, setGroupFilterKind] = useState("follow");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [rows, setRows] = useState([]);
  const [awaitingRows, setAwaitingRows] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState("processId");
  const [sortDirection, setSortDirection] = useState("asc");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [currencies, setCurrencies] = useState([]);
  const [descriptions, setDescriptions] = useState([]);
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [modalOpen, setModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [toasts, setToasts] = useState([]);
  const [descriptionPickerOpen, setDescriptionPickerOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  /** Partnership/Audit read_only 时禁用流程写操作 — synced from layout session */
  const sessionMe = sessionMeFromLayout;
  const fetchAbortRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const skipNextFetchRef = useRef(false);
  const skipCompanyFetchEffectRef = useRef(false);
  const processListCacheRef = useRef(new Map());
  const processListWarmInflightRef = useRef(new Map());
  const suppressCrossPageSyncRef = useRef(false);
  const onSwitchCompanyRef = useRef(null);
  /** Prevent session refresh from re-running boot and resetting GroupID ALL / follow UI. */
  const processListInitDoneRef = useRef(false);
  const rowsRef = useRef([]);
  const fetchGenRef = useRef(0);
  const activeCompanyIdRef = useRef(null);
  const companySessionAbortRef = useRef(null);

  const [existingProcesses, setExistingProcesses] = useState([]);

  const notify = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type, visible: false }].slice(-2));
    requestAnimationFrame(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, visible: true } : t)));
    });
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 1500);
  }, []);

  // Layout phase (with BankProcessListPage): avoid deferred useEffect cleanup stripping body.process-page after route swap.
  useLayoutEffect(() => {
    document.body.classList.remove("bg", "dashboard-page", "account-page", "announcement-page");
    document.body.classList.add("process-page");
    return () => {
      document.body.classList.remove("process-page", "process-page--show-all");
      document.body.classList.add("dashboard-page");
    };
  }, []);

  useLayoutEffect(() => {
    if (showAll) document.body.classList.add("process-page--show-all");
    else document.body.classList.remove("process-page--show-all");
  }, [showAll]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "login_lang") setLang(e.newValue === "zh" ? "zh" : "en");
    };
    const onLangUpdated = (e) => {
      const nextLang = e?.detail?.lang;
      setLang(nextLang === "zh" ? "zh" : "en");
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("eazycount:language-updated", onLangUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("eazycount:language-updated", onLangUpdated);
    };
  }, []);

  useEffect(() => {
    window.clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setCurrentPage(1);
    }, 300);
    return () => window.clearTimeout(searchDebounceRef.current);
  }, [search]);

  const processMutationsBlocked = useMemo(
    () => isPartnershipAuditReadOnlyLocked(sessionMe),
    [sessionMe]
  );

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const loadFormMeta = useCallback(async (cid) => {
    if (!cid) return;
    try {
      const u = new URL(buildApiUrl("api/processes/addprocess_api.php"));
      u.searchParams.set("company_id", String(cid));
      const formRes = await fetch(u.toString(), { credentials: "include" });
      const formJson = await formRes.json();
      setExistingProcesses(
        Array.isArray(formJson?.data?.existingProcesses) ? formJson.data.existingProcesses : formJson?.existingProcesses || []
      );
      const apiDays = Array.isArray(formJson?.data?.days) ? formJson.data.days : formJson?.days;
      if (apiDays && apiDays.length > 0) {
        setDays(apiDays);
      }

      // Fetch currencies from Spring Boot
      const curUrl = new URL(buildApiUrl("api/currency/list"));
      curUrl.searchParams.set("tenant_id", String(cid));
      const curRes = await fetch(curUrl.toString(), { method: "POST", credentials: "include" });
      const curJson = await curRes.json();
      if (curRes.ok && curJson?.success) {
        setCurrencies(Array.isArray(curJson.data) ? curJson.data : []);
      }

      // Fetch descriptions from Spring Boot (POST body = tenantId)
      try {
        const descRows = await fetchProcessDescriptionsByTenantId(cid);
        setDescriptions(descRows);
      } catch {
        setDescriptions([]);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (loading || !companyId || groupFilterKind !== "follow") return;
    if (suppressCrossPageSyncRef.current) return;
    const row = companies.find((c) => Number(c.id) === Number(companyId));
    void ensureCrossPageCompanySelection(companyId, {
      companies,
      selectedGroup,
      companyRow: row,
      sessionCompanyId: sessionMeFromLayout?.company_id,
    });
  }, [loading, companyId, companies, selectedGroup, groupFilterKind, sessionMeFromLayout?.company_id]);

  useEffect(() => {
    if (!sessionReady || !sessionMeFromLayout) return;
    const routePrefetch = location.state?.processListPrefetch;
    if (processListInitDoneRef.current && !routePrefetch) return;
    (async () => {
      let skipLoadingDone = false;
      try {
        const layoutMe = sessionMeFromLayout;
        const currentUrl = new URL(window.location.href);
        const bootSearch = filterSearchInput(currentUrl.searchParams.get("search") || "");
        const bootShowInactive = currentUrl.searchParams.has("showInactive");
        const bootShowAll = currentUrl.searchParams.has("showAll");
        if (layoutMe?.company_id) {
          warmProcessListRouteCache(layoutMe.company_id, {
            search: bootSearch,
            showInactive: bootShowInactive,
            showAll: bootShowAll,
          });
        }
        const prefetchCompanyId = routePrefetch?.companyId ? Number(routePrefetch.companyId) : null;
        const prefetchQueryCompany = currentUrl.searchParams.get("company_id");

        if (routePrefetch && prefetchCompanyId && (!prefetchQueryCompany || Number(prefetchQueryCompany) === prefetchCompanyId)) {
          const prefetchedCompanies = Array.isArray(routePrefetch.companies) ? routePrefetch.companies : [];
          const prefetchedMeta = routePrefetch.meta || {};
          setCompanies(prefetchedCompanies);
          const prefetchedRow = prefetchedCompanies.find((c) => Number(c.id) === prefetchCompanyId);
          const prefBootGroup = resolveInitialSelectedGroupFromSession(
            prefetchedCompanies,
            prefetchedRow,
            layoutMe,
          );
          const resolvedPrefetchId = resolveSubsidiaryBootCompanyId(prefetchedCompanies, {
            urlCompanyId: prefetchQueryCompany ?? String(prefetchCompanyId),
            sessionCompanyId: layoutMe.company_id,
            selectedGroup: prefBootGroup,
            loginMe: layoutMe,
          });
          const pfGfk = routePrefetch.groupFilterKind;
          const ungroupedBoot =
            pfGfk === "ungrouped" || sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1";
          const prefetchGroupIds = [
            ...new Set(
              prefetchedCompanies
                .map((c) => String(c.group_id || "").trim().toUpperCase())
                .filter(Boolean),
            ),
          ].sort();
          const resolvedCompanyId = ungroupedBoot
            ? resolveProcessListActiveCompanyId(resolvedPrefetchId, prefetchedCompanies, {
              groupFilterKind: "ungrouped",
              groupIds: prefetchGroupIds,
            })
            : resolvedPrefetchId;
          setCompanyId(resolvedCompanyId);
          setGroupFilterKind(ungroupedBoot ? "ungrouped" : "follow");
          if (ungroupedBoot) setSelectedGroup(null);

          const normalizedSearch = filterSearchInput(currentUrl.searchParams.get("search") || "");
          setSearch(normalizedSearch);
          setDebouncedSearch(normalizedSearch);

          const showAllChecked = currentUrl.searchParams.has("showAll");
          const showInactiveChecked = currentUrl.searchParams.has("showInactive");
          setShowAll(showAllChecked);
          setShowInactive(showInactiveChecked);

          setCurrencies(Array.isArray(prefetchedMeta.currencies) ? prefetchedMeta.currencies : []);
          setDescriptions(Array.isArray(prefetchedMeta.descriptions) ? prefetchedMeta.descriptions : []);
          setDays(Array.isArray(prefetchedMeta.days) ? prefetchedMeta.days : []);
          setExistingProcesses(Array.isArray(prefetchedMeta.existingProcesses) ? prefetchedMeta.existingProcesses : []);

          if (processListCacheHasEntry(routePrefetch) && resolvedCompanyId != null) {
            const prefRows = applyProcessFilters(normalizeRows(routePrefetch.rows), {
              search: normalizedSearch,
              showInactive: showInactiveChecked,
              showAll: showAllChecked,
            });
            setRows(prefRows);
            skipNextFetchRef.current = true;
            const cacheKey = resolveProcessListCacheKey(
              resolvedCompanyId,
              normalizedSearch,
              showInactiveChecked,
              showAllChecked,
            );
            processListCacheRef.current.set(cacheKey, {
              rows: prefRows,
              currencyCodes: Array.isArray(routePrefetch.currencyCodes)
                ? routePrefetch.currencyCodes
                : null,
            });
          } else if (ungroupedBoot && resolvedCompanyId == null) {
            setRows([]);
            skipNextFetchRef.current = true;
          }
          if (!ungroupedBoot) setSelectedGroup(prefBootGroup);
          const resolvedRow = prefetchedCompanies.find((c) => Number(c.id) === Number(resolvedCompanyId));
          if (resolvedCompanyId != null) {
            persistDashboardFilterState(prefBootGroup, resolvedCompanyId, { allowGroupOnly: false });
          }
          await ensureCrossPageCompanySelection(resolvedCompanyId, {
            companies: prefetchedCompanies,
            selectedGroup: prefBootGroup,
            companyRow: resolvedRow,
            sessionCompanyId: layoutMe.company_id,
          });
          setLoading(false);
          processListInitDoneRef.current = true;
          return;
        }

        const cs = await fetchOwnerCompaniesAll();
        setCompanies(cs);

        const url = new URL(window.location.href);
        const queryCompany = url.searchParams.get("company_id");
        const rowForBoot =
          queryCompany != null && queryCompany !== ""
            ? cs.find((c) => Number(c.id) === Number(queryCompany))
            : cs.find((c) => Number(c.id) === Number(layoutMe.company_id)) || null;
        const bootGroup = resolveInitialSelectedGroupFromSession(cs, rowForBoot, layoutMe);
        let effectiveCompany = resolveSubsidiaryBootCompanyId(cs, {
          urlCompanyId: queryCompany,
          sessionCompanyId: layoutMe.company_id,
          selectedGroup: bootGroup,
          loginMe: layoutMe,
        });

        if (effectiveCompany != null && Number(effectiveCompany) !== Number(layoutMe.company_id)) {
          try {
            const syncJson = await syncCompanySessionApi(effectiveCompany);
            if (!syncJson?.success) {
              effectiveCompany = layoutMe.company_id ? Number(layoutMe.company_id) : effectiveCompany;
            }
          } catch {
            effectiveCompany = layoutMe.company_id ? Number(layoutMe.company_id) : effectiveCompany;
          }
        }

        const currentCompanyRow = cs.find((c) => Number(c.id) === Number(effectiveCompany));
        if (currentCompanyRow?.company_id) {
          const { bankOnly: bankCategory, syncJson } = await resolveTenantIsBankOnly(
            effectiveCompany,
            layoutMe,
          );
          if (syncJson?.success) {
            notifyCompanySessionUpdated(syncJson.data ?? null);
          }
          if (bankCategory) {
            const warm = await prefetchBankProcessListPayload(effectiveCompany);
            navigate(`/bank-process-list?company_id=${effectiveCompany}`, {
              replace: true,
              state: {
                bankProcessListPrefetch: {
                  companyId: effectiveCompany,
                  companies: cs,
                  groupFilterKind: "follow",
                  rows: warm.rows,
                  currencyCodes: warm.currencyCodes,
                },
              },
            });
            skipLoadingDone = true;
            return;
          }
        }

        const bootGroupIds = [
          ...new Set(cs.map((c) => String(c.group_id || "").trim().toUpperCase()).filter(Boolean)),
        ].sort();
        const isUngroupedBoot = sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1";
        if (isUngroupedBoot) {
          setGroupFilterKind("ungrouped");
          setSelectedGroup(null);
          effectiveCompany = resolveProcessListActiveCompanyId(effectiveCompany, cs, {
            groupFilterKind: "ungrouped",
            groupIds: bootGroupIds,
          });
        } else {
          setSelectedGroup(bootGroup);
          setGroupFilterKind("follow");
        }

        setCompanyId(effectiveCompany);
        if (effectiveCompany != null) {
          persistDashboardFilterState(bootGroup, effectiveCompany, { allowGroupOnly: false });
        }

        const rawSearch = url.searchParams.get("search") || "";
        const normalizedSearch = filterSearchInput(rawSearch);
        setSearch(normalizedSearch);
        setDebouncedSearch(normalizedSearch);

        const showAllChecked = url.searchParams.has("showAll");
        const showInactiveChecked = url.searchParams.has("showInactive");
        setShowAll(showAllChecked);
        setShowInactive(showInactiveChecked);

        void loadFormMeta(effectiveCompany);

        if (effectiveCompany != null) {
          const slice = await resolveProcessListRouteCache(effectiveCompany, {
            search: normalizedSearch,
            showInactive: showInactiveChecked,
            showAll: showAllChecked,
          });
          if (processListCacheHasEntry(slice)) {
            const cacheKey = resolveProcessListCacheKey(
              effectiveCompany,
              normalizedSearch,
              showInactiveChecked,
              showAllChecked,
            );
            processListCacheRef.current.set(cacheKey, {
              rows: slice.rows,
              currencyCodes: slice.currencyCodes,
            });
            setRows(slice.rows);
            skipNextFetchRef.current = true;
          }
        } else if (isUngroupedBoot) {
          setRows([]);
          skipNextFetchRef.current = true;
        }

        processListInitDoneRef.current = true;
      } catch {
        window.location.assign(new URL(spaPath("login"), window.location.origin).toString());
      } finally {
        if (!skipLoadingDone) setLoading(false);
      }
    })();
  }, [loadFormMeta, location.state, navigate, sessionReady, sessionMeFromLayout?.user_id]);

  const syncUrl = useCallback(
    (overrides = {}) => {
      const url = new URL(window.location.href);
      const cid = overrides.companyId != null ? overrides.companyId : companyId;
      if (cid) url.searchParams.set("company_id", String(cid));
      else url.searchParams.delete("company_id");
      if (debouncedSearch.trim()) url.searchParams.set("search", debouncedSearch.trim());
      else url.searchParams.delete("search");
      if (showInactive) url.searchParams.set("showInactive", "1");
      else url.searchParams.delete("showInactive");
      if (showAll) url.searchParams.set("showAll", "1");
      else url.searchParams.delete("showAll");
      url.searchParams.delete("currency");
      window.history.replaceState({}, document.title, url.toString());
    },
    [companyId, debouncedSearch, showInactive, showAll],
  );

  const applyProcessListCache = useCallback(
    (cid) => {
      const id = Number(cid);
      if (!Number.isFinite(id) || id <= 0) return false;
      const cacheKey = resolveProcessListCacheKey(id, debouncedSearch, showInactive, showAll);
      const cached = processListCacheRef.current.get(cacheKey);
      if (!processListCacheHasEntry(cached)) return false;
      setRows((prev) =>
        processRowsFingerprint(prev) === processRowsFingerprint(cached.rows) ? prev : cached.rows,
      );
      setAwaitingRows(false);
      return true;
    },
    [debouncedSearch, showInactive, showAll],
  );

  const warmProcessListCompanyCache = useCallback(
    (cid) => {
      const id = Number(cid);
      if (!Number.isFinite(id) || id <= 0) return null;
      const cacheKey = resolveProcessListCacheKey(id, debouncedSearch, showInactive, showAll);
      if (processListCacheRef.current.has(cacheKey)) {
        return null;
      }
      const existing = processListWarmInflightRef.current.get(cacheKey);
      if (existing) return existing;

      const promise = (async () => {
        try {
          const slice = await fetchGamesProcessListSlice(id, {
            search: debouncedSearch,
            showInactive,
            showAll,
          });
          if (Array.isArray(slice.rows)) {
            processListCacheRef.current.set(cacheKey, {
              rows: slice.rows,
              currencyCodes: slice.currencyCodes,
            });
          }
          return slice;
        } catch {
          return null;
        } finally {
          if (processListWarmInflightRef.current.get(cacheKey) === promise) {
            processListWarmInflightRef.current.delete(cacheKey);
          }
        }
      })();
      processListWarmInflightRef.current.set(cacheKey, promise);
      return promise;
    },
    [debouncedSearch, showInactive, showAll],
  );

  const hydrateProcessListCompanyCache = useCallback(
    async (cid) => {
      if (applyProcessListCache(cid)) return true;
      const id = Number(cid);
      if (!Number.isFinite(id) || id <= 0) return false;
      const cacheKey = resolveProcessListCacheKey(id, debouncedSearch, showInactive, showAll);
      const inflight = processListWarmInflightRef.current.get(cacheKey);
      if (inflight) {
        try {
          await inflight;
        } catch {
          /* ignore warm failures */
        }
      }
      return applyProcessListCache(cid);
    },
    [applyProcessListCache, debouncedSearch, showInactive, showAll],
  );

  const fetchRows = useCallback(
    async (opts = {}) => {
      const silent = !!opts.silent;
      const cid = opts.companyId != null ? Number(opts.companyId) : Number(companyId);
      if (!Number.isFinite(cid) || cid <= 0) return;

      const fetchGen = ++fetchGenRef.current;
      const shouldAwaitEmpty = rowsRef.current.length === 0;
      if (shouldAwaitEmpty) setAwaitingRows(true);

      if (fetchAbortRef.current) fetchAbortRef.current.abort();
      const ac = new AbortController();
      fetchAbortRef.current = ac;
      try {
        const slice = await fetchGamesProcessListSlice(cid, {
          search: debouncedSearch,
          showInactive,
          showAll,
          signal: ac.signal,
        });
        if (ac.signal.aborted || fetchGen !== fetchGenRef.current) return;
        if (!Array.isArray(slice.rows)) {
          if (!silent) notify(t("failedLoadProcessList"), "danger");
          return;
        }
        if (Number(activeCompanyIdRef.current) !== cid) return;

        const nextRows = slice.rows;
        const cacheKey = resolveProcessListCacheKey(cid, debouncedSearch, showInactive, showAll);
        processListCacheRef.current.set(cacheKey, {
          rows: nextRows,
          currencyCodes: slice.currencyCodes,
        });
        setRows((prev) => {
          if (silent && processRowsFingerprint(prev) === processRowsFingerprint(nextRows)) {
            return prev;
          }
          return nextRows;
        });
        if (!silent) {
          setSelectedIds(new Set());
          setCurrentPage(1);
          syncUrl({ companyId: cid });
        }
      } catch (err) {
        if (ac.signal.aborted || err?.name === "AbortError" || fetchGen !== fetchGenRef.current) return;
        if (!silent) notify(t("failedLoadProcessList"), "danger");
      } finally {
        if (fetchGen === fetchGenRef.current) {
          setAwaitingRows(false);
        }
      }
    },
    [
      companyId,
      debouncedSearch,
      showInactive,
      showAll,
      notify,
      syncUrl,
      t,
    ],
  );
  const reloadDescriptions = async () => {
    if (!companyId) return;
    try {
      const descRows = await fetchProcessDescriptionsByTenantId(companyId);
      setDescriptions(descRows);
    } catch {
      /* ignore */
    }
  };

  /** @returns {Promise<{ id: number|string, name: string }|null>} */
  const handleAddDescription = async (descName) => {
    if (processMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return null;
    }
    const normalizedName = String(descName || "").trim().toUpperCase();
    if (!normalizedName) return null;
    try {
      const created = await addProcessDescription(companyId, normalizedName);
      notify(t("descAdded"), "success");
      await reloadDescriptions();
      return created?.id != null ? { id: created.id, name: created.name || normalizedName } : null;
    } catch (err) {
      if (err?.duplicate || String(err?.message || "").toLowerCase().includes("already exists")) {
        notify(t("descExists"), "danger");
      } else {
        notify(err?.message || t("failedAddDescription"), "danger");
      }
      return null;
    }
  };

  const handleDeleteDescription = async (descId) => {
    if (processMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    try {
      await deleteProcessDescription(companyId, descId);
      notify(t("descDeleted"), "success");
      await reloadDescriptions();
      setForm((prev) => ({
        ...prev,
        selected_descriptions: prev.selected_descriptions.filter((d) => String(d.id) !== String(descId)),
      }));
    } catch (err) {
      notify(err?.message || t("failedDeleteDescription"), "danger");
    }
  };

  useEffect(() => {
    return () => {
      fetchAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!modalOpen && !descriptionPickerOpen) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (descriptionPickerOpen) setDescriptionPickerOpen(false);
      else setModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, descriptionPickerOpen]);

  const pickerCompanyId = companyId;

  const allCompanyButtons = useMemo(
    () => dedupeCompanyRowsForSwitcher(companies, pickerCompanyId),
    [companies, pickerCompanyId]
  );
  const groupIds = useMemo(
    () =>
      [...new Set(allCompanyButtons.map((c) => String(c.group_id || "").trim().toUpperCase()).filter(Boolean))].sort(),
    [allCompanyButtons]
  );
  const activeCompanyId = useMemo(
    () =>
      resolveProcessListActiveCompanyId(companyId, companies, {
        groupFilterKind,
        groupIds,
      }),
    [companyId, companies, groupFilterKind, groupIds],
  );

  useEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
    if (!activeCompanyId) setAwaitingRows(false);
  }, [activeCompanyId]);

  useEffect(() => {
    if (loading || !activeCompanyId) return;
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }
    if (skipCompanyFetchEffectRef.current) {
      skipCompanyFetchEffectRef.current = false;
      return;
    }
    void (async () => {
      const hydrated = await hydrateProcessListCompanyCache(activeCompanyId);
      if (!hydrated) {
        await fetchRows({ companyId: activeCompanyId, silent: rowsRef.current.length > 0 });
      }
    })();
  }, [loading, activeCompanyId, debouncedSearch, showInactive, showAll, fetchRows, hydrateProcessListCompanyCache]);

  useEffect(() => {
    if (loading) return;
    syncUrl({ companyId: activeCompanyId });
  }, [loading, activeCompanyId, syncUrl]);

  const selectedCompany = useMemo(
    () => allCompanyButtons.find((c) => Number(c.id) === Number(pickerCompanyId)) || null,
    [allCompanyButtons, pickerCompanyId]
  );
  const selectedGroupKey = useMemo(() => {
    if (groupFilterKind !== "follow") return "";
    if (selectedGroup) return String(selectedGroup).trim().toUpperCase();
    return String(selectedCompany?.group_id || "").trim().toUpperCase();
  }, [groupFilterKind, selectedGroup, selectedCompany?.group_id]);

  useGroupAnchorSessionSync({
    companies,
    selectedGroup: groupFilterKind === "follow" ? selectedGroup : null,
    companyId: groupFilterKind === "follow" ? companyId : null,
    sessionCompanyId: sessionMeFromLayout?.company_id,
  });

  useLayoutEffect(() => {
    if (loading) return;
    notifyDashboardGroupFilterChanged(
      groupFilterKind === "follow" ? selectedGroup : null,
      groupFilterKind === "follow" ? companyId : null
    );
  }, [loading, groupFilterKind, selectedGroup, companyId]);

  // Process routes always require a company when a group pill is active.
  useLayoutEffect(() => {
    if (loading || groupFilterKind !== "follow" || !selectedGroup || companyId != null) return;
    const pick = pickDefaultSubsidiaryForGroup(companies, selectedGroup, {
      me: sessionMe,
      preferredCompanyId: sessionMeFromLayout?.company_id,
    });
    if (!pick?.id) return;
    const nextId = Number(pick.id);
    skipCompanyFetchEffectRef.current = applyProcessListCache(nextId);
    suppressCrossPageSyncRef.current = true;
    flushSync(() => setCompanyId(nextId));
    persistDashboardFilterState(selectedGroup, nextId, { allowGroupOnly: false });
    notifyDashboardGroupFilterChanged(selectedGroup, nextId, { companyCode: pick.company_id });
    void onSwitchCompanyRef.current?.(pick, { layoutSilent: true });
  }, [
    loading,
    groupFilterKind,
    selectedGroup,
    companyId,
    companies,
    sessionMe,
    sessionMeFromLayout?.company_id,
    applyProcessListCache,
  ]);
  const companyButtons = useMemo(
    () =>
      filterProcessPageCompanyButtons(allCompanyButtons, {
        groupFilterKind,
        groupIds,
        selectedGroupKey,
      }),
    [allCompanyButtons, groupIds, selectedGroupKey, groupFilterKind]
  );

  useEffect(() => {
    if (loading) return;
    for (const c of companyButtons) {
      warmProcessListCompanyCache(c.id);
    }
  }, [loading, companyButtons, warmProcessListCompanyCache, debouncedSearch, showInactive, showAll]);

  const sortedDisplayRows = useMemo(
    () => sortProcessTableRows(rows, sortColumn, sortDirection),
    [rows, sortColumn, sortDirection],
  );

  const totalPages = useMemo(() => Math.max(1, Math.ceil(sortedDisplayRows.length / PAGE_SIZE)), [sortedDisplayRows]);
  const pageRows = useMemo(() => {
    if (showAll) return sortedDisplayRows;
    const page = Math.min(currentPage, totalPages);
    const start = (page - 1) * PAGE_SIZE;
    return sortedDisplayRows.slice(start, start + PAGE_SIZE);
  }, [sortedDisplayRows, currentPage, totalPages, showAll]);

  const handleProcessTableSort = useCallback((column) => {
    setSortDirection((direction) => (sortColumn === column && direction === "asc" ? "desc" : "asc"));
    setSortColumn(column);
    setCurrentPage(1);
  }, [sortColumn]);

  const toggleSelectAll = useCallback(
    (checked) => {
      const deletable = pageRows.filter(
        (r) => String(r.status || "").toLowerCase() === "inactive" && !r.has_transactions
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (checked) deletable.forEach((r) => next.add(r.id));
        else deletable.forEach((r) => next.delete(r.id));
        return next;
      });
    },
    [pageRows]
  );

  const onSwitchCompany = useCallback(
    async (company, { layoutSilent = false } = {}) => {
      const nextId = Number(company?.id);
      if (!nextId) return;

      const sessionCompanyId =
        sessionMeFromLayout?.company_id != null
          ? Number(sessionMeFromLayout.company_id)
          : sessionMeFromLayout?.tenant_id != null
            ? Number(sessionMeFromLayout.tenant_id)
            : null;
      const previousCompanyId = Number(companyId) === nextId ? sessionCompanyId : companyId;

      suppressCrossPageSyncRef.current = true;
      try {
        const { bankOnly, syncJson, syncFailed } = await resolveTenantIsBankOnly(
          nextId,
          sessionMeFromLayout,
        );

        if (syncFailed) {
          notify(syncJson?.message || t("switchCompanyFailed"), "danger");
          return;
        }
        if (syncJson?.success) {
          notifyCompanySessionUpdated(syncJson.data ?? null);
        }

        if (bankOnly) {
          const warm = await prefetchBankProcessListPayload(nextId);
          navigate(`/bank-process-list?company_id=${nextId}`, {
            replace: true,
            state: {
              bankProcessListPrefetch: {
                companyId: nextId,
                companies,
                groupFilterKind: "follow",
                rows: warm.rows,
                currencyCodes: warm.currencyCodes,
              },
            },
          });
          return;
        }

        void loadFormMeta(nextId);

        const runFetch = async () => {
          await hydrateProcessListCompanyCache(nextId);
          await fetchRows({ companyId: nextId, silent: true });
        };

        void runFetch();
      } catch {
        notify(t("switchCompanyFailed"), "danger");
        if (previousCompanyId != null && Number(previousCompanyId) !== nextId) {
          skipCompanyFetchEffectRef.current = true;
          flushSync(() => {
            setCompanyId(previousCompanyId);
            applyProcessListCache(previousCompanyId);
          });
          void fetchRows({ companyId: previousCompanyId, silent: true });
        }
      } finally {
        suppressCrossPageSyncRef.current = false;
      }
    },
    [
      applyProcessListCache,
      companies,
      companyId,
      fetchRows,
      hydrateProcessListCompanyCache,
      loadFormMeta,
      navigate,
      notify,
      sessionMeFromLayout,
      t,
    ],
  );

  onSwitchCompanyRef.current = onSwitchCompany;

  const onPickCompanyPill = useCallback(
    (c) => {
      const nextId = Number(c?.id);
      if (!nextId || Number(companyId) === nextId) return;

      const gid = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
      const nextGroup = gid || null;

      skipCompanyFetchEffectRef.current = true;
      suppressCrossPageSyncRef.current = true;

      const hadCache = applyProcessListCache(nextId);
      flushSync(() => {
        setGroupFilterKind("follow");
        if (nextGroup) setSelectedGroup(nextGroup);
        setCompanyId(nextId);
        if (hadCache) setSelectedIds(new Set());
      });

      syncUrl({ companyId: nextId });

      if (nextGroup) persistDashboardGroupFilter(nextGroup);
      persistDashboardFilterState(nextGroup, nextId);
      notifyDashboardGroupFilterChanged(nextGroup, nextId, {
        companyCode: c.company_id,
      });

      void onSwitchCompanyRef.current?.(c, { layoutSilent: true });
    },
    [applyProcessListCache, companyId, syncUrl],
  );

  const handlePickGroup = useCallback(
    (gid) => {
      const g = String(gid || "").trim().toUpperCase();
      if (!g) return;

      // Process list is company-scoped: re-click active group hides the group row (ungrouped).
      if (groupFilterKind === "follow" && g === selectedGroupKey && companyId != null) {
        const nextCompanyId = resolveProcessListActiveCompanyId(companyId, companies, {
          groupFilterKind: "ungrouped",
          groupIds,
        });
        skipCompanyFetchEffectRef.current = true;
        if (fetchAbortRef.current) fetchAbortRef.current.abort();
        flushSync(() => {
          setGroupFilterKind("ungrouped");
          setSelectedGroup(null);
          setCompanyId(nextCompanyId);
          if (!nextCompanyId) {
            setRows([]);
            setSelectedIds(new Set());
          }
        });
        if (nextCompanyId != null) {
          clearDashboardGroupFilterKeepCompany(nextCompanyId);
          syncUrl({ companyId: nextCompanyId });
        } else {
          clearDashboardGroupFilterKeepCompany(null);
          syncUrl({ companyId: null });
        }
        return;
      }

      const pick =
        resolveCompanyPickWhenSwitchingGroup(companies, g, companyId) ??
        pickDefaultSubsidiaryForGroup(companies, g, { me: sessionMe, preferredCompanyId: companyId });
      const nextCompanyId = pick?.id != null ? Number(pick.id) : null;

      setGroupFilterKind("follow");
      setSelectedGroup(g);
      persistDashboardGroupFilter(g);

      if (nextCompanyId != null) {
        skipCompanyFetchEffectRef.current = true;
        suppressCrossPageSyncRef.current = true;
        const hadCache = applyProcessListCache(nextCompanyId);
        flushSync(() => {
          setCompanyId(nextCompanyId);
          if (hadCache) setSelectedIds(new Set());
        });
        persistDashboardFilterState(g, nextCompanyId, { allowGroupOnly: false });
        notifyDashboardGroupFilterChanged(g, nextCompanyId, {
          companyCode: pick.company_id,
        });
        void onSwitchCompanyRef.current?.(pick, { layoutSilent: true });
        return;
      }

      if (companyId != null) {
        persistDashboardFilterState(g, companyId, { allowGroupOnly: false });
        const row = findOwnerCompanyById(companyId);
        notifyDashboardGroupFilterChanged(g, companyId, {
          companyCode: row?.company_id,
        });
      }
    },
    [
      applyProcessListCache,
      companies,
      companyId,
      groupFilterKind,
      groupIds,
      selectedGroupKey,
      sessionMe,
      syncUrl,
    ],
  );

  const openAdd = () => {
    if (processMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    if (!activeCompanyId) return;
    setEditMode(false);
    setForm({ ...EMPTY_FORM, existingProcesses });
    setDescriptionPickerOpen(false);
    setModalOpen(true);
  };

  const confirmDescriptionSelection = (selectedDescriptions) => {
    setForm((prev) => ({ ...prev, selected_descriptions: selectedDescriptions }));
    setDescriptionPickerOpen(false);
  };

  const openEdit = (id) => {
    if (processMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    const row = rows.find((r) => Number(r.id) === Number(id));
    if (!row) {
      notify(t("failedLoadProcess"), "danger");
      return;
    }

    let currencyId = row.currency_id != null ? String(row.currency_id) : "";
    if (currencyId) {
      const exists = currencies.some((c) => String(c.id) === currencyId);
      if (!exists) {
        notify(t("currencyWarningNoCompany"), "danger");
        currencyId = "";
      }
    }
    if (!currencyId && row.currency) {
      const code = String(row.currency).toUpperCase();
      const matchingOption = currencies.find((opt) => String(opt.code || "").toUpperCase() === code);
      if (matchingOption) {
        currencyId = String(matchingOption.id);
      } else {
        notify(t("currencyWarningWithCode", { code }), "danger");
      }
    }

    const dtsCreated = formatProcessDtsDisplay(row.created_at);
    const dtsModified = formatProcessDtsDisplay(row.updated_at);
    let displayModifiedDate = "";
    let displayModifiedBy = "";
    if (dtsModified && dtsModified !== dtsCreated) {
      displayModifiedDate = dtsModified;
      displayModifiedBy = row.updated_by != null ? String(row.updated_by) : "";
    }

    setEditMode(true);
    setForm({
      id: String(row.id || ""),
      process_name: row.process_name || "",
      selected_descriptions: buildEditDescriptionSelection(row, descriptions),
      currency_id: currencyId,
      day_use: dayUseIdsFromListRow(row),
      remove_word: row.remove_word || "",
      replace_word_from: row.replace_word_from || "",
      replace_word_to: row.replace_word_to || "",
      remark: parseRemarkForForm(row.remark),
      status: row.status || "active",
      dts_modified: dtsModified,
      modified_by: row.updated_by != null ? String(row.updated_by) : "",
      dts_created: dtsCreated,
      created_by: row.created_by != null ? String(row.created_by) : "",
      dts_modified_display: displayModifiedDate,
      dts_modified_user_display: displayModifiedBy,
      currency_warning: null,
      existingProcesses,
    });
    setDescriptionPickerOpen(false);
    setModalOpen(true);
  };

  const submitForm = async (event) => {
    event.preventDefault();
    if (processMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    if (!form.selected_descriptions || form.selected_descriptions.length === 0) {
      notify(t("needAtLeastOneDescription"), "danger");
      return;
    }
    if (!form.currency_id) {
      notify(t("selectCurrency"), "danger");
      return;
    }

    if (!editMode) {
      if (!form.is_multi_process && (!form.process_name || !String(form.process_name).trim())) {
        notify(t("needProcessIdOrMulti"), "danger");
        return;
      }
      if (form.is_multi_process && (!form.selected_processes || form.selected_processes.length === 0)) {
        notify(t("needOneMultiProcess"), "danger");
        return;
      }
    }

    try {
      if (editMode) {
        await updateProcess(companyId, {
          id: form.id,
          currencyId: form.currency_id,
          descriptionIds: form.selected_descriptions.map((d) => Number(d.id)).filter(Boolean),
          dayOfWeeks: (form.day_use || []).map(Number).filter((n) => Number.isFinite(n) && n >= 1 && n <= 7),
          removeWord: form.remove_word || "",
          replaceWordFrom: form.replace_word_from || "",
          replaceWordTo: form.replace_word_to || "",
          remark: form.remark || "",
        });
        notify(t("processUpdated"), "success");
      } else {
        await addProcess(companyId, {
          code: form.process_name,
          currencyId: form.currency_id,
          descriptionIds: form.selected_descriptions.map((d) => Number(d.id)).filter(Boolean),
          dayOfWeeks: (form.day_use || []).map(Number).filter((n) => Number.isFinite(n) && n >= 1 && n <= 7),
          removeWord: form.remove_word || "",
          replaceWordFrom: form.replace_word_from || "",
          replaceWordTo: form.replace_word_to || "",
          remark: form.remark || "",
        });
        notify(t("processAdded"), "success");
      }
      notifyTransactionDataChanged("processlist-react");
      setModalOpen(false);
      fetchRows();
    } catch (err) {
      notify(err?.message || (editMode ? t("updateFailed") : t("createFailed")), "danger");
    }
  };

  const toggleSelectId = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteSelected = () => {
    if (processMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    if (!selectedIds.size) return;
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteProcesses = async () => {
    if (processMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      setDeleteConfirmOpen(false);
      return;
    }
    if (!selectedIds.size) {
      setDeleteConfirmOpen(false);
      return;
    }
    setDeleteSubmitting(true);
    try {
      if (!companyId) {
        notify(t("deleteFailed"), "danger");
        return;
      }
      // Account-style: one Spring delete-process call per id
      for (const processId of selectedIds) {
        await deleteProcess(companyId, processId);
      }
      const n = selectedIds.size;
      notify(n === 1 ? t("processDeletedOne") : t("processDeletedMany", { count: n }), "success");
      notifyTransactionDataChanged("processlist-react");
      setDeleteConfirmOpen(false);
      setSelectedIds(new Set());
      fetchRows();
    } catch (err) {
      notify(err?.message || t("deleteFailed"), "danger");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const toggleStatus = async (row) => {
    if (processMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    if (!row?.id) return;
    const tid = companyId ?? row.tenant_id;
    if (!tid) {
      notify(t("statusUpdateFailed"), "danger");
      return;
    }
    try {
      const { status: newStatus } = await updateProcessStatus(tid, row.id);

      const shouldShow = processRowVisibleAfterStatusChange(newStatus, { showInactive, showAll });

      if (!shouldShow) {
        setRows((prev) => prev.filter((r) => Number(r.id) !== Number(row.id)));
      } else {
        setRows((prev) => prev.map((r) => (Number(r.id) === Number(row.id) ? { ...r, status: newStatus } : r)));
      }

      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (newStatus === "active") next.delete(row.id);
        return next;
      });

      const statusText = newStatus === "active" ? t("activated") : t("deactivated");
      notify(t("statusChangedTo", { status: statusText }), "success");
      notifyTransactionDataChanged("processlist-react");
    } catch (err) {
      notify(err?.message || t("statusUpdateFailed"), "danger");
    }
  };

  const onSearchChange = (e) => {
    setSearch(filterSearchInput(e.target.value));
  };

  return (
    <div className="container">
      <div className="content">
        <div className="action-buttons-container">
          <div className="action-buttons">
            <div className="action-controls-row" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-add" disabled={processMutationsBlocked || !activeCompanyId} onClick={openAdd}>
                <AddProcessIcon />
                {t("addProcess")}
              </button>
              <div className="search-container userlist-search-bar">
                <span className="userlist-search-bar__icon" aria-hidden="true">
                  <svg fill="currentColor" viewBox="0 0 24 24">
                    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                  </svg>
                </span>
                <input
                  type="text"
                  className="search-input userlist-search-input"
                  placeholder={t("search")}
                  value={search}
                  onChange={onSearchChange}
                />
              </div>
              <div className="userlist-filter-chips" role="group">
                <button
                  type="button"
                  className={`user-filter-chip${showInactive ? " is-selected" : ""}`}
                  aria-pressed={showInactive}
                  onClick={() => setShowInactive((prev) => !prev)}
                >
                  <span className="user-filter-chip__dot" aria-hidden>
                    {showInactive ? (
                      <svg className="user-filter-chip__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 12l4 4 8-8" />
                      </svg>
                    ) : null}
                  </span>
                  <span className="user-filter-chip__label">{t("showInactive")}</span>
                </button>
                <button
                  type="button"
                  className={`user-filter-chip${showAll ? " is-selected" : ""}`}
                  aria-pressed={showAll}
                  onClick={() => setShowAll((prev) => !prev)}
                >
                  <span className="user-filter-chip__dot" aria-hidden>
                    {showAll ? (
                      <svg className="user-filter-chip__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 12l4 4 8-8" />
                      </svg>
                    ) : null}
                  </span>
                  <span className="user-filter-chip__label">{t("showAll")}</span>
                </button>
              </div>
            </div>
            <div className="user-toolbar-actions-right" style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
              <button
                type="button"
                className="btn btn-delete"
                id="processDeleteSelectedBtn"
                disabled={!selectedIds.size || processMutationsBlocked}
                onClick={deleteSelected}
              >
                {selectedIds.size ? t("deleteWithCount", { count: selectedIds.size }) : t("delete")}
              </button>
            </div>
          </div>
          <div className="user-gc-inline-panel">
            {groupIds.length > 0 && (
              <div className="user-gc-inline-row">
                <span className="user-gc-inline-label">{t("groupId")}</span>
                <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                  <div className="user-gc-segment-group" role="group" aria-label={t("groupId")}>
                    {groupIds.map((g) => (
                      <button
                        key={g}
                        type="button"
                        className={`user-gc-segment${groupFilterKind === "follow" && g === selectedGroupKey ? " is-on" : ""}`}
                        disabled={processMutationsBlocked}
                        onClick={() => handlePickGroup(g)}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div className="user-gc-inline-row">
              <span className="user-gc-inline-label">{t("company")}</span>
              <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                <div className="user-gc-segment-group" role="group" aria-label={t("company")}>
                  {companyButtons.map((c) => {
                    const active = Number(c.id) === Number(activeCompanyId);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`user-gc-segment${active ? " is-on" : ""}`}
                        disabled={processMutationsBlocked}
                        onMouseEnter={() => warmProcessListCompanyCache(c.id)}
                        onFocus={() => warmProcessListCompanyCache(c.id)}
                        onClick={() => onPickCompanyPill(c)}
                      >
                        {String(c.company_id || "").toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <ProcessTable
          showAll={showAll}
          showSelectColumn={showInactive || showAll}
          suppressEmpty={awaitingRows || loading}
          pageRows={pageRows}
          currentPage={currentPage}
          PAGE_SIZE={PAGE_SIZE}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={handleProcessTableSort}
          selectedIds={selectedIds}
          toggleStatus={toggleStatus}
          openEdit={openEdit}
          toggleSelectId={toggleSelectId}
          toggleSelectAll={toggleSelectAll}
          mutationsBlocked={processMutationsBlocked}
          t={t}
        />

        {!showAll && (
          <div className="pagination-container" id="paginationContainer">
            <button type="button" className="pagination-btn" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
              ◀
            </button>
            <span className="pagination-info">
              {t("pageOf", { current: currentPage, total: totalPages })}
            </span>
            <button
              type="button"
              className="pagination-btn"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              ▶
            </button>
          </div>
        )}
      </div>

      {modalOpen && (
        <ProcessFormModal
          editMode={editMode}
          form={form}
          setForm={setForm}
          currencies={currencies}
          days={days}
          readOnly={processMutationsBlocked}
          onClose={() => {
            setDescriptionPickerOpen(false);
            setModalOpen(false);
          }}
          onSubmit={submitForm}
          onOpenDescriptionPicker={() => setDescriptionPickerOpen(true)}
          t={t}
        />
      )}

      {modalOpen && descriptionPickerOpen && (
        <DescriptionPickerModal
          descriptions={descriptions}
          form={form}
          readOnly={processMutationsBlocked}
          onConfirm={confirmDescriptionSelection}
          onClose={() => setDescriptionPickerOpen(false)}
          onAddDescription={handleAddDescription}
          onDeleteDescription={handleDeleteDescription}
          t={t}
        />
      )}

      <ProcessDeleteConfirmModal
        open={deleteConfirmOpen}
        count={selectedIds.size}
        deleting={deleteSubmitting}
        confirmDisabled={processMutationsBlocked}
        onCancel={() => !deleteSubmitting && setDeleteConfirmOpen(false)}
        onConfirm={confirmDeleteProcesses}
        t={t}
      />


      <ProcessToastStack items={toasts} />
    </div>
  );
}
