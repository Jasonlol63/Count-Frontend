/**
 * DEV-only preview dataset shaped exactly like the dashboard_bootstrap_api response.
 * Used purely so the UI can be previewed with realistic numbers when the real
 * API returns an empty/zero scope. It flows through the SAME compute functions -
 * no calculation logic is changed. Real data always takes precedence.
 */
function pad(n) {
  return String(n).padStart(2, "0");
}

function buildJuneDaily() {
  const profit = {};
  const expenses = {};
  const capital = {};
  const peaks = { 8: 18000, 15: 9000, 18: 120000, 22: 22000 };
  for (let d = 1; d <= 30; d += 1) {
    const key = `2026-06-${pad(d)}`;
    profit[key] = peaks[d] ?? 1500 + (d % 5) * 600;
    expenses[key] = 120 + (d % 4) * 40;
    capital[key] = 0;
  }
  return { profit, expenses, capital };
}

const PER_CURRENCY_NET = [
  { code: "MYR", net: 184256.35 },
  { code: "SGD", net: -1079.08 },
  { code: "USD", net: 133.29 },
  { code: "EUR", net: 4564.14 },
  { code: "IDR", net: 0 },
  { code: "THB", net: 0 },
];

export const DEMO_BOOTSTRAP = {
  current: {
    currency: "MYR",
    period_total: { profit: 187656.35, expenses: 3400 },
    daily_data: buildJuneDaily(),
  },
  previous: {
    currency: "MYR",
    period_total: { profit: 49096.07, expenses: 0 },
  },
  earnings: {
    current: PER_CURRENCY_NET.map(({ code, net }) => ({
      code,
      payload: { currency: code, period_total: { profit: net, expenses: 0 } },
    })),
  },
};

function hasNonZeroValue(values) {
  if (!values || typeof values !== "object") return false;
  return Object.values(values).some((value) => (parseFloat(value) || 0) !== 0);
}

export function dashboardDataIsUsable(data) {
  if (!data?.current) return false;
  const pt = data.current.period_total || {};
  const profit = parseFloat(pt.profit ?? data.current.profit) || 0;
  const expenses = parseFloat(pt.expenses) || 0;
  if (profit !== 0 || expenses !== 0) return true;

  const daily = data.current.daily_data;
  if (hasNonZeroValue(daily?.profit) || hasNonZeroValue(daily?.expenses)) return true;

  const earnings = data.earnings?.current;
  if (Array.isArray(earnings)) {
    return earnings.some(({ payload }) => {
      const rowTotal = payload?.period_total || {};
      const rowProfit = parseFloat(rowTotal.profit ?? payload?.profit) || 0;
      const rowExpenses = parseFloat(rowTotal.expenses) || 0;
      return rowProfit !== 0 || rowExpenses !== 0;
    });
  }
  return false;
}
