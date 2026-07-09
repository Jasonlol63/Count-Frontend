import {
  GROUP_ONLY_GRID_COLS,
  MAX_GRID_ROWS,
} from "../../grid/dataCaptureGridMeta.js";
import { applyMatrixPatch, findLastFilledGridRowIndex, gridRowHasEditableData, resizeGrid } from "../../grid/gridModel.js";
import { parseAndFillHTMLTable } from "./dataCaptureParseGenericHtml.js";
import {
  ensurePasteTableInitialized,
  getFirstSelectedGridCell,
  getPasteGridModel,
  notifyPasteUser,
  recordPasteHistory,
  replacePasteGridModel,
  recomputeSubmitStateAfterPaste,
} from "../../lib/dataCaptureBridge.js";
import { getDataCaptureState } from "../../lib/dataCaptureRuntime.js";

export function parseGenericHtmlTable(htmlString, startCell) {
  return parseAndFillHTMLTable(htmlString, startCell);
}

function pasteGridCaps() {
  if (getDataCaptureState().isGroupOnlyGrid === true) {
    return { maxRows: MAX_GRID_ROWS, maxCols: GROUP_ONLY_GRID_COLS };
  }
  return { maxRows: MAX_GRID_ROWS, maxCols: MAX_GRID_ROWS };
}

/** Shared grid helpers for paste modules (no legacy script required). */
export function ensurePasteGrid(rows, cols) {
  const { maxRows, maxCols } = pasteGridCaps();
  const targetRows = Math.max(1, Math.min(Number(rows) || 1, maxRows));
  const targetCols = Math.max(1, Math.min(Number(cols) || 1, maxCols));
  let grid = getPasteGridModel();

  if (!grid || grid.rows < 1 || grid.cols < 1) {
    ensurePasteTableInitialized(targetRows, targetCols);
    return;
  }

  if (targetRows <= grid.rows && targetCols <= grid.cols) return;

  if (findLastFilledGridRow() < 0) {
    ensurePasteTableInitialized(targetRows, targetCols);
    return;
  }

  replacePasteGridModel(resizeGrid(grid, targetRows, targetCols));
}

function getGridSize() {
  const grid = getPasteGridModel();
  if (grid) return { rows: grid.rows, cols: grid.cols };
  return { rows: 26, cols: 20 };
}

export function resolvePasteAnchor(cell) {
  if (cell?.dataset?.row != null && cell?.dataset?.col != null) {
    const startRow = Number.parseInt(cell.dataset.row, 10);
    const startCol = Number.parseInt(cell.dataset.col, 10);
    if (Number.isFinite(startRow) && Number.isFinite(startCol)) {
      return { startRow, startCol };
    }
  }
  if (!cell?.parentNode?.parentNode) return { startRow: 0, startCol: 0 };
  const startRow = Array.from(cell.parentNode.parentNode.children).indexOf(cell.parentNode);
  const startCol = Number.parseInt(cell.dataset.col, 10);
  return {
    startRow: startRow >= 0 ? startRow : 0,
    startCol: Number.isFinite(startCol) ? startCol : 0,
  };
}

/** Last tbody row index that has any editable cell content. */
export function findLastFilledGridRow() {
  const grid = getPasteGridModel();
  if (grid) return findLastFilledGridRowIndex(grid);
  return -1;
}

/** Active/selected grid cell used as 2.Format paste anchor, if any. */
export function getFormatPasteAnchorCell() {
  const active = document.activeElement;
  if (active?.contentEditable === "true" && active.closest("#dataTable")) {
    return active;
  }

  const selected = getFirstSelectedGridCell();
  if (selected?.contentEditable === "true" && selected.closest("#dataTable")) {
    return selected;
  }

  return null;
}

/** Selected/active grid cell, else first editable cell (row A, col 1). */
export function getDefaultPasteAnchorCell() {
  const anchor = getFormatPasteAnchorCell();
  if (anchor) return anchor;

  const tableBody = document.getElementById("tableBody");
  const firstRow = tableBody?.children?.[0];
  const firstCell = firstRow?.querySelector?.('td[contenteditable="true"]');
  return firstCell || null;
}

/** Whether a tbody row has any non-empty editable cell. */
export function rowHasEditableData(rowEl) {
  const grid = getPasteGridModel();
  if (!grid || !rowEl) return false;
  const tableBody = document.getElementById("tableBody");
  const rowIndex = tableBody ? Array.from(tableBody.children).indexOf(rowEl) : -1;
  if (rowIndex < 0) return false;
  return gridRowHasEditableData(grid, rowIndex);
}

/**
 * 2.Format paste start row.
 * When grid already has data, append after the last filled row unless the anchor
 * sits on an empty row below all existing data.
 */
export function resolveFormatPasteStartRow(anchorCell = null) {
  const lastFilled = findLastFilledGridRow();
  const appendRow = lastFilled >= 0 ? lastFilled + 1 : 0;

  const cell = anchorCell || getFormatPasteAnchorCell();
  if (!cell?.closest?.("#tableBody")) {
    return appendRow;
  }

  const anchorRow = resolvePasteAnchor(cell).startRow;
  if (lastFilled < 0) {
    return anchorRow;
  }

  if (anchorRow > lastFilled) {
    return anchorRow;
  }

  const anchorRowEl = cell.closest("tr");
  if (anchorRowEl && !rowHasEditableData(anchorRowEl) && anchorRow >= appendRow) {
    return anchorRow;
  }

  return appendRow;
}

export function ensureGridFits(startRow, startCol, matrixRows, matrixCols) {
  const { rows: currentRows, cols: currentCols } = getGridSize();
  const requiredRows = startRow + matrixRows;
  const requiredCols = startCol + matrixCols;
  if (requiredRows <= currentRows && requiredCols <= currentCols) return;

  const { maxRows, maxCols } = pasteGridCaps();
  const targetRows = Math.max(currentRows, Math.min(requiredRows, maxRows));
  const targetCols = Math.max(currentCols, Math.min(requiredCols, maxCols));
  ensurePasteGrid(targetRows, targetCols);
}

function padMatrixRows(dataMatrix) {
  if (!dataMatrix?.length) return dataMatrix;
  const maxCols = Math.max(...dataMatrix.map((row) => row.length));
  dataMatrix.forEach((row) => {
    while (row.length < maxCols) row.push("");
  });
  return dataMatrix;
}

/** @returns {{ value: string, html?: string, style?: object, className?: string }} */
function resolvePasteCellPatch(rawValue, rowIndex, colIndex, options) {
  const { trimValues = false, uppercaseValues = false, transformCell = null } = options;

  if (rawValue && typeof rawValue === "object" && ("value" in rawValue || "html" in rawValue)) {
    const patch = rawValue;
    return {
      value: patch.value != null ? String(patch.value) : "",
      ...(patch.html ? { html: patch.html } : {}),
      ...(patch.style ? { style: patch.style } : {}),
      ...(patch.styleCssText ? { styleCssText: patch.styleCssText } : {}),
      ...(patch.className ? { className: patch.className } : {}),
    };
  }

  let raw = rawValue ?? "";
  if (trimValues) raw = String(raw).trim();

  if (typeof transformCell === "function") {
    const transformed = transformCell(raw, rowIndex, colIndex);
    if (transformed && typeof transformed === "object") {
      return {
        value: transformed.value != null ? String(transformed.value) : "",
        ...(transformed.html ? { html: transformed.html } : {}),
        ...(transformed.style ? { style: transformed.style } : {}),
        ...(transformed.styleCssText ? { styleCssText: transformed.styleCssText } : {}),
        ...(transformed.className ? { className: transformed.className } : {}),
      };
    }
    return { value: transformed != null ? String(transformed) : "" };
  }

  let value = raw;
  if (uppercaseValues) value = String(value).toUpperCase();
  return { value: String(value) };
}

/** High-level paste helper — pads matrix, applies grid, optional notify. */
export function applyParsedMatrixToGrid(dataMatrix, anchorCell, options = {}) {
  const {
    successMessage,
    emptyMessage,
    dangerOnEmpty = true,
    ...gridOptions
  } = options;

  if (!dataMatrix?.length) {
    return { successCount: 0, changes: [], applied: false, maxRows: 0, maxCols: 0 };
  }

  padMatrixRows(dataMatrix);
  const maxCols = Math.max(...dataMatrix.map((row) => row.length));
  const result = applyDataMatrixToGrid(dataMatrix, anchorCell, gridOptions);

  if (result.successCount > 0 && successMessage) {
    notifyPasteSuccess(successMessage);
  } else if (result.successCount === 0 && emptyMessage) {
    notifyPasteSuccess(emptyMessage, dangerOnEmpty ? "danger" : "success");
  }

  return {
    ...result,
    applied: result.successCount > 0,
    maxRows: dataMatrix.length,
    maxCols,
  };
}

/**
 * Fill editable cells from a 2D matrix (pure-react: grid model; legacy: DOM).
 * @returns {{ successCount: number, changes: Array }}
 */
export function applyDataMatrixToGrid(dataMatrix, anchorCell, options = {}) {
  return applyDataMatrixToGridModel(dataMatrix, anchorCell, options);
}

function applyDataMatrixToGridModel(dataMatrix, anchorCell, options = {}) {
  const { startColOverride = null, startRowOverride = null } = options;

  if (!dataMatrix?.length) return { successCount: 0, changes: [] };

  const maxCols = Math.max(...dataMatrix.map((row) => row.length));
  const { startRow: anchorRow, startCol: anchorCol } = resolvePasteAnchor(anchorCell);
  const startRow = startRowOverride != null ? startRowOverride : anchorRow;
  const startCol = startColOverride != null ? startColOverride : anchorCol;

  ensureGridFits(startRow, startCol, dataMatrix.length, maxCols);

  let grid = getPasteGridModel();
  if (!grid) return { successCount: 0, changes: [] };

  const matrixForPatch = dataMatrix.map((rowData, rowIndex) =>
    rowData.map((cellData, colIndex) =>
      resolvePasteCellPatch(cellData, rowIndex, colIndex, options),
    ),
  );

  const changes = [];
  matrixForPatch.forEach((rowData, rowIndex) => {
    rowData.forEach((patch, colIndex) => {
      const r = startRow + rowIndex;
      const c = startCol + colIndex;
      const oldValue = grid.cells[r]?.[c]?.value ?? "";
      changes.push({ row: r, col: c, oldValue, newValue: patch.value ?? "" });
    });
  });

  grid = applyMatrixPatch(grid, startRow, startCol, matrixForPatch);
  replacePasteGridModel(grid);
  recordPasteHistory(changes);
  recomputeSubmitStateAfterPaste();

  const successCount = changes.filter((c) => String(c.newValue || "").trim() !== "").length;
  return { successCount, changes, maxRows: dataMatrix.length, maxCols };
}

export function notifyPasteSuccess(message, level = "success") {
  notifyPasteUser(message, level);
}
