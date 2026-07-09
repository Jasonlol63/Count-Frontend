import { MoneyDecimal } from "../../../../utils/money/moneyDecimal.js";

/** True when value parses as numeric money (not labels like OVERALL / M99M06). */
export function isMoneyLikeDisplayValue(value) {
  const str = (typeof value === "string" ? value : String(value ?? "")).trim();
  if (!str) return false;
  try {
    const cleaned = MoneyDecimal.cleanMoneyInput(str);
    if (!cleaned) return false;
    return /^-?(?:\d+|\d*\.\d+)$/.test(cleaned);
  } catch {
    return false;
  }
}

export function formatNumberToTwoDecimals(value) {
  if (value === null || value === undefined) return value;
  const str = (typeof value === "string" ? value : String(value)).trim();
  if (str === "") return value;
  if (!isMoneyLikeDisplayValue(str)) return value;
  try {
    return MoneyDecimal.formatFixed(str, 2);
  } catch {
    return value;
  }
}

export function formatMoneyDisplay(value) {
  if (!isMoneyLikeDisplayValue(value)) {
    return typeof value === "string" ? value : String(value ?? "");
  }
  try {
    return MoneyDecimal.formatThousands(value, 2);
  } catch {
    return value;
  }
}

export function fixSummaryRowTotalColumns(row) {
  if (!row || row.length < 9) return;
  for (let k = 0; 7 + 3 * k + 2 < row.length; k += 1) {
    try {
      const total = MoneyDecimal.add(row[7 + 3 * k] || "0", row[7 + 3 * k + 1] || "0");
      row[7 + 3 * k + 2] = MoneyDecimal.formatFixed(total, 2);
    } catch {
      row[7 + 3 * k + 2] = formatNumberToTwoDecimals(row[7 + 3 * k + 2]);
    }
  }
}
