/** Ported from js/datacapture.js — 2.Format grid fill (Phase 4c / PR6 batch 1). */

import { applyDataMatrixToGrid, ensureGridFits } from "./dataCapturePasteApply.js";
import { notifyPasteUser, recomputeSubmitStateAfterPaste } from "../../lib/dataCaptureBridge.js";
import {
  parseFormatHtmlTableStructure,
  countFormatRequiredBodyRows,
  buildFormatBodyMatrix,
} from "./dataCaptureFormatHtmlMatrix.js";

export function parseAndFillHtmlTableForFormat(htmlString, options = {}) {
  const startRow =
    Number.isFinite(options.startRow) && options.startRow >= 0 ? options.startRow : 0;

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

    ensureGridFits(startRow, 0, countFormatRequiredBodyRows(dataRows), maxCols);

    const bodyMatrix = buildFormatBodyMatrix(dataRows, maxCols);
    console.log(
      `Format: Applying ${bodyMatrix.length} body row(s) at row ${startRow} (${dataRows.length} source data rows)`,
    );

    const { successCount: bodySuccessCount } = applyDataMatrixToGrid(bodyMatrix, null, {
      startRowOverride: startRow,
      startColOverride: 0,
      trimValues: false,
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
