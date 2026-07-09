export const DASHBOARD_API = "api/transactions/dashboard_api.php";
export const DASHBOARD_BOOTSTRAP_API = "api/transactions/dashboard_bootstrap_api.php";

export const DASHBOARD_PROFIT_COLOR = "#3b82f6";
export const DASHBOARD_EARNINGS_PIE_HEIGHT = 180;
/** Minimum sector angle (deg) so small currencies (e.g. CNY) stay visible on the donut. */
export const DASHBOARD_EARNINGS_PIE_MIN_ANGLE = 5;
export const DASHBOARD_EARNINGS_COLOR = "#f59e0b";

/** 各币种固定色：圆环与右侧列表一致，便于对照 */
export const DASHBOARD_CURRENCY_COLORS = {
  MYR: "#2563eb",
  SGD: "#0891b2",
  USD: "#16a34a",
  EUR: "#7c3aed",
  IDR: "#ea580c",
  CNY: "#dc2626",
  HKD: "#db2777",
  THB: "#ca8a04",
  GBP: "#4f46e5",
  JPY: "#be185d",
  AUD: "#0d9488",
  VND: "#c2410c",
  PHP: "#9333ea",
  KRW: "#1d4ed8",
  TWD: "#059669",
  INR: "#0ea5e9",
  BND: "#65a30d",
  CAD: "#0369a1",
  NZD: "#15803d",
};

export const DASHBOARD_CURRENCY_FALLBACK_PALETTE = [
  "#6366f1",
  "#14b8a6",
  "#f59e0b",
  "#64748b",
  "#a855f7",
  "#84cc16",
];

export const KPI_CARD_ICONS = {
  profit: "fas fa-dollar-sign",
  expense: "fas fa-arrow-trend-down",
  net: "fas fa-chart-line",
  earnings: "fas fa-hand-holding-dollar",
};

/** YYYY-MM from dashboard date_to (matches backend ownership month resolution). */
export function dashboardOwnershipMonthFromDateEnd(dateTo) {
  const m = String(dateTo || "").trim().match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

/** True when date range end falls in a completed past month (use ownership history). */
export function isDashboardHistoricalOwnershipMonth(dateTo) {
  const key = dashboardOwnershipMonthFromDateEnd(dateTo);
  if (!key) return false;
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return key < current;
}
