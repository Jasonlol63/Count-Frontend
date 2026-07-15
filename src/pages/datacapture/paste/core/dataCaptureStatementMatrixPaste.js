/**
 * Citibet-style plain-text matrix paste for billing statements.
 * Used by 1.Text / 2.Format so Material report copies land as Excel-like grids
 * without relying on the HTML format-fill pipeline.
 */
import { applyDataMatrixToGrid, notifyPasteSuccess } from "./dataCapturePasteApply.js";
import { tokenizeCollapsedReportRow } from "./dataCaptureFormatClipboardNormalize.js";
import { parsePlainTextMatrix } from "./dataCaptureTextPaste.js";

export function plainTextLooksLikeBillingStatement(text) {
  const upper = String(text || "")
    .replace(/\u00a0/g, " ")
    .toUpperCase();
  if (!upper.trim()) return false;
  const hasSubtotal = upper.includes("SUBTOTAL") || upper.includes("SUB TOTAL");
  const hasTotalAmount = upper.includes("TOTAL AMOUNT");
  // Agent + SUBTOTAL (no TOTAL AMOUNT) is a common 2-row copy from Report Center.
  return hasSubtotal || hasTotalAmount;
}

/** When parse leaves 1-col rows (space-separated report lines), expand to columns. */
function expandStatementRowsIfCollapsed(dataMatrix) {
  if (!Array.isArray(dataMatrix) || !dataMatrix.length) return dataMatrix;

  const maxCols = Math.max(...dataMatrix.map((row) => (Array.isArray(row) ? row.length : 0)));
  if (maxCols >= 2) return dataMatrix;

  const expanded = dataMatrix.map((row) => {
    const text = (Array.isArray(row) ? row : [row])
      .map((cell) => String(cell ?? "").replace(/\u00a0/g, " ").trim())
      .filter(Boolean)
      .join(" ");
    const tokens = tokenizeCollapsedReportRow(text);
    return tokens.length >= 2 ? tokens : row;
  });

  const expandedCols = Math.max(...expanded.map((row) => (Array.isArray(row) ? row.length : 0)));
  if (expandedCols < 2) return dataMatrix;

  const width = expandedCols;
  return expanded.map((row) => {
    const next = Array.isArray(row) ? [...row] : [row];
    while (next.length < width) next.push("");
    return next;
  });
}

/**
 * Build + apply a multi-column matrix from plain clipboard text (same family as 3.CITIBET).
 * @returns {boolean}
 */
export function tryApplyBillingStatementPlainMatrix(pastedData, anchorCell, options = {}) {
  if (!plainTextLooksLikeBillingStatement(pastedData)) return false;

  let dataMatrix = parsePlainTextMatrix(pastedData);
  if (!dataMatrix.length) return false;

  dataMatrix = expandStatementRowsIfCollapsed(dataMatrix);

  const maxCols = Math.max(...dataMatrix.map((row) => row.length));
  if (maxCols < 2) {
    console.log("Statement plain matrix: still 1-col after parse, skip");
    return false;
  }

  const { successCount, maxRows, maxCols: cols } = applyDataMatrixToGrid(dataMatrix, anchorCell, {
    uppercaseValues: false,
    trimValues: false,
    alignTotalRows: false,
    startRowOverride: options.startRowOverride,
    startColOverride: options.startColOverride,
  });

  if (successCount <= 0) return false;

  console.log(`Statement plain matrix (Citibet-style): ${maxRows} rows x ${cols} cols`, dataMatrix[0]);
  notifyPasteSuccess(
    `成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)，已按Excel矩阵排列!`,
  );
  return true;
}
