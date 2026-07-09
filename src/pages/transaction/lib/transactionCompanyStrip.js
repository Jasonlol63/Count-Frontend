import {
  companiesForCompanyPicker,
  DASHBOARD_GROUP_FILTER_OPT_OUT_KEY,
  dedupeOwnerCompaniesByCode,
  excludeGroupLabelsFromCompanyPicker,
  filterCompaniesWithDisplayId,
  independentCompaniesForPicker,
  sortedUniqueGroupIds,
} from "../../../utils/company/sharedCompanyFilter.js";

function isGroupFilterOptOut(snap) {
  if (snap?.groupFilterOptOut === false) return false;
  if (snap?.groupFilterOptOut === true) return true;
  return (
    typeof sessionStorage !== "undefined" &&
    sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1"
  );
}

/** Company pills for Transaction GC filter (synced with filterSnapshot.companyStripRows). */
export function buildTransactionCompanyStripRows(snap, { selectedGroup, companyId, groupsAllMode } = {}) {
  const list = snap?.snapCompaniesAll || snap?.snapCompanies || [];
  const preferredId = companyId ?? null;
  if (groupsAllMode) {
    return excludeGroupLabelsFromCompanyPicker(
      dedupeOwnerCompaniesByCode(filterCompaniesWithDisplayId(list), preferredId),
    );
  }

  const groupIds = snap?.snapGroupIds || sortedUniqueGroupIds(list);

  if (isGroupFilterOptOut(snap)) {
    const independents = independentCompaniesForPicker(list, groupIds);
    if (independents.length) {
      return dedupeOwnerCompaniesByCode(independents, preferredId);
    }
    return excludeGroupLabelsFromCompanyPicker(
      dedupeOwnerCompaniesByCode(filterCompaniesWithDisplayId(list), preferredId),
      groupIds,
    ).filter((c) => !String(c.group_id || "").trim());
  }

  if (selectedGroup) {
    return dedupeOwnerCompaniesByCode(
      companiesForCompanyPicker(list, selectedGroup, groupIds),
      preferredId,
    );
  }

  // No active group pill (default): show companies for the session company’s group (e.g. C168 / AP).
  if (preferredId != null && Number(preferredId) > 0) {
    const activeRow =
      list.find((c) => Number(c.id) === Number(preferredId)) ||
      filterCompaniesWithDisplayId(list).find((c) => Number(c.id) === Number(preferredId));
    const implicitGroup = activeRow?.group_id
      ? String(activeRow.group_id).trim().toUpperCase()
      : null;
    if (implicitGroup) {
      return dedupeOwnerCompaniesByCode(
        companiesForCompanyPicker(list, implicitGroup, groupIds),
        preferredId,
      );
    }
  }

  return dedupeOwnerCompaniesByCode(
    companiesForCompanyPicker(list, selectedGroup, groupIds),
    preferredId,
  );
}
