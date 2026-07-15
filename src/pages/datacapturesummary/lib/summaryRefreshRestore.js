import { recalculateRowAmounts } from "../table/summaryRowAmount.js";
import { loadSummaryRateMapsFromStorage } from "./summaryStorage.js";
import { buildSummaryRowStableKey } from "./summaryRefreshStatePure.js";

/** Restore rate checkbox/value from refresh storage onto populated rows. */
export function restoreRateValuesOnRows(rows, captureScope = null) {
  const { byKey, byProduct } = loadSummaryRateMapsFromStorage(captureScope);
  if (!Object.keys(byKey).length && !Object.keys(byProduct).length) return rows;

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
