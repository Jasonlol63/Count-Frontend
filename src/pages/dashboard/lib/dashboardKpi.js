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

/**
 * True when the logged-in viewer has earnings config (Account or Group Ownership).
 * Subsidiary drill-down (e.g. AP + C168): group-level earnings do not apply — only direct
 * company ownership or link multiplier counts (matches IG + 95 net-profit panel).
 */
export function viewerHasEarningsConfig(dashboardData, options = {}) {
  if (!dashboardData) return false;
  const subsidiaryGroupDrillDown = !!options.subsidiaryGroupDrillDown;
  if (subsidiaryGroupDrillDown && !dashboardData.has_ownership_setup) return false;
  const directPct = parseFloat(dashboardData.ownership_percentage) || 0;
  if (subsidiaryGroupDrillDown) {
    if (directPct > 0) return true;
    const linkMul = parseFloat(dashboardData._link_multiplier || 0) || 0;
    if (linkMul > 0 && linkMul !== 1) return true;
    const groupEquityPct = parseFloat(dashboardData.group_equity_percentage) || 0;
    const groupAccPct = parseFloat(dashboardData.group_account_percentage) || 0;
    return groupEquityPct > 0 && groupAccPct > 0;
  }
  const linkMul = parseFloat(dashboardData._link_multiplier || 0) || 0;
  if (linkMul > 0 && linkMul !== 1) return true;
  if (directPct > 0) return true;
  if (options.groupsAllCompaniesAggregate) return false;
  if (dashboardData._group_aggregate_earnings || options.groupAggregateEarnings) {
    if (dashboardData.has_group_ownership) return true;
    const groupAccPct = parseFloat(dashboardData.group_account_percentage) || 0;
    return groupAccPct > 0;
  }
  if (dashboardData.has_group_ownership) return true;
  return false;
}

/** Viewer group account % as 0–1 multiplier (1 when unset). */
export function resolveGroupAccountMultiplier(dashboardData) {
  const accPct = parseFloat(dashboardData?.group_account_percentage) || 0;
  return accPct > 0 ? accPct / 100 : 1;
}

/** Group-only: Σ subsidiary group_share × viewer account % (for Earning tab). */
export function sumSubsidiaryMyEarning(dashboardData) {
  if (!dashboardData) return 0;
  const rows = dashboardData.subsidiary_earnings_by_company;
  if (Array.isArray(rows) && rows.length) {
    return rows.reduce((sum, row) => sum + (parseFloat(row.my_earning) || 0), 0);
  }
  const subTotal = parseFloat(dashboardData.subsidiary_earnings_total) || 0;
  return subTotal * resolveGroupAccountMultiplier(dashboardData);
}

/** Group-only: Σ subsidiary company-dashboard Earnings (e.g. C168 Earnings 1,148.21). */
export function sumSubsidiaryCompanyEarnings(dashboardData) {
  if (!dashboardData) return 0;
  const rows = dashboardData.subsidiary_earnings_by_company;
  if (Array.isArray(rows) && rows.length) {
    return rows.reduce((sum, row) => {
      const companyEarning = parseFloat(row.company_earning);
      if (Number.isFinite(companyEarning)) {
        return sum + companyEarning;
      }
      const fallbackProfit = parseFloat(row.profit);
      if (Number.isFinite(fallbackProfit)) {
        return sum + fallbackProfit;
      }
      // Backward compatibility for synthetic rows that only carried net_profit.
      return sum + (parseFloat(row.net_profit) || 0);
    }, 0);
  }
  const explicit = parseFloat(dashboardData.subsidiary_company_earnings_total);
  return Number.isFinite(explicit) ? explicit : 0;
}

/** Group-only Profit KPI = Σ subsidiary company Earnings. */
export function computeGroupAggregateProfit(dashboardData) {
  return sumSubsidiaryCompanyEarnings(dashboardData);
}

/** Group-only Net Profit = Σ subsidiary Earnings + group ledger basic expenses (signed). */
export function computeGroupAggregateNetProfit(dashboardData) {
  const profitSum = computeGroupAggregateProfit(dashboardData);
  const rawExpenses = parseFloat(dashboardData?.period_total?.expenses) || 0;
  const displayExpenses = rawExpenses > 0 ? -rawExpenses : rawExpenses;
  return profitSum + displayExpenses;
}

/** Group-only Earnings = Net Profit × viewer Group Earnings % (group_ownership account %). */
export function computeGroupAggregateEarningsAmount(dashboardData, { requireViewerConfig = true } = {}) {
  if (!dashboardData) return 0;
  const groupAccPct = parseFloat(dashboardData.group_account_percentage) || 0;
  if (requireViewerConfig && !dashboardData.has_group_ownership && groupAccPct <= 0) return 0;
  const netProfit = computeGroupAggregateNetProfit(dashboardData);
  return netProfit * resolveGroupAccountMultiplier(dashboardData);
}

/** Group All (single group + company all): Earnings = Σ each company earnings. */
export function computeGroupAllCompanyEarningsSum(dashboardData) {
  if (!dashboardData) return 0;
  const rows = dashboardData.subsidiary_earnings_by_company;
  if (Array.isArray(rows) && rows.length) {
    return rows.reduce((sum, row) => sum + (parseFloat(row.my_earning) || 0), 0);
  }
  const explicit = parseFloat(
    dashboardData?._subsidiary_earnings_total ?? dashboardData?.subsidiary_earnings_total
  );
  if (Number.isFinite(explicit)) return explicit;
  return 0;
}

export function isGroupAggregateEarningsPayload(dashboardData, options = {}) {
  if (!dashboardData) return false;
  if (options.groupAggregateEarnings) return true;
  return dashboardData._group_aggregate_earnings === true;
}

function resolveEarningsMultiplier(dashboardData, selectedGroup, options = {}, { requireViewerConfig = true } = {}) {
  if (!dashboardData) return 0;
  if (isGroupAggregateEarningsPayload(dashboardData, options)) {
    return resolveGroupAccountMultiplier(dashboardData);
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
  // Subsidiary company view:
  // - In group drill-down, only explicit ownership should affect earnings.
  // - No ownership config means no earnings (0), no fallback to full net profit.
  if (subsidiaryGroupDrillDown) {
    if (!dashboardData.has_ownership_setup) return 0;
    if (directPct > 0) return directPct;
    if (hasLinkOwnership) {
      const viewerGroupShare = groupAccountPercentage > 0 ? groupAccountPercentage / 100 : 1;
      return linkMul * viewerGroupShare;
    }
    if (groupEquityPercentage > 0) {
      const viewerGroupShare = groupAccountPercentage > 0 ? groupAccountPercentage / 100 : 0;
      return (groupEquityPercentage / 100) * viewerGroupShare;
    }
    return 0;
  }
  if (hasLinkOwnership) {
    const viewerGroupShare = groupAccountPercentage > 0 ? groupAccountPercentage / 100 : 1;
    return linkMul * viewerGroupShare;
  }
  if (directPct > 0) return directPct;
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

/** Copy ownership config (not dollar totals) from primary-currency KPI into per-currency payloads. */
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
  const groupAggregate = isGroupAggregateEarningsPayload(dashboardData, options);
  const groupAllCompanyEarningsSum = !!options.groupAllCompaniesEarningsSum;
  const groupProfitSum =
    groupAggregate && !groupAllCompanyEarningsSum
      ? computeGroupAggregateProfit(dashboardData)
      : null;
  const netProfitDisplay =
    groupAggregate && !groupAllCompanyEarningsSum
      ? computeGroupAggregateNetProfit(dashboardData)
      : displayProfitNum + displayExpensesNum;
  const showEarnings = options.groupsAllCompaniesAggregate
    ? false
    : viewerHasEarningsConfig(dashboardData, options);
  const panelMultiplier = resolvePanelEarningsPct(dashboardData, selectedGroup, options);
  const kpiMultiplier = resolveEffectiveOwnershipPct(dashboardData, selectedGroup, options);
  const mergedGroupAllEarnings = groupAllCompanyEarningsSum
    ? computeGroupAllCompanyEarningsSum(dashboardData)
    : null;
  const earningsDisplay = !showEarnings
    ? 0
    : groupAllCompanyEarningsSum
      ? mergedGroupAllEarnings
      : groupAggregate
      ? computeGroupAggregateEarningsAmount(dashboardData, { requireViewerConfig: false })
      : netProfitDisplay * panelMultiplier;
  const kpiCardEarnings = showEarnings
    ? groupAllCompanyEarningsSum
      ? mergedGroupAllEarnings
      : groupAggregate
      ? computeGroupAggregateEarningsAmount(dashboardData, { requireViewerConfig: true })
      : netProfitDisplay * kpiMultiplier
    : 0;
  return {
    profit: groupAggregate && !groupAllCompanyEarningsSum ? groupProfitSum : displayProfitNum,
    expenses: displayExpensesNum,
    netProfit: netProfitDisplay,
    earnings: earningsDisplay,
    kpiCardEarnings,
    showEarnings,
  };
}
