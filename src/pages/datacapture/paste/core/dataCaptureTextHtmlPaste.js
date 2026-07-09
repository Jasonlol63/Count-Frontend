import { applyDataMatrixToGrid, notifyPasteSuccess } from "./dataCapturePasteApply.js";
import { recomputeSubmitStateAfterPaste } from "../../lib/dataCaptureBridge.js";
import {
  detectColumnReorder,
  measureHtmlTable,
  sanitizePastedCellHtml,
} from "./dataCaptureClipboard.js";

function emptyPatch() {
  return { value: "" };
}

function patchFromSourceCell(sourceCell) {
  let cellContent = sourceCell.innerHTML;
  if (!cellContent || cellContent.trim() === "") {
    cellContent = sourceCell.textContent || "";
  }

  const cellText = (sourceCell.textContent || sourceCell.innerText || "").trim();
  const cleanContent = sanitizePastedCellHtml(cellContent);

  if (cleanContent.includes("<") && cleanContent.includes(">")) {
    return { value: cellText, html: cleanContent };
  }
  return { value: cellContent };
}

function buildRowPatches(sourceRow, maxCols, columnOrder) {
  const row = Array.from({ length: maxCols }, () => emptyPatch());
  const rawCells = sourceRow.querySelectorAll("td, th");
  const sourceCells =
    columnOrder && rawCells.length >= columnOrder.length
      ? columnOrder.map((i) => rawCells[i])
      : Array.from(rawCells);

  let currentCol = 0;

  sourceCells.forEach((sourceCell) => {
    const colspan = Number.parseInt(sourceCell.getAttribute("colspan") || "1", 10);

    if (currentCol < maxCols) {
      row[currentCol] = patchFromSourceCell(sourceCell);
    }

    for (let i = 1; i < colspan; i += 1) {
      currentCol += 1;
      if (currentCol < maxCols) {
        row[currentCol] = emptyPatch();
      }
    }

    currentCol += 1;
  });

  return row;
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

    const measured = measureHtmlTable(table);
    if (!measured) return false;

    const { allRows, maxCols } = measured;
    const columnOrder = detectColumnReorder(allRows);
    const dataMatrix = allRows.map((sourceRow) => buildRowPatches(sourceRow, maxCols, columnOrder));

    const { successCount, maxRows, maxCols: cols } = applyDataMatrixToGrid(dataMatrix, anchorCell, {
      trimValues: false,
      uppercaseValues: false,
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
