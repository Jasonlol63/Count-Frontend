/**
 * Shared Customer / Domain report money display and subtotal sums.
 * Aligns with legacy `js/domain_report.js` (HALF_UP + abs(x) < 0.005 as 0) + thousands separators.
 */
import MoneyDecimal from "../../../utils/money/moneyDecimal.js";

export function formatReportAmount(value) {
  const thousandsZero = () => MoneyDecimal.formatThousands(MoneyDecimal.formatFixedHalfUp("0", 2), 2);
  if (value === null || value === undefined) return thousandsZero();
  const raw = String(value).trim();
  if (raw === "" || raw === "-") return thousandsZero();
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return thousandsZero();
  try {
    const absSmall = MoneyDecimal.cmp(MoneyDecimal.abs(cleaned), "0.005") < 0;
    const core = absSmall ? "0" : cleaned;
    const rounded = MoneyDecimal.formatFixedHalfUp(core, 2);
    return MoneyDecimal.formatThousands(rounded, 2);
  } catch {
    return thousandsZero();
  }
}

/** High-precision add for grouped report subtotals (legacy `reportAdd` / MoneyDecimal.add). */
export function reportAmountAdd(a, b) {
  try {
    const sum = MoneyDecimal.add(String(a || "0"), String(b || "0"));
    return MoneyDecimal.stripTrailingZeros(sum.toFixed(8));
  } catch {
    return "0";
  }
}

/** Map report page notify types to maintenance toast CSS variants. */
export function reportToastMaintenanceVariant(type) {
  if (type === "danger" || type === "error") return "error";
  if (type === "info") return "info";
  return "success";
}
