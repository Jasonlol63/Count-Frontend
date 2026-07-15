import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const srcPath = path.join(root, "js/datacapture.js");
const outPath = path.join(root, "frontend/src/pages/datacapture/dataCaptureGridRowColumnCrud.js");
const lines = fs.readFileSync(srcPath, "utf8").split("\n");

/** insertColumnAt … clearRow bodies (legacy bodies remain for classic PHP). */
const START = 1924;
const END = 2229;

let code = lines.slice(START - 1, END).join("\n");

code = code
  .replace(/\bcurrentColumnIndex\b/g, "getContextMenuColumn()")
  .replace(/\bcurrentRowIndex\b/g, "getContextMenuRow()")
  .replace(/\bhideContextMenu\(\)/g, "hideContextMenu()")
  .replace(/\bclearAllSelections\(\)/g, "clearAllSelections()")
  .replace(/\bupdateSubmitButtonState\(\)/g, "recomputeSubmitState()")
  .replace(/\bshowNotification\(/g, "window.showNotification?.(")
  .replace(/\bgetColumnIndexFromHeader\(/g, "getColumnIndexFromHeader(")
  .replace(/\bgetRowIndexFromHeader\(/g, "getRowIndexFromHeader(")
  .replace(/\bgetColumnLabel\(/g, "getRowLabel(")
  .replace(/\battachColumnHeaderListeners\(/g, "attachColumnHeaderListeners(")
  .replace(/\battachRowHeaderListeners\(/g, "attachRowHeaderListeners(")
  .replace(/\brebindColumnHeadersAfterMutation\(/g, "rebindColumnHeadersAfterMutation(")
  .replace(/\brebindRowHeadersAfterMutation\(/g, "rebindRowHeadersAfterMutation(")
  .replace(/\bbindDataCaptureCellEvents\(/g, "bindLegacyGridCell(");

code = code.replace(/^function /gm, "function ");

const header = `/**
 * Row/column insert, delete, clear — extracted from js/datacapture.js (Phase 5c).
 * Re-run: node frontend/scripts/extract-grid-row-column-crud.mjs
 */
import { getRowLabel } from "./dataCaptureGridLabels.js";
import { hideContextMenu } from "./dataCaptureContextMenu.js";

function getContextMenuColumn() {
  return window.__DC_GET_CONTEXT_MENU_COLUMN__?.() ?? null;
}

function getContextMenuRow() {
  return window.__DC_GET_CONTEXT_MENU_ROW__?.() ?? null;
}

function clearAllSelections() {
  window.__DC_CLEAR_ALL_SELECTIONS__?.();
}

function recomputeSubmitState() {
  window.__DC_RECOMPUTE_SUBMIT_STATE__?.();
}

function getColumnIndexFromHeader(header) {
  const headerRow = document.querySelector("#tableHeader tr");
  if (!headerRow) return -1;
  const headers = Array.from(headerRow.children);
  const index = headers.indexOf(header);
  return index > 0 ? index - 1 : -1;
}

function getRowIndexFromHeader(rowHeader) {
  const tableBody = document.getElementById("tableBody");
  if (!tableBody) return -1;
  const rows = Array.from(tableBody.children);
  for (let i = 0; i < rows.length; i++) {
    const rh = rows[i].querySelector(".row-header");
    if (rh === rowHeader) return i;
  }
  return -1;
}

function attachColumnHeaderListeners(header) {
  window.__DC_GRID_ATTACH_COLUMN_HEADER__?.(header);
}

function attachRowHeaderListeners(rowHeader) {
  window.__DC_GRID_ATTACH_ROW_HEADER__?.(rowHeader);
}

function rebindColumnHeadersAfterMutation(headerRow) {
  window.__DC_GRID_REBIND_COLUMN_HEADERS__?.(headerRow);
}

function rebindRowHeadersAfterMutation(tableBody) {
  window.__DC_GRID_REBIND_ROW_HEADERS__?.(tableBody);
}

function bindLegacyGridCell(cell) {
  window.__DC_LEGACY_BIND_CELL__?.(cell);
}

`;

const wrappers = `
export function insertColumnLeft() {
  const col = getContextMenuColumn();
  if (col === null) return;
  insertColumnAt(col);
  hideContextMenu();
}

export function insertColumnRight() {
  const col = getContextMenuColumn();
  if (col === null) return;
  insertColumnAt(col + 1);
  hideContextMenu();
}

export function insertRowAbove() {
  const row = getContextMenuRow();
  if (row === null) return;
  insertRowAt(row);
  hideContextMenu();
}

export function insertRowBelow() {
  const row = getContextMenuRow();
  if (row === null) return;
  insertRowAt(row + 1);
  hideContextMenu();
}

export {
  insertColumnAt,
  deleteColumn,
  clearColumn,
  insertRowAt,
  deleteRow,
  clearRow,
};
`;

// Export inner functions used by wrappers
code = code.replace(/^function insertColumnAt/m, "function insertColumnAt");
code = code.replace(/^function deleteColumn/m, "export function deleteColumn");
code = code.replace(/^function clearColumn/m, "export function clearColumn");
code = code.replace(/^function insertRowAt/m, "function insertRowAt");
code = code.replace(/^function deleteRow/m, "export function deleteRow");
code = code.replace(/^function clearRow/m, "export function clearRow");

fs.writeFileSync(outPath, header + code.trimStart() + "\n" + wrappers);
console.log(`[extract-grid-row-column-crud] → ${path.relative(root, outPath)}`);
