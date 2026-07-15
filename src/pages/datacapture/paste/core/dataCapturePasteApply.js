import {
  GROUP_ONLY_GRID_COLS,
  MAX_GRID_COLS,
  MAX_GRID_ROWS,
} from "../../grid/dataCaptureGridMeta.js";
import {
  applyMatrixPatch,
  findLastFilledGridRowIndex,
  gridRowHasEditableData,
  resizeGrid,
  setCell,
} from "../../grid/gridModel.js";
import { parseAndFillHTMLTable } from "./dataCaptureParseGenericHtml.js";
import { commitPasteGridCheckpoint } from "../../grid/dataCaptureGridPasteHistory.js";
import {
  ensurePasteTableInitialized,
  getFirstSelectedGridCell,
  getPasteGridModel,
  notifyPasteUser,
  replacePasteGridModel,
  recomputeSubmitStateAfterPaste,
} from "../../lib/dataCaptureBridge.js";
import { getDataCaptureState } from "../../lib/dataCaptureRuntime.js";
import { alignTotalRowsInMatrix, alignTotalRowArray } from "./dataCaptureTotalRowAlign.js";

export function parseGenericHtmlTable(htmlString, startCell) {
  return parseAndFillHTMLTable(htmlString, startCell);
}

function alignTotalRowsInGrid(grid, startRow = 0, rowCount = null) {
  if (!grid?.cells?.length) return grid;

  const endRow = rowCount != null ? Math.min(grid.rows, startRow + rowCount) : grid.rows;
  let next = grid;
  let changed = false;

  for (let r = startRow; r < endRow; r += 1) {
    const row = grid.cells[r];
    if (!row?.length) continue;

    const values = row.map((cell) => String(cell?.value ?? ""));
    const alignedValues = alignTotalRowArray(values);
    if (alignedValues === values) continue;

    for (let c = 0; c < grid.cols; c += 1) {
      const value = alignedValues[c] ?? "";
      const prev = row[c];
      if (String(prev?.value ?? "") === value) continue;
      next = setCell(next, r, c, {
        value,
        html: undefined,
        ...(prev?.style ? { style: prev.style } : {}),
        ...(prev?.className ? { className: prev.className } : {}),
      });
      changed = true;
    }
  }

  if (changed) {
    console.log("Grid model: aligned TOTAL row columns to match PHP.");
  }

  return next;
}

function pasteGridCaps() {
  if (getDataCaptureState().isGroupOnlyGrid === true) {
    return { maxRows: MAX_GRID_ROWS, maxCols: GROUP_ONLY_GRID_COLS };
  }
  return { maxRows: MAX_GRID_ROWS, maxCols: MAX_GRID_COLS };
}

/** Shared grid helpers for paste modules (no legacy script required). */
export function ensurePasteGrid(rows, cols) {
  const { maxRows, maxCols } = pasteGridCaps();
  const targetRows = Math.max(1, Math.min(Number(rows) || 1, maxRows));
  const targetCols = Math.max(1, Math.min(Number(cols) || 1, maxCols));
  const grid = getPasteGridModel();

  if (!grid || grid.rows < 1 || grid.cols < 1) {
    ensurePasteTableInitialized(targetRows, targetCols);
    return getPasteGridModel();
  }

  if (targetRows <= grid.rows && targetCols <= grid.cols) {
    return grid;
  }

  const resized = resizeGrid(grid, targetRows, targetCols);
  replacePasteGridModel(resized);
  return resized;
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
 * Prefer the selected/active grid cell when present; otherwise append after the
 * last filled row (or row 0 on an empty grid).
 */
export function resolveFormatPasteStartRow(anchorCell = null) {
  const cell = anchorCell || getFormatPasteAnchorCell();
  if (cell?.closest?.("#tableBody")) {
    return resolvePasteAnchor(cell).startRow;
  }

  const lastFilled = findLastFilledGridRow();
  return lastFilled >= 0 ? lastFilled + 1 : 0;
}

export function ensureGridFits(startRow, startCol, matrixRows, matrixCols) {
  const { rows: currentRows, cols: currentCols } = getGridSize();
  const requiredRows = startRow + matrixRows;
  const requiredCols = startCol + matrixCols;
  if (requiredRows <= currentRows && requiredCols <= currentCols) {
    return getPasteGridModel();
  }

  const { maxRows, maxCols } = pasteGridCaps();
  const targetRows = Math.max(currentRows, Math.min(requiredRows, maxRows));
  const targetCols = Math.max(currentCols, Math.min(requiredCols, maxCols));
  return ensurePasteGrid(targetRows, targetCols);
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
    deferUndoCheckpoint = false,
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
  const { deferUndoCheckpoint = false, ...gridOptions } = options;
  const result = applyDataMatrixToGridModel(dataMatrix, anchorCell, gridOptions);
  if (result.successCount > 0 && !deferUndoCheckpoint) {
    commitPasteGridCheckpoint(result.updatedGrid ?? getPasteGridModel());
  }
  return result;
}

function applyDataMatrixToGridModel(dataMatrix, anchorCell, options = {}) {
  const { startColOverride = null, startRowOverride = null, alignTotalRows = true } = options;

  if (!dataMatrix?.length) return { successCount: 0, changes: [] };

  const sourceMatrix = alignTotalRows ? alignTotalRowsInMatrix(dataMatrix) : dataMatrix;
  const maxCols = Math.max(...sourceMatrix.map((row) => row.length));
  const { startRow: anchorRow, startCol: anchorCol } = resolvePasteAnchor(anchorCell);
  const startRow = startRowOverride != null ? startRowOverride : anchorRow;
  const startCol = startColOverride != null ? startColOverride : anchorCol;

  const gridBefore = getPasteGridModel();
  if (!gridBefore) return { successCount: 0, changes: [] };

  const grid = ensureGridFits(startRow, startCol, sourceMatrix.length, maxCols) || gridBefore;

  const matrixForPatch = sourceMatrix.map((rowData, rowIndex) =>
    rowData.map((cellData, colIndex) =>
      resolvePasteCellPatch(cellData, rowIndex, colIndex, options),
    ),
  );

  const changes = [];
  matrixForPatch.forEach((rowData, rowIndex) => {
    rowData.forEach((patch, colIndex) => {
      const r = startRow + rowIndex;
      const c = startCol + colIndex;
      const oldCell = grid.cells[r]?.[c] ?? {};
      changes.push({
        row: r,
        col: c,
        oldValue: oldCell.value ?? "",
        newValue: patch.value ?? "",
        oldHtml: oldCell.html,
        oldStyle: oldCell.style,
        oldStyleCssText: oldCell.styleCssText,
        oldClassName: oldCell.className,
        oldColspan: oldCell.colspan,
        oldHidden: oldCell.hidden,
      });
    });
  });

  let updatedGrid = applyMatrixPatch(grid, startRow, startCol, matrixForPatch);
  if (alignTotalRows) {
    updatedGrid = alignTotalRowsInGrid(updatedGrid, startRow, sourceMatrix.length);
  }
  replacePasteGridModel(updatedGrid);
  recomputeSubmitStateAfterPaste();

  const successCount = changes.filter((c) => String(c.newValue || "").trim() !== "").length;
  return { successCount, changes, maxRows: sourceMatrix.length, maxCols, updatedGrid };
}

export function notifyPasteSuccess(message, level = "success") {
  notifyPasteUser(message, level);
}
