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
    .replace(/\bupdateSubmitButtonState\(\)/g, "window.__DC_RECOMPUTE_SUBMIT_STATE__?.()")
    .replace(/\bshowNotification\(/g, "window.showNotification?.(")
    .replace(/\bdetectAndParseHTML\(e\)/g, "detectHtmlTableInClipboard(e)")
    .replace(/\bconvertTableFormatOnSubmit\(\)/g, "window.__DC_CONVERT_TABLE_ON_SUBMIT__?.()")
    .replace(/\bfixCitibetAmountColumns\(\)/g, "window.__DC_FIX_CITIBET_AMOUNTS__?.()")
    .replace(/\bparseAndFillHTMLTableForWBET_API\(/g, "parseAndFillHtmlTableForWbetApi(")
    .replace(/\bparseAndFillHTMLTableForWBET\(/g, "parseAndFillHtmlTableForWbet(")
    .replace(/\bparseAndFillHTMLTableForInvoice\(/g, "parseAndFillHtmlTableForInvoice(")
    .replace(/\bparseAndFillHTMLTableForAWC\(/g, "parseAndFillHtmlTableForAwc(")
    .replace(/\bparseAndFillHTMLTable\(/g, "parseGenericHtmlTable(");

  out = out.replace(
    /if \(currentPasteChanges\.length > 0\) \{\s*pasteHistory\.push\(currentPasteChanges\);[\s\S]*?pasteHistory\.shift\(\);\s*\}\s*\}/g,
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

const moneyUtils = `import { MoneyDecimal } from "../../../utils/money/moneyDecimal.js";

export function formatNumberToTwoDecimals(value) {
  if (value === null || value === undefined) return value;
  const str = (typeof value === "string" ? value : String(value)).trim();
  if (str === "") return value;
  try {
    return MoneyDecimal.formatFixed(str, 2);
  } catch {
    return value;
  }
}

export function formatMoneyDisplay(value) {
  try {
    return MoneyDecimal.formatThousands(value, 2);
  } catch {
    return value;
  }
}

export function fixSummaryRowTotalColumns(row) {
  if (!row || row.length < 9) return;
  for (let k = 0; 7 + 3 * k + 2 < row.length; k += 1) {
    try {
      const total = MoneyDecimal.add(row[7 + 3 * k] || "0", row[7 + 3 * k + 1] || "0");
      row[7 + 3 * k + 2] = MoneyDecimal.formatFixed(total, 2);
    } catch {
      row[7 + 3 * k + 2] = formatNumberToTwoDecimals(row[7 + 3 * k + 2]);
    }
  }
}
`;

fs.writeFileSync(path.join(outDir, "dataCapturePasteMoneyUtils.js"), moneyUtils);

function wrapHandler(name, body) {
  return `/** @returns {boolean} */
export function ${name}(e, pastedData) {
${applyPasteReplacements(body)}
  return false;
}
`;
}

function extractIfBlockBody(ifLineOneIndexed) {
  const startIdx = ifLineOneIndexed - 1;
  let depth = 0;
  let bodyStart = null;
  for (let j = startIdx; j < lines.length; j++) {
    const line = lines[j];
    for (let k = 0; k < line.length; k++) {
      const ch = line[k];
      if (ch === "{") {
        depth++;
        if (depth === 1 && bodyStart === null) {
          bodyStart = j + 1;
        }
      } else if (ch === "}") {
        depth--;
        if (depth === 0 && bodyStart !== null) {
          return lines.slice(bodyStart, j).join("\n");
        }
      }
    }
  }
  throw new Error(`Failed to extract block at line ${ifLineOneIndexed}`);
}

function writeHandlerFromIf(filename, header, handlerName, ifLine) {
  const module = `${header}
${gridHelper}

${wrapHandler(handlerName, extractIfBlockBody(ifLine))}
`;
  fs.writeFileSync(path.join(outDir, filename), module);
}

// --- Parsers (Phase 4d + payment) ---
fs.writeFileSync(
  path.join(outDir, "dataCaptureApiReturnParsers.js"),
  `/** API-RETURN / 4.RETURN parsers. */\n\n${toExport(slice(9145, 9547))}\n`,
);
fs.writeFileSync(
  path.join(outDir, "dataCaptureVPowerParser.js"),
  `/** VPOWER parser. */\n\n${toExport(slice(9552, 10018))}\n`,
);
fs.writeFileSync(
  path.join(outDir, "dataCaptureAgentLinkParser.js"),
  `/** AGENT_LINK parser. */\n\n${toExport(slice(10023, 10285))}\n`,
);
fs.writeFileSync(
  path.join(outDir, "dataCapturePaymentParsers.js"),
  `/** Payment report parsers (generic paste). */\n\n${toExport(slice(7358, 7483))}\n\n${toExport(slice(8302, 9144))}\n`,
);

const invoiceHtml = toExport(slice(5397, 5609));
fs.writeFileSync(
  path.join(outDir, "dataCaptureInvoiceHtmlPaste.js"),
  `/** INVOICE HTML table fill. */\n\n${gridHelper}\n${invoiceHtml.replace("parseAndFillHTMLTableForInvoice", "parseAndFillHtmlTableForInvoice")}\n`,
);

const awcParsers = toExport(slice(5612, 5852));
const awcHtml = slice(5855, 5995).replace(
  /^function parseAndFillHTMLTableForAWC/,
  "export function parseAndFillHtmlTableForAwc",
);
fs.writeFileSync(
  path.join(outDir, "dataCaptureAwcPaste.js"),
  `/** AWC parsers + HTML fill. */
import { formatNumberToTwoDecimals } from "./dataCapturePasteMoneyUtils.js";

${gridHelper}
${awcParsers}

${applyPasteReplacements(awcHtml)}
`,
);

// WBET HTML
const wbetHtml = `export function parseAndFillHtmlTableForWbet(htmlString, startCell) {
${applyPasteReplacements(slice(6002, 6415))}`;
const wbetApiHtml = `export function parseAndFillHtmlTableForWbetApi(htmlString, startCell) {
${applyPasteReplacements(slice(6422, 6859))}`;
fs.writeFileSync(
  path.join(outDir, "dataCaptureWbetHtmlPaste.js"),
  `/** WBET / WBET_API HTML paste. */
import { formatMoneyDisplay, fixSummaryRowTotalColumns } from "./dataCapturePasteMoneyUtils.js";
${gridHelper}
${wbetHtml}

${wbetApiHtml}
`,
);

// --- Typed paste handlers (4d + remaining) ---
fs.writeFileSync(
  path.join(outDir, "dataCaptureReturnPaste.js"),
  `/** API_RETURN & 4.RETURN paste. */
import { parseApiReturnFormat, parseApiReturnTableFormat } from "./dataCaptureApiReturnParsers.js";
${gridHelper}
${wrapHandler("handleApiReturnPaste", extractIfBlockBody(17554))}
${wrapHandler("handle4ReturnPaste", extractIfBlockBody(17979))}
`,
);

writeHandlerFromIf(
  "dataCaptureInvoicePaste.js",
  `/** INVOICE paste. */
import { detectHtmlTableInClipboard } from "./dataCaptureHtmlClipboard.js";
import { parseAndFillHtmlTableForInvoice } from "./dataCaptureInvoiceHtmlPaste.js";`,
  "handleInvoicePaste",
  10502,
);

writeHandlerFromIf(
  "dataCapture2SpecialPaste.js",
  `/** 2.SPECIAL auto-detect paste. */
import { detectHtmlTableInClipboard } from "./dataCaptureHtmlClipboard.js";
import {
  parseCitibetMajorPaymentReport,
  parseCitibetPaymentReport,
} from "./dataCaptureCitibetParsers.js";
import { parseVPowerTableFormat } from "./dataCaptureVPowerParser.js";
import { parseAgentLinkTableFormat } from "./dataCaptureAgentLinkParser.js";
import { parseAndFillHtmlTableForWbet, parseAndFillHtmlTableForWbetApi } from "./dataCaptureWbetHtmlPaste.js";
import { formatNumberToTwoDecimals, formatMoneyDisplay } from "./dataCapturePasteMoneyUtils.js";`,
  "handle2SpecialPaste",
  11125,
);

writeHandlerFromIf(
  "dataCapture3ApiPaste.js",
  `/** 3.API paste. */
import { detectHtmlTableInClipboard } from "./dataCaptureHtmlClipboard.js";
import { parseAndFillHtmlTableForWbetApi } from "./dataCaptureWbetHtmlPaste.js";
import { parseAndFillHtmlTableForInvoice } from "./dataCaptureInvoiceHtmlPaste.js";`,
  "handle3ApiPaste",
  14493,
);

writeHandlerFromIf(
  "dataCaptureAwcHandlerPaste.js",
  `/** AWC paste handler. */
import { detectHtmlTableInClipboard } from "./dataCaptureHtmlClipboard.js";
import { parseAWCPatternBasedData, parseAndFillHtmlTableForAwc } from "./dataCaptureAwcPaste.js";`,
  "handleAwcPaste",
  15466,
);

writeHandlerFromIf(
  "dataCapturePegasusPaste.js",
  `/** PEGASUS paste. */`,
  "handlePegasusPaste",
  15683,
);

writeHandlerFromIf(
  "dataCaptureVPowerPaste.js",
  `/** VPOWER paste. */
import { parseVPowerTableFormat } from "./dataCaptureVPowerParser.js";`,
  "handleVPowerPaste",
  16649,
);

writeHandlerFromIf(
  "dataCaptureAgentLinkPaste.js",
  `/** AGENT_LINK paste. */
import { detectHtmlTableInClipboard } from "./dataCaptureHtmlClipboard.js";
import { parseAgentLinkTableFormat } from "./dataCaptureAgentLinkParser.js";`,
  "handleAgentLinkPaste",
  16846,
);

writeHandlerFromIf(
  "dataCaptureAlipayPaste.js",
  `/** ALIPAY paste. */
import { detectHtmlTableInClipboard } from "./dataCaptureHtmlClipboard.js";`,
  "handleAlipayPaste",
  17083,
);

writeHandlerFromIf(
  "dataCaptureWbetApiPaste.js",
  `/** WBET_API paste. */
import { detectHtmlTableInClipboard } from "./dataCaptureHtmlClipboard.js";
import { parseAndFillHtmlTableForWbetApi } from "./dataCaptureWbetHtmlPaste.js";`,
  "handleWbetApiPaste",
  15859,
);

writeHandlerFromIf(
  "dataCaptureWbetPaste.js",
  `/** WBET paste. */
import { detectHtmlTableInClipboard } from "./dataCaptureHtmlClipboard.js";
import { parseAndFillHtmlTableForWbet } from "./dataCaptureWbetHtmlPaste.js";`,
  "handleWbetPaste",
  16266,
);

writeHandlerFromIf(
  "dataCaptureC8PlayPaste.js",
  `/** C8PLAY paste. */
import { detectHtmlTableInClipboard } from "./dataCaptureHtmlClipboard.js";
import { formatNumberToTwoDecimals } from "./dataCapturePasteMoneyUtils.js";`,
  "handleC8PlayPaste",
  18514,
);

writeHandlerFromIf(
  "dataCaptureMaxbetPaste.js",
  `/** MAXBET paste. */
import { detectHtmlTableInClipboard } from "./dataCaptureHtmlClipboard.js";
import { formatNumberToTwoDecimals } from "./dataCapturePasteMoneyUtils.js";`,
  "handleMaxbetPaste",
  19017,
);

// Generic paste (payment reports + TSV fallback + post-process)
const genericBody = slice(19407, 22305);
fs.writeFileSync(
  path.join(outDir, "dataCaptureGenericPaste.js"),
  `/** Generic / fallback cell paste (payment reports, TSV, HTML). */
import { detectHtmlTableInClipboard } from "./dataCaptureHtmlClipboard.js";
import {
  parseCitibetMajorPaymentReport,
  parseCitibetPaymentReport,
  parseCitibetFormatBasedPaste,
} from "./dataCaptureCitibetParsers.js";
import {
  parseSimplePaymentReport,
  parseFullPaymentReport,
  parseExcelFormatPaymentReport,
} from "./dataCapturePaymentParsers.js";
import { formatNumberToTwoDecimals } from "./dataCapturePasteMoneyUtils.js";

${gridHelper}

/** @returns {boolean} */
export function handleGenericPaste(e, pastedData) {
  if (!pastedData) {
    const clipboard = e.clipboardData || window.clipboardData;
    const getData = (type) => {
      try {
        return clipboard?.getData?.(type) || "";
      } catch {
        return "";
      }
    };
    pastedData = getData("text/plain") || getData("text") || getData("Text") || "";
  }
${applyPasteReplacements(genericBody)}
  return typeof successCount !== "undefined" && successCount > 0;
}
`,
);

console.log("extract-all-paste: all modules written");
