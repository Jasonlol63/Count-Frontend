import { recalculateRowAmounts } from "../table/summaryRowAmount.js";
import { summaryRefreshStorageKeys, RATE_BY_PRODUCT_KEY } from "./summaryStorage.js";
import { SUMMARY_RATE_VALUES_KEY } from "./summaryStorage.js";
import { buildSummaryRowStableKey } from "./summaryRefreshStatePure.js";

function readJsonObject(key) {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function readRateMaps(captureScope) {
  const keys = summaryRefreshStorageKeys(captureScope);
  const byKey =
    readJsonObject(keys.rateValues) ?? readJsonObject(SUMMARY_RATE_VALUES_KEY);
  const byProduct =
    readJsonObject(keys.rateByProduct) ?? readJsonObject(RATE_BY_PRODUCT_KEY);
  if (!byKey && !byProduct) return { byKey: null, byProduct: null };
  return { byKey, byProduct };
}

/** Restore rate checkbox/value from refresh storage onto populated rows. */
export function restoreRateValuesOnRows(rows, captureScope = null) {
  const { byKey, byProduct } = readRateMaps(captureScope);
  if (!byKey && !byProduct) return rows;

  return rows.map((row) => {
    let rateChecked = row.rateChecked;
    let rateValue = row.rateValue || "";

    let fromKey = byKey?.[row.key];
    if (!fromKey) {
      const stableKey = buildSummaryRowStableKey(row);
      if (stableKey && byKey?.[stableKey]) {
        fromKey = byKey[stableKey];
      }
    }
    if (fromKey && typeof fromKey === "object") {
      rateChecked = !!fromKey.checked;
      rateValue = fromKey.value != null ? String(fromKey.value) : rateValue;
    } else if (fromKey != null && typeof fromKey !== "object") {
      rateValue = String(fromKey);
    }

    if (!rateValue && row.idProduct && byProduct?.[row.idProduct]) {
      const entry = byProduct[row.idProduct];
      if (entry && typeof entry === "object") {
        rateChecked = !!entry.checked;
        rateValue = entry.value != null ? String(entry.value) : rateValue;
      }
    }

    if (!rateValue && !rateChecked) return row;
    return recalculateRowAmounts({ ...row, rateChecked, rateValue }, "");
  });
}
