/**
 * Merge dashboard payloads for Group/Company "All" (aligned with desktop dashboardMerge.js).
 */

function viewerHasEarningsConfig(dashboardData) {
  if (!dashboardData) return false;
  const directPct = parseFloat(dashboardData.ownership_percentage) || 0;
  if (directPct > 0) return true;
  const linkMul = parseFloat(dashboardData._link_multiplier || 0) || 0;
  if (linkMul > 0 && linkMul !== 1) return true;
  if (dashboardData.has_group_ownership) return true;
  return false;
}

function netProfitFromDashboardPayload(dashboardData) {
  if (!dashboardData) return 0;
  const rawProfit = parseFloat(dashboardData?.period_total?.profit ?? dashboardData.profit) || 0;
  const rawExpenses = parseFloat(dashboardData?.period_total?.expenses ?? dashboardData.expenses) || 0;
  const displayExpenses = rawExpenses > 0 ? -rawExpenses : rawExpenses;
  return rawProfit + displayExpenses;
}

function mergeDailyMap(target, source) {
  if (!source || typeof source !== "object") return;
  Object.keys(source).forEach((date) => {
    target[date] = (target[date] || 0) + parseFloat(source[date] || 0);
  });
}

/** Attach group ledger expenses/ownership onto merged subsidiary totals (desktop parity). */
export function attachGroupAggregateEarningsFields(mergedSubsidiaries, groupLedgerPayload) {
  if (!mergedSubsidiaries || !groupLedgerPayload) return mergedSubsidiaries;
  const subsidiaryTotal =
    parseFloat(mergedSubsidiaries._subsidiary_earnings_total) ||
    parseFloat(mergedSubsidiaries.subsidiary_earnings_total) ||
    0;
  const ledgerExpenses =
    parseFloat(groupLedgerPayload?.period_total?.expenses ?? groupLedgerPayload?.expenses) || 0;
  const ledgerDailyExpenses =
    groupLedgerPayload?.daily_data?.expenses &&
    typeof groupLedgerPayload.daily_data.expenses === "object"
      ? groupLedgerPayload.daily_data.expenses
      : mergedSubsidiaries?.daily_data?.expenses || {};
  const groupLedgerNetProfit =
    groupLedgerPayload?.group_ledger_net_profit != null
      ? parseFloat(groupLedgerPayload.group_ledger_net_profit) || 0
      : netProfitFromDashboardPayload(groupLedgerPayload);
  return {
    ...mergedSubsidiaries,
    expenses: ledgerExpenses,
    period_total: {
      ...(mergedSubsidiaries?.period_total || {}),
      expenses: ledgerExpenses,
    },
    daily_data: {
      ...(mergedSubsidiaries?.daily_data || {}),
      expenses: ledgerDailyExpenses,
    },
    subsidiary_earnings_total: subsidiaryTotal,
    group_ledger_net_profit: groupLedgerNetProfit,
    group_account_percentage: parseFloat(groupLedgerPayload?.group_account_percentage) || 0,
    has_group_ownership: !!groupLedgerPayload?.has_group_ownership,
    has_ownership_setup: !!groupLedgerPayload?.has_group_ownership,
    _group_aggregate_earnings: true,
  };
}

export function mergeGroupData(dataList, dateRange = {}) {
  let capital = 0;
  let expenses = 0;
  let profit = 0;
  let periodCapital = 0;
  let periodExpenses = 0;
  let periodProfit = 0;
  let bfCapital = 0;
  let bfExpenses = 0;
  let bfProfit = 0;
  const dailyCapital = {};
  const dailyExpenses = {};
  const dailyProfit = {};
  const dailyProfitFlow = {};
  let hasViewerEarningsConfig = false;
  const companyEarnings = [];

  (dataList || []).forEach((d) => {
    if (!d) return;
    capital += parseFloat(d.capital || 0);
    expenses += parseFloat(d?.period_total?.expenses ?? 0);
    profit += parseFloat(d.profit || 0);

    if (d.period_total) {
      periodCapital += parseFloat(d.period_total.capital || 0);
      periodExpenses += parseFloat(d.period_total.expenses || 0);
      periodProfit += parseFloat(d.period_total.profit || 0);
    }
    if (d.initial_balance) {
      bfCapital += parseFloat(d.initial_balance.capital || 0);
      bfExpenses += parseFloat(d.initial_balance.expenses || 0);
      bfProfit += parseFloat(d.initial_balance.profit || 0);
    }
    if (d.daily_data) {
      mergeDailyMap(dailyCapital, d.daily_data.capital);
      mergeDailyMap(dailyExpenses, d.daily_data.expenses);
      mergeDailyMap(dailyProfit, d.daily_data.profit);
      mergeDailyMap(dailyProfitFlow, d.daily_data.profit_payment_flow_daily);
    }
    if (viewerHasEarningsConfig(d)) hasViewerEarningsConfig = true;

    const pct = parseFloat(d.ownership_percentage || 0);
    const grpPct = parseFloat(d.group_equity_percentage || 0);
    const grpAccPct = parseFloat(d.group_account_percentage || 0);
    const hasGrp = !!d.has_group_ownership;
    const rawP = parseFloat(d?.period_total?.profit ?? d.profit) || 0;
    const rawE = parseFloat(d?.period_total?.expenses ?? d.expenses) || 0;
    const displayE = rawE > 0 ? -rawE : rawE;
    const netProfit = rawP + displayE;
    const linkMul = parseFloat(d?._link_multiplier || 0) || 0;
    const hasLink = linkMul > 0 && linkMul !== 1;
    const directPct = pct / 100;
    let effectivePct = 0;
    if (hasLink) {
      const viewerGroupShare = grpAccPct > 0 ? grpAccPct / 100 : 1;
      effectivePct = linkMul * viewerGroupShare;
    } else if (directPct > 0) {
      effectivePct = directPct;
    } else if (hasGrp) {
      effectivePct = (grpPct / 100) * (grpAccPct / 100);
    }
    if (!viewerHasEarningsConfig(d)) return;
    companyEarnings.push({
      netProfit,
      pct,
      earnings: netProfit * effectivePct,
      my_earning: netProfit * effectivePct,
      company_id: d.company_id || d.company_code || "",
    });
  });

  const totalEarnings = companyEarnings.reduce((sum, c) => sum + c.earnings, 0);
  const mergedRawProfit = periodProfit;
  const mergedRawExpenses = periodExpenses;
  const mergedDisplayExpenses = mergedRawExpenses > 0 ? -mergedRawExpenses : mergedRawExpenses;
  const mergedNetProfit = mergedRawProfit + mergedDisplayExpenses;

  let effectiveOwnershipPct = 0;
  if (mergedNetProfit !== 0) {
    effectiveOwnershipPct = (totalEarnings / mergedNetProfit) * 100;
  } else if (companyEarnings.length > 0) {
    const totalPct = companyEarnings.reduce((sum, c) => sum + c.pct, 0);
    effectiveOwnershipPct = totalPct / companyEarnings.length;
  }

  return {
    capital,
    expenses: periodExpenses,
    profit,
    period_total: { capital: periodCapital, expenses: periodExpenses, profit: periodProfit },
    initial_balance: { capital: bfCapital, expenses: bfExpenses, profit: bfProfit },
    daily_data: {
      capital: dailyCapital,
      expenses: dailyExpenses,
      profit: dailyProfit,
      profit_payment_flow_daily: dailyProfitFlow,
    },
    date_range: dataList[0]?.date_range || { from: dateRange.startDate, to: dateRange.endDate },
    ownership_percentage: effectiveOwnershipPct,
    has_ownership_setup: hasViewerEarningsConfig,
    has_group_ownership: dataList.some((d) => d?.has_group_ownership),
    group_equity_percentage: 0,
    group_account_percentage: 0,
    _subsidiary_earnings_total: totalEarnings,
    subsidiary_earnings_total: totalEarnings,
    subsidiary_earnings_by_company: companyEarnings.map((c) => ({
      company_id: c.company_id,
      net_profit: c.netProfit,
      my_earning: c.my_earning,
    })),
  };
}

/**
 * After merging multiple group-ledger payloads (Groups All), mark aggregate earnings
 * so KPI uses groupAggregateEarnings path (desktop finalizeMergedGroupLedgerDashboard).
 */
export function finalizeMergedGroupLedgerDashboard(merged, groupLedgerPayloads) {
  if (!merged || !groupLedgerPayloads?.length) return merged;
  const ledgerRows = groupLedgerPayloads.filter(
    (d) => d && (d._group_aggregate_earnings || d.group_ledger_net_profit != null || d.has_group_ownership),
  );
  const rows = ledgerRows.length ? ledgerRows : groupLedgerPayloads.filter(Boolean);
  if (!rows.length) return merged;

  let aggregateEarnings = 0;
  let hasGroupOwnership = false;
  let hasOwnershipSetup = false;
  for (const d of rows) {
    const net = netProfitFromDashboardPayload(d);
    const accPct = parseFloat(d?.group_account_percentage) || 0;
    const mul = accPct > 0 ? accPct / 100 : 1;
    aggregateEarnings += net * mul;
    if (d.has_group_ownership) hasGroupOwnership = true;
    if (viewerHasEarningsConfig(d) || d.has_ownership_setup) hasOwnershipSetup = true;
  }

  return {
    ...merged,
    subsidiary_earnings_total: aggregateEarnings,
    _subsidiary_earnings_total: aggregateEarnings,
    group_ledger_net_profit: 0,
    group_account_percentage: 0,
    group_equity_percentage: 0,
    ownership_percentage: 0,
    has_group_ownership: hasGroupOwnership,
    has_ownership_setup: hasOwnershipSetup || hasGroupOwnership || aggregateEarnings !== 0,
    _group_aggregate_earnings: true,
  };
}
