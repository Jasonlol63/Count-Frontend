import { createEmptyGrid, gridModelHasEditableData, gridToSnapshot } from "../grid/gridModel.js";
import { normalizeStoredCaptureType } from "./dataCaptureStorage.js";
import { getBridgeCaptureType, getPasteGridModel } from "./dataCaptureBridge.js";

function resolveSnapshotCaptureType(captureType) {
  return (
    normalizeStoredCaptureType(captureType) ||
    normalizeStoredCaptureType(getBridgeCaptureType("")) ||
    "1.Text"
  );
}

/** Build a submit/validation snapshot from the React grid model. */
export function captureTableSnapshot(captureType, grid = null) {
  const resolvedType = resolveSnapshotCaptureType(captureType);
  const workingGrid = grid ?? getPasteGridModel() ?? createEmptyGrid();
  return gridToSnapshot(workingGrid, resolvedType);
}

export function tableSnapshotHasData(tableData) {
  if (!tableData?.rows?.length) return false;
  return tableData.rows.some((row) => rowHasSnapshotData(row));
}

function rowHasSnapshotData(rowData) {
  return rowData.some((cell) => cell.type === "data" && String(cell.value || "").trim() !== "");
}

/** Count tbody rows that contain at least one non-empty data cell. */
export function countFilledSnapshotRows(tableData) {
  if (!tableData?.rows?.length) return 0;
  return tableData.rows.filter((row) => rowHasSnapshotData(row)).length;
}

/** Last row index (inclusive) with any data cell content. */
export function findLastFilledSnapshotRowIndex(tableData) {
  if (!tableData?.rows?.length) return -1;
  for (let i = tableData.rows.length - 1; i >= 0; i -= 1) {
    if (rowHasSnapshotData(tableData.rows[i])) return i;
  }
  return -1;
}

/** Drop trailing empty rows; keep rowCount aligned with saved rows. */
export function trimSnapshotToFilledRows(tableData) {
  if (!tableData?.rows?.length) return tableData;
  const lastFilled = findLastFilledSnapshotRowIndex(tableData);
  if (lastFilled < 0) return tableData;

  const rows = tableData.rows.slice(0, lastFilled + 1);
  return {
    ...tableData,
    rows,
    rowCount: rows.length,
  };
}

/** Prefer the snapshot that contains more filled data rows. */
export function pickRicherTableSnapshot(primary, secondary) {
  const a = primary || { rows: [] };
  const b = secondary || { rows: [] };
  const aFilled = countFilledSnapshotRows(a);
  const bFilled = countFilledSnapshotRows(b);
  if (bFilled > aFilled) return trimSnapshotToFilledRows(b);
  return trimSnapshotToFilledRows(a);
}

/** DOM column index for a snapshot data cell (children[0] is row header). */
export function snapshotDataCellDomIndex(cellData, rowDataIndex) {
  if (cellData?.type !== "data") return null;
  if (typeof cellData.col === "number") return cellData.col + 1;
  return rowDataIndex >= 1 ? rowDataIndex : null;
}

/** Build 2.Format preview HTML from snapshot — data cells only, no row labels. */
export function buildFormatPreviewHtmlFromTableSnapshot(tableData) {
  if (!tableData?.rows?.length) return "";

  let html = '<table border="1" cellspacing="0" cellpadding="2"><tbody>';
  tableData.rows.forEach((rowData) => {
    html += "<tr>";
    rowData.forEach((cell) => {
      if (cell.type !== "data") return;
      const v =
        cell.value != null ? String(cell.value) : "";
      html += `<td>${v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td>`;
    });
    html += "</tr>";
  });
  html += "</tbody></table>";
  return html;
}

/** Whether the grid model has any non-empty cell. */
export function domGridHasEditableData() {
  const grid = getPasteGridModel();
  return grid ? gridModelHasEditableData(grid) : false;
}
