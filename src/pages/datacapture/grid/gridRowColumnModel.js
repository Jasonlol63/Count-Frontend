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
  return { value: "", html: undefined, colspan: undefined, hidden: false, className: "", style: {} };
}

function readCellPatch(grid, row, col) {
  const cell = grid.cells[row]?.[col];
  if (!cell) return emptyCellPatch();
  return {
    value: cell.value != null ? String(cell.value) : "",
    ...(cell.html ? { html: cell.html } : {}),
    ...(cell.colspan && cell.colspan > 1 ? { colspan: cell.colspan } : {}),
    ...(cell.hidden ? { hidden: true } : {}),
    ...(cell.className ? { className: cell.className } : {}),
    ...(cell.style ? { style: cell.style } : {}),
    ...(cell.styleCssText ? { styleCssText: cell.styleCssText } : {}),
  };
}

export function clearCellRangeInGrid(grid, minRow, maxRow, minCol, maxCol) {
  let next = grid;
  for (let r = minRow; r <= maxRow; r += 1) {
    for (let c = minCol; c <= maxCol; c += 1) {
      next = setCell(next, r, c, emptyCellPatch());
    }
  }
  return next;
}

/** Excel-like delete: clear selection and shift remaining cells left on each affected row. */
export function shiftCellsLeftInGrid(grid, minRow, maxRow, minCol, maxCol) {
  const width = maxCol - minCol + 1;
  let next = grid;

  for (let r = minRow; r <= maxRow; r += 1) {
    for (let c = minCol; c < next.cols - width; c += 1) {
      const sourceCol = c + width;
      next = setCell(next, r, c, readCellPatch(next, r, sourceCol));
    }
    for (let c = Math.max(minCol, next.cols - width); c < next.cols; c += 1) {
      next = setCell(next, r, c, emptyCellPatch());
    }
  }

  return next;
}

/** Excel-like delete: clear selection and shift remaining cells up on each affected column. */
export function shiftCellsUpInGrid(grid, minRow, maxRow, minCol, maxCol) {
  const height = maxRow - minRow + 1;
  let next = grid;

  for (let c = minCol; c <= maxCol; c += 1) {
    for (let r = minRow; r < next.rows - height; r += 1) {
      const sourceRow = r + height;
      next = setCell(next, r, c, readCellPatch(next, sourceRow, c));
    }
    for (let r = Math.max(minRow, next.rows - height); r < next.rows; r += 1) {
      next = setCell(next, r, c, emptyCellPatch());
    }
  }

  return next;
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
