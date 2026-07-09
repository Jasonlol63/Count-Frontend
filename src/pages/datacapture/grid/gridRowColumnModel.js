import {
  appendGridColumn,
  appendGridRow,
  deleteCol,
  deleteRow,
  insertCol,
  insertRow,
  setCell,
} from "./gridModel.js";

function emptyCellPatch() {
  return { value: "", colspan: undefined, hidden: false, className: "", style: {} };
}

export function clearColumnsInGrid(grid, colIndices) {
  let next = grid;
  colIndices.forEach((col) => {
    for (let r = 0; r < next.rows; r += 1) {
      next = setCell(next, r, col, emptyCellPatch());
    }
  });
  return next;
}

export function clearRowsInGrid(grid, rowIndices) {
  let next = grid;
  rowIndices.forEach((row) => {
    for (let c = 0; c < next.cols; c += 1) {
      next = setCell(next, row, c, emptyCellPatch());
    }
  });
  return next;
}

export function insertColumnInGrid(grid, atIndex) {
  return insertCol(grid, atIndex);
}

export function insertRowInGrid(grid, atIndex) {
  return insertRow(grid, atIndex);
}

export function deleteColumnsInGrid(grid, colIndices) {
  let next = grid;
  const sorted = [...new Set(colIndices)].sort((a, b) => b - a);
  sorted.forEach((col) => {
    if (next.cols <= 1) return;
    next = deleteCol(next, col);
  });
  return next;
}

export function deleteRowsInGrid(grid, rowIndices) {
  let next = grid;
  const sorted = [...new Set(rowIndices)].sort((a, b) => b - a);
  sorted.forEach((row) => {
    if (next.rows <= 1) return;
    next = deleteRow(next, row);
  });
  return next;
}

export function appendRowInGrid(grid) {
  return appendGridRow(grid);
}

export function appendColumnInGrid(grid) {
  return appendGridColumn(grid);
}
