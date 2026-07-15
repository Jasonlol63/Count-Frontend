import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const srcPath = path.join(root, "js/datacapture.js");
const outPath = path.join(root, "frontend/src/pages/datacapture/dataCaptureGridMouseSelection.js");
const lines = fs.readFileSync(srcPath, "utf8").split("\n");

/** handleCellMouseDown … toggleRowSelection + handleMouseUp */
const START = 443;
const END = 780;

let code = lines.slice(START - 1, END).join("\n");

code = code
  .replace(/\btableActive = true;/g, "setTableActive(true);")
  .replace(/\bselectedCells\.has\(/g, "hasSelectedCell(")
  .replace(/\bselectedCells\.add\(/g, "registerSelectedCell(")
  .replace(/\bselectedCells\.delete\(/g, "unregisterSelectedCell(")
  .replace(/\bselectedCells\.forEach\(/g, "forEachSelectedCell(")
  .replace(/\bselectedCells\.clear\(\)/g, "clearSelectedCellSet()");

const header = `/**
 * Cell/column/row drag selection — extracted from js/datacapture.js (Phase 5f).
 * Re-run: node frontend/scripts/extract-grid-mouse-selection.mjs
 */
import { setTableActive } from "./dataCaptureGridTableState.js";
import {
  clearAllSelections,
  hasSelectedCell,
  registerSelectedCell,
  selectedCells,
  unregisterSelectedCell,
} from "./dataCaptureGridSelection.js";

let isSelecting = false;
let startCell = null;
let isSelectingColumns = false;
let isSelectingRows = false;
let startColumnIndex = null;
let startRowIndex = null;

function forEachSelectedCell(fn) {
  selectedCells.forEach(fn);
}

function clearSelectedCellSet() {
  selectedCells.clear();
}

`;

const footer = `
export function handleColumnHeaderMousedown(e) {
  if (e.button === 0) handleColumnHeaderClick(e, -1);
}

export function handleColumnHeaderMouseover(e) {
  if (!e.ctrlKey && !e.metaKey) handleColumnHeaderMouseOver(e, -1);
}

export function handleRowHeaderMousedown(e) {
  if (e.button === 0) handleRowHeaderClick(e, -1);
}

export function handleRowHeaderMouseover(e) {
  if (!e.ctrlKey && !e.metaKey) handleRowHeaderMouseOver(e, -1);
}
`;

const body = code.replace(/^let isSelecting = false;\s*\nlet startCell = null;\s*\n/s, "");
const exports = body.replace(/^function /gm, "export function ");

fs.writeFileSync(outPath, header + exports + footer);
console.log(`Wrote ${outPath}`);
