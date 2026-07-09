const KPI_PCT_CAP = 999.9;

/** Month-over-month % vs previous month's equivalent date range. */
export function kpiPercentChange(current, previous) {
  const c = parseFloat(current) || 0;
  const p = parseFloat(previous) || 0;
  if (p === 0) {
    if (c === 0) return 0;
    return c > 0 ? 100 : -100;
  }
  const raw = ((c - p) / Math.abs(p)) * 100;
  if (!Number.isFinite(raw)) return 0;
  return Math.max(-KPI_PCT_CAP, Math.min(KPI_PCT_CAP, Math.round(raw * 10) / 10));
}

export function buildKpiCompare(current, previous) {
  const c = parseFloat(current) || 0;
  const p = parseFloat(previous) || 0;
  const delta = c - p;
  return {
    delta,
    pct: kpiPercentChange(current, previous),
    isUp: delta >= 0,
  };
}

/** Net profit from dashboard_api payload (period profit + signed expenses). */
export function netProfitFromDashboardPayload(dashboardData) {
  if (!dashboardData) return 0;
  const rawProfit = parseFloat(dashboardData?.period_total?.profit ?? dashboardData.profit) || 0;
  const rawExpenses = parseFloat(dashboardData?.period_total?.expenses ?? dashboardData.expenses) || 0;
  const displayExpenses = rawExpenses > 0 ? -rawExpenses : rawExpenses;
  return rawProfit + displayExpenses;
}

/** True when the logged-in viewer has earnings config (Account or Group Ownership). */
export function viewerHasEarningsConfig(dashboardData) {
  if (!dashboardData) return false;
  const directPct = parseFloat(dashboardData.ownership_percentage) || 0;
  if (directPct > 0) return true;
  if (dashboardData.has_group_ownership) return true;
  const linkMul = parseFloat(dashboardData._link_multiplier || 0) || 0;
  return linkMul > 0 && linkMul !== 1;
}

/** Group earning = (subsidiary earnings + group ledger net profit) × viewer group %. */
export function computeGroupAggregateEarningsAmount(dashboardData, { requireViewerConfig = true } = {}) {
  if (!dashboardData) return 0;
  if (requireViewerConfig && !dashboardData.has_group_ownership) return 0;
  const subEarn = parseFloat(dashboardData.subsidiary_earnings_total) || 0;
  const grpNp =
    dashboardData.group_ledger_net_profit != null
      ? parseFloat(dashboardData.group_ledger_net_profit) || 0
      : 0;
  const accPct = parseFloat(dashboardData.group_account_percentage) || 0;
  const accountMul = accPct > 0 ? accPct / 100 : 1;
  return (subEarn + grpNp) * accountMul;
}

export function isGroupAggregateEarningsPayload(dashboardData, options = {}) {
  if (!dashboardData) return false;
  if (options.groupAggregateEarnings || dashboardData._group_aggregate_earnings) return true;
  return (
    dashboardData.subsidiary_earnings_total != null &&
    dashboardData.group_ledger_net_profit != null
  );
}

function resolveEarningsMultiplier(dashboardData, selectedGroup, options = {}, { requireViewerConfig = true } = {}) {
  if (!dashboardData) return 0;
  if (isGroupAggregateEarningsPayload(dashboardData, options)) {
    const netProfit = netProfitFromDashboardPayload(dashboardData);
    if (!netProfit) return 0;
    return (
      computeGroupAggregateEarningsAmount(dashboardData, { requireViewerConfig }) / netProfit
    );
  }
  const subsidiaryGroupDrillDown = !!options.subsidiaryGroupDrillDown;
  const ownershipPercentage = parseFloat(dashboardData?.ownership_percentage) || 0;
  const groupEquityPercentage = parseFloat(dashboardData?.group_equity_percentage) || 0;
  const groupAccountPercentage = parseFloat(dashboardData?.group_account_percentage) || 0;
  const hasGroupOwnership = !!dashboardData?.has_group_ownership;
  const linkMul = parseFloat(dashboardData?._link_multiplier || 0) || 0;
  const hasLinkOwnership = linkMul > 0 && linkMul !== 1;
  const inGroupView = !!selectedGroup;
  const directPct = ownershipPercentage / 100;
  if (hasLinkOwnership) {
    const viewerGroupShare = groupAccountPercentage > 0 ? groupAccountPercentage / 100 : 1;
    return linkMul * viewerGroupShare;
  }
  if (directPct > 0) return directPct;
  if (subsidiaryGroupDrillDown && groupEquityPercentage > 0) {
    return groupEquityPercentage / 100;
  }
  if (hasGroupOwnership) {
    return (groupEquityPercentage / 100) * (groupAccountPercentage / 100);
  }
  if (requireViewerConfig) return 0;
  return directPct === 0 && inGroupView ? 1 : 0;
}

/** Ownership multiplier for the top KPI Earnings card (viewer config required). */
export function resolveEffectiveOwnershipPct(dashboardData, selectedGroup, options = {}) {
  return resolveEarningsMultiplier(dashboardData, selectedGroup, options, {
    requireViewerConfig: true,
  });
}

/** Multiplier for earnings panel + trend chart (always visible). */
export function resolvePanelEarningsPct(dashboardData, selectedGroup, options = {}) {
  return resolveEarningsMultiplier(dashboardData, selectedGroup, options, {
    requireViewerConfig: false,
  });
}

/** Copy ownership fields from primary-currency KPI into per-currency earnings payloads. */
export function mergeDashboardOwnershipFields(payload, ownershipSource) {
  if (!payload || !ownershipSource) return payload;
  return {
    ...payload,
    ownership_percentage: ownershipSource.ownership_percentage,
    has_ownership_setup: ownershipSource.has_ownership_setup,
    group_equity_percentage: ownershipSource.group_equity_percentage,
    group_account_percentage: ownershipSource.group_account_percentage,
    has_group_ownership: ownershipSource.has_group_ownership,
    _link_multiplier: ownershipSource._link_multiplier,
    subsidiary_earnings_total: ownershipSource.subsidiary_earnings_total,
    group_ledger_net_profit: ownershipSource.group_ledger_net_profit,
    _group_aggregate_earnings: ownershipSource._group_aggregate_earnings,
  };
}

/**
 * True when per-currency earnings should be refetched.
 * KPI-only fallback may fill the active currency while other rows stay 0 — not bootstrap-complete.
 */
export function dashboardEarningsRowsLookStale(
  rows,
  kpiEarnings,
  activeCurrencyCode,
  bootstrapComplete = false
) {
  if (!Array.isArray(rows) || !rows.length) return true;
  if (rows.some((row) => row.earnings == null)) return false;
  if (rows.length > 1 && !bootstrapComplete) return true;

  const kpi = parseFloat(kpiEarnings);
  if (!Number.isFinite(kpi) || Math.abs(kpi) < 0.0001) return false;

  const code = String(activeCurrencyCode || "").trim().toUpperCase();
  const allNearZero = rows.every((row) => Math.abs(parseFloat(row.earnings) || 0) < 0.0001);
  if (!code) return allNearZero;

  const active = rows.find((row) => String(row.code).trim().toUpperCase() === code);
  const activeVal = parseFloat(active?.earnings);
  if (Number.isFinite(activeVal) && Math.abs(activeVal - kpi) < 0.02) return false;
  return allNearZero || !Number.isFinite(activeVal) || Math.abs(activeVal - kpi) > 0.02;
}

export function computeKpiMetrics(dashboardData, selectedGroup, options = {}) {
  if (!dashboardData) return null;
  const rawProfit = parseFloat(dashboardData?.period_total?.profit ?? dashboardData.profit) || 0;
  // Expenses KPI = 本期 Win/Loss + Cr/Dr（与 Transaction List / Payment History 一致，不含 CLEAR）。
  const rawExpenses = parseFloat(dashboardData?.period_total?.expenses) || 0;
  const displayProfitNum = rawProfit;
  const displayExpensesNum = rawExpenses > 0 ? -rawExpenses : rawExpenses;
  const netProfitDisplay = displayProfitNum + displayExpensesNum;
  const showEarnings = viewerHasEarningsConfig(dashboardData);
  const groupAggregate = isGroupAggregateEarningsPayload(dashboardData, options);
  const panelMultiplier = resolvePanelEarningsPct(dashboardData, selectedGroup, options);
  const kpiMultiplier = resolveEffectiveOwnershipPct(dashboardData, selectedGroup, options);
  const earningsDisplay = !showEarnings
    ? netProfitDisplay
    : groupAggregate
      ? computeGroupAggregateEarningsAmount(dashboardData, { requireViewerConfig: false })
      : netProfitDisplay * panelMultiplier;
  const kpiCardEarnings = showEarnings
    ? groupAggregate
      ? computeGroupAggregateEarningsAmount(dashboardData, { requireViewerConfig: true })
      : netProfitDisplay * kpiMultiplier
    : 0;
  return {
    profit: displayProfitNum,
    expenses: displayExpensesNum,
    netProfit: netProfitDisplay,
    earnings: earningsDisplay,
    kpiCardEarnings,
    showEarnings,
  };
}
