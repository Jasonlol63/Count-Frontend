import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const srcPath = path.join(root, "js/datacapture.js");
const outPath = path.join(root, "frontend/src/pages/datacapture/dataCaptureConvertTableOnSubmit.js");
const lines = fs.readFileSync(srcPath, "utf8").split("\n");

/** Lines 23205–23501 in js/datacapture.js (function convertTableFormatOnSubmit). */
const START = 23205;
const END = 23501;

let code = lines.slice(START - 1, END).join("\n");

code = code.replace(
  /\s*if \(window\.__DATA_CAPTURE_REACT_FORM__ && typeof window\.__DC_CONVERT_TABLE_ON_SUBMIT_REACT__ === 'function'\) \{\s*return window\.__DC_CONVERT_TABLE_ON_SUBMIT_REACT__\(\);\s*\}\s*/,
  "\n",
);

code = code.replace(
  /^function convertTableFormatOnSubmit\(\)/m,
  "export function convertTableFormatOnSubmit(captureType)",
);

code = code
  .replace(/\bcurrentDataCaptureType\b/g, "captureType")
  .replace(/\binitializeTable\(/g, "ensureSubmitGrid(")
  .replace(/\bgetColumnLabel\(/g, "getRowLabel(")
  .replace(/\bbindDataCaptureCellEvents\(/g, "bindLegacyGridCell(")
  .replace(/\btableActive = true;\s*\n\s*selectColumn\(/g, "window.__DC_SET_TABLE_ACTIVE__?.(true);\n                                window.__DC_SELECT_COLUMN__?.(")
  .replace(/\bfixCitibetAmountColumns\(\)/g, "window.__DC_FIX_CITIBET_AMOUNTS__?.()");

const header = `/**
 * Submit-time SUB TOTAL / GRAND TOTAL row split — extracted from js/datacapture.js.
 * Re-run: node frontend/scripts/extract-convert-table-submit.mjs
 */
import { getRowLabel } from "./dataCaptureGridLabels.js";

function resolveCaptureType(captureType) {
  if (captureType) return captureType;
  if (typeof window.__DC_GET_CAPTURE_TYPE__ === "function") return window.__DC_GET_CAPTURE_TYPE__() || "";
  return "";
}

function ensureSubmitGrid(rows, cols) {
  if (typeof window.__DC_INITIALIZE_TABLE__ === "function") {
    window.__DC_INITIALIZE_TABLE__(rows, cols);
  } else if (typeof window.__DC_LEGACY_BUILD_TABLE__ === "function") {
    window.__DC_LEGACY_BUILD_TABLE__(rows, cols);
  }
}

function bindLegacyGridCell(cell) {
  if (typeof window.__DC_LEGACY_BIND_CELL__ === "function") {
    window.__DC_LEGACY_BIND_CELL__(cell);
  }
}

`;

const body = code.replace(
  /export function convertTableFormatOnSubmit\(captureType\) \{/,
  `export function convertTableFormatOnSubmit(captureType) {
  captureType = resolveCaptureType(captureType);`,
);

fs.writeFileSync(outPath, header + body.trimStart() + "\n");
console.log(`[extract-convert-table-submit] → ${path.relative(root, outPath)}`);
