import { applyDataMatrixToGrid, notifyPasteSuccess } from "./dataCapturePasteApply.js";
import { getClipboardHtml } from "./dataCaptureClipboard.js";
import { detectHtmlTableInClipboard } from "./dataCaptureClipboard.js";
import { parseAndFillHtmlTableForText } from "./dataCaptureTextHtmlPaste.js";

/** 1.Text — tab-separated Excel paste (always from column 0). */
export function handleTextTabPaste(e, pastedData, anchorCell) {
  const normalized = pastedData.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((line) => line.trim() !== "");
  if (!lines.length || !lines.some((line) => line.includes("\t"))) return false;

  const dataMatrix = [];
  let maxCols = 0;

  lines.forEach((line) => {
    if (line.includes("\t")) {
      const cells = line.split("\t");
      dataMatrix.push(cells);
      maxCols = Math.max(maxCols, cells.length);
    } else {
      dataMatrix.push([line]);
      maxCols = Math.max(maxCols, 1);
    }
  });

  dataMatrix.forEach((row) => {
    while (row.length < maxCols) row.push("");
  });

  const { successCount, maxRows, maxCols: cols } = applyDataMatrixToGrid(dataMatrix, anchorCell, {
    startColOverride: 0,
    uppercaseValues: false,
    trimValues: false,
  });

  if (successCount > 0) {
    notifyPasteSuccess(
      `成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)，已保持Excel原始格式!`,
    );
    return true;
  }
  return false;
}

/** 1.Text — HTML table paste (Phase 4b, React-owned). */
export function handleTextHtmlPaste(html, anchorCell) {
  if (!html || !html.includes("<table")) return false;
  return parseAndFillHtmlTableForText(html, anchorCell);
}

export function handleTextModePaste(e, pastedData, anchorCell) {
  const html = getClipboardHtml(e);
  if (handleTextHtmlPaste(html, anchorCell)) return true;

  const htmlFromDetect = detectHtmlTableInClipboard(e);
  if (htmlFromDetect && handleTextHtmlPaste(htmlFromDetect, anchorCell)) return true;

  return handleTextTabPaste(e, pastedData, anchorCell);
}
