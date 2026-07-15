import { useCallback, useEffect, useState } from "react";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { getApiMessage, isApiConflict, isApiSuccess } from "../shared/ownershipHelpers.js";
import { formatOwnershipSavedAt } from "../shared/ownershipMonthHelpers.js";
import {
  applyOwnershipRowFieldUpdate,
  calcOwnershipTotal,
  createEmptyOwnershipRow,
  EMPTY_OWNERSHIP_ROW,
  fmtOwnershipPct,
  validateOwnershipRowsForSave,
  mapOwnerApiRows,
  accountsFromOwnerRows,
  mergeEditorAccounts,
  rowsToSavePayload,
  allocationRowsForSave,
} from "../shared/ownershipRowHelpers.js";

export function useGroupEarnings(shell) {
  const {
    activeTab,
    showToast,
    readOnlyMode,
    selectedMonth,
    isHistoricalView,
    setHistoryBanner,
    setConflict,
    lang,
  } = shell;

  const viewOnlyMode = readOnlyMode;
  const adminLocked = readOnlyMode || isHistoricalView;

  const [geGroups, setGeGroups] = useState([]);
  const [geLoading, setGeLoading] = useState(false);
  const [geStates, setGeStates] = useState({});
  const [geExpanded, setGeExpanded] = useState(null);
  const [geLoadingGid, setGeLoadingGid] = useState(null);
  const [geSavingGid, setGeSavingGid] = useState(null);

  useEffect(() => {
    setGeStates({});
    setGeExpanded(null);
    setHistoryBanner(null);
  }, [selectedMonth, setHistoryBanner]);

  const loadGeGroups = useCallback(async () => {
    setGeLoading(true);
    try {
      const monthQs = isHistoricalView
        ? `?month=${encodeURIComponent(selectedMonth)}`
        : "";
      const res = await fetch(buildApiUrl(`api/ownership/get_group_earnings_api.php${monthQs}`), {
        credentials: "include",
      });
      const json = await res.json();
      if (isApiSuccess(json)) setGeGroups(json.data || []);
      else showToast(getApiMessage(json, "Failed to load groups"), "error");
    } catch {
      showToast("Server error", "error");
    } finally {
      setGeLoading(false);
    }
  }, [showToast, isHistoricalView, selectedMonth]);

  useEffect(() => {
    if (activeTab === "group-earnings") void loadGeGroups();
  }, [activeTab, loadGeGroups, selectedMonth]);

  useEffect(() => {
    if (!isHistoricalView || geGroups.length === 0 || activeTab !== "group-earnings") return undefined;
    let cancelled = false;
    (async () => {
      try {
        const pairs = await Promise.all(
          geGroups.map(async (grp) => {
            const gid = grp.group_id;
            const url = `api/ownership/get_group_owners_api.php?group_id=${encodeURIComponent(gid)}&month=${encodeURIComponent(selectedMonth)}`;
            const oRes = await fetch(buildApiUrl(url), { credentials: "include" }).then((r) => r.json());
            return { gid, oRes };
          }),
        );
        if (cancelled) return;
        const next = {};
        let bannerSet = false;
        for (const { gid, oRes } of pairs) {
          if (!isApiSuccess(oRes)) continue;
          const rows = mapOwnerApiRows(oRes.data);
          next[gid] = { accounts: accountsFromOwnerRows(rows), rows };
          if (!bannerSet) {
            const meta = oRes.meta || {};
            setHistoryBanner({
              empty: meta.has_snapshot === false,
              savedAt: formatOwnershipSavedAt(meta.saved_at, lang),
            });
            bannerSet = true;
          }
        }
        setGeStates(next);
      } catch {
        if (!cancelled) showToast("Error loading group data", "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, selectedMonth, isHistoricalView, geGroups, lang, setHistoryBanner, showToast]);

  const loadGroupState = useCallback(
    async (gid, { force = false } = {}) => {
      if (!force) {
        let cached = null;
        setGeStates((prev) => {
          if (prev[gid]) cached = prev[gid];
          return prev;
        });
        if (cached) return cached;
      }

      setGeLoadingGid(gid);
      try {
        const ownersUrl = isHistoricalView
          ? `api/ownership/get_group_owners_api.php?group_id=${encodeURIComponent(gid)}&month=${encodeURIComponent(selectedMonth)}`
          : `api/ownership/get_group_owners_api.php?group_id=${encodeURIComponent(gid)}`;
        const [aRes, oRes] = await Promise.all([
          fetch(
            buildApiUrl(
              `api/ownership/get_group_available_accounts_api.php?group_id=${encodeURIComponent(gid)}`,
            ),
            { credentials: "include" },
          ).then((r) => r.json()),
          fetch(buildApiUrl(ownersUrl), { credentials: "include" }).then((r) => r.json()),
        ]);
        const meta = oRes.meta || {};
        if (isHistoricalView) {
          setHistoryBanner({
            empty: meta.has_snapshot === false,
            savedAt: formatOwnershipSavedAt(meta.saved_at, lang),
          });
        } else {
          setHistoryBanner(null);
        }
        const rows = mapOwnerApiRows(oRes.status === "success" ? oRes.data : []);
        const pickerAccounts = aRes.status === "success" ? aRes.data : [];
        const stateAccounts = mergeEditorAccounts(pickerAccounts, rows);
        const nextState = { accounts: stateAccounts, rows };
        setGeStates((prev) => ({
          ...prev,
          [gid]: nextState,
        }));
        return nextState;
      } catch {
        showToast("Error loading group data", "error");
        return null;
      } finally {
        setGeLoadingGid(null);
      }
    },
    [isHistoricalView, selectedMonth, setHistoryBanner, lang, showToast],
  );

  const geToggle = useCallback(
    async (gid) => {
      if (geExpanded === gid) {
        setGeExpanded(null);
        setHistoryBanner(null);
        return;
      }
      setGeExpanded(gid);
      await loadGroupState(gid);
    },
    [geExpanded, loadGroupState, setHistoryBanner],
  );

  const geUpdateRow = useCallback((gid, idx, field, val) => {
    setGeStates((prev) => {
      const st = prev[gid];
      if (!st) return prev;
      const rows = [...st.rows];
      rows[idx] = applyOwnershipRowFieldUpdate(rows[idx], field, val, st.accounts, rows, idx);
      return { ...prev, [gid]: { ...st, rows } };
    });
  }, []);

  const geAddRow = useCallback(
    (gid) => {
      if (readOnlyMode) return showToast("Read-only: only owner can modify ownership", "error");
      setGeStates((prev) => {
        const st = prev[gid];
        if (!st) return prev;
        return {
          ...prev,
          [gid]: { ...st, rows: [...st.rows, createEmptyOwnershipRow()] },
        };
      });
    },
    [readOnlyMode, showToast],
  );

  const geRemoveRow = useCallback(
    async (gid, idx) => {
      if (readOnlyMode) return showToast("Read-only: only owner can modify ownership", "error");
      const st = geStates[gid];
      if (!st) return;
      const row = st.rows[idx];
      if (row?.ownership_id && !isHistoricalView) {
        try {
          const body = new FormData();
          body.append("ownership_id", String(row.ownership_id));
          const res = await fetch(buildApiUrl("api/ownership/remove_owner_api.php"), {
            method: "POST",
            credentials: "include",
            body,
          });
          const json = await res.json();
          if (!isApiSuccess(json)) {
            showToast(getApiMessage(json, "Remove failed"), "error");
            return;
          }
        } catch {
          showToast("Server error", "error");
          return;
        }
      }
      setGeStates((prev) => {
        const cur = prev[gid];
        if (!cur) return prev;
        const rows = [...cur.rows];
        rows.splice(idx, 1);
        return { ...prev, [gid]: { ...cur, rows } };
      });
    },
    [geStates, readOnlyMode, isHistoricalView, showToast],
  );

  const geConfirm = useCallback(
    async (groupId) => {
      if (readOnlyMode) return showToast("Read-only: only owner can modify ownership", "error");
      const st = geStates[groupId];
      if (!st) return;
      const { rows } = st;
      const err = validateOwnershipRowsForSave(rows, {
        emptyAccount: "Please select an account.",
        over100: "Total percentage exceeds 100%",
        duplicate: "Duplicate accounts detected.",
      });
      if (err) {
        showToast(err, "error");
        return;
      }
      const total = calcOwnershipTotal(allocationRowsForSave(rows));
      setGeSavingGid(groupId);
      try {
        const payload = {
          group_id: groupId,
          owners: rowsToSavePayload(rows),
        };
        if (isHistoricalView) payload.month = selectedMonth;
        const res = await fetch(buildApiUrl("api/ownership/batch_save_group_owners_api.php"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (isApiSuccess(json)) {
          showToast(getApiMessage(json, "Group ownership saved successfully"), "success");
          if (!isHistoricalView) {
            setGeGroups((g) =>
              g.map((x) => (x.group_id === groupId ? { ...x, allocated_percentage: total } : x)),
            );
          }
          await loadGroupState(groupId, { force: true });
          setGeExpanded(null);
        } else showToast(getApiMessage(json, "Save failed"), "error");
      } catch {
        showToast("Server error", "error");
      } finally {
        setGeSavingGid(null);
      }
    },
    [geStates, readOnlyMode, isHistoricalView, selectedMonth, showToast, loadGroupState],
  );

  const geLinkPartner = useCallback(
    async (groupId, loginId, forceType = "") => {
      if (adminLocked) {
        showToast("Read-only: only owner can modify ownership", "error");
        return false;
      }
      try {
        const res = await fetch(buildApiUrl("api/ownership/add_group_external_partner_api.php"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ group_id: groupId, login_id: loginId, force_type: forceType }),
        });
        const json = await res.json();
        if (isApiSuccess(json)) {
          showToast(getApiMessage(json, "Partner linked successfully"), "success");
          await loadGroupState(groupId, { force: true });
          return true;
        }
        if (isApiConflict(json)) {
          setConflict({ scope: "group", groupId, loginId, data: json.data });
          return false;
        }
        showToast(getApiMessage(json, "Link partner failed"), "error");
        return false;
      } catch {
        showToast("Server error", "error");
        return false;
      }
    },
    [loadGroupState, adminLocked, setConflict, showToast],
  );

  return {
    geGroups,
    geLoading,
    geStates,
    geExpanded,
    setGeExpanded,
    geLoadingGid,
    geSavingGid,
    calcTotal: calcOwnershipTotal,
    fmtPct: fmtOwnershipPct,
    viewOnlyMode,
    adminLocked,
    isHistoricalView,
    geToggle,
    geUpdateRow,
    geAddRow,
    geRemoveRow,
    geConfirm,
    geLinkPartner,
  };
}
