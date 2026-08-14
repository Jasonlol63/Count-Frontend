import { applyDataMatrixToGrid, notifyPasteSuccess } from "./dataCapturePasteApply.js";
import {
  detectHtmlTableInClipboard,
  getClipboardHtml,
  isFormatRichHtmlTable,
} from "./dataCaptureClipboard.js";
import {
  clipboardHtmlLooksLikeGrid,
  normalizeClipboardHtmlToTable,
} from "./dataCaptureFormatClipboardNormalize.js";
import {
  parseAndFillHtmlTableForText,
  parseAndFillHtmlTableForTextWithFormat,
} from "./dataCaptureTextHtmlPaste.js";
import {
  detectFlattenedStatementMatrix,
  detectVerticalFieldDump,
} from "./dataCaptureVerticalDumpDetect.js";
import { tryReshapeC8WinLossPlainMatrix } from "./dataCaptureC8WinLossPasteHelper.js";
import { tryReshapeAllGamesPlainMatrix } from "./dataCaptureAllGamesPasteHelper.js";
import { tryReshapePdfTablePlainMatrix } from "./dataCapturePdfTablePasteHelper.js";
import {
  plainTextLooksLikeAlignedTsv,
  sanitizePasteMatrix,
} from "./dataCapturePasteMatrixSanitize.js";
import { splitStackedSubtotalGrandTotalRows } from "./dataCaptureStackedTotalSplit.js";
import { tryHandleAwcWinLossReportPaste } from "../vendors/dataCaptureAwcPaste.js";

/**
 * Badge / summary chips like "Total win: 2,753.79" copy as one span —
 * split label + money into two columns (1.TEXT and 2.FORMAT share this parser).
 * @returns {[string, string] | null}
 */
export function trySplitLabelColonMoneyCell(cell) {
  const text = String(cell ?? "")
    .replace(/\u00a0/g, " ")
    .trim();
  if (!text || !text.includes(":")) return null;

  const match = text.match(
    /^(.+?)\s*:\s*(\(?-?\$?\d{1,3}(?:,\d{3})*(?:\.\d+)?\)?|-?\$?\d+(?:\.\d+)?)\s*$/,
  );
  if (!match) return null;

  const label = `${match[1].trim()}:`;
  const value = match[2].trim();
  if (!match[1].trim() || !value) return null;
  // Need a word-like label (not bare punctuation / numeric ratio left side).
  if (!/[A-Za-z\u4e00-\u9fff]/.test(label)) return null;
  return [label, value];
}

function cellPlainForColonSplit(cell) {
  if (cell != null && typeof cell === "object" && "value" in cell) {
    return String(cell.value ?? "");
  }
  return String(cell ?? "");
}

/** Expand single-cell "Label: money" rows into two columns. */
export function expandLabelColonMoneyCells(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) return matrix;

  let changed = false;
  const rows = matrix.map((row) => {
    if (!Array.isArray(row) || row.length !== 1) return row;
    const split = trySplitLabelColonMoneyCell(cellPlainForColonSplit(row[0]));
    if (!split) return row;
    changed = true;
    const sample = row[0];
    if (sample != null && typeof sample === "object" && "value" in sample) {
      return [
        { ...sample, value: split[0], html: undefined },
        { value: split[1] },
      ];
    }
    return split;
  });
  if (!changed) return matrix;

  const maxCols = Math.max(...rows.map((row) => row.length), 0);
  rows.forEach((row) => {
    while (row.length < maxCols) {
      row.push(typeof row[0] === "object" ? { value: "" } : "");
    }
  });
  return rows;
}

function finalizePlainMatrix(matrix) {
  return sanitizePasteMatrix(expandLabelColonMoneyCells(matrix));
}

/**
 * Normalize clipboard plain text into a row/col matrix.
 * Material / Report-Center copies often land as one field per line — reshape via
 * detectVerticalFieldDump before falling back to N×1.
 */
export function parsePlainTextMatrix(pastedData) {
  const normalized = String(pastedData ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  if (!normalized.trim()) return [];

  // Only real spreadsheet TSV uses the tab-row path (keeps empty cells 1:1).
  // Sparse tabs mixed into a one-field-per-line dump must fall through.
  if (plainTextLooksLikeAlignedTsv(normalized)) {
    const tabRows = normalized
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => line.split("\t"));
    if (!tabRows.length) return [];

    const maxCols = Math.max(...tabRows.map((row) => row.length));
    tabRows.forEach((row) => {
      while (row.length < maxCols) row.push("");
    });
    return finalizePlainMatrix(tabRows);
  }

  // Scoped C8 Win Loss Detail helper — vertical / sparse-tab only.
  // Null for all other report pastes (agent_period, OB, etc.).
  const c8WinLoss = tryReshapeC8WinLossPlainMatrix(normalized);
  if (c8WinLoss?.length) return finalizePlainMatrix(c8WinLoss);

  // Scoped allGames (iview) helper — % tokens + Total(N) break shared vertical-dump.
  const allGames = tryReshapeAllGamesPlainMatrix(normalized);
  if (allGames?.length) return finalizePlainMatrix(allGames);

  // Universal PDF table-row helper — multi-space / single-space collapsed invoice lines.
  const pdfTable = tryReshapePdfTablePlainMatrix(normalized);
  if (pdfTable?.length) return finalizePlainMatrix(pdfTable);

  const rawLines = normalized.split("\n");
  const nonEmptyLines = rawLines.filter((line) => line.trim() !== "");

  // Prefer vertical-dump reshape before blank-line block splitting so mat-row
  // dumps with blank separators / trailing paginator still become multi-col rows.
  // detectVerticalFieldDump expands sparse tabs into tokens.
  const verticalDump = detectVerticalFieldDump(nonEmptyLines);
  if (verticalDump?.rows?.length) return finalizePlainMatrix(verticalDump.rows);

  const hasBlankLine = rawLines.some((line) => line.trim() === "");
  if (hasBlankLine) {
    const rowBlocks = [];
    let currentRow = [];

    rawLines.forEach((line) => {
      if (line.trim() === "") {
        if (currentRow.length) {
          rowBlocks.push(currentRow);
          currentRow = [];
        }
        return;
      }
      currentRow.push(line);
    });
    if (currentRow.length) rowBlocks.push(currentRow);

    const hasMultiColBlock = rowBlocks.some((row) => row.length > 1);
    if (rowBlocks.length >= 2 && hasMultiColBlock) {
      const maxCols = Math.max(...rowBlocks.map((row) => row.length));
      rowBlocks.forEach((row) => {
        while (row.length < maxCols) row.push("");
      });
      return finalizePlainMatrix(rowBlocks);
    }
  }

  const spacingSplitRows = nonEmptyLines.map((line) =>
    line
      .trim()
      .split(/\s{2,}/)
      .map((cell) => cell.trim())
      .filter((cell) => cell !== ""),
  );
  if (spacingSplitRows.length >= 2) {
    const maxCols = Math.max(...spacingSplitRows.map((row) => row.length));
    const multiColRows = spacingSplitRows.filter((row) => row.length >= 2).length;
    const minRowsForWideSplit = Math.max(2, Math.ceil(spacingSplitRows.length * 0.6));

    if (maxCols >= 2 && multiColRows >= minRowsForWideSplit) {
      spacingSplitRows.forEach((row) => {
        while (row.length < maxCols) row.push("");
      });
      return finalizePlainMatrix(spacingSplitRows);
    }
  }

  const flattenedStatementRows = detectFlattenedStatementMatrix(nonEmptyLines);
  if (flattenedStatementRows) return finalizePlainMatrix(flattenedStatementRows);

  return finalizePlainMatrix(nonEmptyLines.map((line) => [line]));
}

/** 1.Text — Excel plain text paste, preserving the clipboard matrix as-is. */
export function handleTextPlainPaste(e, pastedData, anchorCell) {
  // TEXT-only: unwind SUB TOTAL+GRAND TOTAL stacked in one label cell (helper not used by Format).
  const dataMatrix = splitStackedSubtotalGrandTotalRows(parsePlainTextMatrix(pastedData));
  if (!dataMatrix.length) return false;

  const { successCount, maxRows, maxCols: cols } = applyDataMatrixToGrid(dataMatrix, anchorCell, {
    uppercaseValues: false,
    trimValues: false,
    alignTotalRows: false,
  });

  if (successCount > 0) {
    notifyPasteSuccess(
      `成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)，已保持Excel原始格式!`,
    );
    return true;
  }
  return false;
}

function resolveTextPasteHtml(html) {
  if (!html) return "";
  const normalized = normalizeClipboardHtmlToTable(html) || html;
  if (/<table\b/i.test(normalized)) return normalized;
  return "";
}

/** 1.Text — HTML table paste (Phase 4b, React-owned). */
export function handleTextHtmlPaste(html, anchorCell) {
  const tableHtml = resolveTextPasteHtml(html);
  if (!tableHtml) return false;
  return parseAndFillHtmlTableForText(tableHtml, anchorCell);
}

/**
 * True when plain clipboard is a Material/report one-field-per-line dump that
 * Plan B can reshape — prefer this over HTML that often lands as N×1 <tr>s.
 */
function plainLooksLikeReshapableVerticalDump(pastedData) {
  const text = String(pastedData ?? "");
  if (!text.trim()) return false;
  const nonEmptyLines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim() !== "");
  if (!nonEmptyLines.length) return false;

  // Sparse tabs (C8Play: "87\tAgent\t" amid one-field-per-line) still count as
  // vertical dumps. Dense TSV (most lines have tabs) stays on the tab/HTML path.
  const tabLines = nonEmptyLines.filter((line) => line.includes("\t")).length;
  if (tabLines > 0 && tabLines >= Math.ceil(nonEmptyLines.length * 0.35)) return false;

  const tokens = [];
  nonEmptyLines.forEach((line) => {
    if (line.includes("\t")) {
      line.split("\t").forEach((part) => {
        const t = part.replace(/\u00a0/g, " ").trim();
        if (t) tokens.push(t);
      });
    } else {
      tokens.push(line.trim());
    }
  });
  return Boolean(detectVerticalFieldDump(tokens)?.rows?.length);
}

/** Wide multi-col <tr> count — used so Plan B cannot beat a fuller HTML table. */
function countWideHtmlTableRows(html) {
  if (!html || !/<table\b/i.test(html)) return 0;
  try {
    const root = document.createElement("div");
    root.innerHTML = html;
    const table = root.querySelector("table");
    if (!table) return 0;
    let wide = 0;
    table.querySelectorAll("tr").forEach((tr) => {
      const cells = tr.querySelectorAll("td, th");
      if (cells.length >= 3) wide += 1;
    });
    return wide;
  } catch {
    return 0;
  }
}

/** True when HTML table is field-per-row (col1 stack) — Plan B must still win. */
function htmlTableLooksLikeVerticalNx1(html) {
  if (!html || !/<table\b/i.test(html)) return false;
  try {
    const root = document.createElement("div");
    root.innerHTML = html;
    const table = root.querySelector("table");
    if (!table) return false;
    let maxCols = 0;
    let rowCount = 0;
    table.querySelectorAll("tr").forEach((tr) => {
      const n = tr.querySelectorAll("td, th").length;
      if (!n) return;
      rowCount += 1;
      maxCols = Math.max(maxCols, n);
    });
    return rowCount >= 3 && maxCols <= 1;
  } catch {
    return false;
  }
}

export function handleTextModePaste(e, pastedData, anchorCell) {
  const html = getClipboardHtml(e);
  const htmlFromDetect = html ? "" : detectHtmlTableInClipboard(e);
  const rawHtmlCandidate = html || htmlFromDetect;
  const htmlCandidate = resolveTextPasteHtml(rawHtmlCandidate) || rawHtmlCandidate;
  const wideHtmlRows = countWideHtmlTableRows(htmlCandidate || rawHtmlCandidate);
  const htmlNx1 = htmlTableLooksLikeVerticalNx1(htmlCandidate || rawHtmlCandidate);

  if (tryHandleAwcWinLossReportPaste(html, pastedData, { anchorCell })) return true;

  // Match 2.FORMAT: prefer plain vertical-dump reshape whenever it yields a real
  // multi-col matrix. HTML-first only when it has a strictly fuller wide table
  // than plain (C8 Kendo 3-row footer vs plain that lost a row).
  if (plainLooksLikeReshapableVerticalDump(pastedData)) {
    const plainMatrix = parsePlainTextMatrix(pastedData);
    const plainRows = Array.isArray(plainMatrix) ? plainMatrix.length : 0;
    const plainCols = Math.max(
      0,
      ...(plainMatrix || []).map((row) => (Array.isArray(row) ? row.length : 0)),
    );
    const plainReshaped = plainRows >= 2 && plainCols >= 2;
    const htmlClearlyFuller = wideHtmlRows >= 3 && wideHtmlRows > plainRows && !htmlNx1;
    if (plainReshaped && !htmlClearlyFuller) {
      if (handleTextPlainPaste(e, pastedData, anchorCell)) return true;
    }
  }

  if (htmlCandidate && (isFormatRichHtmlTable(htmlCandidate) || clipboardHtmlLooksLikeGrid(rawHtmlCandidate))) {
    const formatHtml = resolveTextPasteHtml(htmlCandidate) || htmlCandidate;
    if (parseAndFillHtmlTableForTextWithFormat(formatHtml, anchorCell)) return true;

    // Keep user flow unblocked: fallback to legacy 1.Text parsing.
    if (handleTextHtmlPaste(htmlCandidate, anchorCell)) {
      notifyPasteSuccess("格式保留失败，已按纯文本粘贴。", "danger");
      return true;
    }

    if (handleTextPlainPaste(e, pastedData, anchorCell)) {
      notifyPasteSuccess("格式保留失败，已按纯文本粘贴。", "danger");
      return true;
    }
    return false;
  }

  if (handleTextHtmlPaste(html, anchorCell)) return true;
  if (htmlFromDetect && handleTextHtmlPaste(htmlFromDetect, anchorCell)) return true;

  return handleTextPlainPaste(e, pastedData, anchorCell);
}
