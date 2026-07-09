import { useCallback, useMemo, useState } from "react";
import { flushSync } from "react-dom";

import { useAuthSession } from "../../../context/AuthSessionContext.jsx";
import { canUseGroupOnlyMode } from "../../../utils/company/loginScope.js";
import {
  clearDashboardGroupFilterKeepCompany,
  companiesForCompanyPicker,
  DASHBOARD_GROUP_FILTER_OPT_OUT_KEY,
  dedupeOwnerCompaniesByCode,
  excludeGroupLabelsFromCompanyPicker,
  filterCompaniesWithDisplayId,
  independentCompaniesForPicker,
  notifyDashboardGroupFilterChanged,
  persistDashboardFilterState,
  persistDashboardGroupFilter,
  persistDashboardGroupOnlyMode,
  sortedUniqueGroupIds,
} from "../../../utils/company/sharedCompanyFilter.js";
import { useGcFilterWithAllModes } from "../../../utils/company/useGcFilterWithAllModes.js";
import { resolveReportCompanyWhenClosingGroup } from "./reportGcBoot.js";

function isGroupFilterOptOut() {
  return (
    typeof sessionStorage !== "undefined" &&
    sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1"
  );
}

/**
 * Report pages: group-only via company pill deselect; re-clicking active group (group-only)
 * closes the group and shows independent companies with synced report data.
 */
export function useReportGroupCompanyFilter({
  companies,
  companyId,
  selectedGroup,
  setSelectedGroup,
  onPrepareCompanySelect,
  onSelectCompany,
  onClearCompany,
  switchingCompany = false,
  preferredCompanyId = null,
  autoPickCompanyWhenEmpty = false,
  enableGroupAnchorSession = true,
  broadcastFilterToLayout = true,
}) {
  const { me } = useAuthSession();
  const [groupFilterOptOutTick, setGroupFilterOptOutTick] = useState(0);

  const base = useGcFilterWithAllModes({
    companies,
    companyId,
    selectedGroup,
    setSelectedGroup,
    onPrepareCompanySelect,
    onSelectCompany,
    onClearCompany,
    switchingCompany,
    preferredCompanyId,
    me,
    autoPickCompanyWhenEmpty,
    enableGroupAnchorSession,
    broadcastFilterToLayout,
    forceAllowGroupOnly: canUseGroupOnlyMode(me),
    clearCompanyOnActiveGroupReselect: false,
  });

  const {
    groupIds,
    companiesForPicker: baseCompaniesForPicker,
    groupsAllMode,
    groupAllMode,
    setGroupsAllMode,
    setGroupAllMode,
    handlePickAllGroups,
    handlePickAllInGroup,
    handlePickGroup: baseHandlePickGroup,
    handlePickCompany,
    allowClearCompany,
    allowGroupOnly,
  } = base;

  const companiesForPicker = useMemo(() => {
    const preferredId = preferredCompanyId ?? companyId ?? null;
    const groupFilterOptOut = isGroupFilterOptOut();

    const independentPicker = () => {
      const list = independentCompaniesForPicker(companies, groupIds);
      if (list.length) {
        return dedupeOwnerCompaniesByCode(list, preferredId);
      }
      return excludeGroupLabelsFromCompanyPicker(
        dedupeOwnerCompaniesByCode(filterCompaniesWithDisplayId(companies), preferredId),
        groupIds,
      ).filter((c) => !String(c.group_id || "").trim());
    };

    if (groupsAllMode) {
      return baseCompaniesForPicker;
    }

    if (!selectedGroup || groupFilterOptOut) {
      return independentPicker();
    }

    if (baseCompaniesForPicker.length > 0) return baseCompaniesForPicker;

    const effectiveGroup = String(selectedGroup).trim().toUpperCase();
    return dedupeOwnerCompaniesByCode(
      companiesForCompanyPicker(companies, effectiveGroup, groupIds),
      preferredId,
    );
  }, [
    baseCompaniesForPicker,
    companies,
    companyId,
    groupIds,
    groupsAllMode,
    preferredCompanyId,
    selectedGroup,
    groupFilterOptOutTick,
  ]);

  const deselectGroupKeepCompany = useCallback(async () => {
    if (switchingCompany) return;

    persistDashboardGroupOnlyMode(false);
    flushSync(() => {
      setGroupsAllMode(false);
      setGroupAllMode(false);
      setSelectedGroup(null);
    });

    const pick = resolveReportCompanyWhenClosingGroup(me, companies, companyId, groupIds);
    const nextCompanyId = pick?.id != null ? Number(pick.id) : null;

    if (nextCompanyId != null && Number.isFinite(nextCompanyId) && nextCompanyId > 0) {
      clearDashboardGroupFilterKeepCompany(nextCompanyId);
      setGroupFilterOptOutTick((n) => n + 1);
      onPrepareCompanySelect?.(pick);
      const select = onSelectCompany;
      if (select) await select(pick);
      return;
    }

    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY, "1");
    }
    setGroupFilterOptOutTick((n) => n + 1);
    persistDashboardGroupFilter(null);
    persistDashboardFilterState(null, null, { allowGroupOnly: false });
    notifyDashboardGroupFilterChanged(null, null);
  }, [
    switchingCompany,
    me,
    companies,
    companyId,
    groupIds,
    setGroupsAllMode,
    setGroupAllMode,
    setSelectedGroup,
    onPrepareCompanySelect,
    onSelectCompany,
  ]);

  const handlePickGroup = useCallback(
    async (gid) => {
      if (switchingCompany) return;
      const g = String(gid || "").trim().toUpperCase();
      if (!g) return;

      const current = String(selectedGroup || "").trim().toUpperCase();

      if (g === current && companyId == null && allowGroupOnly) {
        await deselectGroupKeepCompany();
        return;
      }

      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY);
      }
      setGroupFilterOptOutTick((n) => n + 1);

      await baseHandlePickGroup(g);
    },
    [
      switchingCompany,
      selectedGroup,
      companyId,
      allowGroupOnly,
      deselectGroupKeepCompany,
      baseHandlePickGroup,
    ],
  );

  return {
    ...base,
    groupIds,
    companiesForPicker,
    groupsAllMode,
    groupAllMode,
    handlePickAllGroups,
    handlePickAllInGroup,
    handlePickGroup,
    handlePickCompany,
    allowClearCompany,
  };
}
