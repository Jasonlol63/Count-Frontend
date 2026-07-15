/**
 * Grid multi-selection state and clipboard actions.
 */
import {
  getBridgeCellValue,
  gridHandleCellPaste,
  gridRecomputeSubmitState,
  notifyPasteUser,
} from "../lib/dataCaptureBridge.js";
import {
  buildSyntheticPasteEvent,
  readClipboardForPaste,
} from "../paste/core/dataCaptureClipboard.js";
import { callDataCaptureRuntime } from "../lib/dataCaptureRuntime.js";
import { hideContextMenu } from "../lib/dataCaptureContextMenu.js";

export const selectedCells = new Set();

export function clearAllSelections() {
  selectedCells.forEach((cell) => {
    cell.classList.remove("multi-selected");
  });
  selectedCells.clear();

  document.querySelectorAll("#dataTable th").forEach((header) => {
    header.classList.remove("column-selected");
    header.classList.remove("column-active");
  });

  document.querySelectorAll(".row-header").forEach((header) => {
    header.classList.remove("row-selected");
    header.classList.remove("row-active");
  });
}

export function registerSelectedCell(cell) {
  if (cell) selectedCells.add(cell);
}

export function unregisterSelectedCell(cell) {
  if (cell) selectedCells.delete(cell);
}

export function getSelectedCells() {
  return Array.from(selectedCells);
}

export function getSelectedCellCount() {
  return selectedCells.size;
}

export function hasSelectedCell(cell) {
  return selectedCells.has(cell);
}

function recomputeSubmitState() {
  gridRecomputeSubmitState();
}

function cellPosition(cell) {
  if (!cell?.dataset) return null;
  const rowIndex = Number.parseInt(cell.dataset.row, 10);
  const colIndex = Number.parseInt(cell.dataset.col, 10);
  if (!Number.isFinite(rowIndex) || !Number.isFinite(colIndex)) return null;
  return { rowIndex, colIndex };
}

export function getSelectedCellPositions() {
  return getSelectedCells()
    .filter((cell) => cell && cell.contentEditable === "true" && cell.closest("#dataTable"))
    .map((cell) => cellPosition(cell))
    .filter(Boolean);
}

export function getSelectedCellBounds() {
  const positions = getSelectedCellPositions();
  if (!positions.length) return null;

  const rows = positions.map((p) => p.rowIndex);
  const cols = positions.map((p) => p.colIndex);
  return {
    minRow: Math.min(...rows),
    maxRow: Math.max(...rows),
    minCol: Math.min(...cols),
    maxCol: Math.max(...cols),
    rowIndices: [...new Set(rows)].sort((a, b) => a - b),
    colIndices: [...new Set(cols)].sort((a, b) => a - b),
  };
}

export function copySelectedCells() {
  if (getSelectedCellCount() === 0) return;

  const cellPositions = getSelectedCells()
    .map((cell) => {
      const pos = cellPosition(cell);
      if (!pos) return null;
      return {
        row: pos.rowIndex,
        col: pos.colIndex,
        value: getBridgeCellValue(pos.rowIndex, pos.colIndex),
      };
    })
    .filter(Boolean);

  const rows = cellPositions.map((pos) => pos.row);
  const cols = cellPositions.map((pos) => pos.col);
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);

  const dataMatrix = [];
  for (let ri = minRow; ri <= maxRow; ri += 1) {
    const row = [];
    for (let ci = minCol; ci <= maxCol; ci += 1) {
      const cellPos = cellPositions.find((pos) => pos.row === ri && pos.col === ci);
      row.push(cellPos ? cellPos.value : "");
    }
    dataMatrix.push(row);
  }

  const textData = dataMatrix.map((row) => row.join("\t")).join("\n");

  navigator.clipboard.writeText(textData).catch((err) => {
    console.error("Failed to copy to clipboard:", err);
  });
}

export function pasteToSelectedCells() {
  const firstCell = getSelectedCells()[0];
  if (!firstCell) return;

  readClipboardForPaste()
    .then(({ text, html }) => {
      gridHandleCellPaste(buildSyntheticPasteEvent(firstCell, { text, html }));
    })
    .catch((err) => {
      console.error("Failed to read from clipboard:", err);
      notifyPasteUser("Failed to access clipboard", "danger");
    });

  hideContextMenu();
}

export function clearSelectedCells() {
  callDataCaptureRuntime("clearSelectedCellsInGrid");
}

export function selectAllCells(e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }

  clearAllSelections();

  const tableBody = document.getElementById("tableBody");
  if (!tableBody) {
    hideContextMenu();
    return;
  }

  const allCells = tableBody.querySelectorAll("td[contenteditable='true']");
  if (allCells.length === 0) {
    hideContextMenu();
    return;
  }

  allCells.forEach((cell) => {
    registerSelectedCell(cell);
    cell.classList.add("multi-selected");
  });

  hideContextMenu();
}
