import { insertSubRowInModel } from "../table/summaryRowModel.js";
import { createEmptyRowFields } from "../table/summaryRowData.js";

function nextSubOrder(rows, parentIdProduct) {
  const parent = String(parentIdProduct || "").trim();
  let max = 0;
  for (const row of rows) {
    if (row.productType !== "sub") continue;
    if (String(row.parentIdProduct || "").trim() !== parent) continue;
    const n = row.subOrder != null ? Number(row.subOrder) : 0;
    if (!Number.isNaN(n)) max = Math.max(max, n);
  }
  return max + 1;
}

/**
 * Resolve where a formula save should land (update main, insert sub, etc.).
 * @returns {{ action: 'update', key: string } | { action: 'insertSub', afterKey: string, newKey: string, rows: object[] }}
 */
export function applyFormulaSaveToRows(rows, anchorRow, mode, patch) {
  if (!anchorRow) {
    return { action: "update", key: "", rows };
  }

  if (mode === "edit") {
    const next = rows.map((r) => (r.key === anchorRow.key ? { ...r, ...patch } : r));
    return { action: "update", key: anchorRow.key, rows: next, targetRow: { ...anchorRow, ...patch } };
  }

  const mainHasAccount =
    anchorRow.productType === "main" && String(anchorRow.account || "").trim() !== "";
  const shouldInsertSub =
    anchorRow.productType === "sub" || (anchorRow.productType === "main" && mainHasAccount);

  if (!shouldInsertSub) {
    const next = rows.map((r) => (r.key === anchorRow.key ? { ...r, ...patch } : r));
    return { action: "update", key: anchorRow.key, rows: next, targetRow: { ...anchorRow, ...patch } };
  }

  const { rows: withSub, newKey } = insertSubRowInModel(
    rows,
    anchorRow.idProduct,
    anchorRow.key,
    anchorRow.rowIndex
  );
  const subOrder = nextSubOrder(rows, anchorRow.idProduct) || 1;
  const next = withSub.map((r) =>
    r.key === newKey
      ? {
          ...r,
          ...createEmptyRowFields(),
          ...patch,
          productType: "sub",
          subOrder,
          parentIdProduct: anchorRow.idProduct,
          parentRowIndex: anchorRow.parentRowIndex ?? anchorRow.rowIndex,
        }
      : r
  );
  const targetRow = next.find((r) => r.key === newKey);
  return { action: "insertSub", key: newKey, afterKey: anchorRow.key, rows: next, targetRow };
}
