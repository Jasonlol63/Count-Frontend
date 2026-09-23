/**
 * Removed here (Spring has no counterpart): `DASHBOARD_BOOTSTRAP_API` and `DASHBOARD_API`, both
 * pointing at `api/transactions/dashboard_*_api.php`. Desktop deleted the same two constants when
 * it migrated; every Dashboard read now goes through `lib/dashboardSpringApi.js`, whose 13
 * endpoints carry the same numbers pre-split per scope.
 */
export const DASHBOARD_PROFIT_COLOR = "#3b82f6";

export const DASHBOARD_CURRENCY_COLORS = {
  MYR: "#2563eb",
  SGD: "#0891b2",
  USD: "#16a34a",
  EUR: "#0d60ff",
  IDR: "#ea580c",
  CNY: "#dc2626",
  HKD: "#db2777",
  THB: "#ca8a04",
  GBP: "#2563eb",
  JPY: "#be185d",
  AUD: "#0d9488",
  VND: "#c2410c",
  PHP: "#63c4ff",
  KRW: "#1d4ed8",
  TWD: "#059669",
  INR: "#0ea5e9",
  BND: "#65a30d",
  CAD: "#0369a1",
  NZD: "#15803d",
};

export const DASHBOARD_CURRENCY_FALLBACK_PALETTE = [
  "#0d60ff",
  "#14b8a6",
  "#f59e0b",
  "#64748b",
  "#63c4ff",
  "#84cc16",
];

export const KPI_CARD_ICONS = {
  profit: "fas fa-dollar-sign",
  expense: "fas fa-arrow-trend-down",
  net: "fas fa-chart-line",
  earnings: "fas fa-hand-holding-dollar",
};
