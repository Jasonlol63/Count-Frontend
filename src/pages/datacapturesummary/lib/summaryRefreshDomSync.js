import { recalculateRowAmounts } from "../table/summaryRowAmount.js";

/**
 * Merge in-progress Rate Value / Rate checkbox edits from the live table DOM.
 * contentEditable cells only commit to React state on blur; refresh/back must read DOM first.
 */
export function mergeRowsWithSummaryDomDraft(rows) {
  const domSyncedKeys = new Set();
  if (!Array.isArray(rows) || rows.length === 0) {
    return { rows, domSyncedKeys };
  }

  const tbody = document.getElementById("summaryTableBody");
  if (!tbody) return { rows, domSyncedKeys };

  const domByKey = new Map();
  for (const tr of tbody.querySelectorAll("tr[data-react-row-key]")) {
    const key = tr.getAttribute("data-react-row-key");
    if (!key) continue;
    const rateCell = tr.querySelector('[data-summary-field="rateValue"]');
    const checkbox = tr.querySelector("input.rate-checkbox");
    domByKey.set(key, {
      rateValue: rateCell ? String(rateCell.textContent || "").trim() : null,
      rateChecked: checkbox ? checkbox.checked : null,
    });
    domSyncedKeys.add(key);
  }

  if (domByKey.size === 0) return { rows, domSyncedKeys };

  let changed = false;
  const next = rows.map((row) => {
    const dom = domByKey.get(row.key);
    if (!dom) return row;

    const patch = {};
    if (dom.rateValue !== null && dom.rateValue !== String(row.rateValue || "").trim()) {
      patch.rateValue = dom.rateValue;
    }
    if (dom.rateChecked !== null && dom.rateChecked !== !!row.rateChecked) {
      patch.rateChecked = dom.rateChecked;
      if (!dom.rateChecked && dom.rateValue === "") {
        patch.rateValue = "";
      }
    }

    if (!Object.keys(patch).length) return row;
    changed = true;
    return recalculateRowAmounts({ ...row, ...patch }, "");
  });

  return { rows: changed ? next : rows, domSyncedKeys };
}
