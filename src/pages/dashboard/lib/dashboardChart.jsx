import {
  eachDateInRange,
  eachMonthInRange,
  formatChartMonthLabel,
  parseYmd,
  shouldAggregateChartByMonth,
} from "./dashboardDateUtils.js";
import { resolvePanelEarningsPct, viewerHasEarningsConfig } from "./dashboardKpi.js";

/** 按天模式：1 个自然月每天；2 个月隔 2 天；≤14 天每天；更长区间按宽度跳日 */
export function resolveDailyChartXAxisTicks(dayCount, monthSpan) {
  if (monthSpan === 1 || dayCount <= 14) {
    return { interval: 0, minTickGap: 0 };
  }
  if (monthSpan === 2) {
    return { interval: 1, minTickGap: 0 };
  }
  return { interval: "preserveStartEnd", minTickGap: 36 };
}

export function makeDashboardChartXTick(compact) {
  return function DashboardChartXTick({ x, y, payload }) {
    if (x == null || y == null || payload?.value == null) return null;
    const labelY = y + (compact ? 8 : 10);
    const fontSize = compact ? 10 : 11;
    return (
      <text x={x} y={labelY} fill="#94a3b8" fontSize={fontSize} textAnchor="middle">
        {payload.value}
      </text>
    );
  };
}

export function DashboardChartBaseline({ offset, width, yAxisMap }) {
  if (!width || !yAxisMap) return null;
  const yAxis = yAxisMap[0] ?? yAxisMap[Object.keys(yAxisMap)[0]];
  const zeroY = yAxis?.scale?.(0);
  if (zeroY == null || Number.isNaN(zeroY)) return null;
  return (
    <line
      x1={offset?.left ?? 0}
      y1={zeroY}
      x2={width - (offset?.right ?? 0)}
      y2={zeroY}
      stroke="#94a3b8"
      strokeWidth={1}
      className="dashboard-chart-zero-line"
    />
  );
}

function buildChartMetricRow(date, label, dailyData, earningsMultiplier) {
  const profitDelta = parseFloat(dailyData.profit?.[date] || 0) || 0;
  const expensesDelta = parseFloat(dailyData.expenses?.[date] || 0) || 0;
  const displayProfit = profitDelta;
  const displayExpenses = expensesDelta > 0 ? -expensesDelta : expensesDelta;
  const netProfit = displayProfit + displayExpenses;
  const earnings = netProfit * earningsMultiplier;
  return {
    date,
    label,
    profit: displayProfit,
    expenses: displayExpenses,
    netProfit,
    earnings,
  };
}

export function buildChartRows(
  data,
  startYmd,
  endYmd,
  locale = "en-US",
  selectedGroup = null,
  options = {}
) {
  if (!data?.daily_data) return [];
  const dailyData = data.daily_data;
  const earningsMultiplier = viewerHasEarningsConfig(data)
    ? resolvePanelEarningsPct(data, selectedGroup, options)
    : 1;
  const rangeStart = parseYmd(startYmd);
  const rangeEnd = parseYmd(endYmd);

  if (shouldAggregateChartByMonth(startYmd, endYmd)) {
    return eachMonthInRange(startYmd, endYmd).map(({ year, month }) => {
      const monthKey = `${year}-${String(month).padStart(2, "0")}`;
      const lastDay = new Date(year, month, 0).getDate();
      let profitSum = 0;
      let expensesSum = 0;
      for (let day = 1; day <= lastDay; day += 1) {
        const dateStr = `${monthKey}-${String(day).padStart(2, "0")}`;
        const dateObj = parseYmd(dateStr);
        if (dateObj < rangeStart || dateObj > rangeEnd) continue;
        profitSum += parseFloat(dailyData.profit?.[dateStr] || 0) || 0;
        expensesSum += parseFloat(dailyData.expenses?.[dateStr] || 0) || 0;
      }
      const displayProfit = profitSum;
      const displayExpenses = expensesSum > 0 ? -expensesSum : expensesSum;
      const netProfit = displayProfit + displayExpenses;
      const earnings = netProfit * earningsMultiplier;
      return {
        date: monthKey,
        label: formatChartMonthLabel(year, month, locale),
        profit: displayProfit,
        expenses: displayExpenses,
        netProfit,
        earnings,
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
    const label = sameCalendarMonth
      ? String(d.getDate())
      : `${d.getDate()}/${d.getMonth() + 1}`;
    return buildChartMetricRow(date, label, dailyData, earningsMultiplier);
  });
}
