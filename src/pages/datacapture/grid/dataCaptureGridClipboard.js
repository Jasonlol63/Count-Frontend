/**
 * Context menu clipboard actions — extracted from js/datacapture.js.
 */
import { hideContextMenu } from "../lib/dataCaptureContextMenu.js";
import {
  gridHandleCellPaste,
  gridRecomputeSubmitState,
} from "../lib/dataCaptureBridge.js";
import {
  clearAllSelections,
  getSelectedCellCount,
  getSelectedCells,
  registerSelectedCell,
} from "./dataCaptureGridSelection.js";

function recomputeSubmitState() {
  gridRecomputeSubmitState();
}

export function copySelectedCells() {
  if (getSelectedCellCount() === 0) return;

  const cellPositions = getSelectedCells().map((cell) => {
    const row = cell.parentNode;
    const table = row.parentNode;
    const rowIndex = Array.from(table.children).indexOf(row);
    const colIndex = parseInt(cell.dataset.col, 10);
    return { row: rowIndex, col: colIndex, value: cell.textContent };
  });

  const rows = cellPositions.map((pos) => pos.row);
  const cols = cellPositions.map((pos) => pos.col);
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);

  const dataMatrix = [];
  for (let ri = minRow; ri <= maxRow; ri++) {
    const row = [];
    for (let ci = minCol; ci <= maxCol; ci++) {
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
    window.showNotification?.("Failed to access clipboard", "danger");
  });

  hideContextMenu();
}

export function clearSelectedCells() {
  const cellsToClear = getSelectedCells().filter(
    (cell) => cell && cell.contentEditable === "true" && cell.closest("#dataTable"),
  );

  cellsToClear.forEach((cell) => {
    cell.textContent = "";
  });

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
