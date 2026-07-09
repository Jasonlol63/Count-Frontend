/** Kunzzgroup KPI chart: static area gradients + zero-baseline draw helpers. */

export const DASHBOARD_TREND_DRAW_DURATION_MS = 650;

const TREND_CHART_METRIC_KEYS = ["profit", "expenses", "netProfit", "earnings"];

/** Palette matches dashboard series colors. */
const TREND_AREA_SERIES = [
  { id: "Profit", color: "#3b82f6" },
  { id: "Exp", color: "#ef4444" },
  { id: "Net", color: "#10b981" },
  { id: "Earn", color: "#f59e0b" },
];

export function DashboardTrendAreaDefs() {
  return (
    <defs>
      {TREND_AREA_SERIES.map(({ id, color }) => (
        <linearGradient key={id} id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="30%" stopColor={color} stopOpacity="0.2" />
          <stop offset="70%" stopColor={color} stopOpacity="0.1" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      ))}
    </defs>
  );
}

const AREA_FILL_BY_DATA_KEY = {
  profit: "url(#gProfit)",
  expenses: "url(#gExp)",
  netProfit: "url(#gNet)",
  earnings: "url(#gEarn)",
};

export function resolveTrendAreaFill(dataKey) {
  return AREA_FILL_BY_DATA_KEY[dataKey] || null;
}

/** Y domain always spans 0 so positives grow up and negatives grow down from the zero line. */
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

export function zeroTrendChartRows(rows) {
  if (!rows?.length) return [];
  return rows.map((row) => {
    const next = { ...row };
    TREND_CHART_METRIC_KEYS.forEach((key) => {
      if (key in row) next[key] = 0;
    });
    return next;
  });
}
