import { useCallback, useMemo, useState } from "react";

import {
  companiesForCompanyPicker,
  DASHBOARD_GROUP_FILTER_OPT_OUT_KEY,
  dedupeOwnerCompaniesByCode,
  excludeGroupLabelsFromCompanyPicker,
  filterCompaniesWithDisplayId,
  independentCompaniesForPicker,
  isVirtualGroupLinkCompanyRow,
  notifyDashboardGroupFilterChanged,
  persistDashboardFilterState,
  persistDashboardGroupFilter,
  persistDashboardGroupsAllMode,
  persistGroupsAllSidebarGroup,
  resolveGroupsAllSidebarAnchorGroup,
  sortedUniqueGroupIds,
} from "./sharedCompanyFilter.js";
import {
  canUseGroupOnlyMode,
  getLoginIdentifier,
  isCompanyLogin,
  isGroupLogin,
} from "./loginScope.js";
import { useDashboardStyleGcFilter } from "./useDashboardStyleGcFilter.js";

/**
 * Dashboard-aligned Group / Company filters with explicit All modes.
 * - groupsAllMode: show every group (All is UI-only, never sent as group_id).
 * - groupAllMode: aggregate every company in the current group / groups-all scope.
 */
export function useGcFilterWithAllModes({
  companies,
  companyId,
  selectedGroup,
  setSelectedGroup,
  onSelectCompany,
  onPrepareCompanySelect,
  onClearCompany,
  onDeselectGroup,
  switchingCompany = false,
  preferredCompanyId = null,
  me = null,
  enableGroupAnchorSession = true,
  autoPickCompanyWhenEmpty = true,
  forceAllowGroupOnly = false,
  broadcastFilterToLayout = true,
  clearCompanyOnActiveGroupReselect = undefined,
  /** Re-click active Group closes it and picks a company (Data Capture / Transaction). */
  closeActiveGroupOnReselect = false,
  allowClearCompany: allowClearCompanyOverride = undefined,
}) {
  const [groupsAllMode, setGroupsAllMode] = useState(false);
  const [groupAllMode, setGroupAllMode] = useState(false);

  const base = useDashboardStyleGcFilter({
    companies,
    companyId,
    selectedGroup,
    setSelectedGroup,
    onSelectCompany,
    onPrepareCompanySelect,
    onClearCompany,
    onDeselectGroup,
    switchingCompany,
    preferredCompanyId,
    me,
    enableGroupAnchorSession,
    selectFirstCompanyOnGroupChange: false,
    autoPickCompanyWhenEmpty,
    forceAllowGroupOnly,
    broadcastFilterToLayout,
    clearCompanyOnActiveGroupReselect:
      clearCompanyOnActiveGroupReselect ?? !forceAllowGroupOnly,
    closeActiveGroupOnReselect,
    allowClearCompany: allowClearCompanyOverride,
  });

  const groupIds = base.groupIds;

  const groupFilterOptOut =
    typeof sessionStorage !== "undefined" &&
    sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1";

  const effectiveGroupForCompanies = useMemo(() => {
    if (groupsAllMode) return null;
    // Explicit close of Group pill: do not fall back to login GroupID (show independents).
    if (groupFilterOptOut) return null;
    if (selectedGroup) return String(selectedGroup).trim().toUpperCase();
    if (isGroupLogin(me)) return getLoginIdentifier(me);
    return null;
  }, [groupsAllMode, groupFilterOptOut, selectedGroup, me]);

  const companiesForPicker = useMemo(() => {
    const preferredId = preferredCompanyId ?? companyId ?? null;
    if (groupsAllMode) {
      return excludeGroupLabelsFromCompanyPicker(
        dedupeOwnerCompaniesByCode(filterCompaniesWithDisplayId(companies), preferredId),
        groupIds
      );
    }
    // Align with Dashboard / Transaction / Report: opt-out → independent companies only.
    if (groupFilterOptOut) {
      const independents = independentCompaniesForPicker(companies, groupIds);
      if (independents.length) {
        return dedupeOwnerCompaniesByCode(independents, preferredId);
      }
    }
    return dedupeOwnerCompaniesByCode(
      companiesForCompanyPicker(companies, effectiveGroupForCompanies, groupIds),
      preferredId
    );
  }, [
    companies,
    effectiveGroupForCompanies,
    groupFilterOptOut,
    groupsAllMode,
    groupIds,
    preferredCompanyId,
    companyId,
  ]);

  const resolveMergeCompanyList = useCallback(() => {
    if (groupsAllMode) {
      return filterCompaniesWithDisplayId(companies).filter((c) => !isVirtualGroupLinkCompanyRow(c));
    }
    if (effectiveGroupForCompanies) {
      return companiesForCompanyPicker(companies, effectiveGroupForCompanies, groupIds);
    }
    return filterCompaniesWithDisplayId(companies).filter((c) => !isVirtualGroupLinkCompanyRow(c));
  }, [companies, effectiveGroupForCompanies, groupsAllMode, groupIds]);

  const mergeCompanyIds = useMemo(() => {
    return resolveMergeCompanyList()
      .map((c) => Number(c.id))
      .filter((id) => Number.isFinite(id) && id > 0);
  }, [resolveMergeCompanyList]);

  const handlePickAllGroups = useCallback(() => {
    if (groupsAllMode) return;
    const sidebarAnchorGroup = resolveGroupsAllSidebarAnchorGroup(selectedGroup);
    if (sidebarAnchorGroup) persistGroupsAllSidebarGroup(sidebarAnchorGroup);
    setGroupsAllMode(true);
    setGroupAllMode(false);
    setSelectedGroup(null);
    persistDashboardGroupsAllMode(true);
    persistDashboardGroupFilter(null);
    persistDashboardFilterState(null, companyId, { allowGroupOnly: false, groupsAllMode: true });
    notifyDashboardGroupFilterChanged(null, companyId);
  }, [groupsAllMode, companyId, selectedGroup, setSelectedGroup]);

  const handlePickAllInGroup = useCallback(() => {
    const list = resolveMergeCompanyList();
    const groupForPersist = groupsAllMode ? null : selectedGroup;

    if (groupAllMode && !companyId) {
      if (
        isCompanyLogin(me) &&
        !isGroupLogin(me) &&
        !canUseGroupOnlyMode(me, groupForPersist, companies)
      ) {
        return;
      }

      setGroupAllMode(false);
      persistDashboardFilterState(groupForPersist, null, {
        allowGroupOnly: canUseGroupOnlyMode(me, groupForPersist, companies),
        groupsAllMode,
      });
      onClearCompany?.(groupForPersist);
      notifyDashboardGroupFilterChanged(groupForPersist, null);
      return;
    }

    setGroupAllMode(true);
    persistDashboardFilterState(groupForPersist, null, {
      allowGroupOnly: false,
      companyAllMode: true,
      groupsAllMode,
    });
    onClearCompany?.(groupsAllMode ? null : selectedGroup);
    notifyDashboardGroupFilterChanged(groupsAllMode ? null : selectedGroup, null);
  }, [
    groupAllMode,
    companyId,
    groupsAllMode,
    selectedGroup,
    onClearCompany,
    resolveMergeCompanyList,
    companies,
    me,
  ]);

  const handlePickGroup = useCallback(
    async (gid) => {
      const g = String(gid || "").trim().toUpperCase();
      if (!g) return;
      setGroupsAllMode(false);
      setGroupAllMode(false);
      await base.handlePickGroup(g);
    },
    [base],
  );

  const handlePickCompany = useCallback(
    async (c) => {
      setGroupAllMode(false);
      setGroupsAllMode(false);
      await base.handlePickCompany(c);
    },
    [base],
  );

  const isListScopeReady = useMemo(() => {
    if (companyId != null) return true;
    if (groupAllMode || groupsAllMode) return mergeCompanyIds.length > 0;
    if (selectedGroup) return true;
    if (effectiveGroupForCompanies && isGroupLogin(me)) return true;
    return false;
  }, [
    companyId,
    groupAllMode,
    groupsAllMode,
    mergeCompanyIds.length,
    selectedGroup,
    effectiveGroupForCompanies,
    me,
  ]);

  return {
    ...base,
    groupIds,
    companiesForPicker,
    groupsAllMode,
    groupAllMode,
    setGroupsAllMode,
    setGroupAllMode,
    handlePickAllGroups,
    handlePickAllInGroup,
    handlePickGroup,
    handlePickCompany,
    resolveMergeCompanyList,
    mergeCompanyIds,
    isListScopeReady,
  };
}

/** Group ids for per-group aggregate fetch when groups-all without company-all. */
export function groupIdsForGroupsAllAggregate(companies, groupIds) {
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds(companies);
  return gids.map((g) => String(g || "").trim().toUpperCase()).filter(Boolean);
}
