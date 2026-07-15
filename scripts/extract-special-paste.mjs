import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const srcPath = path.join(root, "js/datacapture.js");
const outDir = path.join(root, "frontend/src/pages/datacapture/paste");
const lines = fs.readFileSync(srcPath, "utf8").split("\n");

function slice(start, end) {
  return lines.slice(start - 1, end).join("\n");
}

function toExport(code) {
  return code.replace(/^function /gm, "export function ");
}

function applyPasteReplacements(code) {
  let out = code
    .replace(/\binitializeTable\(/g, "ensurePasteGrid(")
    .replace(/setTimeout\(updateSubmitButtonState, 0\)/g, "window.__DC_RECOMPUTE_SUBMIT_STATE__?.()")
    .replace(/\bshowNotification\(/g, "window.showNotification?.(")
    .replace(/\bdetectAndParseHTML\(e\)/g, "detectHtmlTableInClipboard(e)");

  out = out.replace(
    /if \(currentPasteChanges\.length > 0\) \{\s*pasteHistory\.push\(currentPasteChanges\);\s*if \(pasteHistory\.length > maxHistorySize\) \{\s*pasteHistory\.shift\(\);\s*\}\s*\}/g,
    "window.__DC_PUSH_PASTE_HISTORY__?.(currentPasteChanges);",
  );
  out = out.replace(/if \(currentPasteChanges\.length > 0\) \{\s*\}/g, "window.__DC_PUSH_PASTE_HISTORY__?.(currentPasteChanges);");

  out = out.replace(
    /window\.__DC_RECOMPUTE_SUBMIT_STATE__\?\.\(\);\s*\n(\s*)return;/g,
    "window.__DC_RECOMPUTE_SUBMIT_STATE__?.();\n$1return true;",
  );
  out = out.replace(
    /setTimeout\(updateSubmitButtonState, 0\);\s*\n(\s*)return;/g,
    "window.__DC_RECOMPUTE_SUBMIT_STATE__?.();\n$1return true;",
  );

  return out;
}

const gridHelper = `
function ensurePasteGrid(rows, cols) {
  if (typeof window.__DC_INITIALIZE_TABLE__ === "function") {
    window.__DC_INITIALIZE_TABLE__(rows, cols);
  } else if (typeof window.__DC_LEGACY_BUILD_TABLE__ === "function") {
    window.__DC_LEGACY_BUILD_TABLE__(rows, cols);
  }
}

function parseGenericHtmlTable(htmlString, startCell) {
  if (typeof window.__DC_LEGACY_PARSE_GENERIC_HTML__ === "function") {
    return window.__DC_LEGACY_PARSE_GENERIC_HTML__(htmlString, startCell);
  }
  return false;
}
`;

// --- Parsers ---
fs.writeFileSync(
  path.join(outDir, "dataCaptureApiReturnParsers.js"),
  `/** Phase 4d — API-RETURN / 4.RETURN parsers (from js/datacapture.js). */\n\n${toExport(slice(9145, 9547))}\n`,
);

fs.writeFileSync(
  path.join(outDir, "dataCaptureVPowerParser.js"),
  `/** Phase 4d — VPOWER parser. */\n\n${toExport(slice(9552, 10018))}\n`,
);

fs.writeFileSync(
  path.join(outDir, "dataCaptureAgentLinkParser.js"),
  `/** Phase 4d — AGENT_LINK (PS3838) parser. */\n\n${toExport(slice(10023, 10285))}\n`,
);

// --- WBET HTML paste (skip legacy SPA delegation block) ---
const wbetHtml = `export function parseAndFillHtmlTableForWbet(htmlString, startCell) {
${applyPasteReplacements(slice(6002, 6415))}`;

const wbetApiHtml = `export function parseAndFillHtmlTableForWbetApi(htmlString, startCell) {
${applyPasteReplacements(slice(6422, 6859))}`;

fs.writeFileSync(
  path.join(outDir, "dataCaptureWbetHtmlPaste.js"),
  `/** Phase 4d — WBET / WBET_API HTML table paste. */\n\n${gridHelper}\n${wbetHtml}\n\n${wbetApiHtml}\n`,
);

function wrapHandler(name, body, imports = "") {
  return `/** @returns {boolean} */
export function ${name}(e, pastedData) {
${applyPasteReplacements(body)}
  return false;
}
`;
}

const returnModule = `/** Phase 4d — API_RETURN & 4.RETURN cell paste handlers. */
import {
  parseApiReturnFormat,
  parseApiReturnTableFormat,
} from "./dataCaptureApiReturnParsers.js";

${gridHelper}

${wrapHandler("handleApiReturnPaste", slice(17523, 17943))}

${wrapHandler("handle4ReturnPaste", slice(17948, 18478))}
`;

fs.writeFileSync(path.join(outDir, "dataCaptureReturnPaste.js"), returnModule);

const vpowerModule = `/** Phase 4d — VPOWER paste handler. */
import { parseVPowerTableFormat } from "./dataCaptureVPowerParser.js";

${gridHelper}

${wrapHandler("handleVPowerPaste", slice(16618, 16716))}
`;

fs.writeFileSync(path.join(outDir, "dataCaptureVPowerPaste.js"), vpowerModule);

const agentLinkModule = `/** Phase 4d — AGENT_LINK (PS3838) paste handler. */
import { detectHtmlTableInClipboard } from "./dataCaptureHtmlClipboard.js";
import { parseAgentLinkTableFormat } from "./dataCaptureAgentLinkParser.js";

${gridHelper}

${wrapHandler("handleAgentLinkPaste", slice(16815, 17046).replace(/\bparseAndFillHTMLTable\(/g, "parseGenericHtmlTable("))}
`;

fs.writeFileSync(path.join(outDir, "dataCaptureAgentLinkPaste.js"), agentLinkModule);

const wbetApiModule = `/** Phase 4d — WBET_API paste handler. */
import { detectHtmlTableInClipboard } from "./dataCaptureHtmlClipboard.js";
import { parseAndFillHtmlTableForWbetApi } from "./dataCaptureWbetHtmlPaste.js";

${gridHelper}

${wrapHandler(
  "handleWbetApiPaste",
  slice(15828, 16229)
    .replace(/\bparseAndFillHTMLTableForWBET_API\(/g, "parseAndFillHtmlTableForWbetApi("),
)}
`;

fs.writeFileSync(path.join(outDir, "dataCaptureWbetApiPaste.js"), wbetApiModule);

const wbetModule = `/** Phase 4d — WBET paste handler. */
import { detectHtmlTableInClipboard } from "./dataCaptureHtmlClipboard.js";
import { parseAndFillHtmlTableForWbet } from "./dataCaptureWbetHtmlPaste.js";

${gridHelper}

${wrapHandler(
  "handleWbetPaste",
  slice(16235, 16613).replace(/\bparseAndFillHTMLTableForWBET\(/g, "parseAndFillHtmlTableForWbet("),
)}
`;

fs.writeFileSync(path.join(outDir, "dataCaptureWbetPaste.js"), wbetModule);

console.log("Phase 4d special paste modules extracted");
