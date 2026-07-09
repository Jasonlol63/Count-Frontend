import { useCallback, useMemo, useState } from "react";

import {
  companiesForCompanyPicker,
  companiesNativeInGroupList,
  dedupeOwnerCompaniesByCode,
  excludeGroupLabelsFromCompanyPicker,
  filterCompaniesWithDisplayId,
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
  allowActiveGroupDeselect = false,
  requireCompanyWithGroup = false,
  resolveCompanyOnGroupClose = null,
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
    allowActiveGroupDeselect,
    requireCompanyWithGroup,
    resolveCompanyOnGroupClose,
    allowClearCompany: allowClearCompanyOverride,
  });

  const groupIds = base.groupIds;

  const effectiveGroupForCompanies = useMemo(() => {
    if (groupsAllMode) return null;
    if (selectedGroup) return String(selectedGroup).trim().toUpperCase();
    if (isGroupLogin(me)) return getLoginIdentifier(me);
    return null;
  }, [groupsAllMode, selectedGroup, me]);

  const companiesForPicker = useMemo(() => {
    const preferredId = preferredCompanyId ?? companyId ?? null;
    if (groupsAllMode) {
      return excludeGroupLabelsFromCompanyPicker(
        dedupeOwnerCompaniesByCode(filterCompaniesWithDisplayId(companies), preferredId),
        groupIds
      );
    }
    return dedupeOwnerCompaniesByCode(
      companiesForCompanyPicker(companies, effectiveGroupForCompanies, groupIds),
      preferredId
    );
  }, [
    companies,
    effectiveGroupForCompanies,
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
      return companiesNativeInGroupList(companies, effectiveGroupForCompanies);
    }
    return filterCompaniesWithDisplayId(companies).filter((c) => !isVirtualGroupLinkCompanyRow(c));
  }, [companies, effectiveGroupForCompanies, groupsAllMode]);

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
