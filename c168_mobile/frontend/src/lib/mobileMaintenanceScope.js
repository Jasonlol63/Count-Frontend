/** Scope helpers for mobile Maintenance (Transaction + Payment) pages. */

import { normalizeGroupId } from "./dashboardScope.js";

/**
 * Resolve a simple maintenance / report scope.
 * @returns {{mode:'company'|'group'|'groupsAll', companyId:number|null, groupId:string|null, groupIds?:string[]}|null}
 */
export function resolveMaintenanceScope({
  companyId,
  selectedGroup,
  groupMode,
  groupsAllMode = false,
  aggregateGroupIds = [],
}) {
  if (groupsAllMode) {
    const ids = (Array.isArray(aggregateGroupIds) ? aggregateGroupIds : [])
      .map((g) => normalizeGroupId(g))
      .filter(Boolean);
    if (!ids.length) return null;
    return { mode: "groupsAll", companyId: null, groupId: null, groupIds: ids };
  }
  const group = selectedGroup ? normalizeGroupId(selectedGroup) : null;
  const cid = Number(companyId);
  if (groupMode && group) {
    return { mode: "group", companyId: null, groupId: group };
  }
  if (Number.isFinite(cid) && cid > 0) {
    return { mode: "company", companyId: cid, groupId: group };
  }
  if (group) {
    return { mode: "group", companyId: null, groupId: group };
  }
  return null;
}

export function maintenanceScopeIsReady(scope) {
  if (!scope) return false;
  if (scope.mode === "groupsAll") {
    return Array.isArray(scope.groupIds) && scope.groupIds.length > 0;
  }
  if (scope.mode === "group") return Boolean(scope.groupId);
  return Number(scope.companyId) > 0;
}

/** Stable cache key for list re-fetch effects. */
export function maintenanceScopeKey(scope) {
  if (!scope) return "";
  if (scope.mode === "groupsAll") {
    return `groupsAll:${(scope.groupIds || []).join(",")}`;
  }
  return `${scope.mode}:${scope.companyId ?? ""}:${scope.groupId ?? ""}`;
}

/** Append scope params for Transaction Maintenance search (maintenance_search_api.php). */
export function appendTransactionMaintenanceScope(params, scope) {
  if (!scope) return params;
  if (scope.mode === "group") {
    params.set("report_scope", "group");
    params.set("view_group", scope.groupId);
    params.set("group_id", scope.groupId);
    params.set("group_aggregate", "1");
    params.set("group_only", "1");
  } else if (Number(scope.companyId) > 0) {
    params.set("report_scope", "company");
    params.set("company_id", String(scope.companyId));
    if (scope.groupId) {
      params.set("view_group", scope.groupId);
    }
  }
  return params;
}

/** Scope params object for Payment Maintenance search/delete (search_api.php / delete_api.php). */
export function paymentMaintenanceScopeParams(scope) {
  if (!scope) return {};
  if (scope.mode === "group") {
    return {
      report_scope: "group",
      view_group: scope.groupId,
      group_id: scope.groupId,
      group_aggregate: "1",
      group_only: "1",
    };
  }
  if (Number(scope.companyId) > 0) {
    return { company_id: String(scope.companyId) };
  }
  return {};
}

/** Convert an <input type="date"> value (yyyy-mm-dd) to API dd/mm/yyyy. */
export function ymdToDmy(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Convert dd/mm/yyyy to yyyy-mm-dd for <input type="date">. */
export function dmyToYmd(dmy) {
  const m = String(dmy || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Today's date as yyyy-mm-dd (local). */
export function todayYmd() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
