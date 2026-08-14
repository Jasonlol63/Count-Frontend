/**
 * Empty / zero dashboard helpers — new companies with no currencies or ledger rows
 * must still exit scope skeleton (displayScopeKey alignment).
 */

/** @returns {'none'|'pending'|'empty'|'ready'} */
export function companyCurrencyCacheState(map, companyId) {
  const cid = companyId != null ? parseInt(companyId, 10) : Number.NaN;
  if (!Number.isFinite(cid) || cid <= 0 || !map || typeof map.has !== "function") {
    return "none";
  }
  if (!map.has(cid)) return "pending";
  const list = map.get(cid);
  if (!Array.isArray(list) || list.length === 0) return "empty";
  return "ready";
}

/** Settled zero payload so KPI/chart/pie can paint without waiting on currency/chart. */
export function buildEmptyDashboardPayload(dateFrom, dateTo) {
  return {
    capital: 0,
    expenses: 0,
    profit: 0,
    ownership_percentage: 0,
    has_ownership_setup: false,
    group_equity_percentage: 0,
    group_account_percentage: 0,
    has_group_ownership: false,
    period_total: { capital: 0, expenses: 0, profit: 0 },
    initial_balance: { capital: 0, expenses: 0, profit: 0 },
    daily_data: { capital: {}, expenses: {}, profit: {} },
    _chart_daily_settled: true,
    _dash_date_from: dateFrom || "",
    _dash_date_to: dateTo || "",
  };
}
