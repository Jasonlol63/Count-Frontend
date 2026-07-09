import {
  getPasteGridModel,
  notifyPasteUser,
  replacePasteGridModel,
} from "../lib/dataCaptureBridge.js";
import { setCell } from "./gridModel.js";

const MAX_HISTORY_SIZE = 50;

export const pasteHistory = [];

export function pushPasteHistory(changes) {
  if (!Array.isArray(changes) || changes.length === 0) return;
  pasteHistory.push(changes);
  if (pasteHistory.length > MAX_HISTORY_SIZE) {
    pasteHistory.shift();
  }
}

export function clearPasteHistory() {
  pasteHistory.length = 0;
}

export function hasPasteHistory() {
  return pasteHistory.length > 0;
}

export function undoLastPaste() {
  if (pasteHistory.length === 0) {
    notifyPasteUser("No paste operation to undo", "danger");
    return;
  }

  const lastPaste = pasteHistory.pop();
  let grid = getPasteGridModel();
  if (!grid) return;

  let undoCount = 0;
  lastPaste.forEach((change) => {
    if (grid.cells?.[change.row]?.[change.col]) {
      grid = setCell(grid, change.row, change.col, { value: change.oldValue ?? "" });
      undoCount += 1;
    }
  });

  replacePasteGridModel(grid);
  notifyPasteUser(`Undo completed: ${undoCount} cells restored`, "success");
}
