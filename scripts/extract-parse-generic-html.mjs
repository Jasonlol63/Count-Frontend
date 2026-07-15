import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const srcPath = path.join(root, "js/datacapture.js");
const outPath = path.join(root, "frontend/src/pages/datacapture/paste/dataCaptureParseGenericHtml.js");
const lines = fs.readFileSync(srcPath, "utf8").split("\n");

const START = 6870;
const END = 7358;

let code = lines.slice(START - 1, END).join("\n");

code = code
  .replace(/\binitializeTable\(/g, "ensurePasteGrid(")
  .replace(/\bcurrentDataCaptureType\b/g, "getCaptureType()")
  .replace(/\btypeof getCaptureType\(\) !== 'undefined' && getCaptureType\(\)/g, "getCaptureType()")
  .replace(
    /if \(currentPasteChanges\.length > 0\) \{\s*pasteHistory\.push\(currentPasteChanges\);[\s\S]*?pasteHistory\.shift\(\);\s*\}/,
    "window.__DC_PUSH_PASTE_HISTORY__?.(currentPasteChanges);",
  )
  .replace(/\bshowNotification\(/g, "notifyPaste(")
  .replace(/\bconvertTableFormatOnSubmit\(\)/g, "window.__DC_CONVERT_TABLE_ON_SUBMIT__?.()");

const header = `/**
 * Generic HTML table paste fill — extracted from js/datacapture.js parseAndFillHTMLTable.
 * Re-run: node frontend/scripts/extract-parse-generic-html.mjs
 */
import { pushDataCaptureNotification } from "../dataCaptureNotify.js";
import { formatMoneyDisplay } from "./dataCapturePasteMoneyUtils.js";
import { ensurePasteGrid } from "./dataCapturePasteGridUtils.js";

function getCaptureType() {
  return window.__DC_GET_CAPTURE_TYPE__?.() || "1.Text";
}

function notifyPaste(message, type) {
  pushDataCaptureNotification(message, type);
}

`;

const body = code.replace(/^function parseAndFillHTMLTable/, "export function parseAndFillHTMLTable");

fs.writeFileSync(outPath, header + body);
console.log(`Wrote ${outPath}`);
