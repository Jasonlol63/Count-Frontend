/**
 * KPI card maths.
 *
 * What used to be in this file: `computeKpiMetrics`, `viewerHasEarningsConfig`,
 * `resolveEarningsMultiplier` and seven private helpers (~200 lines) that re-derived the
 * ownership-weighted Earnings figure **on the client** from the legacy PHP bootstrap payload —
 * `ownership_percentage`, `group_equity_percentage`, `group_account_percentage`,
 * `_link_multiplier`, `has_group_ownership`, `has_ownership_setup`, `_group_aggregate_earnings`,
 * `subsidiary_earnings_by_company[]`, `subsidiary_company_earnings_total`, `period_total.*`,
 * `daily_data.*`. None of those fields exist in the Spring response any more.
 *
 * `/api/dashboard/kpi` (and `/group-kpi`, `/kpi-all`, `/kpi-all-groups`) hand over `showEarnings`,
 * `earningsPercentage` — the *effective* rate, with the "company → group → login" cascade already
 * applied — and the finished `earnings` amount; `DashboardServiceImpl` decides eligibility from the
 * session identity. So the whole multiplier dance is gone, not renamed. Removed rather than left
 * as dead code; the backend's own record is
 * `Count/docs/dashboard-springboot-kpi.md` §0 (per-card formulas) and §11 (the cascade).
 *
 * Note `earningsPercentage` is **null** on `/kpi-all` and `/kpi-all-groups` (only the single
 * `buildKpiDto` path sets it) — those two scopes must read `earnings`, never the percentage.
 */

const KPI_PCT_CAP = 999.9;

/** Period-over-period % change vs the aligned previous period (see DashboardServiceImpl#resolvePreviousRange). */
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

/**
 * True when the previous period's value was small enough (relative to the swing) that
 * `kpiPercentChange()` had to clamp the real percentage down to ±999.9 — the raw maths is a
 * legitimate huge number (e.g. -1770%), not an error, but showing "999.9%" as if it were the
 * exact figure is misleading. Callers append a "+" ("999.9+%") to signal "capped, not exact".
 * `previous === 0` is a *different* case (no baseline at all) and is never flagged.
 */
export function kpiPercentChangeIsClamped(current, previous) {
  const c = parseFloat(current) || 0;
  const p = parseFloat(previous) || 0;
  if (p === 0) return false;
  const raw = ((c - p) / Math.abs(p)) * 100;
  return Number.isFinite(raw) && Math.abs(raw) > KPI_PCT_CAP;
}

export function buildKpiCompare(current, previous) {
  const c = parseFloat(current) || 0;
  const p = parseFloat(previous) || 0;
  const delta = c - p;
  return {
    delta,
    pct: kpiPercentChange(current, previous),
    isUp: delta >= 0,
    clamped: kpiPercentChangeIsClamped(current, previous),
  };
}

/**
 * `/api/dashboard/kpi` and `/api/dashboard/group-kpi` return the identical shape
 * (profit/expenses/netProfit/showEarnings/earnings + the whole `previous*` set), so the KPI card
 * assembly is shared. Copied from Count-frontend `useDashboardPage.js#buildKpiFromSpringPayload`
 * (desktop).
 *
 * `expenses` is passed through **untouched**: the server already signs it (`netProfit = profit +
 * expenses`, verified against real data — Company 95: 71,253.36 + (−45,033.00) = 26,220.36). The
 * legacy `rawExpenses > 0 ? -rawExpenses : rawExpenses` flip must not be reintroduced here.
 */
export function buildKpiFromSpringPayload(payload) {
  if (!payload) return null;
  const comparisons = {};
  if (payload.previousProfit != null) {
    comparisons.profit = buildKpiCompare(payload.profit ?? 0, payload.previousProfit);
  }
  if (payload.previousExpenses != null) {
    comparisons.expenses = buildKpiCompare(payload.expenses ?? 0, payload.previousExpenses);
  }
  if (payload.previousNetProfit != null) {
    comparisons.netProfit = buildKpiCompare(payload.netProfit ?? 0, payload.previousNetProfit);
  }
  if (payload.showEarnings && payload.previousEarnings != null) {
    comparisons.earnings = buildKpiCompare(payload.earnings ?? 0, payload.previousEarnings);
  }
  return {
    profit: payload.profit ?? 0,
    expenses: payload.expenses ?? 0,
    netProfit: payload.netProfit ?? 0,
    showEarnings: !!payload.showEarnings,
    earnings: payload.earnings ?? 0,
    kpiCardEarnings: payload.earnings ?? 0,
    comparisons,
  };
}
