import { normalizeSummaryIdProductText } from "./summaryIdProductUtils.js";

export const SUMMARY_SUPPRESSED_ROWS_KEY = "summarySuppressedRowKeys";

/** Stable key for a summary row within one capture round (rowIndex + idProduct). */
export function makeSuppressionKey(row) {
  if (!row) return "";
  const id = normalizeSummaryIdProductText(row.idProduct || "");
  const ri = row.rowIndex != null && !Number.isNaN(Number(row.rowIndex)) ? String(row.rowIndex) : "";
  const pt = row.productType === "sub" ? "sub" : "main";
  return `${pt}|${ri}|${id}`;
}

export function loadSuppressedRowKeys() {
  try {
    const raw = localStorage.getItem(SUMMARY_SUPPRESSED_ROWS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

export function saveSuppressedRowKeys(keys) {
  const list = [...(keys instanceof Set ? keys : new Set(keys))].filter(Boolean);
  if (!list.length) {
    localStorage.removeItem(SUMMARY_SUPPRESSED_ROWS_KEY);
    return;
  }
  localStorage.setItem(SUMMARY_SUPPRESSED_ROWS_KEY, JSON.stringify(list));
}

export function addSuppressedRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return;
  const set = loadSuppressedRowKeys();
  for (const row of rows) {
    const key = makeSuppressionKey(row);
    if (key) set.add(key);
  }
  saveSuppressedRowKeys(set);
}

export function removeSuppressedRow(row) {
  const key = makeSuppressionKey(row);
  if (!key) return;
  const set = loadSuppressedRowKeys();
  if (!set.delete(key)) return;
  saveSuppressedRowKeys(set);
}

export function clearSuppressedRowKeys() {
  localStorage.removeItem(SUMMARY_SUPPRESSED_ROWS_KEY);
}

export function isRowSuppressed(row, suppressed = loadSuppressedRowKeys()) {
  const key = makeSuppressionKey(row);
  return key ? suppressed.has(key) : false;
}

export function isParentRowSuppressed(subRow, rows, suppressed = loadSuppressedRowKeys()) {
  if (!subRow || subRow.productType !== "sub") return false;
  const parentNorm = normalizeSummaryIdProductText(subRow.parentIdProduct || "");
  const parent = rows.find(
    (r) =>
      r.productType === "main" &&
      (normalizeSummaryIdProductText(r.idProduct) === parentNorm ||
        r.rowIndex === subRow.parentRowIndex)
  );
  return parent ? isRowSuppressed(parent, suppressed) : false;
}
