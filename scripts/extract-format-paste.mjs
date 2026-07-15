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

const styleUtils = toExport(slice(24102, 24159));
fs.writeFileSync(
  path.join(outDir, "dataCaptureFormatStyleUtils.js"),
  "/** Ported from js/datacapture.js — 2.Format style sanitization (Phase 4c). */\n\n" + styleUtils + "\n",
);

const escapeHtml = slice(24092, 24099).replace("function escapeHtml", "export function escapeHtml");
const sanitizePasted = slice(24161, 24394).replace(
  "function sanitizePastedHTML",
  "export function sanitizePastedHTML",
);
const previewHelpers = toExport(slice(24397, 24553));

let previewModule = [
  "/** Ported from js/datacapture.js — 2.Format preview helpers (Phase 4c). */",
  "",
  "import { setFormatPreviewHtml } from '../dataCaptureFormatStorage.js';",
  "",
  escapeHtml,
  "",
  sanitizePasted,
  "",
  previewHelpers,
  "",
].join("\n");

previewModule = previewModule.replace(
  "console.log('Format: Preview container set to block in renderFormatPreview');",
  "console.log('Format: Preview container set to block in renderFormatPreview');\n        setFormatPreviewHtml(safeTable);",
);

fs.writeFileSync(path.join(outDir, "dataCaptureFormatPreview.js"), previewModule + "\n");

let formatPaste = slice(4427, 5112);
formatPaste = formatPaste.replace(
  /^function parseAndFillHTMLTableForFormat/,
  "export function parseAndFillHtmlTableForFormat",
);
formatPaste = formatPaste.replace(/\binitializeTable\(/g, "ensureFormatGrid(");
formatPaste = formatPaste.replace(
  /\/\/ 将本次粘贴操作添加到历史记录[\s\S]*?if \(pasteHistory\.length > maxHistorySize\) \{[\s\S]*?pasteHistory\.shift\(\);[\s\S]*?\}/,
  "window.__DC_PUSH_PASTE_HISTORY__?.(currentPasteChanges);",
);
formatPaste = formatPaste.replace(/setTimeout\(updateSubmitButtonState, 0\)/g, "window.__DC_RECOMPUTE_SUBMIT_STATE__?.()");
formatPaste = formatPaste.replace(/\bshowNotification\(/g, "window.showNotification?.(");

const formatPasteModule = [
  "/** Ported from js/datacapture.js — 2.Format grid fill (Phase 4c). */",
  "",
  "import {",
  "  sanitizeFormatHtmlFragment,",
  "  sanitizeCopiedStyleString,",
  "  stripBackgroundFromStyle,",
  "} from './dataCaptureFormatStyleUtils.js';",
  "",
  "function ensureFormatGrid(rows, cols) {",
  "  if (typeof window.__DC_INITIALIZE_TABLE__ === 'function') {",
  "    window.__DC_INITIALIZE_TABLE__(rows, cols);",
  "  } else if (typeof window.__DC_LEGACY_BUILD_TABLE__ === 'function') {",
  "    window.__DC_LEGACY_BUILD_TABLE__(rows, cols);",
  "  }",
  "}",
  "",
  formatPaste,
  "",
].join("\n");

fs.writeFileSync(path.join(outDir, "dataCaptureFormatHtmlPaste.js"), formatPasteModule);
console.log("extracted format modules OK");
