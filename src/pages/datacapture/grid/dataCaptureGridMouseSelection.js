/**
 * Cell/column/row drag selection — extracted from js/datacapture.js (Phase 5f).
 * Re-run: node frontend/scripts/extract-grid-mouse-selection.mjs
 */
import { blurActiveTableCell, highlightHeadersForCell } from "./gridCellInteraction.js";
import { setTableActive } from "./dataCaptureGridMeta.js";
import {
  clearAllSelections,
  hasSelectedCell,
  registerSelectedCell,
  selectedCells,
  unregisterSelectedCell,
} from "./dataCaptureGridSelection.js";

let isSelecting = false;
let startCell = null;
let isSelectingColumns = false;
let isSelectingRows = false;
let startColumnIndex = null;
let startRowIndex = null;

function forEachSelectedCell(fn) {
  selectedCells.forEach(fn);
}

function clearSelectedCellSet() {
  selectedCells.clear();
}

export function handleCellMouseDown(e) {
    // Check if this is a right-click (button === 2)
    // If right-click, don't modify selection - let contextmenu event handle it
    if (e.button === 2) {
        // Right-click: don't prevent default or modify selection
        // The contextmenu event will handle showing the menu
        return;
    }

    e.preventDefault();

    // Activate table when user clicks on it
    setTableActive(true);

    const cell = (e.target && e.target.closest) ? e.target.closest('td[contenteditable="true"]') : e.target;
    if (!cell || cell.contentEditable !== 'true') return;
    const isCtrlPressed = e.ctrlKey || e.metaKey;

    // If Ctrl/Cmd is pressed, toggle cell selection (multi-select mode)
    if (isCtrlPressed) {
        // Toggle selection: if already selected, remove it; if not selected, add it
        if (hasSelectedCell(cell)) {
            // Deselect this cell
            unregisterSelectedCell(cell);
            cell.classList.remove('multi-selected');
        } else {
            // Add to selection
            registerSelectedCell(cell);
            cell.classList.add('multi-selected');
        }
        // Don't start drag selection when Ctrl is pressed
        isSelecting = false;
        startCell = null;
    } else {
        // Normal click: clear previous selections and start new selection
        // Only clear if not already dragging
        if (!isSelecting) {
            clearAllSelections();
        }

        // Start drag selection
        isSelecting = true;
        startCell = cell;
        registerSelectedCell(cell);
        cell.classList.add('multi-selected');
        cell.classList.add('selected');
        highlightHeadersForCell(cell);
    }
}

// Handle mouse hover
export function handleCellMouseOver(e) {
    if (!isSelecting || !startCell) return;
    const hoverCell = (e.target && e.target.closest) ? e.target.closest('td[contenteditable="true"]') : e.target;
    if (!hoverCell || hoverCell.contentEditable !== 'true') return;

    if (!e.ctrlKey && !e.metaKey) {
            // Clear previous selections (except starting cell)
            forEachSelectedCell(cell => {
                if (cell !== startCell) {
                    cell.classList.remove('multi-selected');
                }
            });
            clearSelectedCellSet();
            registerSelectedCell(startCell);
        }

        // Select all cells in range
        const startRow = Array.from(startCell.parentNode.parentNode.children).indexOf(startCell.parentNode);
        const startCol = parseInt(startCell.dataset.col);
        const endRow = Array.from(hoverCell.parentNode.parentNode.children).indexOf(hoverCell.parentNode);
        const endCol = parseInt(hoverCell.dataset.col);

        const minRow = Math.min(startRow, endRow);
        const maxRow = Math.max(startRow, endRow);
        const minCol = Math.min(startCol, endCol);
        const maxCol = Math.max(startCol, endCol);

        const tableBody = document.getElementById('tableBody');

        for (let r = minRow; r <= maxRow; r++) {
            const row = tableBody.children[r];
            if (row) {
                for (let c = minCol; c <= maxCol; c++) {
                    const cell = row.children[c + 1]; // +1 because first column is row number
                    if (cell && cell.contentEditable === 'true') {
                        registerSelectedCell(cell);
                        cell.classList.add('multi-selected');
                    }
                }
            }
        }
}

// Handle mouse release
export function handleMouseUp() {
    isSelecting = false;
    startCell = null;
    isSelectingColumns = false;
    isSelectingRows = false;
    startColumnIndex = null;
    startRowIndex = null;
}

// Get column index from header element
export function getColumnIndexFromHeader(header) {
    const headerRow = document.querySelector('#tableHeader tr');
    if (!headerRow) return -1;
    const headers = Array.from(headerRow.children);
    const index = headers.indexOf(header);
    return index > 0 ? index - 1 : -1; // -1 because first column is empty
}

function resolveRowHeaderEl(e) {
    if (e.currentTarget?.classList?.contains("row-header")) return e.currentTarget;
    return e.target?.closest?.(".row-header") ?? e.target;
}

function resolveColumnHeaderEl(e) {
    if (e.currentTarget?.tagName === "TH" && e.currentTarget.parentElement?.parentElement?.id === "tableHeader") {
        return e.currentTarget;
    }
    return e.target?.closest?.("#tableHeader th") ?? e.target;
}

// Get row index from row header element
export function getRowIndexFromHeader(rowHeader) {
    const headerEl =
        rowHeader?.nodeType === Node.ELEMENT_NODE
            ? rowHeader.closest?.(".row-header") || rowHeader
            : rowHeader?.parentElement?.closest?.(".row-header");
    if (!headerEl) return -1;

    const tableBody = document.getElementById('tableBody');
    if (!tableBody) return -1;
    const rows = Array.from(tableBody.children);
    for (let i = 0; i < rows.length; i++) {
        const rh = rows[i].querySelector('.row-header');
        if (rh === headerEl) {
            return i;
        }
    }
    return -1;
}

// Handle column header click (both left and right click)
export function handleColumnHeaderClick(e, colIndex) {
    e.preventDefault();
    blurActiveTableCell();
    setTableActive(true);

    const headerEl = resolveColumnHeaderEl(e);
    const actualColIndex = getColumnIndexFromHeader(headerEl);
    const finalColIndex = actualColIndex >= 0 ? actualColIndex : colIndex;

    const isCtrlPressed = e.ctrlKey || e.metaKey;

    // If Ctrl is pressed, toggle this column selection
    if (isCtrlPressed) {
        isSelectingColumns = false;
        startColumnIndex = null;
        const headers = document.querySelectorAll('#dataTable th');
        const isSelected = headers[finalColIndex + 1] && headers[finalColIndex + 1].classList.contains('column-selected');
        toggleColumnSelection(finalColIndex, !isSelected);
    } else {
        // Normal selection or drag selection
        isSelectingColumns = true;
        startColumnIndex = finalColIndex;
        selectColumn(finalColIndex, null, false);
    }
}

// Handle row header click (both left and right click)
export function handleRowHeaderClick(e, rowIndex) {
    e.preventDefault();
    blurActiveTableCell();
    setTableActive(true);

    const rowHeaderEl = resolveRowHeaderEl(e);
    const actualRowIndex = getRowIndexFromHeader(rowHeaderEl);
    const finalRowIndex = actualRowIndex >= 0 ? actualRowIndex : rowIndex;

    const isCtrlPressed = e.ctrlKey || e.metaKey;

    // If Ctrl is pressed, toggle this row selection
    if (isCtrlPressed) {
        isSelectingRows = false;
        startRowIndex = null;
        const isSelected = rowHeaderEl && rowHeaderEl.classList.contains('row-selected');
        toggleRowSelection(finalRowIndex, !isSelected);
    } else {
        // Normal selection or drag selection
        isSelectingRows = true;
        startRowIndex = finalRowIndex;
        selectRow(finalRowIndex, null, false);
    }
}

// Handle column header mouse over (for drag selection)
export function handleColumnHeaderMouseOver(e, colIndex) {
    if (isSelectingColumns && startColumnIndex !== null) {
        // Get actual column index from DOM position
        const actualColIndex = getColumnIndexFromHeader(e.target);
        const finalColIndex = actualColIndex >= 0 ? actualColIndex : colIndex;
        selectColumn(startColumnIndex, finalColIndex);
    }
}

// Handle row header mouse over (for drag selection)
export function handleRowHeaderMouseOver(e, rowIndex) {
    if (isSelectingRows && startRowIndex !== null) {
        // Get actual row index from DOM position
        const actualRowIndex = getRowIndexFromHeader(e.target);
        const finalRowIndex = actualRowIndex >= 0 ? actualRowIndex : rowIndex;
        selectRow(startRowIndex, finalRowIndex);
    }
}

// Select entire column(s) - supports range selection and Ctrl multi-select
export function selectColumn(colIndex, endColIndex = null, append = false) {
    setTableActive(true);

    if (endColIndex === null) {
        endColIndex = colIndex;
    }

    // If not appending, clear all selections first
    if (!append) {
        clearAllSelections();
    }

    // Highlight column headers in range
    const headers = document.querySelectorAll('#dataTable th');
    const minCol = Math.min(colIndex, endColIndex);
    const maxCol = Math.max(colIndex, endColIndex);

    for (let i = minCol; i <= maxCol; i++) {
        if (headers[i + 1]) {
            // If appending and already selected, toggle it off
            if (append && headers[i + 1].classList.contains('column-selected')) {
                toggleColumnSelection(i, false);
            } else {
                headers[i + 1].classList.add('column-selected');
                // Select all cells in this column
                const tableBody = document.getElementById('tableBody');
                Array.from(tableBody.children).forEach(row => {
                    const cell = row.children[i + 1];
                    if (cell && cell.contentEditable === 'true') {
                        registerSelectedCell(cell);
                        cell.classList.add('multi-selected');
                    }
                });
            }
        }
    }
}

// Toggle column selection (add or remove)
export function toggleColumnSelection(colIndex, add) {
    const headers = document.querySelectorAll('#dataTable th');
    const header = headers[colIndex + 1];
    const tableBody = document.getElementById('tableBody');

    if (add) {
        if (header) {
            header.classList.add('column-selected');
        }
        Array.from(tableBody.children).forEach(row => {
            const cell = row.children[colIndex + 1];
            if (cell && cell.contentEditable === 'true') {
                registerSelectedCell(cell);
                cell.classList.add('multi-selected');
            }
        });
    } else {
        if (header) {
            header.classList.remove('column-selected');
        }
        Array.from(tableBody.children).forEach(row => {
            const cell = row.children[colIndex + 1];
            if (cell && cell.contentEditable === 'true') {
                unregisterSelectedCell(cell);
                cell.classList.remove('multi-selected');
            }
        });
    }
}

// Select entire row(s) - supports range selection and Ctrl multi-select
export function selectRow(rowIndex, endRowIndex = null, append = false) {
    setTableActive(true);

    if (endRowIndex === null) {
        endRowIndex = rowIndex;
    }

    // If not appending, clear all selections first
    if (!append) {
        clearAllSelections();
    }

    // Highlight row headers in range
    const tableBody = document.getElementById('tableBody');
    const minRow = Math.min(rowIndex, endRowIndex);
    const maxRow = Math.max(rowIndex, endRowIndex);

    for (let i = minRow; i <= maxRow; i++) {
        const row = tableBody.children[i];
        if (row) {
            const rowHeader = row.querySelector('.row-header');
            if (rowHeader) {
                // If appending and already selected, toggle it off
                if (append && rowHeader.classList.contains('row-selected')) {
                    toggleRowSelection(i, false);
                } else {
                    rowHeader.classList.add('row-selected');
                    // Select all cells in this row
                    Array.from(row.children).forEach(cell => {
                        if (cell && cell.contentEditable === 'true') {
                            registerSelectedCell(cell);
                            cell.classList.add('multi-selected');
                        }
                    });
                }
            }
        }
    }
}

// Toggle row selection (add or remove)
export function toggleRowSelection(rowIndex, add) {
    const tableBody = document.getElementById('tableBody');
    const row = tableBody.children[rowIndex];

    if (row) {
        const rowHeader = row.querySelector('.row-header');
        if (add) {
            if (rowHeader) {
                rowHeader.classList.add('row-selected');
            }
            Array.from(row.children).forEach(cell => {
                if (cell && cell.contentEditable === 'true') {
                    registerSelectedCell(cell);
                    cell.classList.add('multi-selected');
                }
            });
        } else {
            if (rowHeader) {
                rowHeader.classList.remove('row-selected');
            }
            Array.from(row.children).forEach(cell => {
                if (cell && cell.contentEditable === 'true') {
                    unregisterSelectedCell(cell);
                    cell.classList.remove('multi-selected');
                }
            });
        }
    }
}

export function handleColumnHeaderMousedown(e) {
  if (e.button === 0) handleColumnHeaderClick(e, getColumnIndexFromHeader(resolveColumnHeaderEl(e)));
}

export function handleColumnHeaderMouseover(e) {
  if (!e.ctrlKey && !e.metaKey) handleColumnHeaderMouseOver(e, -1);
}

export function handleRowHeaderMousedown(e) {
  if (e.button === 0) handleRowHeaderClick(e, getRowIndexFromHeader(resolveRowHeaderEl(e)));
}

export function handleRowHeaderMouseover(e) {
  if (!e.ctrlKey && !e.metaKey) handleRowHeaderMouseOver(e, -1);
}
