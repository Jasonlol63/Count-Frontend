import { parseAndFillHtmlTableForFormat } from "./dataCaptureFormatHtmlPaste.js";
import {
  buildFormatPreviewFragmentFromClipboardHtml,
  clipboardLooksLikeTable,
  plainMatrixToFormatCellPatches,
  plainMatrixToHtmlTable,
  sanitizePastedHTML,
  tsvToHtmlTable,
} from "./dataCaptureFormatPreview.js";
import {
  clipboardHtmlLooksLikeGrid,
  normalizeClipboardHtmlToTable,
  tokenizeCollapsedReportRow,
} from "./dataCaptureFormatClipboardNormalize.js";
import { parseFormatHtmlTableStructure } from "./dataCaptureFormatHtmlMatrix.js";
import { formatBodyMatrixLooksCollapsed } from "./dataCaptureFormatHtmlPaste.js";
import { parsePlainTextMatrix, expandLabelColonMoneyCells } from "./dataCaptureTextPaste.js";
import { splitStackedSubtotalGrandTotalRows } from "./dataCaptureStackedTotalSplit.js";
import { sanitizePasteMatrix } from "./dataCapturePasteMatrixSanitize.js";
import {
  applyDataMatrixToGrid,
  ensureGridFits,
  getFormatPasteAnchorCell,
  resolveFormatPasteStartRow,
  resolvePasteAnchor,
} from "./dataCapturePasteApply.js";
import { isGridPasteBlockedTarget } from "./dataCaptureClipboard.js";
import { showFormatEditableGrid, syncFormatPreviewFromDom } from "../../format/dataCaptureFormat.js";
import { resolvePasteCell } from "./dataCaptureClipboard.js";
import {
  getActiveCaptureType,
  notifyPasteUser,
  recomputeSubmitStateAfterPaste,
  setFormatGridReady,
  toggleFormatDisplay,
} from "../../lib/dataCaptureBridge.js";

function isFormatMode() {
  return getActiveCaptureType() === "2.Format";
}

function isEditableFormField(el) {
  return isGridPasteBlockedTarget(el);
}

function afterFormatPasteFilled(filled, area) {
  if (!filled) return false;
  setFormatGridReady(true);
  syncFormatPreviewFromDom();
  if (area) area.innerHTML = "";
  showFormatEditableGrid();
  toggleFormatDisplay();
  recomputeSubmitStateAfterPaste();
  return true;
}

function resolveNormalizedHtml(html) {
  if (!html) return "";
  if (/<table\b/i.test(html)) {
    return normalizeClipboardHtmlToTable(html) || html;
  }
  if (clipboardHtmlLooksLikeGrid(html)) {
    return normalizeClipboardHtmlToTable(html) || "";
  }
  return "";
}

function matrixLooksMultiColumn(matrix) {
  if (!matrix?.length) return false;
  const cols = matrix[0]?.length || 0;
  return cols >= 2 && matrix.some((row) => (row?.length || 0) >= 2);
}

/**
 * Reshaped plain that looks like Report Center agent_period (label + $ money),
 * not a wide statement sheet (serial No. | OB | … | 16 cols).
 */
function plainMatrixLooksLikeAgentPeriodDump(matrix) {
  if (!matrixLooksMultiColumn(matrix)) return false;
  const width = matrix[0]?.length || 0;
  // agent_period is typically ~9 fields; statement tables are often 14–16+.
  if (width < 6 || width > 12) return false;

  let dollarRows = 0;
  for (const row of matrix.slice(0, 5)) {
    const cells = row || [];
    const first = String(cells[0] ?? "").trim();
    if (/^\d{1,4}$/.test(first)) return false;
    const dollars = cells.filter((c) => /\$/.test(String(c ?? ""))).length;
    if (dollars >= 3) dollarRows += 1;
  }
  return dollarRows >= 1;
}

function shouldPreferFormatPlainDual(plainMulti, plainMatrix, normalizedHtml) {
  if (!plainMulti) return false;
  if (!normalizedHtml || !/<table\b/i.test(normalizedHtml)) return true;
  if (formatHtmlLooksLikeVerticalNx1(normalizedHtml)) return true;
  return plainMatrixLooksLikeAgentPeriodDump(plainMatrix);
}

/**
 * When text/plain is empty or already crushed to N×1, rebuild a field dump from
 * Material / table cells so Format dual-source can reshape.
 */
export function extractPlainFieldDumpFromHtml(html) {
  if (!html) return "";
  try {
    // Prefer DOMParser so <table> markup is not lost inside a <div> shell.
    const doc = new DOMParser().parseFromString(String(html), "text/html");
    const root = doc.body || document.createElement("div");
    if (!doc.body) root.innerHTML = String(html);

    const cells = root.querySelectorAll(
      [
        "mat-cell",
        "mat-footer-cell",
        "mat-header-cell",
        ".mat-cell",
        ".mat-footer-cell",
        ".mat-header-cell",
        '[role="gridcell"]',
        "td",
        "th",
      ].join(", "),
    );
    const tokens = [];
    cells.forEach((cell) => {
      const text = String(cell.textContent || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) return;
      // One TD may hold a whole agent_period row as flattened text / nested blocks.
      const tokenized = tokenizeCollapsedReportRow(text);
      if (tokenized.length >= 3) {
        tokenized.forEach((token) => tokens.push(token));
      } else {
        tokens.push(text);
      }
    });
    if (tokens.length >= 3) return tokens.join("\n");

    // Collapsed clipboard: fields live in nested blocks without usable TD text
    // (or parser dropped table structure). Walk visible blocks.
    root.querySelectorAll("div, p, span, font, a").forEach((el) => {
      if (el.querySelector("div, p, span, font, a, td, th, mat-cell")) return;
      const text = String(el.textContent || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) tokens.push(text);
    });
    if (tokens.length >= 3) return tokens.join("\n");

    // Fallback: newline-split text content (paste-area / collapsed copies).
    const raw = String(root.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
    const lines = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.length >= 3 ? lines.join("\n") : "";
  } catch {
    return "";
  }
}

function resolveFormatPlainText(html, text) {
  const direct = String(text ?? "");
  const directMatrix = direct.trim() ? parsePlainTextMatrix(direct) : null;
  if (matrixLooksMultiColumn(directMatrix)) return direct;

  const fromHtml = extractPlainFieldDumpFromHtml(html);
  if (!fromHtml) return direct;
  const htmlMatrix = parsePlainTextMatrix(fromHtml);
  if (matrixLooksMultiColumn(htmlMatrix)) return fromHtml;
  return direct || fromHtml;
}

/**
 * True when normalized Format HTML collapsed to a vertical N×1 dump
 * (common when mat-cell copies become one <td> per <tr>).
 */
export function formatHtmlLooksLikeVerticalNx1(html) {
  if (!html || !/<table\b/i.test(html)) return false;
  try {
    const structure = parseFormatHtmlTableStructure(html);
    if (!structure) return true;
    const { dataRows, maxCols } = structure;
    if (maxCols >= 2) return false;
    return (dataRows?.length || 0) >= 3 || maxCols <= 1;
  } catch {
    return false;
  }
}

/** Process HTML/TSV clipboard content into preview + editable grid. */
export function processFormatTableHtml(
  html,
  { area = null, startRow = null, startCol = null, anchorCell = null, plainMatrix = null } = {},
) {
  if (!html) return false;
  const normalizedHtml = resolveNormalizedHtml(html) || html;
  if (!/<table\b/i.test(normalizedHtml)) return false;

  const anchor = anchorCell || getFormatPasteAnchorCell();
  const { startCol: anchorCol } = resolvePasteAnchor(anchor);
  const resolvedStartRow =
    startRow != null ? startRow : resolveFormatPasteStartRow(anchor);
  const resolvedStartCol = startCol != null ? startCol : anchorCol;

  const previewFragment = buildFormatPreviewFragmentFromClipboardHtml(normalizedHtml);
  const sanitized = sanitizePastedHTML(normalizedHtml);
  if (!previewFragment && !sanitized) return false;

  const filled = parseAndFillHtmlTableForFormat(sanitized || previewFragment, {
    startRow: resolvedStartRow,
    startCol: resolvedStartCol,
    plainMatrix,
  });
  return afterFormatPasteFilled(filled, area);
}

export function processFormatTsv(text, { area = null, startRow = null, startCol = null, anchorCell = null } = {}) {
  if (!text || !text.includes("\t")) return false;
  const plainMatrix = parsePlainTextMatrix(text);
  const tableHtml = tsvToHtmlTable(text);
  return processFormatTableHtml(tableHtml, { area, startRow, startCol, anchorCell, plainMatrix });
}

/**
 * 2.Format dual-source: plain matrix owns structure; HTML supplies .positive / link colors.
 * Applies patches directly (no HTML table round-trip) so collapsed clipboard cannot win.
 * Format-only — does not touch 1.TEXT handlers.
 */
export function processFormatDualSource(html, text, { area = null, startRow = null, startCol = null, anchorCell = null } = {}) {
  if (!text?.trim()) return false;
  const matrix = parsePlainTextMatrix(text);
  if (!matrixLooksMultiColumn(matrix)) return false;

  const anchor = anchorCell || getFormatPasteAnchorCell();
  const { startCol: anchorCol } = resolvePasteAnchor(anchor);
  const resolvedStartRow =
    startRow != null ? startRow : resolveFormatPasteStartRow(anchor);
  const resolvedStartCol = startCol != null ? startCol : anchorCol;
  ensureGridFits(resolvedStartRow, resolvedStartCol, matrix.length, matrix[0]?.length || 0);

  let patches =
    plainMatrixToFormatCellPatches(matrix, html || "") ||
    matrix.map((row) => (row || []).map((value) => ({ value: String(value ?? "") })));
  patches = splitStackedSubtotalGrandTotalRows(patches);
  patches = sanitizePasteMatrix(expandLabelColonMoneyCells(patches));

  if (formatBodyMatrixLooksCollapsed(patches, null)) {
    console.log("Format: Dual-source reshape still looks collapsed — abort");
    return false;
  }

  const patchedCols = Math.max(...patches.map((row) => (row || []).length), 0);
  ensureGridFits(resolvedStartRow, resolvedStartCol, patches.length, patchedCols);

  const { successCount } = applyDataMatrixToGrid(patches, null, {
    startRowOverride: resolvedStartRow,
    startColOverride: resolvedStartCol,
    trimValues: false,
    alignTotalRows: false,
  });
  if (successCount <= 0) return false;

  notifyPasteUser(
    `成功粘贴表格 (${patches.length} 个数据行 x ${patchedCols} 列)，已按字段重排!`,
    "success",
  );
  console.log(`Format: Dual-source applied ${patches.length}x${patchedCols} directly (no HTML reparse)`);
  return afterFormatPasteFilled(true, area);
}

/** 2.Format: mat-row plain vertical dump → reshape → HTML table fill. */
export function processFormatPlainMatrix(text, { area = null, startRow = null, startCol = null, anchorCell = null, html = "" } = {}) {
  if (!text?.trim()) return false;
  if (html) return processFormatDualSource(html, text, { area, startRow, startCol, anchorCell });
  const matrix = parsePlainTextMatrix(text);
  if (!matrixLooksMultiColumn(matrix)) return false;
  const tableHtml = plainMatrixToHtmlTable(matrix);
  return processFormatTableHtml(tableHtml, { area, startRow, startCol, anchorCell, plainMatrix: matrix });
}

function readClipboard(clipboard) {
  const getData = (type) => {
    try {
      return clipboard?.getData?.(type) || "";
    } catch {
      return "";
    }
  };
  return {
    html: getData("text/html"),
    text: getData("text/plain"),
  };
}

function tryProcessFormatClipboard(html, text, options) {
  const plainText = resolveFormatPlainText(html, text);
  const plainMatrix = plainText?.trim() ? parsePlainTextMatrix(plainText) : null;
  const plainMulti = matrixLooksMultiColumn(plainMatrix);
  const normalizedHtml = resolveNormalizedHtml(html);
  const opts = { ...options, plainMatrix };

  // agent_period / N×1 dumps: plain reshape FIRST (avoids Fig1 col1 stack).
  // Wide statement HTML (OB / 16-col) stays on HTML path below.
  if (shouldPreferFormatPlainDual(plainMulti, plainMatrix, normalizedHtml)) {
    if (processFormatDualSource(html, plainText, opts)) return true;
  }

  // Multi-col report HTML (e.g. OB/SUBTOTAL sheets) — keep styles + icon column.
  // Fall through to dual when HTML fill rejects collapsed bodies.
  if (normalizedHtml && /<table\b/i.test(normalizedHtml)) {
    if (!formatHtmlLooksLikeVerticalNx1(normalizedHtml)) {
      if (processFormatTableHtml(normalizedHtml, opts)) return true;
      if (plainMulti) return processFormatDualSource(html || normalizedHtml, plainText, opts);
    } else if (plainMulti) {
      return processFormatDualSource(html || normalizedHtml, plainText, opts);
    }
  } else if (plainMulti) {
    if (processFormatDualSource(html, plainText, opts)) return true;
  }

  if (html && clipboardHtmlLooksLikeGrid(html)) {
    const forced = normalizeClipboardHtmlToTable(html);
    if (forced && /<table\b/i.test(forced)) {
      if (!formatHtmlLooksLikeVerticalNx1(forced)) {
        if (processFormatTableHtml(forced, opts)) return true;
        if (plainMulti) return processFormatDualSource(html, plainText, opts);
      } else if (plainMulti) {
        return processFormatDualSource(html, plainText, opts);
      }
    }
  }

  // Grid-like HTML + reshapable plain, but normalize failed → still dual-source.
  if (html && clipboardHtmlLooksLikeGrid(html) && plainMulti) {
    return processFormatDualSource(html, plainText, opts);
  }

  if (plainText && /<table\b/i.test(plainText)) {
    if (!formatHtmlLooksLikeVerticalNx1(plainText)) {
      if (processFormatTableHtml(plainText, opts)) return true;
      if (plainMulti) return processFormatDualSource(html, plainText, opts);
    } else if (plainMulti) {
      return processFormatDualSource(html, plainText, opts);
    }
  }
  if (plainText && plainText.includes("\t")) {
    return processFormatTsv(plainText, opts);
  }
  if (plainMulti) {
    return processFormatDualSource(html, plainText, opts);
  }
  if (plainText?.trim()) {
    return processFormatPlainMatrix(plainText, { ...opts, html: html || "" });
  }
  return false;
}

/** Paste handler for #pasteAreaFormat (direct paste into format area). */
export function handleFormatPasteAreaEvent(e) {
  if (!isFormatMode()) return;

  const clipboard = e.clipboardData || window.clipboardData;
  const { html, text } = readClipboard(clipboard);
  const area = document.getElementById("pasteAreaFormat");

  const anchorCell = getFormatPasteAnchorCell();
  const startRow = resolveFormatPasteStartRow(anchorCell);
  const options = { area, startRow, anchorCell };

  if (tryProcessFormatClipboard(html, text, options)) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  // Still intercept Material / report pastes so the browser does not dump N×1 into the area.
  if ((html && clipboardHtmlLooksLikeGrid(html)) || resolveFormatPlainText(html, text).includes("\n")) {
    e.preventDefault();
    e.stopPropagation();
    const recovered = resolveFormatPlainText(html, text);
    if (recovered?.trim() && processFormatDualSource(html, recovered, options)) return;
  }

  setTimeout(() => {
    try {
      const pastedHTML = area?.innerHTML || "";
      const normalizedPasted = resolveNormalizedHtml(pastedHTML) || pastedHTML;
      if (normalizedPasted && /<table\b/i.test(normalizedPasted)) {
        if (formatHtmlLooksLikeVerticalNx1(normalizedPasted) && text?.trim()) {
          const appendStartRow = resolveFormatPasteStartRow(getFormatPasteAnchorCell());
          processFormatDualSource(pastedHTML, text, {
            area,
            startRow: appendStartRow,
            anchorCell: getFormatPasteAnchorCell(),
          });
          return;
        }
        const appendStartRow = resolveFormatPasteStartRow(getFormatPasteAnchorCell());
        const delayedAnchor = getFormatPasteAnchorCell();
        if (processFormatTableHtml(normalizedPasted, {
          area,
          startRow: appendStartRow,
          anchorCell: delayedAnchor,
        })) return;
        if (text?.trim()) {
          processFormatDualSource(pastedHTML || normalizedPasted, text, {
            area,
            startRow: appendStartRow,
            anchorCell: delayedAnchor,
          });
        }
      }
    } catch {
      /* ignore */
    }
  }, 0);
}

/**
 * Global bubble-phase intercept: route table paste to format pipeline
 * instead of letting <table> land elsewhere on the page.
 */
export function handleGlobalFormatPaste(e) {
  if (!isFormatMode()) return;
  if (isEditableFormField(e.target)) return;
  if (e.target?.closest?.("#dataTable")) return;
  if (e.defaultPrevented) return;

  const clipboard = e.clipboardData || window.clipboardData;
  if (!clipboard || !clipboardLooksLikeTable(clipboard)) return;

  e.preventDefault();
  e.stopPropagation();

  const anchorCell = getFormatPasteAnchorCell();
  const startRow = resolveFormatPasteStartRow(anchorCell);
  const pasteAreaFormat = document.getElementById("pasteAreaFormat");
  const { html, text } = readClipboard(clipboard);

  tryProcessFormatClipboard(html, text, {
    area: pasteAreaFormat,
    startRow,
    anchorCell,
  });
}

/** Legacy-compatible entry used by handleFormatPasteFromClipboard. */
export function handleFormatPasteFromClipboard(clipboard, fallbackHTML, options = {}) {
  if (!isFormatMode() || !clipboard) return false;

  const { html, text } = readClipboard(clipboard);
  const htmlCandidate = html || fallbackHTML || "";

  if (tryProcessFormatClipboard(htmlCandidate, text, options)) {
    return true;
  }
  return false;
}

/**
 * Phase 4e: 2.Format grid cell paste — route table HTML/TSV/mat-row through format pipeline.
 */
export function handleFormatCellPaste(e, pastedData) {
  const anchorCell = resolvePasteCell(e.target);
  const startRow = resolveFormatPasteStartRow(anchorCell);
  const options = { startRow, anchorCell };

  const clipboard = e.clipboardData || window.clipboardData;
  if (clipboard && handleFormatPasteFromClipboard(clipboard, null, options)) {
    return true;
  }

  const html = (() => {
    try {
      return clipboard?.getData?.("text/html") || "";
    } catch {
      return "";
    }
  })();

  return tryProcessFormatClipboard(html, pastedData, options);
}
