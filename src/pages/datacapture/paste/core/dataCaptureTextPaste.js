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
import { sanitizePasteMatrix } from "./dataCapturePasteMatrixSanitize.js";
import { splitStackedSubtotalGrandTotalRows } from "./dataCaptureStackedTotalSplit.js";

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

  if (normalized.includes("\t")) {
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

  const rawLines = normalized.split("\n");
  const nonEmptyLines = rawLines.filter((line) => line.trim() !== "");

  // Prefer vertical-dump reshape before blank-line block splitting so mat-row
  // dumps with blank separators / trailing paginator still become multi-col rows.
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
  if (!text.trim() || text.includes("\t")) return false;
  const nonEmptyLines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim() !== "");
  return Boolean(detectVerticalFieldDump(nonEmptyLines)?.rows?.length);
}

export function handleTextModePaste(e, pastedData, anchorCell) {
  // Plan B first: agent_period / mat-row copies often ship HTML that parses as
  // N×1 while plain is the reliable vertical field dump.
  if (plainLooksLikeReshapableVerticalDump(pastedData)) {
    if (handleTextPlainPaste(e, pastedData, anchorCell)) return true;
  }

  const html = getClipboardHtml(e);
  const htmlFromDetect = html ? "" : detectHtmlTableInClipboard(e);
  const rawHtmlCandidate = html || htmlFromDetect;
  const htmlCandidate = resolveTextPasteHtml(rawHtmlCandidate) || rawHtmlCandidate;

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
