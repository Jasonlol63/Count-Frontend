/**
 * Grid multi-selection state and clipboard actions.
 */
import {
  clearBridgeCells,
  getBridgeCellValue,
  gridHandleCellPaste,
  gridRecomputeSubmitState,
  notifyPasteUser,
} from "../lib/dataCaptureBridge.js";
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
  if (!cell?.parentNode?.parentNode) return null;
  const row = cell.parentNode;
  const table = row.parentNode;
  const rowIndex = Array.from(table.children).indexOf(row);
  const colIndex = Number.parseInt(cell.dataset.col, 10);
  if (rowIndex < 0 || !Number.isFinite(colIndex)) return null;
  return { rowIndex, colIndex };
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

  navigator.clipboard.readText().then((text) => {
    const mockEvent = {
      preventDefault() {},
      clipboardData: { getData: () => text },
      target: firstCell,
    };
    gridHandleCellPaste(mockEvent);
  }).catch((err) => {
    console.error("Failed to read from clipboard:", err);
    notifyPasteUser("Failed to access clipboard", "danger");
  });

  hideContextMenu();
}

export function clearSelectedCells() {
  const positions = getSelectedCells()
    .filter((cell) => cell && cell.contentEditable === "true" && cell.closest("#dataTable"))
    .map((cell) => cellPosition(cell))
    .filter(Boolean);

  if (positions.length) {
    clearBridgeCells(positions);
  }

  hideContextMenu();
  recomputeSubmitState();
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
