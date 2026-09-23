import {
  eachDateInRange,
  eachMonthInRange,
  formatChartMonthLabel,
  parseYmd,
  shouldAggregateChartByMonth,
} from "./dashboardDateUtils.js";

export function resolveDailyChartXAxisTicks(pointCount, { monthly = false } = {}) {
  if (monthly) {
    if (pointCount <= 8) return { interval: 0, minTickGap: 4, height: 24, marginBottom: 8 };
    return { interval: "preserveStartEnd", minTickGap: 18, height: 26, marginBottom: 10 };
  }
  if (pointCount <= 10) return { interval: 0, minTickGap: 6, height: 22, marginBottom: 8 };
  if (pointCount <= 31) return { interval: "preserveStartEnd", minTickGap: 20, height: 24, marginBottom: 10 };
  if (pointCount <= 100) return { interval: "preserveStartEnd", minTickGap: 36, height: 28, marginBottom: 12 };
  return { interval: "preserveStartEnd", minTickGap: 52, height: 30, marginBottom: 14 };
}

export function computeTrendYDomain(rows, dataKeys) {
  if (!rows?.length || !dataKeys?.length) return [0, 1];
  let min = 0;
  let max = 0;
  rows.forEach((row) => {
    dataKeys.forEach((key) => {
      const value = Number(row[key]) || 0;
      if (value < min) min = value;
      if (value > max) max = value;
    });
  });
  if (min === 0 && max === 0) return [-1, 1];
  const span = max - min || Math.max(Math.abs(max), Math.abs(min), 1);
  const pad = span * 0.08;
  return [min < 0 ? min - pad : 0, max > 0 ? max + pad : 0];
}

/**
 * `/api/dashboard/chart` (and `/chart-group`, `/chart-all`, `/chart-all-groups`) `data` →
 * Trend Chart rows. Copied from Count-frontend `lib/dashboardChart.jsx#buildSpringTrendChartRows`
 * (desktop).
 *
 * What changed vs the old `buildChartRows`, which read the legacy `daily_data.profit{}` /
 * `daily_data.expenses{}` date→value maps and multiplied `earnings` by a client-side ownership
 * multiplier:
 *   - `expenses` arrives **already signed** (`netProfit = profit + expenses`), so the old
 *     `expenses > 0 ? -expenses : expenses` flip is gone;
 *   - `earnings` is read straight off each point instead of being recomputed, and a `null`
 *     earnings (identity isn't entitled to Earnings at all) stays `null` rather than becoming a
 *     fake 0;
 *   - the backend only returns **day** granularity, so the month roll-up for long ranges is still
 *     done here by summing the day points that fall inside each month.
 */
export function buildSpringTrendChartRows(trendPoints, startYmd, endYmd) {
  if (!Array.isArray(trendPoints) || !trendPoints.length) return [];
  const byDate = new Map(trendPoints.map((p) => [String(p.date), p]));
  const rangeStart = parseYmd(startYmd);
  const rangeEnd = parseYmd(endYmd);

  const rowFor = (profit, expenses, earnings) => ({
    profit,
    expenses,
    netProfit: profit + expenses,
    earnings,
  });

  if (shouldAggregateChartByMonth(startYmd, endYmd)) {
    return eachMonthInRange(startYmd, endYmd).map(({ year, month }) => {
      const monthKey = `${year}-${String(month).padStart(2, "0")}`;
      const label = formatChartMonthLabel(year, month);
      const lastDay = new Date(year, month, 0).getDate();
      let profitSum = 0;
      let expensesSum = 0;
      let earningsSum = 0;
      let hasEarnings = false;
      for (let day = 1; day <= lastDay; day += 1) {
        const dateStr = `${monthKey}-${String(day).padStart(2, "0")}`;
        const dateObj = parseYmd(dateStr);
        if (dateObj < rangeStart || dateObj > rangeEnd) continue;
        const point = byDate.get(dateStr);
        if (!point) continue;
        profitSum += parseFloat(point.profit || 0) || 0;
        expensesSum += parseFloat(point.expenses || 0) || 0;
        if (point.earnings != null) {
          earningsSum += parseFloat(point.earnings) || 0;
          hasEarnings = true;
        }
      }
      return {
        date: monthKey,
        label,
        ...rowFor(profitSum, expensesSum, hasEarnings ? earningsSum : null),
      };
    });
  }

  const dates = eachDateInRange(startYmd, endYmd);
  const sameCalendarMonth =
    rangeStart &&
    rangeEnd &&
    rangeStart.getFullYear() === rangeEnd.getFullYear() &&
    rangeStart.getMonth() === rangeEnd.getMonth();

  return dates.map((date) => {
    const d = parseYmd(date);
    const label = sameCalendarMonth ? String(d.getDate()) : `${d.getDate()}/${d.getMonth() + 1}`;
    const point = byDate.get(date);
    const profit = parseFloat(point?.profit || 0) || 0;
    const expenses = parseFloat(point?.expenses || 0) || 0;
    const earnings = point?.earnings != null ? parseFloat(point.earnings) || 0 : null;
    return { date, label, ...rowFor(profit, expenses, earnings) };
  });
}
