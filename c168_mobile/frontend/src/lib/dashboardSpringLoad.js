/**
 * Dashboard data loading — Spring `/api/dashboard/*` (see `dashboardSpringApi.js`).
 *
 * This replaces `dashboardLoad.js`, which is left on disk (now unreferenced) as a reference — there
 * is no git history for `c168_mobile/`, so nothing is deleted until the numbers are verified.
 *
 * What the old loader did: fetch one fat `dashboard_bootstrap_api.php` payload and, for the
 * "All"-style scopes, fan out **one request per company / per group** and stitch the results back
 * together in `dashboardMerge.js` — re-deriving each company's ownership-weighted earnings on the
 * client, plus a second `bootstrap_scope=previous` request whenever the previous period was
 * missing. None of that is needed any more: the Spring endpoints take comma-separated tenant lists
 * and aggregate server-side, and every KPI response carries its own aligned `previous*` block.
 *
 * So the whole job is now "pick the right endpoint family for the scope, then issue three GETs in
 * parallel".
 *
 * Four scopes, mirroring the backend's own enumeration
 * (`Count/docs/dashboard-springboot-kpi.md` §6.1):
 *   单 Company / 子公司下钻 → kpi / chart / kpi-currency-breakdown
 *   单 Group               → group-kpi / chart-group / group-kpi-currency-breakdown
 *   Company: All           → kpi-all / chart-all / kpi-all-currency-breakdown
 *   Group: All             → kpi-all-groups / chart-all-groups / kpi-all-groups-currency-breakdown
 */
import {
  fetchDashboardChart,
  fetchDashboardChartAll,
  fetchDashboardChartAllGroups,
  fetchDashboardChartGroup,
  fetchDashboardGroupCompanyNetProfit,
  fetchDashboardGroupKpi,
  fetchDashboardGroupKpiCurrencyBreakdown,
  fetchDashboardKpi,
  fetchDashboardKpiAll,
  fetchDashboardKpiAllCurrencyBreakdown,
  fetchDashboardKpiAllGroups,
  fetchDashboardKpiAllGroupsCurrencyBreakdown,
  fetchDashboardKpiCurrencyBreakdown,
} from "./dashboardSpringApi.js";
import { normalizeGroupId } from "./dashboardScope.js";
import {
  accountScopeIsGroupOnly,
  findGroupRow,
  groupIdsForGroupsAllAggregate,
  resolveScopeTenantIds,
} from "./mobileAccountScope.js";

const EMPTY_SCOPE = {
  tenantId: null,
  tenantIds: [],
  groupTenantId: null,
  groupTenantIds: [],
  companyTenantIds: [],
};

function collectGroupMemberIds(companies, groupCodes) {
  return (companies || [])
    .filter((row) => {
      const id = Number(row?.id);
      if (!(id > 0)) return false;
      const gid = String(row?.group_id || "").trim().toUpperCase();
      const native = String(row?.native_group_id || "").trim().toUpperCase();
      const link = String(row?.link_source_group || "").trim().toUpperCase();
      return groupCodes.has(gid) || groupCodes.has(native) || groupCodes.has(link);
    })
    .map((row) => Number(row.id));
}

/**
 * Map the page's GC scope onto one of the backend's four Dashboard scopes.
 *
 * @returns {{ mode: "company"|"group"|"companiesAll"|"groupsAll" } & typeof EMPTY_SCOPE}
 */
export function resolveMobileDashboardScope(scope, companies = [], groupIds = []) {
  const { companyId, selectedGroup, groupAllMode, groupsAllMode } = scope || {};
  const group = normalizeGroupId(selectedGroup);
  const hasCompany = Number(companyId) > 0 && Number.isFinite(Number(companyId));

  // Group: All — every accessible Group's own ledger, plus (when a company is also selected) its
  // member companies' rows for the aggregate.
  if (groupsAllMode) {
    const groupTenantIds = resolveScopeTenantIds(scope, companies, groupIds);
    let companyTenantIds = [];
    if (groupAllMode) {
      const groupCodes = new Set(
        groupIdsForGroupsAllAggregate(companies, groupIds).map((g) => String(g).toUpperCase()),
      );
      companyTenantIds = collectGroupMemberIds(companies, groupCodes);
    }
    return { ...EMPTY_SCOPE, mode: "groupsAll", groupTenantIds, companyTenantIds };
  }

  // Company: All — every company inside the selected Group.
  if (groupAllMode && group) {
    return {
      ...EMPTY_SCOPE,
      mode: "companiesAll",
      tenantIds: resolveScopeTenantIds(scope, companies, groupIds),
    };
  }

  // 单 Group — the Group's own ledger.
  if (accountScopeIsGroupOnly(scope) || (group && !hasCompany)) {
    const id = Number(findGroupRow(companies, group)?.id);
    return { ...EMPTY_SCOPE, mode: "group", groupTenantId: id > 0 ? id : null };
  }

  // 单 Company. A company inside a group is still just a single company — the backend applies the
  // "direct ownership, else via its Group" earnings cascade itself (backend doc §11).
  const id = Number(companyId);
  return { ...EMPTY_SCOPE, mode: "company", tenantId: id > 0 ? id : null };
}

/**
 * @param {object} scopeState
 * @param {{ signal?: AbortSignal, loadError?: string }} [opts]
 */
export async function loadMobileDashboardData(scopeState, { signal, loadError } = {}) {
  const {
    companyId,
    selectedGroup,
    groupAllMode,
    groupsAllMode,
    companies = [],
    groupIds = [],
    dateFrom,
    dateTo,
    currency,
  } = scopeState || {};

  const scope = resolveMobileDashboardScope(
    { companyId, selectedGroup, groupAllMode, groupsAllMode },
    companies,
    groupIds,
  );
  const baseCurrency = String(currency || "").toUpperCase();
  const range = { dateFrom, dateTo, currency: baseCurrency };

  let kpiPromise;
  let trendPromise;
  let breakdownPromise;
  let netProfitPromise = null;

  if (scope.mode === "groupsAll") {
    const args = {
      ...range,
      groupTenantIds: scope.groupTenantIds,
      companyTenantIds: scope.companyTenantIds,
    };
    kpiPromise = fetchDashboardKpiAllGroups(args, signal);
    trendPromise = fetchDashboardChartAllGroups(args, signal);
    breakdownPromise = fetchDashboardKpiAllGroupsCurrencyBreakdown({ ...args, baseCurrency }, signal);
  } else if (scope.mode === "companiesAll") {
    const args = { ...range, tenantIds: scope.tenantIds };
    kpiPromise = fetchDashboardKpiAll(args, signal);
    trendPromise = fetchDashboardChartAll(args, signal);
    breakdownPromise = fetchDashboardKpiAllCurrencyBreakdown({ ...args, baseCurrency }, signal);
  } else if (scope.mode === "group") {
    const args = { ...range, groupTenantId: scope.groupTenantId, companyTenantIds: [] };
    kpiPromise = fetchDashboardGroupKpi(args, signal);
    trendPromise = fetchDashboardChartGroup(args, signal);
    breakdownPromise = fetchDashboardGroupKpiCurrencyBreakdown({ ...args, baseCurrency }, signal);
    // Group-only "Net Profit by member company" tab — `[{code, netProfit, group}]`.
    const group = normalizeGroupId(selectedGroup);
    const memberIds = collectGroupMemberIds(companies, new Set(group ? [group] : []));
    netProfitPromise = memberIds.length
      ? fetchDashboardGroupCompanyNetProfit(
          { ...range, groupTenantId: scope.groupTenantId, companyTenantIds: memberIds },
          signal,
        ).catch(() => [])
      : Promise.resolve([]);
  } else {
    const args = { ...range, tenantId: scope.tenantId };
    kpiPromise = fetchDashboardKpi(args, signal);
    trendPromise = fetchDashboardChart(args, signal);
    breakdownPromise = fetchDashboardKpiCurrencyBreakdown({ ...args, baseCurrency }, signal);
  }

  const [kpi, trend, breakdown, groupsNetProfit] = await Promise.all([
    kpiPromise,
    trendPromise.catch(() => []),
    breakdownPromise.catch(() => []),
    netProfitPromise ?? Promise.resolve(null),
  ]);

  if (!kpi) throw new Error(loadError || "Failed to load dashboard");

  return {
    /** DashboardKpiDTO — read through `buildKpiFromSpringPayload`. */
    kpi,
    /** [{date, profit, expenses, netProfit, earnings}] — day granularity only. */
    trend: Array.isArray(trend) ? trend : [],
    /** [{code, originalAmount, amount, rate, earnings, earningsConverted}] for the Currency/Earning tabs. */
    breakdown: Array.isArray(breakdown) ? breakdown : [],
    /** Group-only Net Profit tab rows, else null. */
    groupsNetProfit,
    currency: baseCurrency,
    /** Flat previous-period bounds — replaces the old nested `previous` payload + `previous_date_range`. */
    previousDateFrom: kpi.previousDateFrom ?? null,
    previousDateTo: kpi.previousDateTo ?? null,
    _mobile_scope: {
      mode: scope.mode,
      group: normalizeGroupId(selectedGroup),
      tenants: scope.tenantIds.length,
      groups: scope.groupTenantIds.length,
    },
  };
}

/**
 * Spring currency-breakdown rows → the shape the Currency / Earning panels already consume
 * (`mapPanelCurrencyRows` expects `{code, netProfit, netProfitConverted, earnings, earningsConverted}`).
 *
 * Every conversion is now server-side: `originalAmount` is the native net profit, `amount` the same
 * figure in the display currency, `rate` the unit rate (null when unavailable → the panel renders
 * "—"), and `earnings` is the ownership-weighted share (0, never null, once resolved).
 */
export function breakdownToPanelRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    code: row.code,
    netProfit: row.originalAmount ?? null,
    netProfitConverted: row.amount ?? null,
    earnings: row.earnings ?? 0,
    earningsConverted: row.earningsConverted ?? null,
    rate: row.rate ?? null,
  }));
}
