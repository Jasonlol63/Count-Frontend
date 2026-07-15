/** Ported from js/datacapture.js — 2.Format grid fill (Phase 4c / PR6 batch 1). */

import { applyDataMatrixToGrid, ensureGridFits } from "./dataCapturePasteApply.js";
import { notifyPasteUser, recomputeSubmitStateAfterPaste } from "../../lib/dataCaptureBridge.js";
import {
  parseFormatHtmlTableStructure,
  countFormatRequiredBodyRows,
  buildFormatBodyMatrix,
} from "./dataCaptureFormatHtmlMatrix.js";
import { plainMatrixToFormatCellPatches } from "./dataCaptureFormatPreview.js";
import { parsePlainTextMatrix } from "./dataCaptureTextPaste.js";
import { tokenizeCollapsedReportRow } from "./dataCaptureFormatClipboardNormalize.js";
import { splitStackedSubtotalGrandTotalRows } from "./dataCaptureStackedTotalSplit.js";
import {
  matrixAlignsWithPlainSource,
  plainMatrixLooksReliable,
  sanitizePasteMatrix,
} from "./dataCapturePasteMatrixSanitize.js";
import { expandLabelColonMoneyCells } from "./dataCaptureTextPaste.js";

function flattenFormatBodyMatrixToPlain(bodyMatrix) {
  const lines = [];
  (bodyMatrix || []).forEach((row) => {
    (row || []).forEach((cell) => {
      const text = String(cell?.value || "")
        .replace(/\u00a0/g, " ")
        .trim();
      const html = String(cell?.html || "");
      if (text.includes("\n") || text.includes("\r")) {
        text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .forEach((line) => lines.push(line));
        return;
      }
      const fromHtml = html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(?:div|p|tr|li|mat-cell)>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/\u00a0/g, " ");
      const htmlLines = fromHtml
        .split(/\r?\n/)
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      if (htmlLines.length >= 3) {
        htmlLines.forEach((line) => lines.push(line));
        return;
      }
      const tokenized = tokenizeCollapsedReportRow(text || fromHtml);
      if (tokenized.length >= 3) {
        tokenized.forEach((token) => lines.push(token));
        return;
      }
      if (text) lines.push(text);
    });
  });
  return lines.join("\n");
}

function tryReshapeCollapsedFormatBody(bodyMatrix, htmlString) {
  const fromMatrix = flattenFormatBodyMatrixToPlain(bodyMatrix);
  const candidates = [fromMatrix, String(htmlString || "").replace(/<[^>]+>/g, "\n")].filter(
    (s) => s && s.trim().length >= 3,
  );

  for (const candidate of candidates) {
    const matrix = parsePlainTextMatrix(candidate);
    const cols = matrix?.[0]?.length || 0;
    if (cols < 2) continue;
    const patches = plainMatrixToFormatCellPatches(matrix, htmlString || "");
    if (!patches.length) continue;
    if (formatBodyMatrixLooksCollapsed(patches, null)) continue;
    console.log(
      `Format: Healed collapsed body via plain reshape → ${patches.length}x${cols}`,
    );
    return patches;
  }
  return null;
}

function cellText(cell) {
  if (cell == null) return "";
  if (typeof cell === "string" || typeof cell === "number") return String(cell).trim();
  return String(cell?.value || cell?.html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cellLooksMoneyOrNumber(text) {
  const cleaned = String(text ?? "")
    .trim()
    .replace(/[,$¥€£]/g, "")
    .replace(/^\((.*)\)$/, "-$1");
  if (!cleaned) return false;
  return /^-?\d+(?:\.\d+)?$/.test(cleaned) || /^\$?-?\d/.test(String(text).trim());
}

function cellLooksAgentId(text) {
  const t = String(text ?? "").trim();
  if (!t || cellLooksMoneyOrNumber(t)) return false;
  if (/^(SUBTOTAL|SUB TOTAL|TOTAL(?:\s+AMOUNT)?|GRAND\s*TOTAL)$/i.test(t)) return false;
  // Agent codes: AW9966, SDSPDA95, BSAM2424 — not prose.
  return /^[A-Za-z][A-Za-z0-9._-]{1,24}$/.test(t);
}

/**
 * Fig2 跑位: row N = only agent id in col0; row N+1 = only numbers across cols.
 * Reject so Format can retry another clipboard path instead of writing misaligned grid.
 */
export function formatBodyMatrixLooksIdNumberSplit(bodyMatrix) {
  if (!bodyMatrix || bodyMatrix.length < 2) return false;

  let splitPairs = 0;
  for (let i = 0; i < bodyMatrix.length - 1; i += 1) {
    const idRow = bodyMatrix[i] || [];
    const numRow = bodyMatrix[i + 1] || [];

    const idTexts = idRow.map(cellText);
    const numTexts = numRow.map(cellText);
    const idFilled = idTexts.filter(Boolean);
    const numFilled = numTexts.filter(Boolean);

    const idOnlyAgent =
      idFilled.length === 1 && cellLooksAgentId(idFilled[0]) && !idFilled.some(cellLooksMoneyOrNumber);
    const nextIsNumbers =
      numFilled.length >= 3 &&
      numFilled.filter(cellLooksMoneyOrNumber).length >= Math.ceil(numFilled.length * 0.75) &&
      !cellLooksAgentId(numTexts[0] || "");

    if (idOnlyAgent && nextIsNumbers) splitPairs += 1;
  }

  // At least one clear pair, or ≥2 pairs when many rows.
  if (splitPairs >= 1 && bodyMatrix.length <= 4) return true;
  if (splitPairs >= 2) return true;
  return false;
}

/** Plain string matrix variant of {@link formatBodyMatrixLooksIdNumberSplit}. */
export function formatPlainMatrixLooksIdNumberSplit(matrix) {
  if (!matrix?.length) return false;
  const asCells = matrix.map((row) => (row || []).map((value) => ({ value: String(value ?? "") })));
  return formatBodyMatrixLooksIdNumberSplit(asCells);
}

/**
 * User symptom: "Applying 1 body row(s) … (3 source data rows)" then col1 stack.
 * Reject so Format can fall through to plain dual-source reshape.
 */
export function formatBodyMatrixLooksCollapsed(bodyMatrix, dataRows) {
  const sourceCount = dataRows?.length || 0;
  const matrixRows = bodyMatrix?.length || 0;
  if (!matrixRows) return true;

  // Classic failure log: many source TRs collapsed into one matrix row.
  if (sourceCount >= 3 && matrixRows === 1) return true;

  const nonEmptyCols = (row) =>
    (row || []).filter((cell) => String(cell?.value || cell?.html || "").trim()).length;

  const maxFilledCols = Math.max(...bodyMatrix.map(nonEmptyCols), 0);
  const totalFilled = bodyMatrix.reduce((sum, row) => sum + nonEmptyCols(row), 0);

  // N×1 dump: many rows, only first column filled, looks like field-per-row.
  if (matrixRows >= 6 && maxFilledCols <= 1 && totalFilled >= 6) return true;

  // Few tall cells (agent/subtotal/total) each still holding a multi-field stack (Fig1).
  if (matrixRows >= 2 && matrixRows <= 5 && maxFilledCols <= 1 && totalFilled >= 2) {
    const stackedRows = bodyMatrix.filter((row) => {
      const cell = (row || [])[0];
      if (!cell) return false;
      const text = String(cell?.value || "")
        .replace(/\u00a0/g, " ")
        .trim();
      const html = String(cell?.html || "");
      const blob = `${text}\n${html}`;
      const moneyHits = (blob.match(/\$[\d,]+(?:\.\d+)?/g) || []).length;
      const lineHits = text.split(/\r?\n/).filter((line) => line.trim()).length;
      const nestedBlocks = (html.match(/<(?:div|p|span|br|mat-cell|font)\b/gi) || []).length;
      return moneyHits >= 2 || lineHits >= 3 || nestedBlocks >= 3;
    }).length;
    if (stackedRows >= 1) return true;
  }

  // One (or few) cells still holding a whole multi-field report dump.
  const hasStackedDumpCell = bodyMatrix.some((row) =>
    (row || []).some((cell) => {
      const text = String(cell?.value || "")
        .replace(/\u00a0/g, " ")
        .trim();
      const html = String(cell?.html || "");
      const blob = `${text}\n${html}`;
      const moneyHits = (blob.match(/\$[\d,]+(?:\.\d+)?/g) || []).length;
      const lineHits = text.split(/\r?\n/).filter((line) => line.trim()).length;
      const nestedBlocks = (html.match(/<(?:div|p|span|br|mat-cell|font)\b/gi) || []).length;
      return moneyHits >= 3 || lineHits >= 3 || (nestedBlocks >= 3 && moneyHits >= 1);
    }),
  );
  if (hasStackedDumpCell && maxFilledCols <= 2) return true;

  if (formatBodyMatrixLooksIdNumberSplit(bodyMatrix)) return true;

  return false;
}

export function parseAndFillHtmlTableForFormat(htmlString, options = {}) {
  const startRow =
    Number.isFinite(options.startRow) && options.startRow >= 0 ? options.startRow : 0;
  const startCol =
    Number.isFinite(options.startCol) && options.startCol >= 0 ? options.startCol : 0;

  try {
    const hasBrInOriginal =
      /<br\s+[^>]*>/i.test(htmlString) || /<br\s*\/?>/i.test(htmlString);
    console.log(
      `Format: Parsing HTML table with header support... hasBrInOriginal=${hasBrInOriginal}`,
    );

    const structure = parseFormatHtmlTableStructure(htmlString);
    if (!structure) {
      return false;
    }

    const { headerRows, dataRows, maxCols } = structure;

    ensureGridFits(startRow, startCol, countFormatRequiredBodyRows(dataRows), maxCols);

    let bodyMatrix = buildFormatBodyMatrix(dataRows, maxCols);
    console.log(
      `Format: Applying ${bodyMatrix.length} body row(s) at row ${startRow} col ${startCol} (${dataRows.length} source data rows)`,
    );

    if (
      !options.acceptCollapsedMatrix &&
      formatBodyMatrixLooksCollapsed(bodyMatrix, dataRows)
    ) {
      const healed = tryReshapeCollapsedFormatBody(bodyMatrix, htmlString);
      if (healed) {
        bodyMatrix = healed;
        ensureGridFits(
          startRow,
          startCol,
          bodyMatrix.length,
          Math.max(...bodyMatrix.map((row) => row.length), 0),
        );
      } else {
        console.log(
          "Format: Rejecting collapsed/misaligned body matrix (will try another clipboard path)",
        );
        return false;
      }
    }

    // Over-select: trim trailing empty cols / junk rows (same as 1.TEXT plain path).
    bodyMatrix = sanitizePasteMatrix(expandLabelColonMoneyCells(bodyMatrix));

    // Same as 1.TEXT: stacked SUBTOTAL + GRAND TOTAL in one row → two full rows.
    const beforeSplit = bodyMatrix.length;
    bodyMatrix = splitStackedSubtotalGrandTotalRows(bodyMatrix);
    if (bodyMatrix.length !== beforeSplit) {
      console.log(
        `Format: Split stacked SUBTOTAL/GRANDTOTAL → ${beforeSplit} row(s) became ${bodyMatrix.length}`,
      );
    }
    bodyMatrix = sanitizePasteMatrix(expandLabelColonMoneyCells(bodyMatrix));

    // Grill: when plain TSV is reliable, HTML body must match its shape (reject → dual-source).
    const plainMatrix = options.plainMatrix;
    if (
      plainMatrixLooksReliable(plainMatrix) &&
      !matrixAlignsWithPlainSource(bodyMatrix, plainMatrix)
    ) {
      console.log(
        "Format: HTML body misaligned with plain TSV after over-select sanitize — reject for dual-source",
      );
      return false;
    }

    ensureGridFits(
      startRow,
      startCol,
      bodyMatrix.length,
      Math.max(...bodyMatrix.map((row) => row.length), 0),
    );

    const { successCount: bodySuccessCount } = applyDataMatrixToGrid(bodyMatrix, null, {
      startRowOverride: startRow,
      startColOverride: startCol,
      trimValues: false,
      alignTotalRows: false,
    });

    const successCount = bodySuccessCount;

    if (successCount > 0) {
      notifyPasteUser(
        `成功粘贴表格 (${headerRows.length} 个表头行, ${dataRows.length} 个数据行 x ${maxCols} 列)，已保持完整表格结构!`,
        "success",
      );
      recomputeSubmitStateAfterPaste();
      return true;
    }

    console.log("Format: No cells were pasted");
    return false;
  } catch (error) {
    console.error("Format: Error parsing HTML table:", error);
    return false;
  }
}
