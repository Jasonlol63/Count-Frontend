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
import {
  plainTextLooksLikeAlignedTsv,
  sanitizePasteMatrix,
} from "./dataCapturePasteMatrixSanitize.js";
import { ensureTotalRowCodeColumnGap } from "./dataCaptureTotalRowAlign.js";
import {
  applyDataMatrixToGrid,
  ensureGridFits,
  getFormatPasteAnchorCell,
  resolveFormatPasteStartRow,
  resolvePasteAnchor,
} from "./dataCapturePasteApply.js";
import { isGridPasteBlockedTarget } from "./dataCaptureClipboard.js";
import { tryHandleAwcWinLossReportPaste } from "../vendors/dataCaptureAwcPaste.js";
import { tryHandleGamingSoftInvoicePaste } from "./dataCaptureGamingSoftInvoicePasteHelper.js";
import { tryHandleKing855WinLossPaste } from "./dataCaptureKing855WinLossPasteHelper.js";
import { tryHandleWosWinLossDetailPaste } from "./dataCaptureWosWinLossDetailPasteHelper.js";
import { tryHandleCitibetAgentPtReportPaste } from "./dataCaptureCitibetAgentPtReportPasteHelper.js";
import {
  alignFooterOnlySubGrandMatrix,
  tryHandleFooterOnlySubGrandPaste,
} from "./dataCaptureWinLoseFooterOnlyPasteHelper.js";
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

/**
 * Post-fill bookkeeping.
 * @param {boolean} filled
 * @param {HTMLElement|null} area
 * @param {{ formatShell?: boolean }} [options]
 *   formatShell (default true): 2.Format UI — ready flag, preview cache, paste area.
 *   Pass false when 1.Text reuses the Format fill core without touching Format shell state.
 */
function afterFormatPasteFilled(filled, area, { formatShell = true } = {}) {
  if (!filled) return false;
  if (formatShell) {
    setFormatGridReady(true);
    syncFormatPreviewFromDom();
    if (area) area.innerHTML = "";
    showFormatEditableGrid();
    toggleFormatDisplay();
  }
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
  let structure = null;
  try {
    structure = parseFormatHtmlTableStructure(html);
    if (!structure) return true;
    const { dataRows, maxCols } = structure;
    if (maxCols >= 2) return false;
    return (dataRows?.length || 0) >= 3 || maxCols <= 1;
  } catch {
    // Fail closed: prefer plain dual-source reshape over applying a bad HTML body.
    return true;
  } finally {
    structure?.dispose?.();
  }
}

/** Process HTML/TSV clipboard content into preview + editable grid. */
export function processFormatTableHtml(
  html,
  {
    area = null,
    startRow = null,
    startCol = null,
    anchorCell = null,
    plainMatrix = null,
    formatShell = true,
  } = {},
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
  return afterFormatPasteFilled(filled, area, { formatShell });
}

export function processFormatTsv(
  text,
  { area = null, startRow = null, startCol = null, anchorCell = null, formatShell = true } = {},
) {
  if (!text || !text.includes("\t")) return false;
  const plainMatrix = parsePlainTextMatrix(text);
  const tableHtml = tsvToHtmlTable(text);
  return processFormatTableHtml(tableHtml, {
    area,
    startRow,
    startCol,
    anchorCell,
    plainMatrix,
    formatShell,
  });
}

/**
 * Dual-source fill: plain matrix owns structure; HTML supplies .positive / link colors.
 * Applies patches directly (no HTML table round-trip) so collapsed clipboard cannot win.
 * Shared by 2.Format and 1.Text (Text passes formatShell: false).
 */
export function processFormatDualSource(
  html,
  text,
  {
    area = null,
    startRow = null,
    startCol = null,
    anchorCell = null,
    formatShell = true,
  } = {},
) {
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
  patches = alignFooterOnlySubGrandMatrix(patches);
  patches = sanitizePasteMatrix(expandLabelColonMoneyCells(patches));
  // Plain TSV may omit the blank under the code column on TOTAL BALANCE rows.
  patches = ensureTotalRowCodeColumnGap(patches);

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
  return afterFormatPasteFilled(true, area, { formatShell });
}

/** Plain vertical dump → reshape → HTML table fill (2.Format + 1.Text shared core). */
export function processFormatPlainMatrix(
  text,
  {
    area = null,
    startRow = null,
    startCol = null,
    anchorCell = null,
    html = "",
    formatShell = true,
  } = {},
) {
  if (!text?.trim()) return false;
  if (html) {
    return processFormatDualSource(html, text, {
      area,
      startRow,
      startCol,
      anchorCell,
      formatShell,
    });
  }
  const matrix = parsePlainTextMatrix(text);
  if (!matrixLooksMultiColumn(matrix)) return false;
  const tableHtml = plainMatrixToHtmlTable(matrix);
  return processFormatTableHtml(tableHtml, {
    area,
    startRow,
    startCol,
    anchorCell,
    plainMatrix: matrix,
    formatShell,
  });
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

function tryFormatHtmlFill(html, _options, htmlFillOpts) {
  if (!html || !/<table\b/i.test(html)) return false;
  if (formatHtmlLooksLikeVerticalNx1(html)) return false;
  // Do not retry with plainMatrix cleared — that bypasses TSV row/col grill and can
  // accept HTML missing footers. C8 messy plain is already excluded from htmlFillOpts
  // via plainTextLooksLikeAlignedTsv (only aligned TSV may grill).
  return processFormatTableHtml(html, htmlFillOpts);
}

function tryProcessFormatClipboard(html, text, options = {}) {
  if (
    tryHandleAwcWinLossReportPaste(html, text, {
      anchorCell: options?.anchorCell,
      startRowOverride: options?.startRow,
    })
  ) {
    return afterFormatPasteFilled(true, options?.area, options);
  }

  if (
    tryHandleGamingSoftInvoicePaste(html, text, {
      anchorCell: options?.anchorCell,
      startRowOverride: options?.startRow,
    })
  ) {
    return afterFormatPasteFilled(true, options?.area, options);
  }

  if (
    tryHandleKing855WinLossPaste(html, text, {
      anchorCell: options?.anchorCell,
      startRowOverride: options?.startRow,
    })
  ) {
    return afterFormatPasteFilled(true, options?.area, options);
  }

  if (
    tryHandleWosWinLossDetailPaste(html, text, {
      anchorCell: options?.anchorCell,
      startRowOverride: options?.startRow,
    })
  ) {
    return afterFormatPasteFilled(true, options?.area, options);
  }

  if (
    tryHandleCitibetAgentPtReportPaste(html, text, {
      anchorCell: options?.anchorCell,
      startRowOverride: options?.startRow,
    })
  ) {
    return afterFormatPasteFilled(true, options?.area, options);
  }

  if (
    tryHandleFooterOnlySubGrandPaste(html, text, {
      anchorCell: options?.anchorCell,
      startRowOverride: options?.startRow,
    })
  ) {
    return afterFormatPasteFilled(true, options?.area, options);
  }

  const plainText = resolveFormatPlainText(html, text);
  const plainMatrix = plainText?.trim() ? parsePlainTextMatrix(plainText) : null;
  const plainMulti = matrixLooksMultiColumn(plainMatrix);
  const normalizedHtml = resolveNormalizedHtml(html);
  // Only real spreadsheet TSV may grill-reject HTML. C8Play Win Loss plain is a
  // vertical dump with sparse tabs (`87\\tAgent\\t`) — never treat as aligned TSV.
  const directIsAlignedTsv = plainTextLooksLikeAlignedTsv(text);
  const directMatrix = directIsAlignedTsv && text?.trim() ? parsePlainTextMatrix(text) : null;
  // 1.Text reuses this pipeline with formatShell:false — prefer HTML cell structure
  // (TOTAL BALANCE gap + per-cell colors) over plain-TSV grill → dual-source.
  const skipPlainGrill = options?.formatShell === false || options?.skipPlainGrill === true;
  const htmlFillOpts = {
    ...options,
    plainMatrix: matrixLooksMultiColumn(directMatrix) ? directMatrix : null,
    skipPlainGrill,
  };
  const dualOpts = { ...options, plainMatrix, skipPlainGrill };

  // agent_period / N×1 dumps: plain reshape FIRST (avoids Fig1 col1 stack).
  // Wide statement HTML (OB / 16-col) stays on HTML path below.
  if (shouldPreferFormatPlainDual(plainMulti, plainMatrix, normalizedHtml)) {
    if (processFormatDualSource(html, plainText, dualOpts)) return true;
  }

  // Multi-col report HTML (e.g. OB/SUBTOTAL sheets) — keep styles + icon column.
  // Fall through to dual when HTML fill rejects collapsed bodies.
  if (normalizedHtml && /<table\b/i.test(normalizedHtml)) {
    if (!formatHtmlLooksLikeVerticalNx1(normalizedHtml)) {
      if (tryFormatHtmlFill(normalizedHtml, options, htmlFillOpts)) return true;
      if (plainMulti) return processFormatDualSource(html || normalizedHtml, plainText, dualOpts);
    } else if (plainMulti) {
      return processFormatDualSource(html || normalizedHtml, plainText, dualOpts);
    }
  } else if (plainMulti) {
    if (processFormatDualSource(html, plainText, dualOpts)) return true;
  }

  if (html && clipboardHtmlLooksLikeGrid(html)) {
    const forced = normalizeClipboardHtmlToTable(html);
    if (forced && /<table\b/i.test(forced)) {
      if (!formatHtmlLooksLikeVerticalNx1(forced)) {
        if (tryFormatHtmlFill(forced, options, htmlFillOpts)) return true;
        if (plainMulti) return processFormatDualSource(html, plainText, dualOpts);
      } else if (plainMulti) {
        return processFormatDualSource(html, plainText, dualOpts);
      }
    }
  }

  // Grid-like HTML + reshapable plain, but normalize failed → still dual-source.
  if (html && clipboardHtmlLooksLikeGrid(html) && plainMulti) {
    return processFormatDualSource(html, plainText, dualOpts);
  }

  if (plainText && /<table\b/i.test(plainText)) {
    if (!formatHtmlLooksLikeVerticalNx1(plainText)) {
      if (tryFormatHtmlFill(plainText, options, htmlFillOpts)) return true;
      if (plainMulti) return processFormatDualSource(html, plainText, dualOpts);
    } else if (plainMulti) {
      return processFormatDualSource(html, plainText, dualOpts);
    }
  }
  if (plainText && plainText.includes("\t")) {
    return processFormatTsv(plainText, dualOpts);
  }
  if (plainMulti) {
    return processFormatDualSource(html, plainText, dualOpts);
  }
  if (plainText?.trim()) {
    return processFormatPlainMatrix(plainText, { ...dualOpts, html: html || "" });
  }
  return false;
}

/**
 * Shared Format clipboard fill (dual-source / HTML table / TSV).
 * 1.Text passes `{ formatShell: false }` so preview / formatGridReady /
 * #pasteAreaFormat are not touched, and `{ skipPlainGrill: true }` so HTML
 * structure/styles are not rejected for dual-source. Same orchestration as
 * 2.Format (normalize → HTML fill → dual-source fallback) — required for
 * Material rows like REDIRECT2U that need the full Format pipeline.
 */
export function tryFillGridWithFormatClipboard(html, text, options = {}) {
  if (options.formatShell === false) {
    return tryProcessFormatClipboard(html, text, {
      ...options,
      formatShell: false,
      skipPlainGrill: true,
    });
  }
  return tryProcessFormatClipboard(html, text, options);
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

  // Only block the browser dump when dual-source actually fills the grid.
  // Previously we preventDefault'd on any grid-like HTML, then dual-source failed
  // (C8Play messy plain) — paste area stayed empty and Ctrl+V looked broken.
  if ((html && clipboardHtmlLooksLikeGrid(html)) || resolveFormatPlainText(html, text).includes("\n")) {
    const recovered = resolveFormatPlainText(html, text);
    if (recovered?.trim() && processFormatDualSource(html, recovered, options)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
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
