import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { getApiMessage, isApiConflict, isApiSuccess, ownershipSubsidiariesInGroup, rebuildGroupIds } from "../shared/ownershipHelpers.js";
import { formatOwnershipSavedAt } from "../shared/ownershipMonthHelpers.js";
import {
  applyOwnershipRowFieldUpdate,
  calcOwnershipTotal,
  createEmptyOwnershipRow,
  EMPTY_OWNERSHIP_ROW,
  fmtOwnershipPct,
  reorderOwnershipRows,
  validateOwnershipRowsForSave,
  mapOwnerApiRows,
  accountsFromOwnerRows,
  mergeEditorAccounts,
  rowsToSavePayload,
  allocationRowsForSave,
} from "../shared/ownershipRowHelpers.js";

export function useCompanyOwnership(shell) {
  const {
    activeTab,
    allCompanies,
    setAllCompanies,
    fetchCompanies,
    showToast,
    readOnlyMode,
    setConflict,
    selectedMonth,
    isHistoricalView,
    setHistoryBanner,
    lang,
  } = shell;

  const viewOnlyMode = readOnlyMode;
  const adminLocked = readOnlyMode || isHistoricalView;

  const [groupFilter, setGroupFilter] = useState(null);
  const [companyStates, setCompanyStates] = useState({});
  const [expandedCompanyId, setExpandedCompanyId] = useState(null);
  const [loadingCompanyId, setLoadingCompanyId] = useState(null);
  const [savingCompanyId, setSavingCompanyId] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState(new Set());
  const [bulkGroupSelect, setBulkGroupSelect] = useState("");
  const [openGroupForCompanyId, setOpenGroupForCompanyId] = useState(null);
  const dragRef = useRef({ companyId: null, idx: null });

  useEffect(() => {
    const onDoc = (e) => {
      if (!e.target.closest?.(".own-group-btn-wrap")) setOpenGroupForCompanyId(null);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  useEffect(() => {
    setSelectedCompanyIds(new Set());
    setSelectionMode(false);
  }, [groupFilter]);

  useEffect(() => {
    setCompanyStates({});
    setExpandedCompanyId(null);
    setHistoryBanner(null);
  }, [selectedMonth, setHistoryBanner]);

  const allGroupIds = useMemo(() => rebuildGroupIds(allCompanies), [allCompanies]);

  const companiesData = useMemo(() => {
    if (groupFilter !== null) {
      return ownershipSubsidiariesInGroup(allCompanies, groupFilter);
    }
    const independent = allCompanies.filter((c) => !c.group_id);
    if (independent.length > 0) return independent;
    if (allGroupIds.length === 0) return independent;
    const firstGroup = allGroupIds[0];
    return ownershipSubsidiariesInGroup(allCompanies, firstGroup);
  }, [allCompanies, groupFilter, allGroupIds]);

  useEffect(() => {
    if (activeTab !== "account-ownership" || !isHistoricalView || companiesData.length === 0) {
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const pairs = await Promise.all(
          companiesData.map(async (c) => {
            const cid = Number(c.id);
            const url = `api/ownership/get_owners_api.php?company_id=${cid}&month=${encodeURIComponent(selectedMonth)}`;
            const oRes = await fetch(buildApiUrl(url), { credentials: "include" }).then((r) => r.json());
            return { cid, oRes };
          }),
        );
        if (cancelled) return;
        const next = {};
        let bannerSet = false;
        for (const { cid, oRes } of pairs) {
          if (!isApiSuccess(oRes)) continue;
          const rows = mapOwnerApiRows(oRes.data);
          next[cid] = { accounts: accountsFromOwnerRows(rows), rows };
          if (!bannerSet) {
            const meta = oRes.meta || {};
            setHistoryBanner({
              empty: meta.has_snapshot === false,
              savedAt: formatOwnershipSavedAt(meta.saved_at, lang),
            });
            bannerSet = true;
          }
        }
        setCompanyStates(next);
      } catch {
        if (!cancelled) showToast("Error loading data", "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, selectedMonth, isHistoricalView, companiesData, lang, setHistoryBanner, showToast]);

  useEffect(() => {
    if (groupFilter !== null) return;
    const independent = allCompanies.filter((c) => !c.group_id);
    if (independent.length > 0 || allGroupIds.length === 0) return;
    setGroupFilter(allGroupIds[0]);
  }, [groupFilter, allCompanies, allGroupIds]);

  const loadCompanyState = useCallback(
    async (cid, { force = false } = {}) => {
      if (!force) {
        let cached = null;
        setCompanyStates((prev) => {
          if (prev[cid]) cached = prev[cid];
          return prev;
        });
        if (cached) return cached;
      }

      setLoadingCompanyId(cid);
      try {
        const compData = allCompanies.find((c) => Number(c.id) === cid);
        const compGid = compData?.group_id || "";
        const ownersUrl = isHistoricalView
          ? `api/ownership/get_owners_api.php?company_id=${cid}&month=${encodeURIComponent(selectedMonth)}`
          : `api/ownership/get_owners_api.php?company_id=${cid}`;
        const [aRes, oRes] = await Promise.all([
          fetch(buildApiUrl(`api/ownership/get_available_accounts_api.php?company_id=${cid}`), {
            credentials: "include",
          }).then((r) => r.json()),
          fetch(buildApiUrl(ownersUrl), {
            credentials: "include",
          }).then((r) => r.json()),
        ]);
        const accounts = aRes.status === "success" ? aRes.data : [];
        if (compGid && !accounts.some((a) => String(a.id) === `G_${compGid}`)) {
          accounts.push({
            id: `G_${compGid}`,
            account_name: `Group: ${compGid}`,
            name: `Group Equity`,
            role: "GROUP",
            type: "group",
            is_main_owner: 0,
          });
        }
        const rows = mapOwnerApiRows(oRes.status === "success" ? oRes.data : []);
        const stateAccounts = mergeEditorAccounts(accounts, rows);
        const meta = oRes.meta || {};
        if (isHistoricalView) {
          setHistoryBanner({
            empty: meta.has_snapshot === false,
            savedAt: formatOwnershipSavedAt(meta.saved_at, lang),
          });
        } else {
          setHistoryBanner(null);
        }
        const nextState = { accounts: stateAccounts, rows };
        setCompanyStates((prev) => ({
          ...prev,
          [cid]: nextState,
        }));
        return nextState;
      } catch {
        showToast("Error loading data", "error");
        return null;
      } finally {
        setLoadingCompanyId(null);
      }
    },
    [allCompanies, isHistoricalView, selectedMonth, setHistoryBanner, lang, showToast],
  );

  const toggleCard = useCallback(
    async (cid) => {
      if (expandedCompanyId === cid) {
        setExpandedCompanyId(null);
        if (isHistoricalView) setHistoryBanner(null);
        return;
      }
      setExpandedCompanyId(cid);
      await loadCompanyState(cid);
    },
    [expandedCompanyId, isHistoricalView, loadCompanyState, setHistoryBanner],
  );

  const updateRow = useCallback((cid, idx, field, val) => {
    setCompanyStates((prev) => {
      const st = prev[cid];
      if (!st) return prev;
      const rows = [...st.rows];
      rows[idx] = applyOwnershipRowFieldUpdate(rows[idx], field, val, st.accounts, rows, idx);
      return { ...prev, [cid]: { ...st, rows } };
    });
  }, []);

  const addRow = useCallback(
    (cid) => {
      if (readOnlyMode) return showToast("Read-only: only owner can modify ownership", "error");
      setCompanyStates((prev) => {
        const st = prev[cid];
        if (!st) return prev;
        return {
          ...prev,
          [cid]: { ...st, rows: [...st.rows, createEmptyOwnershipRow()] },
        };
      });
    },
    [readOnlyMode, showToast],
  );

  const removeRow = useCallback(
    (cid, idx) => {
      if (readOnlyMode) return showToast("Read-only: only owner can modify ownership", "error");
      setCompanyStates((prev) => {
        const cur = prev[cid];
        if (!cur) return prev;
        const rows = [...cur.rows];
        rows.splice(idx, 1);
        return { ...prev, [cid]: { ...cur, rows } };
      });
    },
    [readOnlyMode, showToast],
  );

  const reorderRows = useCallback((cid, from, to, insertAfter) => {
    setCompanyStates((prev) => {
      const st = prev[cid];
      if (!st) return prev;
      return { ...prev, [cid]: { ...st, rows: reorderOwnershipRows(st.rows, from, to, insertAfter) } };
    });
  }, []);

  const linkPartner = useCallback(
    async (cid, loginId, forceType = "") => {
      if (adminLocked) {
        showToast("Read-only: only owner can modify ownership", "error");
        return false;
      }
      try {
        const res = await fetch(buildApiUrl("api/ownership/link-partner"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ tenant_id: cid, login_id: loginId, force_type: forceType }),
        });
        const json = await res.json();
        if (isApiSuccess(json)) {
          showToast(getApiMessage(json, "Partner linked successfully"), "success");
          await loadCompanyState(cid, { force: true });
          return true;
        }
        if (isApiConflict(json)) {
          setConflict({ companyId: cid, loginId, data: json.data });
          return false;
        }
        showToast(getApiMessage(json, "Link partner failed"), "error");
        return false;
      } catch {
        showToast("Server error", "error");
        return false;
      }
    },
    [adminLocked, setConflict, showToast, loadCompanyState],
  );

  const confirmCompany = useCallback(
    async (cid) => {
      if (readOnlyMode) return showToast("Read-only: only owner can modify ownership", "error");
      const st = companyStates[cid];
      if (!st) return;
      const { rows } = st;
      const err = validateOwnershipRowsForSave(rows, {
        emptyAccount: "Please select an account for all rows.",
        over100: "Total percentage exceeds 100%",
        duplicate: "Duplicate accounts detected.",
      });
      if (err) {
        showToast(err, "error");
        return;
      }
      const total = calcOwnershipTotal(allocationRowsForSave(rows));
      setSavingCompanyId(cid);
      try {
        const payload = {
          tenant_id: cid,
          owners: rowsToSavePayload(rows),
        };
        if (isHistoricalView) payload.month = selectedMonth;
        const res = await fetch(buildApiUrl("api/ownership/batch-save-ownership"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (isApiSuccess(json)) {
          showToast(getApiMessage(json, "Saved successfully"), "success");
          if (!isHistoricalView) {
            setAllCompanies((prev) =>
              prev.map((c) => (Number(c.id) === cid ? { ...c, allocated_percentage: total } : c)),
            );
          }
          await loadCompanyState(cid, { force: true });
          setExpandedCompanyId(null);
        } else showToast(getApiMessage(json, "Save failed"), "error");
      } catch {
        showToast("Server error", "error");
      } finally {
        setSavingCompanyId(null);
      }
    },
    [companyStates, readOnlyMode, isHistoricalView, selectedMonth, setAllCompanies, showToast, loadCompanyState],
  );

  const joinGroup = useCallback(
    async (cid, gid, companyName) => {
      if (adminLocked) return showToast("Read-only: only owner can modify ownership", "error");
      try {
        const res = await fetch(buildApiUrl("api/ownership/update-parent-tenant"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ tenant_id: cid, parent_code: gid }),
        });
        const json = await res.json();
        if (isApiSuccess(json)) {
          showToast(`"${companyName}" joined group "${gid}"`, "success");
          void fetchCompanies();
        } else showToast(getApiMessage(json, "Join group failed"), "error");
      } catch {
        showToast("Server error", "error");
      }
    },
    [fetchCompanies, adminLocked, showToast],
  );

  const ungroupCompany = useCallback(
    async (cid, companyName) => {
      if (adminLocked) return showToast("Read-only: only owner can modify ownership", "error");
      try {
        const res = await fetch(buildApiUrl("api/ownership/update-parent-tenant"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ tenant_id: cid, parent_code: null }),
        });
        const json = await res.json();
        if (isApiSuccess(json)) {
          showToast(`"${companyName}" removed from group`, "success");
          void fetchCompanies();
        } else showToast(getApiMessage(json, "Ungroup failed"), "error");
      } catch {
        showToast("Server error", "error");
      }
    },
    [fetchCompanies, adminLocked, showToast],
  );

  const toggleSelectionMode = useCallback(() => {
    if (adminLocked) return showToast("Read-only: only owner can modify ownership", "error");
    setSelectionMode((prev) => !prev);
    setSelectedCompanyIds(new Set());
  }, [adminLocked, showToast]);

  const toggleCompanySelect = useCallback(
    (comp, e) => {
      if (!selectionMode) return;
      const id = Number(comp.id);
      const gid = comp.group_id || null;
      const selectable = allGroupIds.length > 0 && (!gid || groupFilter !== null);
      if (!selectable) return;
      if (e.target.closest("button, .own-group-panel")) return;
      e.stopPropagation();
      setSelectedCompanyIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [allGroupIds.length, groupFilter, selectionMode],
  );

  const bulkJoin = useCallback(
    async (gid) => {
      if (adminLocked) return showToast("Read-only: only owner can modify ownership", "error");
      if (!gid) {
        showToast("Please select a group", "error");
        return;
      }
      try {
        const ids = Array.from(selectedCompanyIds);
        const results = await Promise.all(
          ids.map((cid) =>
            fetch(buildApiUrl("api/ownership/update-parent-tenant"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ tenant_id: cid, parent_code: gid }),
            }).then((r) => r.json()),
          ),
        );
        const failed = results.filter((r) => !isApiSuccess(r));
        if (failed.length === 0) {
          showToast(`Added ${selectedCompanyIds.size} companies to ${gid}`, "success");
          setSelectedCompanyIds(new Set());
          setSelectionMode(false);
          void fetchCompanies();
        } else showToast(`${ids.length - failed.length} succeeded, ${failed.length} failed`, "error");
      } catch {
        showToast("Server error", "error");
      }
    },
    [fetchCompanies, adminLocked, selectedCompanyIds, showToast],
  );

  const bulkUngroup = useCallback(async () => {
    if (adminLocked) return showToast("Read-only: only owner can modify ownership", "error");
    try {
      const ids = Array.from(selectedCompanyIds);
      const results = await Promise.all(
        ids.map((cid) =>
          fetch(buildApiUrl("api/ownership/update-parent-tenant"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ tenant_id: cid, parent_code: null }),
          }).then((r) => r.json()),
        ),
      );
      const failed = results.filter((r) => !isApiSuccess(r));
      if (failed.length === 0) {
        showToast(`Removed ${selectedCompanyIds.size} companies from group`, "success");
        setSelectedCompanyIds(new Set());
        setSelectionMode(false);
        void fetchCompanies();
      } else showToast(`${ids.length - failed.length} succeeded, ${failed.length} failed`, "error");
    } catch {
      showToast("Server error", "error");
    }
  }, [fetchCompanies, adminLocked, selectedCompanyIds, showToast]);

  return {
    groupFilter,
    setGroupFilter,
    allGroupIds,
    companiesData,
    companyStates,
    expandedCompanyId,
    setExpandedCompanyId,
    loadingCompanyId,
    savingCompanyId,
    selectionMode,
    setSelectionMode,
    selectedCompanyIds,
    setSelectedCompanyIds,
    bulkGroupSelect,
    setBulkGroupSelect,
    openGroupForCompanyId,
    setOpenGroupForCompanyId,
    dragRef,
    calcTotal: calcOwnershipTotal,
    fmtPct: fmtOwnershipPct,
    viewOnlyMode,
    adminLocked,
    isHistoricalView,
    toggleCard,
    updateRow,
    addRow,
    removeRow,
    reorderRows,
    linkPartner,
    confirmCompany,
    joinGroup,
    ungroupCompany,
    toggleSelectionMode,
    toggleCompanySelect,
    bulkJoin,
    bulkUngroup,
  };
}
