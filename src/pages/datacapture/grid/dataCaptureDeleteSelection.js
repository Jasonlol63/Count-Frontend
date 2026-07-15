import { getSelectedCellBounds } from "./dataCaptureGridSelection.js";
import { getColumnIndexFromHeader, getRowIndexFromHeader } from "./dataCaptureGridMouseSelection.js";
import {
  getContextMenuColumnIndex,
  getContextMenuRowIndex,
} from "../lib/dataCaptureContextMenu.js";

export function getSelectedColumnIndicesFromDom() {
  const bounds = getSelectedCellBounds();
  if (bounds?.colIndices?.length) return bounds.colIndices;

  const headerRow = document.querySelector("#tableHeader tr");
  if (!headerRow) return [];
  const selected = Array.from(headerRow.querySelectorAll("th.column-selected"));
  if (selected.length) {
    return selected.map((h) => getColumnIndexFromHeader(h)).filter((i) => i >= 0);
  }

  const col = getContextMenuColumnIndex();
  return col !== null && col >= 0 ? [col] : [];
}

export function getSelectedRowIndicesFromDom() {
  const bounds = getSelectedCellBounds();
  if (bounds?.rowIndices?.length) return bounds.rowIndices;

  const selectedHeaders = Array.from(document.querySelectorAll(".row-header.row-selected"));
  if (selectedHeaders.length) {
    return selectedHeaders.map((h) => getRowIndexFromHeader(h)).filter((i) => i >= 0);
  }

  const row = getContextMenuRowIndex();
  return row !== null && row >= 0 ? [row] : [];
}

/** Bounds for delete/shift — same shape as getSelectedCellBounds plus header/context fallbacks. */
export function resolveDeleteSelectionBounds(grid) {
  const bounds = getSelectedCellBounds();
  if (bounds) return bounds;

  const rowIndices = getSelectedRowIndicesFromDom();
  const colIndices = getSelectedColumnIndicesFromDom();

  if (rowIndices.length && colIndices.length) {
    return {
      minRow: Math.min(...rowIndices),
      maxRow: Math.max(...rowIndices),
      minCol: Math.min(...colIndices),
      maxCol: Math.max(...colIndices),
      rowIndices,
      colIndices,
    };
  }

  if (rowIndices.length) {
    const maxCol = Math.max(0, (grid?.cols ?? 1) - 1);
    return {
      minRow: Math.min(...rowIndices),
      maxRow: Math.max(...rowIndices),
      minCol: 0,
      maxCol,
      rowIndices,
      colIndices: [],
    };
  }

  if (colIndices.length) {
    const maxRow = Math.max(0, (grid?.rows ?? 1) - 1);
    return {
      minRow: 0,
      maxRow,
      minCol: Math.min(...colIndices),
      maxCol: Math.max(...colIndices),
      rowIndices: [],
      colIndices,
    };
  }

  return null;
}
