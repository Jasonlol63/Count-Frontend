import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { spaPath } from "../../../utils/routing/pageRoutes.js";
/* 与 DataCapture 相同：打进 Vite 产物，避免 dynamic import 在生产包中被拆成空 chunk、样式从未加载 */
import "../../../../public/css/accountCSS.css";
import "../../../../public/css/userlist.css";
import "../../../../public/css/transaction.css";
import "../../../../public/css/date-range-picker.css";
import "../../../../public/css/customer_report.css";
import "../../../../public/css/report-outlined-fields.css";
import "../../../../public/css/capture_maintenance.css";
import "../../../../public/css/maintenance_unified_filters.css";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { removeOtherMaintenanceStylesheets, waitForStylesheet } from "../../../utils/maintenance/maintenanceStylesheets.js";
import { ensureMaintenanceDateRangePicker } from "../../../utils/date/dateRangePicker.js";
import { formatYmd } from "../../../utils/date/dateUtils.js";
import { useMaintenanceGroupCompanyFilter } from "../shared/useMaintenanceGroupCompanyFilter.js";
import { runMaintenanceCompanySwitch } from "../shared/maintenanceCompanySwitch.js";
import { useMaintenanceBankOnlyGuard } from "../shared/useMaintenanceBankOnlyGuard.js";
import { useMaintenancePageScrollLock } from "../shared/useMaintenancePageScrollLock.js";
import {
  isMaintenanceGroupOnlyBoot,
  isMaintenanceSessionGroupEntityBoot,
  shouldSkipMaintenanceCategoryGuard,
} from "../shared/maintenanceGroupBoot.js";
import { canUseGroupOnlyMode } from "../../../utils/company/loginScope.js";
import {
  isDashboardGroupOnlyMode,
  persistDashboardFilterState,
  persistDashboardGroupOnlyMode,
  persistDashboardSelectedCompany,
  readPersistedDashboardGcFilter,
  readDashboardSelectedCompanyId,
  DASHBOARD_GROUP_FILTER_KEY,
  DASHBOARD_GROUP_FILTER_OPT_OUT_KEY,
  resolveBootCompanyId,
  resolveCompanyWhenClosingGroup,
  resolveInitialSelectedGroupFromSession,
  sortedUniqueGroupIds,
} from "../../../utils/company/sharedCompanyFilter.js";
import { useGroupAnchorSessionSync } from "../../../utils/company/useGroupAnchorSessionSync.js";
import { fetchOwnerCompaniesAll } from "../../../utils/company/sharedCompanyFilter.js";
import {
  fetchCompanyPermissions,
  fetchProcesses,
  searchCaptureData,
  deleteCaptureItems,
  updateSessionCompany,
} from "./captureMaintenanceLogic.js";
import {
  captureMaintenanceScopeCacheCompanyKey,
  captureMaintenanceScopeCacheKey,
  captureMaintenanceScopeIsReady,
  captureMaintenanceUsesGroupProcesses,
  resolveCaptureMaintenanceScope,
} from "./captureMaintenanceScope.js";
import { useLoginLang } from "../../../utils/i18n/useLoginLang.js";
import { getMaintenanceText, MAINTENANCE_I18N } from "../../../translateFile/pages/maintenanceTranslate.js";
import { usePartnershipAuditWriteGuard } from "../../../utils/audit/usePartnershipAuditWriteGuard.js";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";

function readInitialMaintenanceSelectedGroup() {
  try {
    const saved = sessionStorage.getItem(DASHBOARD_GROUP_FILTER_KEY);
    return saved ? String(saved).trim().toUpperCase() : null;
  } catch {
    return null;
  }
}

function readInitialMaintenanceCompanyId() {
  const persisted = readPersistedDashboardGcFilter();
  if (isDashboardGroupOnlyMode() || persisted.groupOnly) return null;
  const saved = readDashboardSelectedCompanyId();
  if (saved != null) return saved;
  if (persisted.selectedGroup) return null;
  return null;
}

// Componentss
import CaptureMaintenanceFilters from "./components/CaptureMaintenanceFilters.jsx";
import CaptureMaintenanceTable from "./components/CaptureMaintenanceTable.jsx";
import MaintenanceDeleteConfirmModal from "../shared/MaintenanceDeleteConfirmModal.jsx";

export default function CaptureMaintenancePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { me, sessionReady } = useAuthSession();
  const lang = useLoginLang();
  const m = useMemo(() => MAINTENANCE_I18N[lang] || MAINTENANCE_I18N.en, [lang]);
  const t = useCallback((key, params) => getMaintenanceText(lang, key, params), [lang]);

  // -- Boot State ---
  const [bootLoading, setBootLoading] = useState(true);
  const [companies, setCompanies] = useState([]);

  // -- Filter State --
  const [companyId, setCompanyId] = useState(readInitialMaintenanceCompanyId);
  const [companyCode, setCompanyCode] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedProcess, setSelectedProcess] = useState("");
  
  const today = useMemo(() => new Date(), []);
  const todayDmy = useMemo(() => {
    const d = String(today.getDate()).padStart(2, "0");
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const y = today.getFullYear();
    return `${d}/${m}/${y}`;
  }, [today]);
  const [dateFrom, setDateFrom] = useState(todayDmy);
  const [dateTo, setDateTo] = useState(todayDmy);

  // -- Data State --
  const [processes, setProcesses] = useState([]);
  const [captureData, setCaptureData] = useState([]);
  const [captureListEpoch, setCaptureListEpoch] = useState(0);
  const [captureDataSourceCompanyId, setCaptureDataSourceCompanyId] = useState(null);
  const [loading, setLoading] = useState(false);
  /** 与 Report 页一致：非首次拉数时用细条 + 保留旧表，避免切换公司整表 Loading 卡顿感 */
  const [listSyncing, setListSyncing] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  
  // -- UI State --
  const [toasts, setToasts] = useState([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const captureSeqRef = useRef(0);
  const captureAbortRef = useRef(null);
  const scopeKeyRef = useRef("");
  const captureDataRef = useRef(captureData);
  captureDataRef.current = captureData;
  const initialCaptureSearchDoneRef = useRef(false);
  /** 切换公司已手动触发拉数时跳过 useEffect 里下一次重复请求，少等一轮渲染 */
  const suppressNextSearchEffectRef = useRef(false);
  const switchCompanyRef = useRef(async () => {});
  const onPrepareCompanySelectRef = useRef(() => {});
  const onClearCompanyRef = useRef(() => {});

  const {
    snapGroupIds,
    visibleCompanies,
    handleGroupClick,
    handlePickCompany,
    handlePickAllGroups,
    handlePickAllInGroup,
    groupsAllMode,
    groupAllMode,
    allowClearCompany,
  } = useMaintenanceGroupCompanyFilter({
    companies,
    companyId,
    selectedGroup,
    setSelectedGroup,
    switchCompany: (c) => switchCompanyRef.current(c),
    onPrepareCompanySelect: (c) => onPrepareCompanySelectRef.current(c),
    onClearCompany: (...args) => onClearCompanyRef.current(...args),
    pillCategory: "games",
  });

  const captureScope = useMemo(
    () =>
      resolveCaptureMaintenanceScope({
        companies,
        selectedGroup,
        companyId,
        groupsAllMode,
        groupAllMode,
      }),
    [companies, selectedGroup, companyId, groupsAllMode, groupAllMode],
  );

  const captureScopeKey = useMemo(
    () => captureMaintenanceScopeCacheKey(captureScope),
    [captureScope],
  );

  const listQueryEnabled =
    captureMaintenanceScopeIsReady(captureScope) && Boolean(dateFrom) && Boolean(dateTo);

  useGroupAnchorSessionSync({
    companies,
    selectedGroup,
    companyId,
    sessionCompanyId: me?.company_id,
    enabled: true,
  });

  const notify = useCallback((message, type = "success") => {
    const id = Date.now();
    setToasts(prev => {
      if (prev.some(t => t.message === message)) return prev;
      const next = [...prev, { id, message, type }];
      if (next.length > 2) return next.slice(1);
      return next;
    });
    
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 2000);
  }, []);

  const { guardWrite } = usePartnershipAuditWriteGuard(me, notify);
  useMaintenanceBankOnlyGuard(companyId);
  useMaintenancePageScrollLock();

  // -- Initialization --
  useEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "datacapture-page", "transaction-page");
    document.body.classList.add("dashboard-page", "maintenance-page");

    removeOtherMaintenanceStylesheets("capture_maintenance.css");

    const links = [
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap",
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css",
    ];
    links.forEach((href) => waitForStylesheet(href));

    return () => {
      document.body.classList.remove("maintenance-page");
    };
  }, []);

  useEffect(() => {
    if (bootLoading || !me) return;
    window.MaintenanceDateRangePicker?.setLocaleStrings?.({
      placeholder: t("selectDateRange"),
      selectEndDateHint: t("selectEndDate"),
      monthLabels: m.monthsShort,
    });
  }, [bootLoading, me, lang, t, m]);

  // -- Boot Logic --
  useEffect(() => {
    if (!sessionReady || !me) return;
    let cancelled = false;
    (async () => {
      try {
        const u = me;

        // Permissions check
        const perms = Array.isArray(u.permissions) ? u.permissions : [];
        const hasFull = perms.length === 0;
        const canMaintenance = hasFull || perms.includes("maintenance");

        // Sidebar visibility check
        if (!canMaintenance) {
          navigate(spaPath("dashboard"), { replace: true });
          return;
        }

        // Load Companies
        const rows = await fetchOwnerCompaniesAll();
        if (cancelled) return;
        setCompanies(rows);

        // Set Initial Company
        const groupFilterOptOut =
          typeof sessionStorage !== "undefined" &&
          sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1";
        let initialCompanyId = resolveBootCompanyId({
          sessionCompanyId: u.company_id,
          defaultRowId: rows[0]?.id,
        });
        const initialUiCompanyId = readInitialMaintenanceCompanyId();
        if (groupFilterOptOut && initialUiCompanyId != null) {
          initialCompanyId = initialUiCompanyId;
        } else if (groupFilterOptOut && initialCompanyId == null) {
          const pick = resolveCompanyWhenClosingGroup(
            rows,
            null,
            sortedUniqueGroupIds(rows),
          );
          if (pick?.id != null) initialCompanyId = Number(pick.id);
        }
        const currentComp =
          initialCompanyId != null
            ? rows.find((c) => Number(c.id) === initialCompanyId)
            : null;
        const bootGroup = groupFilterOptOut
          ? null
          : resolveInitialSelectedGroupFromSession(rows, currentComp, u);
        setSelectedGroup(bootGroup);
        const persistedGc = readPersistedDashboardGcFilter();
        const sessionGroup = readInitialMaintenanceSelectedGroup();
        let groupOnlyBoot = isMaintenanceGroupOnlyBoot({
          groupFilterOptOut,
          sessionGroup: bootGroup ?? sessionGroup,
          initialUiCompanyId,
          persistedGc,
        });
        if (
          !groupOnlyBoot &&
          !groupFilterOptOut &&
          (isMaintenanceSessionGroupEntityBoot(currentComp, u) ||
            (bootGroup && initialUiCompanyId == null && canUseGroupOnlyMode(u, bootGroup)))
        ) {
          groupOnlyBoot = true;
        }
        if (groupOnlyBoot) {
          persistDashboardGroupOnlyMode(true);
          persistDashboardSelectedCompany(null);
          setCompanyId(null);
          setCompanyCode("");
          const bootScope = resolveCaptureMaintenanceScope({
            companies: rows,
            selectedGroup: bootGroup ?? sessionGroup,
            companyId: null,
            groupsAllMode: false,
            groupAllMode: false,
          });
          if (cancelled) return;
          let procList = [];
          try {
            procList = bootScope ? await fetchProcesses(null, bootScope) : [];
          } catch (procErr) {
            console.error("Group process list load error:", procErr);
            notify(procErr.message || t("failedLoadProcesses"), "error");
          }
          setProcesses(procList);
          if (bootGroup ?? sessionGroup) {
            sessionStorage.setItem("dashboard_group_filter", bootGroup ?? sessionGroup);
          }
          return;
        }
        setCompanyId(initialCompanyId);

        if (currentComp) {
          const code = currentComp.company_id || "";
          setCompanyCode(code);

          const bootScope = resolveCaptureMaintenanceScope({
            companies: rows,
            selectedGroup: bootGroup,
            companyId: initialCompanyId,
          });

          const [procList, companyPerms] = await Promise.all([
            fetchProcesses(initialCompanyId, bootScope),
            fetchCompanyPermissions(code),
          ]);
          if (cancelled) return;

          const skipCategoryGuard = shouldSkipMaintenanceCategoryGuard({
            groupOnlyBoot,
            scope: bootScope,
            me: u,
            selectedGroup: bootGroup,
            companyRow: currentComp,
            companyId: initialCompanyId,
          });
          if (!skipCategoryGuard) {
            const hasGames = companyPerms.includes("Games") || companyPerms.includes("Gambling");
            const bankOnly = companyPerms.includes("Bank") && !hasGames;
            if (bankOnly) {
              navigate(spaPath("dashboard"), { replace: true });
              return;
            }
            if (!hasGames) {
              navigate(spaPath("dashboard"), { replace: true });
              return;
            }
          }

          setProcesses(procList);

          if (bootGroup) sessionStorage.setItem("dashboard_group_filter", bootGroup);
        }

      } catch (err) {
        console.error("Boot error:", err);
        if (!cancelled) {
          notify(err.message || t("failedLoadProcesses"), "error");
        }
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionReady, me, navigate]);

  // -- Load Meta Data (Processes & Permissions) --
  useEffect(() => {
    if (bootLoading || !captureMaintenanceScopeIsReady(captureScope)) return;

    let cancelled = false;
    (async () => {
      try {
        const procList = await fetchProcesses(companyId, captureScope);
        if (cancelled) return;
        setProcesses(procList);

        if (captureMaintenanceUsesGroupProcesses(captureScope)) {
          setSelectedProcess((prev) =>
            prev && procList.some((p) => String(p.id) === String(prev)) ? prev : "",
          );
        }
      } catch (err) {
        console.error("Meta data load error:", err);
        notify(t("failedLoadProcesses"), "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootLoading, captureScope, companyId, notify, t]);

  // -- Search Logic --
  const performSearch = useCallback(
    async (overrides = {}) => {
      const effectiveScope =
        overrides.scope ??
        resolveCaptureMaintenanceScope({
          companies,
          selectedGroup: overrides.selectedGroup ?? selectedGroup,
          companyId: overrides.companyId ?? companyId,
          groupsAllMode,
          groupAllMode,
        });
      if (!captureMaintenanceScopeIsReady(effectiveScope) || !dateFrom || !dateTo) return;

      const searchScopeKey = captureMaintenanceScopeCacheKey(effectiveScope);
      captureAbortRef.current?.abort();
      const ac = new AbortController();
      captureAbortRef.current = ac;
      const seq = ++captureSeqRef.current;
      const quietRefresh = initialCaptureSearchDoneRef.current;
      if (!quietRefresh) setLoading(true);
      else {
        setLoading(false);
        setListSyncing(true);
      }
      setSelectedIds([]);
      try {
        const data = await searchCaptureData(
          {
            dateFrom,
            dateTo,
            process: selectedProcess,
            scope: effectiveScope,
          },
          { signal: ac.signal },
        );
        if (seq !== captureSeqRef.current) return;
        if (searchScopeKey !== scopeKeyRef.current) return;
        setCaptureListEpoch((e) => e + 1);
        setCaptureData(data);
        setCaptureDataSourceCompanyId(captureMaintenanceScopeCacheCompanyKey(effectiveScope));
        if (!quietRefresh) {
          if (data.length > 0) {
            notify(t("foundRecords", { n: data.length }), "success");
          } else {
            notify(t("noDataAdjustSearch"), "info");
          }
        }
      } catch (err) {
        if (err?.name === "AbortError" || seq !== captureSeqRef.current) return;
        if (searchScopeKey !== scopeKeyRef.current) return;
        notify(err.message, "error");
        setCaptureListEpoch((e) => e + 1);
        setCaptureData([]);
        setCaptureDataSourceCompanyId(null);
      } finally {
        initialCaptureSearchDoneRef.current = true;
        if (seq === captureSeqRef.current) {
          setLoading(false);
          setListSyncing(false);
        }
      }
    },
    [companies, selectedGroup, companyId, groupsAllMode, groupAllMode, dateFrom, dateTo, selectedProcess, notify, t],
  );

  // Auto-search when filters change（defer 0ms；切换公司已手动 performSearch 时跳过一轮避免重复）
  useEffect(() => {
    if (!bootLoading && listQueryEnabled) {
      if (suppressNextSearchEffectRef.current) {
        suppressNextSearchEffectRef.current = false;
        return;
      }
      const h = setTimeout(() => {
        void performSearch();
      }, 0);
      return () => clearTimeout(h);
    }
  }, [
    bootLoading,
    listQueryEnabled,
    captureScopeKey,
    selectedProcess,
    dateFrom,
    dateTo,
    performSearch,
  ]);

  useEffect(
    () => () => {
      captureAbortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    scopeKeyRef.current = captureScopeKey;
  }, [captureScopeKey]);

  // -- Handlers --
  const handleClearCompany = useCallback(
    (groupForPersist) => {
      const g = groupForPersist ?? selectedGroup;
      const nextScope = resolveCaptureMaintenanceScope({
        companies,
        selectedGroup: g,
        companyId: null,
        groupsAllMode,
        groupAllMode,
      });
      suppressNextSearchEffectRef.current = true;
      setCompanyId(null);
      setCompanyCode("");
      setSelectedProcess("");
      setSelectedIds([]);
      persistDashboardFilterState(g, null);
      persistDashboardGroupOnlyMode(true);
      if (captureMaintenanceScopeIsReady(nextScope)) {
        void performSearch({ scope: nextScope, selectedGroup: g, companyId: null });
      }
    },
    [companies, selectedGroup, groupsAllMode, groupAllMode, performSearch],
  );

  const onPrepareCompanySelect = useCallback(
    (c) => {
      if (!c?.id) return;
      const nextId = Number(c.id);
      const nextCode = c.company_id || "";
      const newGroup = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
      const nextScope = resolveCaptureMaintenanceScope({
        companies,
        selectedGroup: newGroup,
        companyId: nextId,
        groupsAllMode,
        groupAllMode,
      });
      suppressNextSearchEffectRef.current = true;
      setCompanyId(nextId);
      setCompanyCode(nextCode);
      setSelectedGroup(newGroup);
      persistDashboardFilterState(newGroup, nextId);
      void performSearch({ scope: nextScope });
    },
    [companies, performSearch, groupsAllMode, groupAllMode],
  );

  onPrepareCompanySelectRef.current = onPrepareCompanySelect;

  const handleSwitchCompany = async (c) => {
    if (!c?.id) return;
    const nextCode = c.company_id || "";

    try {
      const { redirected } = await runMaintenanceCompanySwitch({
        companyRow: c,
        viewGroup: c.group_id ? String(c.group_id).toUpperCase().trim() : null,
        currentPath: location.pathname,
        navigate,
        updateSessionCompany,
        onStay: async () => {
          const switchedScope = resolveCaptureMaintenanceScope({
            companies,
            selectedGroup: c.group_id ? String(c.group_id).toUpperCase().trim() : null,
            companyId: Number(c.id),
            groupsAllMode,
            groupAllMode,
          });
          await performSearch({ scope: switchedScope });
          notify(t("switchedTo", { company: nextCode }), "success");
        },
      });
      if (redirected) return;
    } catch (err) {
      const msg = String(err?.message || "");
      if (msg.toLowerCase().includes("unauthorized permission category")) {
        navigate(spaPath("dashboard"), { replace: true });
        return;
      }
      notify(err.message || t("switchFailed"), "error");
    }
  };

  switchCompanyRef.current = handleSwitchCompany;
  onClearCompanyRef.current = handleClearCompany;

  const toggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const selectable = captureDataRef.current.filter(
        (row) => !(row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true),
      );
      if (prev.length === selectable.length && selectable.length > 0) return [];
      return selectable.map((row) => row.capture_id);
    });
  }, []);

  const selectableRowsCount = useMemo(
    () =>
      captureData.filter(
        (row) => !(row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true),
      ).length,
    [captureData],
  );
  const selectAll = selectedIds.length > 0 && selectedIds.length === selectableRowsCount;

  const handleDeleteClick = () => {
    if (guardWrite()) return;
    if (selectedIds.length === 0) {
      notify(t("pleaseSelectOneRecord"), "error");
      return;
    }
    setShowDeleteModal(true);
  };

  const confirmDeleteAction = async () => {
    if (guardWrite()) return;
    setShowDeleteModal(false);
    try {
      const itemsToDelete = captureData
        .filter(row => selectedIds.includes(row.capture_id))
        .map(row => ({
          capture_id: Number(row.capture_id),
          process_id: row.process_id || row.process || null,
          currency_id: row.currency_id ? Number(row.currency_id) : null
        }));

      await deleteCaptureItems({
        items: itemsToDelete,
        dateFrom,
        dateTo,
        scope: captureScope,
      });

      notify(t("deleteSuccessful"), "success");
      setConfirmDelete(false);
      setSelectedIds([]);
      await performSearch();
    } catch (err) {
      notify(err.message, "error");
    }
  };

  const tableLoading = loading || bootLoading;

  return (
    <div className="container">
      <div className="capture-maintenance-page-root">
        <CaptureMaintenanceFilters
          processes={processes}
          selectedProcess={selectedProcess}
          setSelectedProcess={setSelectedProcess}
          dateFrom={dateFrom}
          dateTo={dateTo}
          setDateFrom={setDateFrom}
          setDateTo={setDateTo}
          today={todayDmy}
          companyId={companyId}
          snapGroupIds={snapGroupIds}
          visibleCompanies={visibleCompanies}
          selectedGroup={selectedGroup}
          onGroupClick={handleGroupClick}
          onPickCompany={handlePickCompany}
          onClearCompany={handleClearCompany}
          allowClearCompany={allowClearCompany}
          onPickAllGroups={handlePickAllGroups}
          onPickAllInGroup={handlePickAllInGroup}
          groupsAllMode={groupsAllMode}
          groupAllMode={groupAllMode}
          onDelete={handleDeleteClick}
          canDelete={selectedIds.length > 0}
          confirmDelete={confirmDelete}
          setConfirmDelete={setConfirmDelete}
          m={m}
        />

        <div className="capture-maintenance-table-region">
          {listSyncing && (
            <div className="capture-maintenance-sync-track" aria-hidden>
              <div className="capture-maintenance-sync-bar" />
            </div>
          )}
          <CaptureMaintenanceTable
            key={captureDataSourceCompanyId ?? captureScopeKey ?? "no-scope"}
            data={captureData}
            listEpoch={captureListEpoch}
            rowKeyCompanyId={captureDataSourceCompanyId ?? captureScopeKey}
            loading={tableLoading}
            listSyncing={listSyncing}
            selectedIds={selectedIds}
            toggleSelect={toggleSelect}
            toggleSelectAll={toggleSelectAll}
            selectAll={selectAll}
            m={m}
          />
        </div>
      </div>

      {/* Notifications */}
      <div id="notificationContainer" className="maintenance-notification-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`maintenance-notification maintenance-notification-${toast.type} show`}>
            {toast.message}
          </div>
        ))}
      </div>
      {/* Confirm Modal */}
      <MaintenanceDeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDeleteAction}
        count={selectedIds.length}
        t={t}
      />
    </div>
  );
}
