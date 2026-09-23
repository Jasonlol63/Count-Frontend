/**
 * Dashboard — Spring Boot `/api/dashboard/*` (13 GET endpoints).
 *
 * Replaces the legacy PHP `dashboard_bootstrap_api.php` / `dashboard_api.php` feed, which returned
 * one fat payload that the client then had to merge, re-aggregate and re-derive equity from. The
 * Spring side already splits that payload per scope, already aggregates across tenants, and
 * already computes the ownership-weighted Earnings figure, so each call here returns exactly the
 * numbers one screen needs. See `Count/docs/dashboard-springboot-kpi.md` (the backend's own
 * design record) for the per-card formulas and the four supported scopes.
 *
 * Four scopes, and which call each uses:
 *   单 Company / 子公司下钻 → kpi + chart + kpiCurrencyBreakdown(tenant_id)
 *   单 Group               → groupKpi + chartGroup + groupKpiCurrencyBreakdown
 *   Company: All           → kpiAll + chartAll + kpiAllCurrencyBreakdown(tenant_ids)
 *   Group: All             → kpiAllGroups + chartAllGroups + kpiAllGroupsCurrencyBreakdown
 *
 * Param naming is NOT uniform on the backend: the currency-breakdown endpoints take
 * `base_currency`, every other endpoint takes `currency` — do not "tidy" this.
 */
import { buildApiUrl } from "../utils/apiUrl.js";

function csv(values) {
  const list = (Array.isArray(values) ? values : [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);
  return list.length ? list.join(",") : "";
}

/**
 * @param {string} path e.g. "api/dashboard/kpi"
 * @param {Record<string, string|number|undefined|null>} params
 */
async function getDashboardData(path, params, signal) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === "") return;
    q.set(key, String(value));
  });
  const res = await fetch(buildApiUrl(`${path}?${q.toString()}`), {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    signal,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.success) {
    throw new Error(json?.message || json?.error || "Failed to load dashboard");
  }
  return json.data ?? null;
}

/* ==================== 单 Company ==================== */

/** `data` = DashboardKpiDTO (profit/expenses/netProfit/showEarnings/earnings + previous*). */
export function fetchDashboardKpi({ tenantId, dateFrom, dateTo, currency }, signal) {
  return getDashboardData(
    "api/dashboard/kpi",
    { tenant_id: tenantId, date_from: dateFrom, date_to: dateTo, currency },
    signal,
  );
}

/** `data` = [{date, profit, expenses, netProfit, earnings}] — day granularity only. */
export function fetchDashboardChart({ tenantId, dateFrom, dateTo, currency }, signal) {
  return getDashboardData(
    "api/dashboard/chart",
    { tenant_id: tenantId, date_from: dateFrom, date_to: dateTo, currency },
    signal,
  );
}

/** `data` = [{code, originalAmount, amount, rate, earnings, earningsConverted}]. */
export function fetchDashboardKpiCurrencyBreakdown({ tenantId, dateFrom, dateTo, baseCurrency }, signal) {
  return getDashboardData(
    "api/dashboard/kpi/currency-breakdown",
    { tenant_id: tenantId, date_from: dateFrom, date_to: dateTo, base_currency: baseCurrency },
    signal,
  );
}

/* ==================== 单 Group ==================== */

export function fetchDashboardGroupKpi({ groupTenantId, companyTenantIds, dateFrom, dateTo, currency }, signal) {
  return getDashboardData(
    "api/dashboard/group-kpi",
    {
      group_tenant_id: groupTenantId,
      company_tenant_ids: csv(companyTenantIds),
      date_from: dateFrom,
      date_to: dateTo,
      currency,
    },
    signal,
  );
}

export function fetchDashboardChartGroup({ groupTenantId, companyTenantIds, dateFrom, dateTo, currency }, signal) {
  return getDashboardData(
    "api/dashboard/chart-group",
    {
      group_tenant_id: groupTenantId,
      company_tenant_ids: csv(companyTenantIds),
      date_from: dateFrom,
      date_to: dateTo,
      currency,
    },
    signal,
  );
}

export function fetchDashboardGroupKpiCurrencyBreakdown(
  { groupTenantId, companyTenantIds, dateFrom, dateTo, baseCurrency },
  signal,
) {
  return getDashboardData(
    "api/dashboard/group-kpi/currency-breakdown",
    {
      group_tenant_id: groupTenantId,
      company_tenant_ids: csv(companyTenantIds),
      date_from: dateFrom,
      date_to: dateTo,
      base_currency: baseCurrency,
    },
    signal,
  );
}

/**
 * Group-only "Net Profit by member company" tab — `data` = [{code, netProfit, group}].
 * NOT `/group-kpi/company-breakdown` (that path does not exist; some desktop comments still say
 * it — they are stale).
 */
export function fetchDashboardGroupCompanyNetProfit(
  { groupTenantId, companyTenantIds, dateFrom, dateTo, currency },
  signal,
) {
  return getDashboardData(
    "api/dashboard/group-kpi/net-profit",
    {
      group_tenant_id: groupTenantId,
      company_tenant_ids: csv(companyTenantIds),
      date_from: dateFrom,
      date_to: dateTo,
      currency,
    },
    signal,
  );
}

/* ==================== Group: All ==================== */

export function fetchDashboardKpiAllGroups(
  { groupTenantIds, companyTenantIds, dateFrom, dateTo, currency },
  signal,
) {
  return getDashboardData(
    "api/dashboard/kpi-all-groups",
    {
      group_tenant_ids: csv(groupTenantIds),
      company_tenant_ids: csv(companyTenantIds),
      date_from: dateFrom,
      date_to: dateTo,
      currency,
    },
    signal,
  );
}

export function fetchDashboardChartAllGroups(
  { groupTenantIds, companyTenantIds, dateFrom, dateTo, currency },
  signal,
) {
  return getDashboardData(
    "api/dashboard/chart-all-groups",
    {
      group_tenant_ids: csv(groupTenantIds),
      company_tenant_ids: csv(companyTenantIds),
      date_from: dateFrom,
      date_to: dateTo,
      currency,
    },
    signal,
  );
}

export function fetchDashboardKpiAllGroupsCurrencyBreakdown(
  { groupTenantIds, companyTenantIds, dateFrom, dateTo, baseCurrency },
  signal,
) {
  return getDashboardData(
    "api/dashboard/kpi-all-groups/currency-breakdown",
    {
      group_tenant_ids: csv(groupTenantIds),
      company_tenant_ids: csv(companyTenantIds),
      date_from: dateFrom,
      date_to: dateTo,
      base_currency: baseCurrency,
    },
    signal,
  );
}

/* ==================== Company: All ==================== */

export function fetchDashboardKpiAll({ tenantIds, dateFrom, dateTo, currency }, signal) {
  return getDashboardData(
    "api/dashboard/kpi-all",
    { tenant_ids: csv(tenantIds), date_from: dateFrom, date_to: dateTo, currency },
    signal,
  );
}

export function fetchDashboardChartAll({ tenantIds, dateFrom, dateTo, currency }, signal) {
  return getDashboardData(
    "api/dashboard/chart-all",
    { tenant_ids: csv(tenantIds), date_from: dateFrom, date_to: dateTo, currency },
    signal,
  );
}

export function fetchDashboardKpiAllCurrencyBreakdown(
  { tenantIds, dateFrom, dateTo, baseCurrency },
  signal,
) {
  return getDashboardData(
    "api/dashboard/kpi-all/currency-breakdown",
    { tenant_ids: csv(tenantIds), date_from: dateFrom, date_to: dateTo, base_currency: baseCurrency },
    signal,
  );
}
