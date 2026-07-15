import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const srcPath = path.join(root, "js/datacapture.js");
const outPath = path.join(root, "frontend/src/pages/datacapture/dataCaptureGridDocumentKeyboard.js");
const lines = fs.readFileSync(srcPath, "utf8").split("\n");

/** __dcHandleDocumentGridKeydown body in js/datacapture.js (skip function declaration line). */
const START = 821;
const END = 1100;

let code = lines.slice(START - 1, END).join("\n");

code = code
  .replace(/\btableActive\b/g, "isTableActive()")
  .replace(/\bpasteHistory\.length > 0\b/g, "hasPasteHistory()")
  .replace(/\bundoLastPaste\(\)/g, "undoLastPaste()")
  .replace(/\bclearAllSelections\(\)/g, "clearAllSelections()")
  .replace(/\bselectedCells\.forEach\(/g, "getSelectedCells().forEach(")
  .replace(/\bselectedCells\.size\b/g, "getSelectedCellCount()")
  .replace(/Array\.from\(selectedCells\)/g, "getSelectedCells()")
  .replace(/\bsetActiveCellWithoutFocus\(/g, "setActiveCellWithoutFocus(")
  .replace(/\bsetActiveCell\(/g, "setActiveCell(")
  .replace(/\bmoveCaretToEnd\(/g, "moveCaretToEnd(")
  .replace(/\bupdateSubmitButtonState\(\)/g, "recomputeSubmitState()")
  .replace(/\bselectAllCells\(\)/g, "selectAllCells()")
  .replace(/\bcopySelectedCells\(\)/g, "copySelectedCells()")
  .replace(/\bpasteToSelectedCells\(\)/g, "pasteToSelectedCells()");

const header = `/**
 * Document-level grid keyboard shortcuts — extracted from js/datacapture.js.
 * Re-run: node frontend/scripts/extract-grid-document-keyboard.mjs
 */

function isTableActive() {
  return window.__DC_GET_TABLE_ACTIVE__?.() ?? false;
}

function hasPasteHistory() {
  return window.__DC_HAS_PASTE_HISTORY__?.() ?? false;
}

function undoLastPaste() {
  window.__DC_UNDO_LAST_PASTE__?.();
}

function clearAllSelections() {
  window.__DC_CLEAR_ALL_SELECTIONS__?.();
}

function getSelectedCells() {
  return window.__DC_GET_SELECTED_CELLS__?.() ?? [];
}

function getSelectedCellCount() {
  return window.__DC_GET_SELECTED_CELL_COUNT__?.() ?? 0;
}

function setActiveCellWithoutFocus(cell) {
  window.__DC_SET_ACTIVE_CELL_WITHOUT_FOCUS__?.(cell);
}

function setActiveCell(cell) {
  window.__DC_SET_ACTIVE_CELL__?.(cell);
}

function moveCaretToEnd(cell) {
  window.__DC_MOVE_CARET_TO_END__?.(cell);
}

function recomputeSubmitState() {
  window.__DC_RECOMPUTE_SUBMIT_STATE__?.();
}

function selectAllCells() {
  window.selectAllCells?.();
}

function copySelectedCells() {
  window.copySelectedCells?.();
}

function pasteToSelectedCells() {
  window.pasteToSelectedCells?.();
}

export function handleDocumentGridKeydown(e) {
`;

const footer = `
}
`;

fs.writeFileSync(outPath, header + code.trimStart() + footer);
console.log(`[extract-grid-document-keyboard] → ${path.relative(root, outPath)}`);
