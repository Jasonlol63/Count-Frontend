import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../../utils/company/companySessionEvents.js";
import { ensureCrossPageCompanySelection, syncCompanySessionApi } from "../../utils/company/companySessionSync.js";
import { spaPath } from "../../utils/routing/pageRoutes.js";
import { replaceBrowserPathOnly } from "../../utils/routing/privateBrowserUrl.js";
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
import { getSessionTenantId } from "../../utils/auth/sessionTenant.js";
import "../../../public/css/processCSS.css";
import "../../../public/css/description-input.css";
import "../../../public/css/processlist.css";
import "../../../public/css/remove-word-chip.css";
import "../../../public/css/accountCSS.css";
import "../../../public/css/userlist.css";
import "../../../public/css/list-badge-scale.css";
import { useAutoListPageSize } from "../../hooks/useAutoListPageSize.js";
import { PAGE_SIZE_MAX, PAGE_SIZE_MIN } from "../../constants/listPageSize.js";
import {
  EMPTY_FORM,
  normalizeRows,
  dedupeCompanyRowsForSwitcher,
  filterProcessPageCompanyButtons,
  resolveProcessListActiveTenantId,
  sortProcessTableRows,
  notifyTransactionDataChanged,
  parseRemarkForForm,
  buildEditDescriptionSelection,
  processListCacheHasEntry,
  processListCacheHasRows,
  emptyCopyFromSyncFields,
  buildCopyFromFormPatchFromRow,
  invalidateProcessListTenantCache,
  buildOptimisticProcessRows,
  mergeProcessRowsById,
  existingProcessesFromListRows,
  buildEditFormFromListRow,
  normalizeProcessStatusKey,
  isProcessStatusActive,
  isProcessStatusInactive,
} from "./processListHelpers.js";
import {
  addProcess,
  addProcessDescription,
  deleteProcess,
  deleteProcessDescription,
  fetchProcessFormMeta,
  fetchProcessDescriptionsByTenantId,
  updateProcess,
  updateProcessStatus,
} from "./processListApi.js";
import {
  fetchGamesProcessListSlice,
  prefetchBankProcessListPayload,
  resolveProcessListRouteCache,
  warmProcessListRouteCache,
} from "./processRoutePrefetch.js";
import ProcessTable from "./components/ProcessTable.jsx";
import {
  parseRemoveWordChips,
  resolveSubmittedRemoveWordChips,
  serializeRemoveWordChips,
} from "../../lib/removeWordChips.js";
import ProcessFormModal from "./components/ProcessFormModal.jsx";
import DescriptionPickerModal from "./components/DescriptionPickerModal.jsx";
import ProcessDeleteConfirmModal from "./components/ProcessDeleteConfirmModal.jsx";
import AddProcessIcon from "./components/AddProcessIcon.jsx";
import { getProcessListText, translateProcessListApiMessage } from "../../translateFile/pages/processListTranslate.js";
import { useAuthSession } from "../../context/AuthSessionContext.jsx";
import { useC168ProcessRouteGuard } from "./useC168ProcessRouteGuard.js";

function filterSearchInput(raw) {
  return String(raw || "")
    .replace(/[^A-Z0-9 ]/gi, "")
    .toUpperCase();
}

function resolveProcessListCacheKey(tenantId, debouncedSearch, showInactive, showAll) {
  return `tenant:${Number(tenantId)}|${String(debouncedSearch || "").trim()}|${showInactive ? "1" : "0"}|${showAll ? "1" : "0"}`;
}

function processRowVisibleAfterStatusChange(newStatus, { showInactive, showAll }) {
  const status = normalizeProcessStatusKey(newStatus);
  if (showAll && showInactive) return isProcessStatusInactive(status);
  if (showAll) return isProcessStatusActive(status);
  if (showInactive) return isProcessStatusInactive(status);
  return isProcessStatusActive(status);
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
  const [days, setDays] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [toasts, setToasts] = useState([]);
  const [descriptionPickerOpen, setDescriptionPickerOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmError, setDeleteConfirmError] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  /** Partnership/Audit read_only æ—¶ç¦ç”¨æµç¨‹å†™æ“ä½œ â€” synced from layout session */
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
  const listPaginationCompanyRef = useRef(null);
  const listRegionRef = useRef(null);

  const [existingProcesses, setExistingProcesses] = useState([]);

  const notify = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type, visible: false }].slice(-2));
    requestAnimationFrame(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, visible: true } : t)));
    });
    const durationMs = type === "danger" ? 6000 : 1500;
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, durationMs);
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

  const loadFormMeta = useCallback(async (tenantId) => {
    const tid = Number(tenantId);
    if (!Number.isFinite(tid) || tid <= 0) return;
    try {
      const meta = await fetchProcessFormMeta(tid);
      setCurrencies(meta.currencies || []);
      setDescriptions(meta.descriptions || []);
      setDays(meta.days || []);
      setExistingProcesses(existingProcessesFromListRows(rowsRef.current));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!companyId) return;
    setExistingProcesses(existingProcessesFromListRows(rows));
  }, [rows, companyId]);

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
            ? resolveProcessListActiveTenantId(resolvedPrefetchId, prefetchedCompanies, {
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
            const prefRows = normalizeRows(routePrefetch.rows);
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

        const cs = await fetchOwnerCompaniesAll({ me: layoutMe });
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

        if (effectiveCompany != null && Number(effectiveCompany) !== Number(getSessionTenantId(layoutMe))) {
          try {
            const syncJson = await syncCompanySessionApi(effectiveCompany);
            if (!syncJson?.success) {
              effectiveCompany = getSessionTenantId(layoutMe) ?? effectiveCompany;
            }
          } catch {
            effectiveCompany = getSessionTenantId(layoutMe) ?? effectiveCompany;
          }
        }

        const currentCompanyRow = cs.find((c) => Number(c.id) === Number(effectiveCompany));
        if (currentCompanyRow?.company_id) {
          const { bankOnly: bankCategory } = await resolveTenantIsBankOnly(
            effectiveCompany,
            layoutMe,
            currentCompanyRow,
          );
          if (bankCategory) {
            const warm = await prefetchBankProcessListPayload(effectiveCompany);
            navigate(spaPath("bank-process-list"), {
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
          effectiveCompany = resolveProcessListActiveTenantId(effectiveCompany, cs, {
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

  const syncUrl = useCallback(() => {
    replaceBrowserPathOnly();
  }, []);

  const resetProcessListPagination = useCallback(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, []);

  const resetPaginationForCompany = useCallback(
    (cid, { force = false } = {}) => {
      const key = String(Number(cid));
      if (!key || key === "NaN") return false;
      if (!force && key === listPaginationCompanyRef.current) return false;
      listPaginationCompanyRef.current = key;
      resetProcessListPagination();
      return true;
    },
    [resetProcessListPagination],
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
      const force = !!opts.force;
      const cid = opts.companyId != null ? Number(opts.companyId) : Number(companyId);
      if (!Number.isFinite(cid) || cid <= 0) return;

      const fetchGen = ++fetchGenRef.current;
      const shouldAwaitEmpty = rowsRef.current.length === 0 && !force;
      if (shouldAwaitEmpty) setAwaitingRows(true);
      if (force) setAwaitingRows(false);

      if (!opts.keepInFlight && fetchAbortRef.current) fetchAbortRef.current.abort();
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
          if (!silent && !force) notify(t("failedLoadProcessList"), "danger");
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
          if (!force && silent && processRowsFingerprint(prev) === processRowsFingerprint(nextRows)) {
            return prev;
          }
          const preserveIds = Array.isArray(opts.preserveIds)
            ? opts.preserveIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
            : [];
          if (force && preserveIds.length > 0) {
            const serverIds = new Set(nextRows.map((row) => Number(row.id)));
            const pending = (prev || []).filter(
              (row) => preserveIds.includes(Number(row.id)) && !serverIds.has(Number(row.id)),
            );
            return pending.length > 0 ? mergeProcessRowsById(nextRows, pending) : nextRows;
          }
          return nextRows;
        });
        if (!silent || force) {
          listPaginationCompanyRef.current = String(cid);
          resetProcessListPagination();
          syncUrl({ companyId: cid });
        } else {
          resetPaginationForCompany(cid);
        }
      } catch (err) {
        if (ac.signal.aborted || err?.name === "AbortError" || fetchGen !== fetchGenRef.current) return;
        if (!silent && !force) notify(t("failedLoadProcessList"), "danger");
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
      resetPaginationForCompany,
      resetProcessListPagination,
      syncUrl,
      t,
    ],
  );

  const reloadDescriptions = async () => {
    const tid = Number(activeCompanyId ?? companyId);
    if (!Number.isFinite(tid) || tid <= 0) return;
    try {
      const rows = await fetchProcessDescriptionsByTenantId(tid);
      setDescriptions(rows.map((d) => ({ id: d.id, name: d.name })));
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
    const tid = Number(activeCompanyId ?? companyId);
    if (!Number.isFinite(tid) || tid <= 0) return null;
    try {
      const created = await addProcessDescription(tid, normalizedName);
      notify(t("descAdded"), "success");
      await reloadDescriptions();
      return created?.id != null ? { id: created.id, name: created.name || normalizedName } : null;
    } catch (err) {
      if (err?.duplicate) notify(t("descExists"), "danger");
      else notify(err?.message || t("failedAddDescription"), "danger");
      return null;
    }
  };

  const handleDeleteDescription = async (descId) => {
    if (processMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    const tid = Number(activeCompanyId ?? companyId);
    if (!Number.isFinite(tid) || tid <= 0) return;
    try {
      await deleteProcessDescription(tid, descId);
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
      resolveProcessListActiveTenantId(companyId, companies, {
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

  const showSelectColumn = showInactive || showAll;
  const pageSize = useAutoListPageSize({
    listRegionRef,
    enabled: !showAll,
    rowSelector: ".games-process-row",
    headerSelector: ".games-process-table-header",
    paginationSelector: ".pagination-container",
    minRows: PAGE_SIZE_MIN,
    maxRows: PAGE_SIZE_MAX,
    stableRowHeight: true,
    remeasureDeps: [
      sortedDisplayRows.length,
      showAll,
      showInactive,
      debouncedSearch,
      lang,
      currentPage,
      loading,
      awaitingRows,
      companyId,
      selectedGroup,
      groupFilterKind,
      showSelectColumn,
    ],
  });

  const totalPages = useMemo(() => Math.max(1, Math.ceil(sortedDisplayRows.length / pageSize)), [sortedDisplayRows.length, pageSize]);
  const effectivePage = useMemo(
    () => Math.min(Math.max(1, currentPage), totalPages),
    [currentPage, totalPages],
  );
  useEffect(() => {
    if (showAll) return;
    setCurrentPage((p) => Math.min(p, totalPages));
  }, [showAll, totalPages, pageSize]);

  const pageRows = useMemo(() => {
    if (showAll) return sortedDisplayRows;
    const start = (effectivePage - 1) * pageSize;
    return sortedDisplayRows.slice(start, start + pageSize);
  }, [sortedDisplayRows, effectivePage, pageSize, showAll]);

  const handleProcessTableSort = useCallback((column) => {
    setSortDirection((direction) => (sortColumn === column && direction === "asc" ? "desc" : "asc"));
    setSortColumn(column);
    setCurrentPage(1);
  }, [sortColumn]);

  const toggleSelectAll = useCallback(
    (checked) => {
      const deletable = pageRows.filter(
        (r) => isProcessStatusInactive(r.status) && !r.has_transactions
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

      suppressCrossPageSyncRef.current = true;
      try {
        const sessionCompanyId = getSessionTenantId(sessionMeFromLayout);

        const bankCategoryResolved = resolveTenantIsBankOnly(nextId, sessionMeFromLayout, company);
        void loadFormMeta(nextId);

        try {
          const { bankOnly: bankCategory, syncJson } = await bankCategoryResolved;
          if (bankCategory) {
            const warm = await prefetchBankProcessListPayload(nextId);
            navigate(spaPath("bank-process-list"), {
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
        } catch {
          /* fall through to session sync */
        }

        const runFetch = async () => {
          await hydrateProcessListCompanyCache(nextId);
          await fetchRows({ companyId: nextId, silent: true });
        };

        if (sessionCompanyId === nextId) {
          void runFetch();
          return;
        }

        const previousCompanyId = Number(companyId) === nextId ? sessionCompanyId : companyId;
        companySessionAbortRef.current?.abort();
        const sessionAc = new AbortController();
        companySessionAbortRef.current = sessionAc;

        void runFetch();

        try {
          const json = await syncCompanySessionApi(nextId);
          if (sessionAc.signal.aborted) return;
          if (!json?.success) {
            if (previousCompanyId != null && Number(previousCompanyId) !== nextId) {
              skipCompanyFetchEffectRef.current = true;
              flushSync(() => {
                setCompanyId(previousCompanyId);
                applyProcessListCache(previousCompanyId);
              });
              void fetchRows({ companyId: previousCompanyId, silent: true });
            }
            notify(json?.message || t("switchCompanyFailed"), "danger");
            return;
          }
          notifyCompanySessionUpdated(json.data ?? null);
          runFetch();
        } catch {
          if (sessionAc.signal.aborted) return;
          if (previousCompanyId != null && Number(previousCompanyId) !== nextId) {
            skipCompanyFetchEffectRef.current = true;
            flushSync(() => {
              setCompanyId(previousCompanyId);
              applyProcessListCache(previousCompanyId);
            });
            void fetchRows({ companyId: previousCompanyId, silent: true });
          }
          notify(t("switchCompanyFailed"), "danger");
        } finally {
          if (companySessionAbortRef.current === sessionAc) {
            companySessionAbortRef.current = null;
          }
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
      selectedGroup,
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

      applyProcessListCache(nextId);
      flushSync(() => {
        setGroupFilterKind("follow");
        if (nextGroup) setSelectedGroup(nextGroup);
        setCompanyId(nextId);
        resetPaginationForCompany(nextId, { force: true });
      });

      syncUrl({ companyId: nextId });

      if (nextGroup) persistDashboardGroupFilter(nextGroup);
      persistDashboardFilterState(nextGroup, nextId);
      notifyDashboardGroupFilterChanged(nextGroup, nextId, {
        companyCode: c.company_id,
      });

      void onSwitchCompanyRef.current?.(c, { layoutSilent: true });
    },
    [applyProcessListCache, companyId, resetPaginationForCompany, syncUrl],
  );

  const handlePickGroup = useCallback(
    (gid) => {
      const g = String(gid || "").trim().toUpperCase();
      if (!g) return;

      // Process list is company-scoped: re-click active group hides the group row (ungrouped).
      if (groupFilterKind === "follow" && g === selectedGroupKey && companyId != null) {
        const nextCompanyId = resolveProcessListActiveTenantId(companyId, companies, {
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
            resetProcessListPagination();
          } else {
            resetPaginationForCompany(nextCompanyId, { force: true });
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
        applyProcessListCache(nextCompanyId);
        flushSync(() => {
          setCompanyId(nextCompanyId);
          resetPaginationForCompany(nextCompanyId, { force: true });
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
      resetPaginationForCompany,
      resetProcessListPagination,
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

  const handleCopyFromSelect = useCallback(
    async (processId) => {
      const id = String(processId ?? "").trim();
      if (!id) {
        setForm((prev) => ({
          ...prev,
          copy_from: "",
          ...emptyCopyFromSyncFields(),
        }));
        return;
      }

      setForm((prev) => ({ ...prev, copy_from: id }));

      const row = rowsRef.current.find((r) => String(r.id) === id);
      if (!row) {
        notify(t("failedLoadProcess"), "danger");
        return;
      }

      const patch = buildCopyFromFormPatchFromRow(row, { currencies, descriptions });
      setForm((prev) => ({
        ...prev,
        copy_from: id,
        ...patch,
      }));
    },
    [currencies, descriptions, t, notify],
  );

  const openEdit = (id) => {
    if (processMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    const row = rowsRef.current.find((r) => Number(r.id) === Number(id));
    if (!row) {
      notify(t("failedLoadProcess"), "danger");
      return;
    }
    setEditMode(true);
    setForm({
      ...buildEditFormFromListRow(row, descriptions, { existingProcesses }),
      existingProcesses,
    });
    setDescriptionPickerOpen(false);
    setModalOpen(true);
  };

  const submitForm = async (event) => {
    event.preventDefault();
    const removeWordDraft = event.currentTarget?.elements?.namedItem?.("remove_word")?.value || "";
    const submittedRemoveWord = resolveSubmittedRemoveWordChips(form.remove_word, removeWordDraft);
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

    const submitTenantId = Number(activeCompanyId ?? companyId);
    if (!Number.isFinite(submitTenantId) || submitTenantId <= 0) return;

    const descriptionIds = form.selected_descriptions
      .map((d) => Number(d.id))
      .filter((n) => Number.isFinite(n) && n > 0);
    const dayOfWeeks = (form.day_use || [])
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 7);
    const springFields = {
      currencyId: Number(form.currency_id),
      descriptionIds,
      dayOfWeeks,
      removeWord: submittedRemoveWord,
      replaceWordFrom: form.replace_word_from || "",
      replaceWordTo: form.replace_word_to || "",
      remark: form.remark || "",
    };

    if (editMode) {
      try {
        await updateProcess(submitTenantId, {
          id: Number(form.id),
          ...springFields,
        });
        notify(t("processUpdated"), "success");
        notifyTransactionDataChanged("processlist-react");
        setModalOpen(false);
        invalidateProcessListTenantCache(processListCacheRef, submitTenantId);
        fetchRows({ companyId: submitTenantId, force: true });
      } catch (err) {
        notify(err?.message || t("updateFailed"), "danger");
      }
      return;
    }

    if (!form.is_multi_process && (!form.process_name || !String(form.process_name).trim())) {
      notify(t("needProcessIdOrMulti"), "danger");
      return;
    }
    if (form.is_multi_process && (!form.selected_processes || form.selected_processes.length === 0)) {
      notify(t("needOneMultiProcess"), "danger");
      return;
    }

    const codesToCreate = form.is_multi_process
      ? form.selected_processes.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
      : [String(form.process_name).trim().toUpperCase()];

    try {
      const created = [];
      const errors = [];
      for (const code of codesToCreate) {
        try {
          const data = await addProcess(submitTenantId, { code, ...springFields });
          if (data?.id != null) {
            created.push({ id: data.id, process_id: data.process?.code ?? code, description_id: descriptionIds[0] });
          }
        } catch (err) {
          errors.push(err?.message || code);
        }
      }
      if (!created.length) {
        notify(errors[0] || t("createFailed"), "danger");
        return;
      }
      let message = t("processAdded");
      if (errors.length > 0) {
        message += `. ${t("processSkippedConflicts", { count: errors.length })}`;
      }
      notify(message, "success");
      notifyTransactionDataChanged("processlist-react");
      setModalOpen(false);

      const optimisticRows = buildOptimisticProcessRows(created, form, { currencies, days });
      if (optimisticRows.length > 0) {
        setRows((prev) => mergeProcessRowsById(prev, optimisticRows));
        setAwaitingRows(false);
        resetProcessListPagination();
      }

      invalidateProcessListTenantCache(processListCacheRef, submitTenantId);
      await loadFormMeta(submitTenantId);
      await fetchRows({
        companyId: submitTenantId,
        force: true,
        preserveIds: optimisticRows.map((row) => row.id),
      });
    } catch (err) {
      notify(err?.message || t("createFailed"), "danger");
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
    setDeleteConfirmError("");
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
    const submitTenantId = Number(activeCompanyId ?? companyId);
    if (!Number.isFinite(submitTenantId) || submitTenantId <= 0) return;

    setDeleteSubmitting(true);
    setDeleteConfirmError("");
    try {
      let deleted = 0;
      for (const id of selectedIds) {
        await deleteProcess(submitTenantId, id);
        deleted += 1;
      }
      notify(deleted === 1 ? t("processDeletedOne") : t("processDeletedMany", { count: deleted }), "success");
      notifyTransactionDataChanged("processlist-react");
      setDeleteConfirmOpen(false);
      setDeleteConfirmError("");
      setSelectedIds(new Set());
      invalidateProcessListTenantCache(processListCacheRef, submitTenantId);
      fetchRows({ companyId: submitTenantId, force: true });
    } catch (err) {
      const msg = translateProcessListApiMessage(lang, { message: err?.message }, t("deleteFailed"));
      setDeleteConfirmError(msg);
      notify(msg, "danger");
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
    const submitTenantId = Number(activeCompanyId ?? companyId);
    if (!Number.isFinite(submitTenantId) || submitTenantId <= 0) return;
    try {
      const { status } = await updateProcessStatus(submitTenantId, row.id);
      const newStatus = normalizeProcessStatusKey(status);
      if (!newStatus) {
        notifyTransactionDataChanged("processlist-react");
        fetchRows({ companyId: submitTenantId, force: true });
        return;
      }

      const shouldShow = processRowVisibleAfterStatusChange(newStatus, { showInactive, showAll });

      if (!shouldShow) {
        setRows((prev) => prev.filter((r) => Number(r.id) !== Number(row.id)));
      } else {
        setRows((prev) => prev.map((r) => (Number(r.id) === Number(row.id) ? { ...r, status: newStatus } : r)));
      }

      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (isProcessStatusActive(newStatus)) next.delete(row.id);
        return next;
      });

      const statusText = isProcessStatusActive(newStatus) ? t("activated") : t("deactivated");
      notify(t("statusChangedTo", { status: statusText }), "success");
      notifyTransactionDataChanged("processlist-react");
      invalidateProcessListTenantCache(processListCacheRef, submitTenantId);
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
          showSelectColumn={showSelectColumn}
          suppressEmpty={awaitingRows || loading}
          pageRows={pageRows}
          currentPage={effectivePage}
          pageSize={pageSize}
          listRegionRef={listRegionRef}
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
            <button type="button" className="pagination-btn" disabled={effectivePage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
              â—€
            </button>
            <span className="pagination-info">
              {t("pageOf", { current: effectivePage, total: totalPages })}
            </span>
            <button
              type="button"
              className="pagination-btn"
              disabled={effectivePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              â–¶
            </button>
          </div>
        )}
      </div>

      {modalOpen && (
        <ProcessFormModal
          editMode={editMode}
          form={form}
          setForm={setForm}
          scopeTenantId={activeCompanyId ?? companyId}
          currencies={currencies}
          days={days}
          readOnly={processMutationsBlocked}
          onClose={() => {
            setDescriptionPickerOpen(false);
            setModalOpen(false);
          }}
          onSubmit={submitForm}
          onOpenDescriptionPicker={() => setDescriptionPickerOpen(true)}
          onCopyFromSelect={handleCopyFromSelect}
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
        errorMessage={deleteConfirmError}
        confirmDisabled={processMutationsBlocked}
        onCancel={() => {
          if (!deleteSubmitting) {
            setDeleteConfirmError("");
            setDeleteConfirmOpen(false);
          }
        }}
        onConfirm={confirmDeleteProcesses}
        t={t}
      />


      <ProcessToastStack items={toasts} />
    </div>
  );
}
