import { applyDataMatrixToGrid, notifyPasteSuccess } from "./dataCapturePasteApply.js";
import { recomputeSubmitStateAfterPaste } from "../../lib/dataCaptureBridge.js";
import {
  measureTopLevelTables,
  plainTextFromSanitizedHtml,
  sanitizePastedCellHtml,
} from "./dataCaptureClipboard.js";
import { buildFormatDataCellStyle } from "./dataCaptureFormatHtmlMatrix.js";
import { splitStackedSubtotalGrandTotalRows } from "./dataCaptureStackedTotalSplit.js";

function emptyPatch() {
  return { value: "" };
}

function isBlankPastedCellText(text) {
  const collapsed = String(text ?? "")
    .replace(/\u00a0/g, " ")
    .trim();
  if (collapsed === "") return true;
  return /^&(?:nbsp|#0*160);?$/i.test(collapsed);
}

function getPlainPastedCellValue(sourceCell) {
  const text = sourceCell.textContent ?? sourceCell.innerText ?? "";
  if (isBlankPastedCellText(text)) return "";
  return text;
}

function patchFromSourceCell(sourceCell, { includeFormatStyle = false } = {}) {
  let cellContent = sourceCell.innerHTML;
  if (!cellContent || cellContent.trim() === "") {
    cellContent = sourceCell.textContent || "";
  }

  const cleanContent = sanitizePastedCellHtml(cellContent);
  const rawText = plainTextFromSanitizedHtml(cleanContent) || getPlainPastedCellValue(sourceCell);
  const cellText = isBlankPastedCellText(rawText) ? "" : rawText;
  const styleCssText = includeFormatStyle ? buildFormatDataCellStyle(sourceCell) : "";

  if (cleanContent.includes("<") && cleanContent.includes(">")) {
    return {
      value: cellText,
      html: cleanContent,
      ...(styleCssText ? { styleCssText } : {}),
    };
  }
  return {
    value: cellText,
    ...(styleCssText ? { styleCssText } : {}),
  };
}

function buildRowPatches(sourceRow, maxCols, columnOrder) {
  const row = Array.from({ length: maxCols }, () => emptyPatch());
  const rawCells = sourceRow.querySelectorAll("td, th");
  const sourceCells =
    columnOrder && rawCells.length >= columnOrder.length
      ? columnOrder.map((i) => rawCells[i])
      : Array.from(rawCells);

  // 1.Text follows Excel's visible left-to-right cell order without report fixes.
  sourceCells.forEach((sourceCell, index) => {
    if (index < maxCols) {
      row[index] = patchFromSourceCell(sourceCell);
    }
  });

  return row;
}

function buildRowPatchesWithSpanOccupancy(sourceRows, maxCols) {
  const pendingRowspanCols = Array.from({ length: maxCols }, () => 0);

  return sourceRows.map((sourceRow) => {
    const row = Array.from({ length: maxCols }, () => emptyPatch());
    const occupiedFromPreviousRowspan = pendingRowspanCols.map((n) => n > 0);
    const occupiedCols = [...occupiedFromPreviousRowspan];

    occupiedFromPreviousRowspan.forEach((occupied, colIndex) => {
      if (occupied) row[colIndex] = emptyPatch();
    });

    const sourceCells = Array.from(sourceRow.querySelectorAll("td, th"));
    let nextCol = 0;

    sourceCells.forEach((sourceCell) => {
      while (nextCol < maxCols && occupiedCols[nextCol]) nextCol += 1;
      if (nextCol >= maxCols) return;

      const colspan = Math.max(1, parseInt(sourceCell.getAttribute("colspan") || "1", 10) || 1);
      const rowspan = Math.max(1, parseInt(sourceCell.getAttribute("rowspan") || "1", 10) || 1);
      const patch = patchFromSourceCell(sourceCell, { includeFormatStyle: true });

      for (let offset = 0; offset < colspan; offset += 1) {
        const targetCol = nextCol + offset;
        if (targetCol >= maxCols) break;
        row[targetCol] = offset === 0 ? patch : emptyPatch();
        occupiedCols[targetCol] = true;
        if (rowspan > 1) {
          pendingRowspanCols[targetCol] = Math.max(pendingRowspanCols[targetCol], rowspan - 1);
        }
      }

      nextCol += colspan;
    });

    occupiedFromPreviousRowspan.forEach((occupied, colIndex) => {
      if (occupied && pendingRowspanCols[colIndex] > 0) {
        pendingRowspanCols[colIndex] -= 1;
      }
    });

    return row;
  });
}

/**
 * 1.Text — paste Excel HTML table while preserving cell formatting (Phase 4b).
 * Ported from `parseAndFillHTMLTableForText` (1.Text branch only).
 */
export function parseAndFillHtmlTableForText(htmlString, anchorCell) {
  try {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = htmlString;

    const table = tempDiv.querySelector("table");
    if (!table) return false;

    // Collect rows across every top-level table: some reports split the data
    // rows and the TOTAL footer row into separate sibling tables, so reading
    // only the first table would drop the TOTAL row (matches the PHP site).
    const measured = measureTopLevelTables(tempDiv);
    if (!measured) return false;

    const { allRows, maxCols } = measured;
    const dataMatrix = splitStackedSubtotalGrandTotalRows(
      allRows.map((sourceRow) => buildRowPatches(sourceRow, maxCols, null)),
    );

    const { successCount, maxRows, maxCols: cols } = applyDataMatrixToGrid(dataMatrix, anchorCell, {
      trimValues: false,
      uppercaseValues: false,
      alignTotalRows: false,
    });

    if (successCount > 0) {
      notifyPasteSuccess(
        `成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)，已保持Excel原始格式!`,
      );
      recomputeSubmitStateAfterPaste();
      return true;
    }

    return false;
  } catch (err) {
    console.error("1.Text: Error parsing HTML table:", err);
    return false;
  }
}

/**
 * 1.Text format-merge mode: preserve text + style and expand rowspan occupancy.
 */
export function parseAndFillHtmlTableForTextWithFormat(htmlString, anchorCell) {
  try {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = htmlString;

    const table = tempDiv.querySelector("table");
    if (!table) return false;

    const measured = measureTopLevelTables(tempDiv);
    if (!measured) return false;

    const { allRows, maxCols } = measured;
    const dataMatrix = splitStackedSubtotalGrandTotalRows(
      buildRowPatchesWithSpanOccupancy(allRows, maxCols),
    );

    const { successCount, maxRows, maxCols: cols } = applyDataMatrixToGrid(dataMatrix, anchorCell, {
      trimValues: false,
      uppercaseValues: false,
      alignTotalRows: false,
    });

    if (successCount > 0) {
      notifyPasteSuccess(
        `成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)，已在1.Text保留格式显示!`,
      );
      recomputeSubmitStateAfterPaste();
      return true;
    }

    return false;
  } catch (err) {
    console.error("1.Text format-merge: Error parsing HTML table:", err);
    return false;
  }
}
