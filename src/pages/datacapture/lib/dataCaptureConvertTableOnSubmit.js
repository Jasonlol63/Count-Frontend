/**
 * Submit-time SUB TOTAL / GRAND TOTAL conversion — grid model / snapshot only.
 */
import { gridToSnapshot, snapshotToGrid } from "../grid/gridModel.js";
import { getRowLabel } from "../grid/dataCaptureGridMeta.js";
import {
  getBridgeCaptureType,
  getPasteGridModel,
  replacePasteGridModel,
} from "./dataCaptureBridge.js";

function resolveRequiredGridSize(tableData, fallbackGrid) {
  const requiredRows = tableData.rowCount || tableData.rows.length;
  const requiredCols = Math.max(
    tableData.colCount || (tableData.headers ? tableData.headers.length - 1 : 15),
    fallbackGrid?.cols || 15,
  );
  return { requiredRows, requiredCols };
}

function resolveCaptureType(captureType) {
  if (captureType) return captureType;
  return getBridgeCaptureType("");
}

function cloneTableSnapshot(tableData) {
  return JSON.parse(JSON.stringify(tableData));
}

function getDataCellText(rowData, dataColIndex) {
  const cell = rowData[dataColIndex + 1];
  if (!cell || cell.type !== "data") return "";
  return String(cell.value || "").trim();
}

function includesTotalLabel(text, label) {
  const upper = String(text || "").toUpperCase().trim();
  return upper === label || upper.includes(label);
}

function getNonEmptyDataValues(rowData) {
  return rowData
    .filter((cell) => cell?.type === "data" && String(cell.value || "").trim() !== "")
    .map((cell) => String(cell.value).trim());
}

function countDataCells(rowData) {
  return rowData.filter((cell) => cell?.type === "data").length;
}

function buildConvertedTotalRow(rowIndex, values, maxLength) {
  const rowData = [{ type: "header", value: getRowLabel(rowIndex) }];
  for (let i = 0; i < maxLength; i += 1) {
    rowData.push({
      type: "data",
      value: i < values.length ? String(values[i]).toUpperCase() : "",
      col: i,
    });
  }
  return rowData;
}

function relabelRowsFrom(rows, startIndex) {
  for (let i = startIndex; i < rows.length; i += 1) {
    if (rows[i]?.[0]?.type === "header") {
      rows[i][0].value = getRowLabel(i);
    }
  }
}

function padSnapshotColumns(tableData, colCount) {
  const maxDataCols = Math.max(0, colCount - 1);
  tableData.colCount = colCount;

  while (tableData.headers.length < colCount) {
    tableData.headers.push(tableData.headers.length === 0 ? "" : String(tableData.headers.length));
  }
  if (tableData.headers.length > colCount) {
    tableData.headers = tableData.headers.slice(0, colCount);
  }

  tableData.rows.forEach((rowData) => {
    const currentDataCols = rowData.length - 1;
    for (let i = currentDataCols; i < maxDataCols; i += 1) {
      rowData.push({ type: "data", value: "", col: i });
    }
  });

  tableData.rowCount = tableData.rows.length;
  return tableData;
}

/**
 * @param {object} tableData — `gridToSnapshot` shape
 * @param {string} [captureType]
 * @returns {object} new snapshot (unchanged when no conversion applies)
 */
export function convertTableFormatOnSubmitSnapshot(tableData, captureType) {
  const resolvedType = resolveCaptureType(captureType);

  if (resolvedType === "WBET" || resolvedType === "WBET_API") {
    return tableData;
  }

  if (!tableData?.rows?.length) {
    return tableData;
  }

  const working = cloneTableSnapshot(tableData);
  const rows = working.rows;

  let subTotalRowIndex = -1;
  let grandTotalRowIndex = -1;

  for (let i = 0; i < rows.length; i += 1) {
    const firstText = getDataCellText(rows[i], 0);
    const secondText = getDataCellText(rows[i], 1);

    if (
      includesTotalLabel(firstText, "SUB TOTAL") ||
      includesTotalLabel(secondText, "SUB TOTAL")
    ) {
      if (subTotalRowIndex < 0) subTotalRowIndex = i;
    }

    if (
      includesTotalLabel(firstText, "GRAND TOTAL") ||
      includesTotalLabel(secondText, "GRAND TOTAL")
    ) {
      if (grandTotalRowIndex < 0) grandTotalRowIndex = i;
    }
  }

  if (subTotalRowIndex < 0 || subTotalRowIndex !== grandTotalRowIndex) {
    return working;
  }

  const headerRow = rows[subTotalRowIndex];
  const firstText = getDataCellText(headerRow, 0);
  const secondText = getDataCellText(headerRow, 1);

  if (
    !includesTotalLabel(firstText, "SUB TOTAL") ||
    !includesTotalLabel(secondText, "GRAND TOTAL")
  ) {
    return working;
  }

  const subTotalCells = ["SUB TOTAL"];
  const grandTotalCells = ["GRAND TOTAL"];

  if (headerRow.length > 3) {
    const thirdCell = headerRow[3];
    if (thirdCell?.type === "data") {
      const thirdTextRaw = String(thirdCell.value || "").trim();
      if (thirdTextRaw !== "") {
        grandTotalCells.push(thirdTextRaw.toUpperCase());
      }
    }
  }

  let currentRow = subTotalRowIndex + 1;

  let expectedCols = 0;
  if (subTotalRowIndex > 0) {
    expectedCols = countDataCells(rows[subTotalRowIndex - 1]);
  }

  while (currentRow < rows.length) {
    const rowData = rows[currentRow];
    const nonEmptyCells = getNonEmptyDataValues(rowData);

    if (nonEmptyCells.length === 2) {
      const cell1 = nonEmptyCells[0];
      const cell2 = nonEmptyCells[1];
      if (
        cell1 !== "" &&
        cell2 !== "" &&
        !cell1.toUpperCase().includes("TOTAL") &&
        !cell2.toUpperCase().includes("TOTAL")
      ) {
        subTotalCells.push(cell1);
        grandTotalCells.push(cell2);
        currentRow += 1;
        continue;
      }
    }

    if (nonEmptyCells.length > 3) break;

    if (nonEmptyCells.length === 1) {
      const cell = nonEmptyCells[0];
      if (subTotalCells.length > grandTotalCells.length) {
        grandTotalCells.push(cell);
      } else {
        subTotalCells.push(cell);
      }
      currentRow += 1;
      continue;
    }

    break;
  }

  if (subTotalCells.length <= 1 && grandTotalCells.length <= 1) {
    return working;
  }

  const maxLength = Math.max(subTotalCells.length, grandTotalCells.length, expectedCols);
  const newSubTotalRow = buildConvertedTotalRow(subTotalRowIndex, subTotalCells, maxLength);
  const newGrandTotalRow = buildConvertedTotalRow(subTotalRowIndex + 1, grandTotalCells, maxLength);

  const rowsToRemove = currentRow - subTotalRowIndex - 1;
  let newRows;

  if (rowsToRemove > 0) {
    newRows = [
      ...rows.slice(0, subTotalRowIndex),
      newSubTotalRow,
      newGrandTotalRow,
      ...rows.slice(currentRow),
    ];
  } else {
    newRows = [
      ...rows.slice(0, subTotalRowIndex),
      newSubTotalRow,
      newGrandTotalRow,
      ...rows.slice(subTotalRowIndex + 1),
    ];
  }

  relabelRowsFrom(newRows, subTotalRowIndex + 2);
  working.rows = newRows;
  padSnapshotColumns(working, maxLength + 1);

  return working;
}

/** Apply submit-time conversion to the live grid model (paste / bridge entry). */
export function applyConvertTableOnSubmitToGrid(captureType) {
  const grid = getPasteGridModel();
  if (!grid) return null;

  const resolvedType = captureType || getBridgeCaptureType("");
  const snapshot = gridToSnapshot(grid, resolvedType);
  const converted = convertTableFormatOnSubmitSnapshot(snapshot, resolvedType);
  const { requiredRows, requiredCols } = resolveRequiredGridSize(converted, grid);
  replacePasteGridModel(snapshotToGrid(converted, requiredRows, requiredCols));
  return converted;
}

/** Route submit-time conversion via snapshot (grid model is SSOT). */
export function convertTableFormatForSubmit(captureType, tableData = null) {
  if (tableData) {
    return convertTableFormatOnSubmitSnapshot(tableData, captureType);
  }
  return applyConvertTableOnSubmitToGrid(captureType);
}
