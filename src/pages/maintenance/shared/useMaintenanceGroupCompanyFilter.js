import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";

import { useAuthSession } from "../../../context/AuthSessionContext.jsx";
import {
  canClearCompanySelection,
  canUseGroupOnlyMode,
} from "../../../utils/company/loginScope.js";
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
  resolveCompanyWhenClosingGroup,
  sortedUniqueGroupIds,
} from "../../../utils/company/sharedCompanyFilter.js";
import {
  filterCompaniesForBankOnlyPills,
  filterCompaniesForDataCaptureMaintenancePills,
  filterCompaniesForGamesPills,
} from "../../../utils/company/companyCategoryFlags.js";
import { useGcFilterWithAllModes } from "../../../utils/company/useGcFilterWithAllModes.js";

function isGroupFilterOptOut() {
  return (
    typeof sessionStorage !== "undefined" &&
    sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1"
  );
}

/**
 * Maintenance Group / Company filters — All pills (never sent as group_id / company code).
 * Group-only: re-clicking active group closes it and shows independent companies.
 */
export function useMaintenanceGroupCompanyFilter({
  companies,
  companyId,
  selectedGroup,
  setSelectedGroup,
  switchCompany,
  onPrepareCompanySelect,
  onClearCompany,
  switchingCompany = false,
  enableGroupAnchorSession = true,
  /** "games" — hide bank-only (CX); "datacapture" — Games + bank-only; "bank" — hide games-only; payment/process list omit this. */
  pillCategory = null,
}) {
  const { me } = useAuthSession();
  const [groupFilterOptOutTick, setGroupFilterOptOutTick] = useState(0);

  const gc = useGcFilterWithAllModes({
    companies,
    companyId,
    selectedGroup,
    setSelectedGroup,
    onSelectCompany: switchCompany,
    onPrepareCompanySelect,
    onClearCompany,
    switchingCompany,
    preferredCompanyId: companyId,
    me,
    autoPickCompanyWhenEmpty: false,
    forceAllowGroupOnly: canUseGroupOnlyMode(me),
    clearCompanyOnActiveGroupReselect: false,
    enableGroupAnchorSession,
  });

  const {
    groupIds,
    companiesForPicker: baseCompaniesForPicker,
    groupsAllMode,
    groupAllMode,
    setGroupsAllMode,
    setGroupAllMode,
    handlePickGroup: baseHandlePickGroup,
    allowGroupOnly,
  } = gc;

  const visibleCompanies = useMemo(() => {
    const preferredId = companyId ?? null;
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
    selectedGroup,
    groupFilterOptOutTick,
  ]);

  const bankCompaniesForGroup = useCallback(
    (gid) => {
      const g = String(gid || "").trim().toUpperCase();
      if (!g) return [];
      const inGroup = dedupeOwnerCompaniesByCode(
        companiesForCompanyPicker(companies, g, groupIds),
        companyId,
      );
      return filterCompaniesForBankOnlyPills(inGroup, companyId);
    },
    [companies, companyId, groupIds],
  );

  const categoryScopedCompanies = useMemo(() => {
    let filtered;
    if (pillCategory === "games") {
      filtered = filterCompaniesForGamesPills(visibleCompanies, companyId);
    } else if (pillCategory === "datacapture") {
      filtered = filterCompaniesForDataCaptureMaintenancePills(visibleCompanies, companyId);
    } else if (pillCategory === "bank") {
      filtered = filterCompaniesForBankOnlyPills(visibleCompanies, companyId);
    } else {
      filtered = visibleCompanies;
    }

    // 关键修复：确保当前选中的公司一定在最终列表中！
    if (companyId != null) {
      // 先检查 filtered 中是否已经有该公司
      const hasCompany = filtered.some((c) => Number(c.id) === Number(companyId));
      if (!hasCompany) {
        // 从完整的 companies 列表中找到该公司并添加进去
        const companyToAdd = companies.find((c) => Number(c.id) === Number(companyId));
        if (companyToAdd) {
          // 先检查是否已有相同 company_code 的公司，有就替换，没有就添加
          const existingIndex = filtered.findIndex(
            (c) => String(c.company_id).toUpperCase().trim() === 
                   String(companyToAdd.company_id).toUpperCase().trim()
          );
          if (existingIndex >= 0) {
            // 替换掉 existingIndex 位置的公司
            const newList = [...filtered];
            newList[existingIndex] = companyToAdd;
            return newList;
          } else {
            // 直接添加进去
            return [...filtered, companyToAdd];
          }
        }
      }
    }
    return filtered;
  }, [visibleCompanies, pillCategory, companyId, companies]);

  const scopedGroupIds = useMemo(() => {
    if (pillCategory !== "bank") return groupIds;
    return groupIds.filter((gid) => bankCompaniesForGroup(gid).length > 0);
  }, [groupIds, pillCategory, bankCompaniesForGroup]);

  const deselectGroupKeepCompany = useCallback(async () => {
    if (switchingCompany) return;

    persistDashboardGroupOnlyMode(false);
    flushSync(() => {
      setGroupsAllMode(false);
      setGroupAllMode(false);
      setSelectedGroup(null);
    });

    const pick = resolveCompanyWhenClosingGroup(companies, companyId, groupIds);
    const nextCompanyId = pick?.id != null ? Number(pick.id) : null;

    if (nextCompanyId != null && Number.isFinite(nextCompanyId) && nextCompanyId > 0) {
      clearDashboardGroupFilterKeepCompany(nextCompanyId);
      setGroupFilterOptOutTick((n) => n + 1);
      onPrepareCompanySelect?.(pick);
      const select = switchCompany;
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
    companies,
    companyId,
    groupIds,
    setGroupsAllMode,
    setGroupAllMode,
    setSelectedGroup,
    onPrepareCompanySelect,
    switchCompany,
  ]);

  useLayoutEffect(() => {
    if (!isGroupFilterOptOut()) return;
    if (selectedGroup == null) return;
    setSelectedGroup(null);
  }, [selectedGroup, groupFilterOptOutTick, setSelectedGroup]);

  const handleGroupClick = useCallback(
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
    snapGroupIds: pillCategory === "bank" ? scopedGroupIds : groupIds,
    visibleCompanies: categoryScopedCompanies,
    handleGroupClick,
    handlePickCompany: gc.handlePickCompany,
    handlePickAllGroups: gc.handlePickAllGroups,
    handlePickAllInGroup: gc.handlePickAllInGroup,
    groupsAllMode: gc.groupsAllMode,
    groupAllMode: gc.groupAllMode,
    allowClearCompany: canClearCompanySelection(me, selectedGroup),
    isListScopeReady: gc.isListScopeReady,
  };
}
