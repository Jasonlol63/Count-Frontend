import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchCurrentUser, logoutSession } from "../lib/authApi.js";
import { getLoginIdentifier, isGroupLogin } from "../lib/loginScope.js";
import { useSyncedLoginLang, writeLoginLang } from "../lib/loginLang.js";
import { isPartnershipAuditReadOnlyLocked } from "../lib/partnershipAuditReadOnly.js";
import { useRealtimeDomain } from "../lib/realtime/useRealtimeDomain.js";
import { REALTIME_DOMAINS } from "../lib/realtime/realtimeEvents.js";
import {
  allocationRowsForSave,
  applyOwnershipRowFieldUpdate,
  calcOwnershipTotal,
  createEmptyOwnershipRow,
  fmtOwnershipPct,
  formatOwnershipSavedAt,
  getApiMessage,
  getOwnershipCurrentMonthKey,
  isApiConflict,
  isApiSuccess,
  isOwnershipHistoricalMonth,
  mapAvailableAccountsForPicker,
  mapOwnerApiRows,
  mergeEditorAccounts,
  mergeServerRowsPreservingDrafts,
  ownershipSubsidiariesInGroup,
  rebuildGroupIds,
  rowsToSavePayload,
  validateOwnershipRowsForSave,
} from "../lib/ownershipLogic.js";
import {
  batchSaveOwnership,
  fetchCompanyAvailableAccounts,
  fetchCompanyOwners,
  fetchGroupAvailableAccounts,
  fetchGroupEarnings,
  fetchGroupOwners,
  fetchOwnershipCompanies,
  linkPartner as linkPartnerApi,
  updateParentTenant,
} from "../lib/ownershipApi.js";
import { getOwnershipText, ownershipText } from "../translateFile/ownershipTranslate.js";
import { canAccessOwnership, resolveMobileLandingPath } from "../utils/mobilePermissions.js";

export function useMobileOwnership() {
  const navigate = useNavigate();
  const [lang, setLangState] = useSyncedLoginLang();
  const i18n = useMemo(() => ownershipText(lang), [lang]);
  const t = useCallback((key, params) => getOwnershipText(lang, key, params), [lang]);

  const [me, setMe] = useState(null);
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [activeTab, setActiveTab] = useState("account-ownership");
  const [allCompanies, setAllCompanies] = useState([]);
  const [toast, setToast] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(getOwnershipCurrentMonthKey);
  const [historyBanner, setHistoryBanner] = useState(null);
  const toastTimer = useRef(null);

  const [groupFilter, setGroupFilter] = useState(null);
  const [companyStates, setCompanyStates] = useState({});
  const [expandedCompanyId, setExpandedCompanyId] = useState(null);
  const [loadingCompanyId, setLoadingCompanyId] = useState(null);
  const [savingCompanyId, setSavingCompanyId] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState(() => new Set());
  const [bulkGroupSelect, setBulkGroupSelect] = useState("");

  const [geGroups, setGeGroups] = useState([]);
  const [geLoading, setGeLoading] = useState(false);
  const [geStates, setGeStates] = useState({});
  const [geExpanded, setGeExpanded] = useState(null);
  const [geLoadingGid, setGeLoadingGid] = useState(null);
  const [geSavingGid, setGeSavingGid] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const companyStatesRef = useRef(companyStates);
  const geStatesRef = useRef(geStates);
  companyStatesRef.current = companyStates;
  geStatesRef.current = geStates;

  const isHistoricalView = useMemo(
    () => isOwnershipHistoricalMonth(selectedMonth),
    [selectedMonth],
  );
  const viewOnlyMode = isPartnershipAuditReadOnlyLocked(me);
  const adminLocked = viewOnlyMode || isHistoricalView;

  const setLang = useCallback((next) => {
    setLangState(writeLoginLang(next));
  }, []);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), type === "error" ? 4000 : 2200);
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutSession();
    } finally {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  const fetchCompanies = useCallback(
    async (monthKey = getOwnershipCurrentMonthKey(), { force = false } = {}) => {
      if (!force) setLoadingList(true);
      try {
        const json = await fetchOwnershipCompanies(monthKey, { force });
        if (isApiSuccess(json)) setAllCompanies(json.data || []);
        else showToast(getApiMessage(json, t("failedToLoadCompanies")), "error");
      } catch {
        showToast(t("serverError"), "error");
      } finally {
        setLoadingList(false);
      }
    },
    [showToast, t],
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
        const user = json.data;
        if (user.needs_owner_secondary || user.needs_user_secondary) {
          navigate(user.needs_owner_secondary ? "/owner-secondary-password" : "/user-secondary-password", {
            replace: true,
          });
          return;
        }
        if (!canAccessOwnership(user)) {
          setBlocked(true);
          navigate(resolveMobileLandingPath(user), { replace: true });
          return;
        }
        setMe(user);
      } catch (error) {
        if (error?.name !== "AbortError") navigate("/login", { replace: true });
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [navigate]);

  useEffect(() => {
    if (!me) return;
    void fetchCompanies(selectedMonth);
  }, [me, fetchCompanies, selectedMonth]);

  useRealtimeDomain(REALTIME_DOMAINS.OWNERSHIP, () => {
    void fetchCompanies(selectedMonth, { force: true });
  }, { enabled: !!me });

  const allGroupIds = useMemo(() => rebuildGroupIds(allCompanies), [allCompanies]);

  const companiesData = useMemo(() => {
    if (groupFilter !== null) return ownershipSubsidiariesInGroup(allCompanies, groupFilter);
    const independent = allCompanies.filter((c) => !c.group_id);
    if (independent.length > 0) return independent;
    if (allGroupIds.length === 0) return independent;
    return ownershipSubsidiariesInGroup(allCompanies, allGroupIds[0]);
  }, [allCompanies, groupFilter, allGroupIds]);

  useEffect(() => {
    setSelectedCompanyIds(new Set());
    setSelectionMode(false);
  }, [groupFilter]);

  useEffect(() => {
    setCompanyStates({});
    setExpandedCompanyId(null);
    setGeStates({});
    setGeExpanded(null);
    setHistoryBanner(null);
  }, [selectedMonth]);

  useEffect(() => {
    if (groupFilter !== null) return;
    const independent = allCompanies.filter((c) => !c.group_id);
    if (independent.length > 0 || allGroupIds.length === 0) return;
    if (isGroupLogin(me)) {
      const loginG = getLoginIdentifier(me);
      if (loginG && allGroupIds.includes(loginG)) {
        setGroupFilter(loginG);
        return;
      }
    }
    setGroupFilter(allGroupIds[0]);
  }, [groupFilter, allCompanies, allGroupIds, me]);

  useEffect(() => {
    if (groupFilter === null || allGroupIds.includes(groupFilter)) return;
    setGroupFilter(allGroupIds.length > 0 ? allGroupIds[0] : null);
  }, [groupFilter, allGroupIds]);

  const loadCompanyState = useCallback(
    async (cid, { force = false, preserveDrafts = false } = {}) => {
      if (!force && companyStatesRef.current[cid]) return companyStatesRef.current[cid];
      const draftRows = preserveDrafts ? companyStatesRef.current[cid]?.rows || null : null;
      setLoadingCompanyId(cid);
      try {
        const [aRes, oRes] = await Promise.all([
          fetchCompanyAvailableAccounts(cid, selectedMonth, isHistoricalView),
          fetchCompanyOwners(cid, selectedMonth, isHistoricalView),
        ]);
        // No synthetic "Group Equity" picker row any more — desktop's Spring-era
        // useCompanyOwnership.js dropped this (the available-accounts endpoint doesn't
        // return one either), so a company row can no longer allocate a share directly
        // to "the group" as a pseudo-account from this screen.
        const accounts = mapAvailableAccountsForPicker(isApiSuccess(aRes) ? aRes.data : []);
        let rows = mapOwnerApiRows(isApiSuccess(oRes) ? oRes.data : []);
        if (preserveDrafts && draftRows) rows = mergeServerRowsPreservingDrafts(draftRows, rows);
        const meta = oRes?.meta || {};
        if (isHistoricalView) {
          setHistoryBanner({
            empty: meta.has_snapshot === false,
            savedAt: formatOwnershipSavedAt(meta.saved_at, lang),
          });
        } else {
          setHistoryBanner(null);
        }
        const nextState = { accounts: mergeEditorAccounts(accounts, rows), rows };
        setCompanyStates((prev) => ({ ...prev, [cid]: nextState }));
        return nextState;
      } catch {
        showToast(t("errorLoadingData"), "error");
        return null;
      } finally {
        setLoadingCompanyId(null);
      }
    },
    [allCompanies, isHistoricalView, lang, selectedMonth, showToast, t],
  );

  const openCompany = useCallback(
    async (cid) => {
      setExpandedCompanyId(cid);
      await loadCompanyState(cid);
    },
    [loadCompanyState],
  );

  const closeCompany = useCallback(() => {
    setExpandedCompanyId(null);
    if (isHistoricalView) setHistoryBanner(null);
  }, [isHistoricalView]);

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
      if (viewOnlyMode) return showToast(t("readOnlyModifyBlocked"), "error");
      setCompanyStates((prev) => {
        const st = prev[cid];
        if (!st) return prev;
        return { ...prev, [cid]: { ...st, rows: [...st.rows, createEmptyOwnershipRow()] } };
      });
    },
    [showToast, t, viewOnlyMode],
  );

  // Spring `batch-save-ownership` always fully replaces a tenant's row set on Confirm, so
  // removing a row here only needs to update local state — Confirm persists the new set
  // (matches desktop's useCompanyOwnership.js; the old immediate `remove_owner_api.php`
  // call is gone, there is no equivalent single-row-delete endpoint any more).
  const removeRow = useCallback(
    (cid, idx) => {
      if (viewOnlyMode) return showToast(t("readOnlyModifyBlocked"), "error");
      setCompanyStates((prev) => {
        const cur = prev[cid];
        if (!cur) return prev;
        const rows = [...cur.rows];
        rows.splice(idx, 1);
        return { ...prev, [cid]: { ...cur, rows } };
      });
    },
    [showToast, t, viewOnlyMode],
  );

  const linkPartner = useCallback(
    async (cid, loginId, forceType = "") => {
      if (adminLocked) {
        showToast(t("readOnlyModifyBlocked"), "error");
        return false;
      }
      try {
        const json = await linkPartnerApi({ tenantId: cid, loginId, forceType });
        if (isApiSuccess(json)) {
          showToast(getApiMessage(json, t("partnerLinkedSuccessfully")));
          await loadCompanyState(cid, { force: true, preserveDrafts: true });
          return true;
        }
        if (isApiConflict(json)) {
          setConflict({ scope: "company", companyId: cid, loginId, data: json.data });
          return false;
        }
        showToast(getApiMessage(json, t("linkPartnerFailed")), "error");
        return false;
      } catch {
        showToast(t("serverError"), "error");
        return false;
      }
    },
    [adminLocked, loadCompanyState, showToast, t],
  );

  const confirmCompany = useCallback(
    async (cid) => {
      if (viewOnlyMode) return showToast(t("readOnlyModifyBlocked"), "error");
      const st = companyStatesRef.current[cid];
      if (!st) return false;
      const err = validateOwnershipRowsForSave(st.rows, {
        emptyAccount: t("pleaseSelectAccountAllRows"),
        over100: t("totalPercentageExceeds"),
        duplicate: t("duplicateAccountsDetected"),
      });
      if (err) {
        showToast(err, "error");
        return false;
      }
      const total = calcOwnershipTotal(allocationRowsForSave(st.rows));
      setSavingCompanyId(cid);
      try {
        const json = await batchSaveOwnership({
          tenantId: cid,
          owners: rowsToSavePayload(st.rows),
          month: isHistoricalView ? selectedMonth : undefined,
        });
        if (isApiSuccess(json)) {
          showToast(getApiMessage(json, t("savedSuccessfully")));
          if (!isHistoricalView) {
            setAllCompanies((prev) =>
              prev.map((c) => (Number(c.id) === cid ? { ...c, allocated_percentage: total } : c)),
            );
          }
          await loadCompanyState(cid, { force: true });
          setExpandedCompanyId(null);
          return true;
        }
        showToast(getApiMessage(json, t("saveFailed")), "error");
        return false;
      } catch {
        showToast(t("serverError"), "error");
        return false;
      } finally {
        setSavingCompanyId(null);
      }
    },
    [isHistoricalView, loadCompanyState, selectedMonth, showToast, t, viewOnlyMode],
  );

  const patchCompaniesGroup = useCallback((patches) => {
    setAllCompanies((prev) =>
      prev.map((c) => {
        const id = Number(c.id);
        if (!patches.has(id)) return c;
        return { ...c, group_id: patches.get(id) || null };
      }),
    );
  }, []);

  const clearCompanyEditorState = useCallback((companyIds) => {
    const idSet = new Set((companyIds || []).map((id) => Number(id)));
    setCompanyStates((prev) => {
      const next = { ...prev };
      idSet.forEach((id) => {
        delete next[id];
      });
      return next;
    });
    setExpandedCompanyId((cur) => (cur != null && idSet.has(Number(cur)) ? null : cur));
  }, []);

  const joinGroup = useCallback(
    async (cid, gid, companyName) => {
      if (adminLocked) return showToast(t("readOnlyModifyBlocked"), "error");
      try {
        const json = await updateParentTenant({ tenantId: cid, parentCode: gid });
        if (isApiSuccess(json)) {
          showToast(t("joinedGroup", { company: companyName, group: gid }));
          patchCompaniesGroup(new Map([[Number(cid), gid]]));
          clearCompanyEditorState([cid]);
          if (groupFilter === null) setGroupFilter(gid);
          await fetchCompanies(selectedMonth, { force: true });
        } else showToast(getApiMessage(json, t("joinGroupFailed")), "error");
      } catch {
        showToast(t("serverError"), "error");
      }
    },
    [adminLocked, clearCompanyEditorState, fetchCompanies, groupFilter, patchCompaniesGroup, selectedMonth, showToast, t],
  );

  const ungroupCompany = useCallback(
    async (cid, companyName) => {
      if (adminLocked) return showToast(t("readOnlyModifyBlocked"), "error");
      try {
        const json = await updateParentTenant({ tenantId: cid, parentCode: null });
        if (isApiSuccess(json)) {
          showToast(t("removedFromGroup", { company: companyName }));
          patchCompaniesGroup(new Map([[Number(cid), null]]));
          clearCompanyEditorState([cid]);
          await fetchCompanies(selectedMonth, { force: true });
        } else showToast(getApiMessage(json, t("ungroupFailed")), "error");
      } catch {
        showToast(t("serverError"), "error");
      }
    },
    [adminLocked, clearCompanyEditorState, fetchCompanies, patchCompaniesGroup, selectedMonth, showToast, t],
  );

  const toggleSelectionMode = useCallback(() => {
    if (adminLocked) return showToast(t("readOnlyModifyBlocked"), "error");
    setSelectionMode((prev) => !prev);
    setSelectedCompanyIds(new Set());
  }, [adminLocked, showToast, t]);

  const enterSelectionWith = useCallback(
    (comp) => {
      if (adminLocked) return showToast(t("readOnlyModifyBlocked"), "error");
      setSelectionMode(true);
      const id = Number(comp.id);
      const gid = comp.group_id || null;
      const selectable = allGroupIds.length > 0 && (!gid || groupFilter !== null);
      if (!selectable) {
        setSelectedCompanyIds(new Set());
        return;
      }
      setSelectedCompanyIds(new Set([id]));
    },
    [adminLocked, allGroupIds.length, groupFilter, showToast, t],
  );

  const toggleCompanySelect = useCallback(
    (comp) => {
      if (!selectionMode) return;
      const id = Number(comp.id);
      const gid = comp.group_id || null;
      const selectable = allGroupIds.length > 0 && (!gid || groupFilter !== null);
      if (!selectable) return;
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
      if (adminLocked) return showToast(t("readOnlyModifyBlocked"), "error");
      if (!gid) {
        showToast(t("pleaseSelectGroup"), "error");
        return;
      }
      try {
        const ids = Array.from(selectedCompanyIds);
        const results = await Promise.all(
          ids.map((cid) => updateParentTenant({ tenantId: cid, parentCode: gid })),
        );
        const failed = results.filter((r) => !isApiSuccess(r));
        if (failed.length === 0) {
          showToast(t("addedCompaniesToGroup", { count: selectedCompanyIds.size, group: gid }));
          patchCompaniesGroup(new Map(ids.map((cid) => [Number(cid), gid])));
          clearCompanyEditorState(ids);
          setSelectedCompanyIds(new Set());
          setSelectionMode(false);
          if (groupFilter === null) setGroupFilter(gid);
          await fetchCompanies(selectedMonth, { force: true });
        } else {
          showToast(t("succeededFailed", { ok: ids.length - failed.length, failed: failed.length }), "error");
        }
      } catch {
        showToast(t("serverError"), "error");
      }
    },
    [adminLocked, clearCompanyEditorState, fetchCompanies, groupFilter, patchCompaniesGroup, selectedCompanyIds, selectedMonth, showToast, t],
  );

  const bulkUngroup = useCallback(async () => {
    if (adminLocked) return showToast(t("readOnlyModifyBlocked"), "error");
    try {
      const ids = Array.from(selectedCompanyIds);
      const results = await Promise.all(
        ids.map((cid) => updateParentTenant({ tenantId: cid, parentCode: null })),
      );
      const failed = results.filter((r) => !isApiSuccess(r));
      if (failed.length === 0) {
        showToast(t("removedCompaniesFromGroup", { count: selectedCompanyIds.size }));
        patchCompaniesGroup(new Map(ids.map((cid) => [Number(cid), null])));
        clearCompanyEditorState(ids);
        setSelectedCompanyIds(new Set());
        setSelectionMode(false);
        await fetchCompanies(selectedMonth, { force: true });
      } else {
        showToast(t("succeededFailed", { ok: ids.length - failed.length, failed: failed.length }), "error");
      }
    } catch {
      showToast(t("serverError"), "error");
    }
  }, [adminLocked, clearCompanyEditorState, fetchCompanies, patchCompaniesGroup, selectedCompanyIds, selectedMonth, showToast, t]);

  const loadGeGroups = useCallback(async () => {
    setGeLoading(true);
    try {
      const json = await fetchGroupEarnings(selectedMonth, isHistoricalView);
      if (isApiSuccess(json)) setGeGroups(json.data || []);
      else showToast(getApiMessage(json, t("failedToLoadGroups")), "error");
    } catch {
      showToast(t("serverError"), "error");
    } finally {
      setGeLoading(false);
    }
  }, [isHistoricalView, selectedMonth, showToast, t]);

  useEffect(() => {
    if (activeTab === "group-earnings" && me) void loadGeGroups();
  }, [activeTab, loadGeGroups, me, selectedMonth]);

  const loadGroupState = useCallback(
    async (gid, { force = false, preserveDrafts = false } = {}) => {
      if (!force && geStatesRef.current[gid]) return geStatesRef.current[gid];
      const draftRows = preserveDrafts ? geStatesRef.current[gid]?.rows || null : null;
      setGeLoadingGid(gid);
      try {
        const [aRes, oRes] = await Promise.all([
          fetchGroupAvailableAccounts(gid, selectedMonth, isHistoricalView),
          fetchGroupOwners(gid, selectedMonth, isHistoricalView),
        ]);
        const meta = oRes?.meta || {};
        if (isHistoricalView) {
          setHistoryBanner({
            empty: meta.has_snapshot === false,
            savedAt: formatOwnershipSavedAt(meta.saved_at, lang),
          });
        } else {
          setHistoryBanner(null);
        }
        let rows = mapOwnerApiRows(isApiSuccess(oRes) ? oRes.data : []);
        if (preserveDrafts && draftRows) rows = mergeServerRowsPreservingDrafts(draftRows, rows);
        const pickerAccounts = mapAvailableAccountsForPicker(isApiSuccess(aRes) ? aRes.data : []);
        const nextState = { accounts: mergeEditorAccounts(pickerAccounts, rows), rows };
        setGeStates((prev) => ({ ...prev, [gid]: nextState }));
        return nextState;
      } catch {
        showToast(t("errorLoadingGroupData"), "error");
        return null;
      } finally {
        setGeLoadingGid(null);
      }
    },
    [isHistoricalView, lang, selectedMonth, showToast, t],
  );

  const openGroup = useCallback(
    async (gid) => {
      setGeExpanded(gid);
      await loadGroupState(gid);
    },
    [loadGroupState],
  );

  const closeGroup = useCallback(() => {
    setGeExpanded(null);
    setHistoryBanner(null);
  }, []);

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
      if (viewOnlyMode) return showToast(t("readOnlyModifyBlocked"), "error");
      setGeStates((prev) => {
        const st = prev[gid];
        if (!st) return prev;
        return { ...prev, [gid]: { ...st, rows: [...st.rows, createEmptyOwnershipRow()] } };
      });
    },
    [showToast, t, viewOnlyMode],
  );

  // Same "local only, Confirm does the full replace" semantics as removeRow above.
  const geRemoveRow = useCallback(
    (gid, idx) => {
      if (viewOnlyMode) return showToast(t("readOnlyModifyBlocked"), "error");
      setGeStates((prev) => {
        const cur = prev[gid];
        if (!cur) return prev;
        const rows = [...cur.rows];
        rows.splice(idx, 1);
        return { ...prev, [gid]: { ...cur, rows } };
      });
    },
    [showToast, t, viewOnlyMode],
  );

  const geConfirm = useCallback(
    async (groupId) => {
      if (viewOnlyMode) return showToast(t("readOnlyModifyBlocked"), "error");
      const st = geStatesRef.current[groupId];
      if (!st) return false;
      const err = validateOwnershipRowsForSave(st.rows, {
        emptyAccount: t("pleaseSelectAccount"),
        over100: t("totalPercentageExceeds"),
        duplicate: t("duplicateAccountsDetected"),
      });
      if (err) {
        showToast(err, "error");
        return false;
      }
      const total = calcOwnershipTotal(allocationRowsForSave(st.rows));
      setGeSavingGid(groupId);
      try {
        const json = await batchSaveOwnership({
          tenantId: groupId,
          owners: rowsToSavePayload(st.rows),
          month: isHistoricalView ? selectedMonth : undefined,
        });
        if (isApiSuccess(json)) {
          showToast(getApiMessage(json, t("groupSavedSuccessfully")));
          if (!isHistoricalView) {
            setGeGroups((g) =>
              g.map((x) => (x.group_id === groupId ? { ...x, allocated_percentage: total } : x)),
            );
          }
          await loadGroupState(groupId, { force: true });
          setGeExpanded(null);
          return true;
        }
        showToast(getApiMessage(json, t("saveFailed")), "error");
        return false;
      } catch {
        showToast(t("serverError"), "error");
        return false;
      } finally {
        setGeSavingGid(null);
      }
    },
    [isHistoricalView, loadGroupState, selectedMonth, showToast, t, viewOnlyMode],
  );

  const geLinkPartner = useCallback(
    async (groupId, loginId, forceType = "") => {
      if (adminLocked) {
        showToast(t("readOnlyModifyBlocked"), "error");
        return false;
      }
      try {
        const json = await linkPartnerApi({ tenantId: groupId, loginId, forceType });
        if (isApiSuccess(json)) {
          showToast(getApiMessage(json, t("partnerLinkedSuccessfully")));
          await loadGroupState(groupId, { force: true, preserveDrafts: true });
          return true;
        }
        if (isApiConflict(json)) {
          setConflict({ scope: "group", groupId, loginId, data: json.data });
          return false;
        }
        showToast(getApiMessage(json, t("linkPartnerFailed")), "error");
        return false;
      } catch {
        showToast(t("serverError"), "error");
        return false;
      }
    },
    [adminLocked, loadGroupState, showToast, t],
  );

  const resolveConflict = useCallback(
    async (type) => {
      const c = conflict;
      setConflict(null);
      if (!c) return;
      if (c.scope === "group") await geLinkPartner(c.groupId, c.loginId, type);
      else await linkPartner(c.companyId, c.loginId, type);
    },
    [conflict, geLinkPartner, linkPartner],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchCompanies(selectedMonth, { force: true });
      if (activeTab === "group-earnings") await loadGeGroups();
    } finally {
      setRefreshing(false);
    }
  }, [activeTab, fetchCompanies, loadGeGroups, selectedMonth]);

  const companyCode = String(me?.company_code || me?.company_id || "").toUpperCase();
  const groupId = String(me?.login_group_id || me?.login_identifier || "").toUpperCase();

  return {
    i18n,
    t,
    lang,
    setLang,
    me,
    companyCode,
    groupId,
    blocked,
    loading,
    refreshing,
    refresh,
    loadingList,
    logout,
    toast,
    conflict,
    setConflict,
    resolveConflict,
    activeTab,
    setActiveTab,
    selectedMonth,
    setSelectedMonth,
    isHistoricalView,
    historyBanner,
    viewOnlyMode,
    adminLocked,
    allCompanies,
    allGroupIds,
    groupFilter,
    setGroupFilter,
    companiesData,
    companyStates,
    expandedCompanyId,
    loadingCompanyId,
    savingCompanyId,
    selectionMode,
    selectedCompanyIds,
    bulkGroupSelect,
    setBulkGroupSelect,
    openCompany,
    closeCompany,
    updateRow,
    addRow,
    removeRow,
    linkPartner,
    confirmCompany,
    joinGroup,
    ungroupCompany,
    toggleSelectionMode,
    enterSelectionWith,
    toggleCompanySelect,
    bulkJoin,
    bulkUngroup,
    geGroups,
    geLoading,
    geStates,
    geExpanded,
    geLoadingGid,
    geSavingGid,
    openGroup,
    closeGroup,
    geUpdateRow,
    geAddRow,
    geRemoveRow,
    geConfirm,
    geLinkPartner,
    calcTotal: calcOwnershipTotal,
    fmtPct: fmtOwnershipPct,
    fetchCompanies,
  };
}
