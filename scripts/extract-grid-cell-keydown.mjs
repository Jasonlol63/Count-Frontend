import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const srcPath = path.join(root, "js/datacapture.js");
const outPath = path.join(root, "frontend/src/pages/datacapture/dataCaptureGridCellKeydown.js");
const lines = fs.readFileSync(srcPath, "utf8").split("\n");

const START = 22302;
const END = 22481;

let code = lines.slice(START - 1, END).join("\n");

code = code
  .replace(/\bpasteHistory\.length > 0\b/g, "hasPasteHistory()")
  .replace(/\bundoLastPaste\(\)/g, "undoLastPaste()")
  .replace(/\bselectedCells\.has\(cell\)/g, "getSelectedCells().includes(cell)")
  .replace(/\bupdateSubmitButtonState\(\)/g, "recomputeSubmitState()")
  .replace(/\bclearAllSelections\(\)/g, "clearAllSelections()")
  .replace(/\bsetActiveCellWithoutFocus\(/g, "setActiveCellWithoutFocus(")
  .replace(/\bsetActiveCell\(/g, "setActiveCell(")
  .replace(/\baddNewColumn\(\)/g, "addNewColumn()")
  .replace(/\baddNewRow\(\)/g, "addNewRow()");

const header = `/**
 * Per-cell keyboard (Tab/Enter/arrows/Delete/Ctrl+Z) — extracted from js/datacapture.js.
 * Re-run: node frontend/scripts/extract-grid-cell-keydown.mjs
 */

function hasPasteHistory() {
  return window.__DC_HAS_PASTE_HISTORY__?.() ?? false;
}

function undoLastPaste() {
  window.__DC_UNDO_LAST_PASTE__?.();
}

function getSelectedCells() {
  return window.__DC_GET_SELECTED_CELLS__?.() ?? [];
}

function recomputeSubmitState() {
  window.__DC_RECOMPUTE_SUBMIT_STATE__?.();
}

function clearAllSelections() {
  window.__DC_CLEAR_ALL_SELECTIONS__?.();
}

function setActiveCellWithoutFocus(cell) {
  window.__DC_SET_ACTIVE_CELL_WITHOUT_FOCUS__?.(cell);
}

function setActiveCell(cell) {
  window.__DC_SET_ACTIVE_CELL__?.(cell);
}

function addNewColumn() {
  return window.__DC_ADD_NEW_COLUMN__?.() ?? null;
}

function addNewRow() {
  return window.__DC_ADD_NEW_ROW__?.() ?? null;
}

export function handleCellKeydown(e) {
`;

fs.writeFileSync(outPath, header + code.trimStart() + "\n}\n");
console.log(`[extract-grid-cell-keydown] → ${path.relative(root, outPath)}`);
