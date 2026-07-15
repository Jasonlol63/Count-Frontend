import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const srcPath = path.join(root, "js/datacapture.js");
const outPath = path.join(root, "frontend/src/pages/datacapture/dataCaptureGridActiveCell.js");
const lines = fs.readFileSync(srcPath, "utf8").split("\n");

const START = 187;
const END = 425;

let code = lines.slice(START - 1, END).join("\n");

code = code
  .replace(/^function highlightHeadersForCell/gm, "export function highlightHeadersForCell")
  .replace(/^function setActiveCellCore/gm, "export function setActiveCellCore")
  .replace(/^function setActiveCell\(/gm, "export function setActiveCell(")
  .replace(/^function moveCaretToEnd/gm, "export function moveCaretToEnd")
  .replace(/^function setActiveCellWithoutFocus/gm, "export function setActiveCellWithoutFocus")
  .replace(/^function setActiveCellForMouseEdit/gm, "export function setActiveCellForMouseEdit")
  .replace(/^function moveCaretToClickPosition/gm, "export function moveCaretToClickPosition")
  .replace(/\bclearAllSelections\(\)/g, "clearAllSelections()")
  .replace(/\bselectedCells\.add\(cell\)/g, "registerSelectedCell(cell)");

const header = `/**
 * Active cell highlight, focus, and caret — extracted from js/datacapture.js.
 * Re-run: node frontend/scripts/extract-grid-active-cell.mjs
 */

function clearAllSelections() {
  window.__DC_CLEAR_ALL_SELECTIONS__?.();
}

function registerSelectedCell(cell) {
  window.__DC_REGISTER_SELECTED_CELL__?.(cell);
}

`;

fs.writeFileSync(outPath, header + code.trimStart() + "\n");
console.log(`[extract-grid-active-cell] → ${path.relative(root, outPath)}`);
