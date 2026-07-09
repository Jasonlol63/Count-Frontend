/**
 * Context menu positioning and show/hide — extracted from js/datacapture.js (Phase 5b).
 */

import {
  gridClearAllSelections,
  gridGetSelectedCellCount,
  gridGetSelectedCells,
  gridRegisterSelectedCell,
  gridSetContextMenuColumn,
  gridSetContextMenuRow,
} from "./dataCaptureBridge.js";
import { getDataCaptureState } from "./dataCaptureRuntime.js";

function isGroupOnlyColumnContextMenuDisabled() {
  return getDataCaptureState().isGroupOnlyGrid === true;
}

let activeContextMenuAnchor = null;
let contextMenuColumn = null;
let contextMenuRow = null;

export function setContextMenuColumn(col) {
  contextMenuColumn = col;
}

export function getContextMenuColumnIndex() {
  return contextMenuColumn;
}

export function setContextMenuRow(row) {
  contextMenuRow = row;
}

export function getContextMenuRowIndex() {
  return contextMenuRow;
}

function getColumnIndexFromHeader(header) {
  const headerRow = document.querySelector("#tableHeader tr");
  if (!headerRow) return -1;
  const headers = Array.from(headerRow.children);
  const index = headers.indexOf(header);
  return index > 0 ? index - 1 : -1;
}

function getRowIndexFromHeader(rowHeader) {
  const tableBody = document.getElementById("tableBody");
  if (!tableBody) return -1;
  const rows = Array.from(tableBody.children);
  for (let i = 0; i < rows.length; i++) {
    const rh = rows[i].querySelector(".row-header");
    if (rh === rowHeader) return i;
  }
  return -1;
}

function getSelectedCellCount() {
  return gridGetSelectedCellCount();
}

function getSelectedCells() {
  return gridGetSelectedCells();
}

function isCellSelected(cell) {
  return getSelectedCells().includes(cell);
}

function clearAllSelections() {
  gridClearAllSelections();
}

function registerSelectedCell(cell) {
  gridRegisterSelectedCell(cell);
}

function positionContextMenuAtPoint(menuElement, cursorX, cursorY) {
  if (!menuElement) return;

  const margin = 8;
  menuElement.style.visibility = "hidden";
  menuElement.style.display = "block";

  const menuWidth = menuElement.offsetWidth;
  const menuHeight = menuElement.offsetHeight;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

  const left = Math.max(margin, Math.min(cursorX, viewportWidth - menuWidth - margin));
  const top = Math.max(margin, Math.min(cursorY, viewportHeight - menuHeight - margin));

  menuElement.style.left = `${left}px`;
  menuElement.style.top = `${top}px`;
  menuElement.style.visibility = "visible";
}

function positionContextMenu(menu, e, anchorElement) {
  if (!menu || !e) return;

  if (!anchorElement) {
    activeContextMenuAnchor = null;
    positionContextMenuAtPoint(menu, e.clientX, e.clientY);
    return;
  }

  const anchorRect = anchorElement.getBoundingClientRect();
  activeContextMenuAnchor = {
    menu,
    anchorElement,
    offsetX: Math.max(0, Math.min(e.clientX - anchorRect.left, anchorRect.width)),
    offsetY: Math.max(0, Math.min(e.clientY - anchorRect.top, anchorRect.height)),
    scrollContainer: anchorElement.closest(".excel-table-container"),
  };

  menu.style.display = "block";
  updateActiveContextMenuPosition();
}

export function updateActiveContextMenuPosition() {
  if (!activeContextMenuAnchor) return;

  const { menu, anchorElement, offsetX, offsetY, scrollContainer } = activeContextMenuAnchor;
  if (!menu || !anchorElement || !anchorElement.isConnected || menu.style.display === "none") {
    activeContextMenuAnchor = null;
    return;
  }

  const anchorRect = anchorElement.getBoundingClientRect();
  if (scrollContainer) {
    const containerRect = scrollContainer.getBoundingClientRect();
    const anchorOutsideContainer =
      anchorRect.bottom < containerRect.top ||
      anchorRect.top > containerRect.bottom ||
      anchorRect.right < containerRect.left ||
      anchorRect.left > containerRect.right;

    if (anchorOutsideContainer) {
      hideContextMenu();
      return;
    }
  }

  positionContextMenuAtPoint(menu, anchorRect.left + offsetX, anchorRect.top + offsetY);
}

export function hideContextMenu() {
  const contextMenu = document.getElementById("contextMenu");
  const columnContextMenu = document.getElementById("columnContextMenu");
  const rowContextMenu = document.getElementById("rowContextMenu");
  if (contextMenu) contextMenu.style.display = "none";
  if (columnContextMenu) columnContextMenu.style.display = "none";
  if (rowContextMenu) rowContextMenu.style.display = "none";
  activeContextMenuAnchor = null;
}

function scheduleDismissOnOutsideClick(menuId) {
  setTimeout(() => {
    const clickHandler = (e) => {
      const menu = document.getElementById(menuId);
      if (menu && menu.contains(e.target)) return;
      hideContextMenu();
      document.removeEventListener("click", clickHandler);
    };
    document.addEventListener("click", clickHandler, { once: true });
  }, 0);
}

function showOnlyContextMenu(menu, e, anchorElement, beforeShow) {
  hideContextMenu();
  if (beforeShow) beforeShow();
  if (!menu) return;
  positionContextMenu(menu, e, anchorElement);
}

export function showContextMenu(e, cell) {
  const contextMenu = document.getElementById("contextMenu");
  if (!contextMenu || !cell) return;

  showOnlyContextMenu(contextMenu, e, cell, () => {
    const count = getSelectedCellCount();
    if (count > 1) {
      // preserve multi-select
    } else if (count === 1) {
      const isCtrlPressed = e.ctrlKey || e.metaKey;
      if (!isCellSelected(cell) && !isCtrlPressed) {
        clearAllSelections();
        registerSelectedCell(cell);
        cell.classList.add("multi-selected");
      }
    } else {
      clearAllSelections();
      registerSelectedCell(cell);
      cell.classList.add("multi-selected");
    }
  });

  scheduleDismissOnOutsideClick("contextMenu");
}

export function showColumnContextMenu(e, headerEl) {
  e.preventDefault();
  e.stopPropagation();
  if (isGroupOnlyColumnContextMenuDisabled()) return;

  const target = headerEl || e.target?.closest?.("#tableHeader th");
  if (!target || target.cellIndex <= 0) return;

  const actualColIndex = getColumnIndexFromHeader(target);
  const finalColIndex = actualColIndex >= 0 ? actualColIndex : null;

  const columnContextMenu = document.getElementById("columnContextMenu");
  if (!columnContextMenu) return;

  showOnlyContextMenu(columnContextMenu, e, target, () => {
    setContextMenuColumn(finalColIndex);
    gridSetContextMenuColumn(finalColIndex);
  });

  scheduleDismissOnOutsideClick("columnContextMenu");
}

export function showRowContextMenu(e, rowHeaderEl) {
  e.preventDefault();
  e.stopPropagation();

  const target = rowHeaderEl || e.target?.closest?.(".row-header");
  if (!target) return;

  const actualRowIndex = getRowIndexFromHeader(target);
  const finalRowIndex = actualRowIndex >= 0 ? actualRowIndex : null;

  const rowContextMenu = document.getElementById("rowContextMenu");
  if (!rowContextMenu) return;

  showOnlyContextMenu(rowContextMenu, e, target, () => {
    setContextMenuRow(finalRowIndex);
    gridSetContextMenuRow(finalRowIndex);
  });

  scheduleDismissOnOutsideClick("rowContextMenu");
}
