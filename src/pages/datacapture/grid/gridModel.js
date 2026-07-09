import { MoneyDecimal } from "../../../utils/money/moneyDecimal.js";
import { getRowLabel } from "./dataCaptureGridMeta.js";

/** Matches legacy `convertBracketedToNegative` in `js/datacapture.js`. */
export function convertBracketedToNegative(value) {
  if (!value || typeof value !== "string") return value;

  const trimmed = value.trim();
  const bracketPattern1 = /^\([\d,]+(\.\d+)?\)$/;
  const bracketPattern2 = /^\(\$[\d,]+(\.\d+)?\)$/;

  let hasDollarSign = false;
  let numberStr = "";

  if (bracketPattern2.test(trimmed)) {
    hasDollarSign = true;
    numberStr = trimmed.slice(2, -1);
  } else if (bracketPattern1.test(trimmed)) {
    numberStr = trimmed.slice(1, -1);
  } else {
    return value;
  }

  const numberWithoutCommas = numberStr.replace(/,/g, "");
  try {
    if (typeof MoneyDecimal?.toDecimal === "function") {
      MoneyDecimal.toDecimal(numberWithoutCommas);
    }
    let formattedNumber = "";
    if (numberWithoutCommas.includes(".")) {
      const parts = numberWithoutCommas.split(".");
      const formattedInteger = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      formattedNumber = `-${formattedInteger}${parts[1] ? `.${parts[1]}` : ""}`;
    } else {
      formattedNumber = `-${numberWithoutCommas.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
    }
    if (hasDollarSign) {
      return `-$${formattedNumber.substring(1)}`;
    }
    return formattedNumber;
  } catch {
    return value;
  }
}

const FORMAT_LABEL_FIRST_COLUMNS = new Set(["AGENT", "PLAYER", "MEMBER", "USER"]);

function emptyCell() {
  return { value: "" };
}

function normalizeCellPatch(patch) {
  if (patch == null) return emptyCell();
  if (typeof patch === "string") return { value: patch };
  return { ...emptyCell(), ...patch };
}

function isPlaceholderIdColumn(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return true;
  if (/^\d{1,2}$/.test(trimmed)) return true;
  return FORMAT_LABEL_FIRST_COLUMNS.has(trimmed.toUpperCase());
}

function swapRowDataCells(a, b) {
  const tempValue = a.value;
  a.value = b.value;
  b.value = tempValue;
  const tempColspan = a.colspan;
  a.colspan = b.colspan;
  b.colspan = tempColspan;
  const tempCol = a.col;
  a.col = b.col;
  b.col = tempCol;
}

function normalizeIdProductColumnForRow(rowData, captureType, rowIndex) {
  if (!["1.Text", "2.Format", "4.RETURN"].includes(captureType) || rowData.length <= 1) {
    return;
  }

  const firstDataCell = rowData[1];
  if (firstDataCell?.type !== "data") return;

  if (isPlaceholderIdColumn(firstDataCell.value)) {
    for (let i = 2; i < rowData.length; i += 1) {
      const cell = rowData[i];
      if (cell?.type !== "data") continue;
      const candidate = String(cell.value || "").trim();
      if (!candidate || FORMAT_LABEL_FIRST_COLUMNS.has(candidate.toUpperCase())) continue;
      swapRowDataCells(firstDataCell, cell);
      console.log(
        `${captureType}: Row ${rowIndex} - adjusted id product from column ${cell.col + 1} (value: "${candidate}") to first column`,
      );
      return;
    }
  }
}

/** @typedef {{ value: string, html?: string, colspan?: number, hidden?: boolean, style?: Record<string, string>, className?: string }} GridCell */

/**
 * @typedef {{
 *   rows: number,
 *   cols: number,
 *   cells: GridCell[][],
 *   rowLabels: string[],
 * }} DataCaptureGridModel
 */

export function createEmptyGrid(rows = 26, cols = 20) {
  const r = Math.max(1, Number(rows) || 26);
  const c = Math.max(1, Number(cols) || 20);
  const cells = Array.from({ length: r }, () => Array.from({ length: c }, () => emptyCell()));
  const rowLabels = Array.from({ length: r }, (_, i) => getRowLabel(i));
  return { rows: r, cols: c, cells, rowLabels };
}

export function setCell(grid, rowIndex, colIndex, patch) {
  const r = Math.max(0, Number(rowIndex) || 0);
  const c = Math.max(0, Number(colIndex) || 0);
  if (!grid?.cells?.[r]?.[c]) return grid;
  const nextCells = grid.cells.map((row, ri) =>
    ri === r ? row.map((cell, ci) => (ci === c ? { ...cell, ...normalizeCellPatch(patch) } : cell)) : row,
  );
  return { ...grid, cells: nextCells };
}

export function applyMatrixPatch(grid, startRow, startCol, matrix) {
  if (!Array.isArray(matrix) || !matrix.length) return grid;
  let next = grid;
  matrix.forEach((rowValues, dr) => {
    if (!Array.isArray(rowValues)) return;
    rowValues.forEach((value, dc) => {
      const patch = typeof value === "object" && value != null ? value : { value: String(value ?? "") };
      next = setCell(next, startRow + dr, startCol + dc, patch);
    });
  });
  return next;
}

function resizeGridCells(cells, rows, cols) {
  const next = Array.from({ length: rows }, (_, r) => {
    const prevRow = cells[r] || [];
    return Array.from({ length: cols }, (_, c) => prevRow[c] || emptyCell());
  });
  return next;
}

export function insertRow(grid, atIndex) {
  const index = Math.min(Math.max(0, Number(atIndex) || 0), grid.rows);
  const newRow = Array.from({ length: grid.cols }, () => emptyCell());
  const cells = [...grid.cells.slice(0, index), newRow, ...grid.cells.slice(index)];
  const rowLabels = Array.from({ length: cells.length }, (_, i) => getRowLabel(i));
  return { ...grid, rows: cells.length, cells, rowLabels };
}

export function deleteRow(grid, atIndex) {
  if (grid.rows <= 1) return grid;
  const index = Math.min(Math.max(0, Number(atIndex) || 0), grid.rows - 1);
  const cells = [...grid.cells.slice(0, index), ...grid.cells.slice(index + 1)];
  const rowLabels = Array.from({ length: cells.length }, (_, i) => getRowLabel(i));
  return { ...grid, rows: cells.length, cells, rowLabels };
}

export function insertCol(grid, atIndex) {
  const index = Math.min(Math.max(0, Number(atIndex) || 0), grid.cols);
  const cells = grid.cells.map((row) => [...row.slice(0, index), emptyCell(), ...row.slice(index)]);
  return { ...grid, cols: grid.cols + 1, cells };
}

export function deleteCol(grid, atIndex) {
  if (grid.cols <= 1) return grid;
  const index = Math.min(Math.max(0, Number(atIndex) || 0), grid.cols - 1);
  const cells = grid.cells.map((row) => [...row.slice(0, index), ...row.slice(index + 1)]);
  return { ...grid, cols: grid.cols - 1, cells };
}

export function appendGridRow(grid) {
  return insertRow(grid, grid.rows);
}

export function appendGridColumn(grid) {
  return insertCol(grid, grid.cols);
}

/**
 * Convert grid model to the snapshot shape used by `saveCaptureSession`.
 */
export function gridToSnapshot(grid, captureType = "1.Text") {
  const tableData = {
    headers: [""],
    rows: [],
    rowCount: grid.rows,
    colCount: grid.cols + 1,
  };

  for (let c = 1; c <= grid.cols; c += 1) {
    tableData.headers.push(String(c));
  }

  let maxDataCols = 0;
  const allRowData = [];

  grid.cells.forEach((row, rowIndex) => {
    const rowData = [{ type: "header", value: grid.rowLabels[rowIndex] || getRowLabel(rowIndex) }];

    row.forEach((cell, colIndex) => {
      if (cell?.hidden && !String(cell.value || "").trim()) return;

      let cellValue = convertBracketedToNegative(String(cell?.value || "").trim().toUpperCase());
      const colspan = cell?.colspan && cell.colspan > 1 ? cell.colspan : undefined;

      rowData.push({
        type: "data",
        value: cellValue,
        col: colIndex,
        ...(colspan ? { colspan } : {}),
      });
    });

    normalizeIdProductColumnForRow(rowData, captureType, rowIndex);

    const dataCols = rowData.length - 1;
    if (dataCols > maxDataCols) maxDataCols = dataCols;
    allRowData.push(rowData);
  });

  allRowData.forEach((rowData) => {
    const currentDataCols = rowData.length - 1;
    if (currentDataCols < maxDataCols) {
      for (let i = currentDataCols; i < maxDataCols; i += 1) {
        rowData.push({ type: "data", value: "", col: i });
      }
    }
  });

  tableData.colCount = maxDataCols + 1;
  if (tableData.headers.length < tableData.colCount) {
    for (let i = tableData.headers.length; i < tableData.colCount; i += 1) {
      tableData.headers.push(i === 0 ? "" : String(i));
    }
  } else if (tableData.headers.length > tableData.colCount) {
    tableData.headers = tableData.headers.slice(0, tableData.colCount);
  }

  tableData.rows = allRowData;
  tableData.rowCount = allRowData.length;
  return tableData;
}

/** Restore grid model from a session snapshot. */
export function snapshotToGrid(snapshot, fallbackRows = 26, fallbackCols = 20) {
  const rows = snapshot?.rowCount || snapshot?.rows?.length || fallbackRows;
  const cols = Math.max(1, (snapshot?.colCount || fallbackCols + 1) - 1);
  const grid = createEmptyGrid(rows, cols);

  if (!snapshot?.rows?.length) return grid;

  snapshot.rows.forEach((rowData, rowIndex) => {
    if (!Array.isArray(rowData)) return;
    rowData.forEach((cellData, colIndex) => {
      if (cellData?.type !== "data") return;
      const domColIndex = typeof cellData.col === "number" ? cellData.col : colIndex >= 1 ? colIndex - 1 : null;
      if (domColIndex == null || domColIndex < 0 || domColIndex >= grid.cols) return;

      const patch = {
        value: cellData.value || "",
        ...(cellData.colspan && cellData.colspan > 1 ? { colspan: cellData.colspan } : {}),
      };
      grid.cells[rowIndex][domColIndex] = { ...grid.cells[rowIndex][domColIndex], ...patch };

      if (cellData.colspan && cellData.colspan > 1) {
        for (let i = 1; i < cellData.colspan; i += 1) {
          const hiddenCol = domColIndex + i;
          if (hiddenCol < grid.cols) {
            grid.cells[rowIndex][hiddenCol] = { ...grid.cells[rowIndex][hiddenCol], hidden: true };
          }
        }
      }
    });
  });

  return grid;
}

export function gridModelHasEditableData(grid) {
  if (!grid?.cells?.length) return false;
  return grid.cells.some((row) =>
    row.some((cell) => String(cell?.value || "").trim() !== ""),
  );
}

export function getGridCellValue(grid, rowIndex, colIndex) {
  return String(grid?.cells?.[rowIndex]?.[colIndex]?.value ?? "");
}

export function gridRowHasEditableData(grid, rowIndex) {
  const row = grid?.cells?.[rowIndex];
  if (!row) return false;
  return row.some((cell) => String(cell?.value || "").trim() !== "");
}

/** Last row index (inclusive) with any non-empty cell value. */
export function findLastFilledGridRowIndex(grid) {
  if (!grid?.cells?.length) return -1;
  for (let rowIndex = grid.rows - 1; rowIndex >= 0; rowIndex -= 1) {
    if (gridRowHasEditableData(grid, rowIndex)) return rowIndex;
  }
  return -1;
}

/** @param {Array<{ row: number, col: number }>} positions */
export function clearCellsInGrid(grid, positions) {
  if (!grid || !positions?.length) return grid;
  let next = grid;
  positions.forEach(({ row, col }) => {
    next = setCell(next, row, col, { value: "", html: undefined, style: undefined, styleCssText: undefined, className: undefined });
  });
  return next;
}

export function clearGridCells(grid) {
  const cells = grid.cells.map((row) =>
    row.map(() => emptyCell()),
  );
  return { ...grid, cells };
}

export function resizeGrid(grid, rows, cols) {
  const r = Math.max(1, Number(rows) || grid.rows);
  const c = Math.max(1, Number(cols) || grid.cols);
  return {
    ...grid,
    rows: r,
    cols: c,
    cells: resizeGridCells(grid.cells, r, c),
    rowLabels: Array.from({ length: r }, (_, i) => getRowLabel(i)),
  };
}
