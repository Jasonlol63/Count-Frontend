/** 2.Format HTML table → body matrix (PR6 batch 1). */

import {
  sanitizeFormatHtmlFragment,
  sanitizeCopiedStyleString,
  stripBackgroundFromStyle,
} from "./dataCaptureFormatStyleUtils.js";

/** @returns {{ headerRows: Element[], dataRows: Element[], maxCols: number, allRows: Element[] } | null} */
export function parseFormatHtmlTableStructure(htmlString) {
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = htmlString;

  const table = tempDiv.querySelector("table");
  if (!table) return null;

  const allRows = Array.from(table.querySelectorAll("tr"));
  if (allRows.length === 0) return null;

  const headerRows = [];
  const dataRows = [];

  allRows.forEach((tr) => {
    if (tr.querySelectorAll("th").length > 0) {
      headerRows.push(tr);
    } else {
      dataRows.push(tr);
    }
  });

  let maxCols = 0;
  allRows.forEach((tr) => {
    const cells = tr.querySelectorAll("td, th");
    let colCount = 0;
    cells.forEach((cell) => {
      colCount += parseInt(cell.getAttribute("colspan") || "1", 10);
    });
    maxCols = Math.max(maxCols, colCount);
  });

  if (maxCols === 0) return null;

  return { headerRows, dataRows, maxCols, allRows };
}

function extractCellLines(sourceCell) {
  const cellHtml = sourceCell.innerHTML || "";
  const cellText = (sourceCell.textContent || sourceCell.innerText || "").trim();

  const hasBrTag =
    /<br\s*\/?>/i.test(cellHtml) ||
    /<br\s+[^>]*>/i.test(cellHtml) ||
    /<br\s+style[^>]*>/i.test(cellHtml);
  const hasNewline =
    cellText.includes("\n") || cellText.includes("\r\n") || cellText.includes("\r");

  let lines = [];

  if (hasBrTag) {
    const htmlWithMarker = cellHtml
      .replace(/<br\s+[^>]*>/gi, "|||SPLIT_MARKER|||")
      .replace(/<br\s*\/?>/gi, "|||SPLIT_MARKER|||");
    const markerDiv = document.createElement("div");
    markerDiv.innerHTML = htmlWithMarker;
    const textWithMarker = markerDiv.textContent || markerDiv.innerText || "";
    lines = textWithMarker
      .split("|||SPLIT_MARKER|||")
      .map((part) => {
        const cleanDiv = document.createElement("div");
        cleanDiv.innerHTML = part;
        return (cleanDiv.textContent || cleanDiv.innerText || "").trim();
      })
      .filter((part) => part !== "");
  } else if (hasNewline) {
    lines = cellText.split(/\r?\n|\r/).map((part) => part.trim()).filter((part) => part !== "");
  } else {
    const directSpans = sourceCell.querySelectorAll(":scope > span");
    if (directSpans.length >= 2) {
      const parts = Array.from(directSpans)
        .map((span) => (span.textContent || "").trim())
        .filter((part) => part !== "");
      if (parts.length >= 2) {
        lines = [parts[0], parts[1]];
      }
    }
  }

  return lines;
}

/** First-cell BR/SPAN check used for required row count pre-detection. */
function sourceRowNeedsVerticalSplit(sourceCells) {
  if (sourceCells.length === 0) return false;
  return extractCellLines(sourceCells[0]).length >= 2;
}

/** Count tbody rows after vertical splits (SUB TOTAL / GRAND TOTAL). */
export function countFormatRequiredBodyRows(dataRows) {
  let count = dataRows.length;
  dataRows.forEach((sourceRow) => {
    const sourceCells = sourceRow.querySelectorAll("td, th");
    if (sourceRowNeedsVerticalSplit(sourceCells)) {
      count += 1;
    }
  });
  return count;
}

function detectRowVerticalSplit(sourceCells) {
  let hasVerticalSplit = false;
  const cellsWithSplit = [];

  sourceCells.forEach((sourceCell, cellIndex) => {
    const lines = extractCellLines(sourceCell);
    if (lines.length >= 2) {
      hasVerticalSplit = true;
      cellsWithSplit.push({
        index: cellIndex,
        cell: sourceCell,
        topData: lines[0],
        bottomData: lines[1],
        allLines: lines,
      });
    }
  });

  if (hasVerticalSplit && cellsWithSplit.length > 0) {
    sourceCells.forEach((sourceCell, cellIndex) => {
      if (cellsWithSplit.some((entry) => entry.index === cellIndex)) return;
      const cellText = (sourceCell.textContent || sourceCell.innerText || "").trim();
      if (cellText.length < 4) return;
      const half = Math.floor(cellText.length / 2);
      const first = cellText.substring(0, half).trim();
      const second = cellText.substring(half).trim();
      if (first !== "" && second !== "") {
        cellsWithSplit.push({
          index: cellIndex,
          cell: sourceCell,
          topData: first,
          bottomData: second,
          allLines: [first, second],
        });
      }
    });
  }

  const isFirstCellWithBrOrSpan = cellsWithSplit.some((entry) => entry.index === 0);
  return { hasVerticalSplit, cellsWithSplit, isFirstCellWithBrOrSpan };
}

function extractPlainText(sourceCell) {
  const cellHtml = sourceCell.innerHTML || "";
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = cellHtml;
  return (tempDiv.textContent || tempDiv.innerText || "").trim();
}

export function buildFormatDataCellStyle(sourceCell) {
  const sourceCellStyle = sourceCell.getAttribute("style");
  const sourceCellComputedStyle = window.getComputedStyle(sourceCell);

  if (sourceCellStyle) {
    const sanitizedCellStyle = stripBackgroundFromStyle(sanitizeCopiedStyleString(sourceCellStyle));
    return sanitizedCellStyle && !sanitizedCellStyle.includes("border")
      ? `border: 1px solid #d0d7de !important; ${sanitizedCellStyle}`
      : sanitizedCellStyle || "border: 1px solid #d0d7de !important;";
  }

  const color = sourceCellComputedStyle.color;
  const fontWeight = sourceCellComputedStyle.fontWeight;
  const textAlign = sourceCellComputedStyle.textAlign;
  let styleString = "border: 1px solid #d0d7de !important;";
  if (color && color !== "rgb(0, 0, 0)") styleString += ` color: ${color} !important;`;
  if (fontWeight && fontWeight !== "normal" && fontWeight !== "400") {
    styleString += ` font-weight: ${fontWeight} !important;`;
  }
  if (textAlign && textAlign !== "left") styleString += ` text-align: ${textAlign} !important;`;
  return styleString;
}

/** @param {Element} sourceCell @param {string} [displayText] split override — plain text only */
export function buildFormatDataCellPatch(sourceCell, displayText) {
  const styleCssText = buildFormatDataCellStyle(sourceCell);

  if (displayText !== undefined) {
    return { value: displayText, styleCssText };
  }

  let cellContent = sourceCell.innerHTML;
  if (!cellContent || cellContent.trim() === "") {
    cellContent = sourceCell.textContent || "";
  }
  const cellText = sourceCell.textContent || sourceCell.innerText || "";

  const cleanContent = cellContent
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "");

  if (cleanContent.includes("<") && cleanContent.includes(">")) {
    return {
      value: cellText,
      html: sanitizeFormatHtmlFragment(cleanContent),
      styleCssText,
    };
  }

  if (cellText && cellText.trim() !== "") {
    const sourceCellStyle = sourceCell.getAttribute("style");
    if (sourceCellStyle) {
      const sanitizedSpanStyle = stripBackgroundFromStyle(sanitizeCopiedStyleString(sourceCellStyle));
      if (sanitizedSpanStyle) {
        return {
          value: cellText,
          html: `<span style="${sanitizedSpanStyle}">${cellText}</span>`,
          styleCssText,
        };
      }
    }
    return { value: cellText, styleCssText };
  }

  return { value: "", styleCssText };
}

function emptyRowPatch(maxCols) {
  return Array.from({ length: maxCols }, () => ({ value: "" }));
}

function fillSourceRowPatches(targetRow, sourceCells, maxCols, lineSelector) {
  let currentCol = 0;

  sourceCells.forEach((sourceCell, cellIndex) => {
    const colspan = parseInt(sourceCell.getAttribute("colspan") || "1", 10);
    const splitInfo = lineSelector(cellIndex, sourceCell);

    if (currentCol < maxCols) {
      if (splitInfo) {
        targetRow[currentCol] = buildFormatDataCellPatch(sourceCell, splitInfo);
      } else {
        targetRow[currentCol] = buildFormatDataCellPatch(sourceCell);
      }
    }

    for (let spanIndex = 1; spanIndex < colspan; spanIndex += 1) {
      currentCol += 1;
      if (currentCol < maxCols) {
        targetRow[currentCol] = { value: "" };
      }
    }
    currentCol += 1;
  });

  return targetRow;
}

function expandSourceRowToMatrixRows(sourceRow, maxCols) {
  const sourceCells = sourceRow.querySelectorAll("td, th");
  const { hasVerticalSplit, cellsWithSplit, isFirstCellWithBrOrSpan } =
    detectRowVerticalSplit(sourceCells);

  if (isFirstCellWithBrOrSpan && hasVerticalSplit && cellsWithSplit.length > 0) {
    const topRow = emptyRowPatch(maxCols);
    const bottomRow = emptyRowPatch(maxCols);

    fillSourceRowPatches(topRow, sourceCells, maxCols, (cellIndex) => {
      const splitInfo = cellsWithSplit.find((entry) => entry.index === cellIndex);
      if (splitInfo) return splitInfo.topData;
      return extractPlainText(sourceCells[cellIndex]);
    });

    fillSourceRowPatches(bottomRow, sourceCells, maxCols, (cellIndex) => {
      const splitInfo = cellsWithSplit.find((entry) => entry.index === cellIndex);
      if (splitInfo) return splitInfo.bottomData;
      return extractPlainText(sourceCells[cellIndex]);
    });

    return [topRow, bottomRow];
  }

  const row = emptyRowPatch(maxCols);
  fillSourceRowPatches(row, sourceCells, maxCols, () => null);
  return [row];
}

/** @returns {Array<Array<{ value: string, html?: string, styleCssText?: string }>>} */
export function buildFormatBodyMatrix(dataRows, maxCols) {
  const matrix = [];
  dataRows.forEach((sourceRow) => {
    expandSourceRowToMatrixRows(sourceRow, maxCols).forEach((row) => matrix.push(row));
  });
  return matrix;
}
