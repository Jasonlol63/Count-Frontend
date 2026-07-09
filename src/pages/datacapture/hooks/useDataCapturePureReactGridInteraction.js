import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useDataCaptureContext } from "../context/DataCaptureContext.jsx";
import { handleCellClick, handleCellKeydown } from "../grid/gridCellInteraction.js";
import { handleDocumentGridKeydown } from "../grid/dataCaptureGridDocumentKeyboard.js";
import { gridClearAllSelections, gridSetTableActive } from "../lib/dataCaptureBridge.js";
import {
  getColumnIndexFromHeader,
  getRowIndexFromHeader,
  handleCellMouseDown,
  handleCellMouseOver,
  handleColumnHeaderClick,
  handleColumnHeaderMousedown,
  handleColumnHeaderMouseover,
  handleMouseUp,
  handleRowHeaderClick,
  handleRowHeaderMousedown,
  handleRowHeaderMouseover,
} from "../grid/dataCaptureGridMouseSelection.js";
import { clearAllSelections } from "../grid/dataCaptureGridSelection.js";
import { undoLastPaste as undoPasteFromHistory } from "../grid/dataCaptureGridPasteHistory.js";
import {
  appendColumnInGrid,
  appendRowInGrid,
  clearColumnsInGrid,
  clearRowsInGrid,
  deleteColumnsInGrid,
  deleteRowsInGrid,
  insertColumnInGrid,
  insertRowInGrid,
} from "../grid/gridRowColumnModel.js";
import {
  getContextMenuColumnIndex,
  getContextMenuRowIndex,
  hideContextMenu,
  showColumnContextMenu,
  showContextMenu,
  showRowContextMenu,
} from "../lib/dataCaptureContextMenu.js";
import { pushDataCaptureNotification } from "../lib/dataCaptureNotify.js";
import { getDataCaptureText } from "../../../translateFile/pages/dataCaptureTranslate.js";
import { MAX_GRID_ROWS } from "../grid/dataCaptureGridMeta.js";
import {
  callDataCaptureRuntime,
  getDataCaptureState,
  registerDataCaptureRuntime,
  unregisterDataCaptureRuntime,
} from "../lib/dataCaptureRuntime.js";

function isGroupOnlyFixedGrid() {
  return getDataCaptureState().isGroupOnlyGrid === true;
}

/** Group-only: columns stay fixed; row context menu remains available. */
function isGroupOnlyFixedColumns() {
  return isGroupOnlyFixedGrid();
}

function withTargetEvent(e, target) {
  if (e.target === target) return e;
  return new Proxy(e, {
    get(obj, prop) {
      if (prop === "target") return target;
      const val = obj[prop];
      return typeof val === "function" ? val.bind(obj) : val;
    },
  });
}

function recomputeSubmitState() {
  callDataCaptureRuntime("recomputeSubmitState");
}

function handleDocumentGridOutsideClick(e) {
  const dataTable = document.getElementById("dataTable");
  const clickedElement = e.target;

  if (dataTable && !dataTable.contains(clickedElement)) {
    const activeElement = document.activeElement;
    const isTableCell =
      activeElement &&
      activeElement.contentEditable === "true" &&
      activeElement.closest("#dataTable");

    if (!isTableCell) {
      gridSetTableActive(false);
      gridClearAllSelections();
      if (
        activeElement &&
        activeElement.contentEditable === "true" &&
        activeElement.closest("#dataTable")
      ) {
        activeElement.blur();
      }
    }
  }
}

function getSelectedColumnIndices() {
  const headerRow = document.querySelector("#tableHeader tr");
  if (!headerRow) return [];
  const selected = Array.from(headerRow.querySelectorAll("th.column-selected"));
  if (selected.length) {
    return selected.map((h) => getColumnIndexFromHeader(h)).filter((i) => i >= 0);
  }
  const col = getContextMenuColumnIndex();
  return col !== null && col >= 0 ? [col] : [];
}

function getSelectedRowIndices() {
  const selectedHeaders = Array.from(document.querySelectorAll(".row-header.row-selected"));
  if (selectedHeaders.length) {
    return selectedHeaders.map((h) => getRowIndexFromHeader(h)).filter((i) => i >= 0);
  }
  const row = getContextMenuRowIndex();
  return row !== null && row >= 0 ? [row] : [];
}

/**
 * Pure-react grid interaction: model-based CRUD bridges + React table event handlers.
 */
export function useDataCapturePureReactGridInteraction(engineReady) {
  const { gridRef, replaceGrid } = useDataCaptureContext();
  const apiRef = useRef({ gridRef, replaceGrid });
  apiRef.current = { gridRef, replaceGrid };

  useLayoutEffect(() => {
    const getGrid = () => apiRef.current.gridRef.current;

    const insertColumnLeft = () => {
      if (isGroupOnlyFixedColumns()) return;
      const col = getContextMenuColumnIndex();
      const grid = getGrid();
      if (col === null || col < 0 || !grid) return;
      apiRef.current.replaceGrid(insertColumnInGrid(grid, col));
      hideContextMenu();
      clearAllSelections();
      recomputeSubmitState();
    };

    const insertColumnRight = () => {
      if (isGroupOnlyFixedColumns()) return;
      const col = getContextMenuColumnIndex();
      const grid = getGrid();
      if (col === null || col < 0 || !grid) return;
      apiRef.current.replaceGrid(insertColumnInGrid(grid, col + 1));
      hideContextMenu();
      clearAllSelections();
      recomputeSubmitState();
    };

    const deleteColumn = () => {
      if (isGroupOnlyFixedColumns()) return;
      const grid = getGrid();
      if (!grid) return;
      const indices = getSelectedColumnIndices();
      if (!indices.length) return;
      if (grid.cols - indices.length < 1) {
        pushDataCaptureNotification("Cannot delete the last column", "danger");
        hideContextMenu();
        return;
      }
      apiRef.current.replaceGrid(deleteColumnsInGrid(grid, indices));
      hideContextMenu();
      clearAllSelections();
      recomputeSubmitState();
    };

    const clearColumn = () => {
      const grid = getGrid();
      if (!grid) return;
      const indices = getSelectedColumnIndices();
      if (!indices.length) return;
      apiRef.current.replaceGrid(clearColumnsInGrid(grid, indices));
      hideContextMenu();
      recomputeSubmitState();
    };

    const insertRowAbove = () => {
      const row = getContextMenuRowIndex();
      const grid = getGrid();
      if (row === null || row < 0 || !grid) return;
      if (grid.rows >= MAX_GRID_ROWS) {
        pushDataCaptureNotification("Cannot add more rows", "danger");
        hideContextMenu();
        return;
      }
      apiRef.current.replaceGrid(insertRowInGrid(grid, row));
      hideContextMenu();
      clearAllSelections();
      recomputeSubmitState();
    };

    const insertRowBelow = () => {
      const row = getContextMenuRowIndex();
      const grid = getGrid();
      if (row === null || row < 0 || !grid) return;
      if (grid.rows >= MAX_GRID_ROWS) {
        pushDataCaptureNotification("Cannot add more rows", "danger");
        hideContextMenu();
        return;
      }
      apiRef.current.replaceGrid(insertRowInGrid(grid, row + 1));
      hideContextMenu();
      clearAllSelections();
      recomputeSubmitState();
    };

    const deleteRow = () => {
      const grid = getGrid();
      if (!grid) return;
      const indices = getSelectedRowIndices();
      if (!indices.length) return;
      if (grid.rows - indices.length < 1) {
        pushDataCaptureNotification("Cannot delete the last row", "danger");
        hideContextMenu();
        return;
      }
      apiRef.current.replaceGrid(deleteRowsInGrid(grid, indices));
      hideContextMenu();
      clearAllSelections();
      recomputeSubmitState();
    };

    const clearRow = () => {
      const grid = getGrid();
      if (!grid) return;
      const indices = getSelectedRowIndices();
      if (!indices.length) return;
      apiRef.current.replaceGrid(clearRowsInGrid(grid, indices));
      hideContextMenu();
      recomputeSubmitState();
    };

    const deleteSelectedRowData = () => {
      const grid = getGrid();
      if (!grid) return;
      const rowIndices = getSelectedRowIndices();
      const colIndices = getSelectedColumnIndices();
      const lang = localStorage.getItem("login_lang") === "zh" ? "zh" : "en";
      if (!rowIndices.length && !colIndices.length) {
        pushDataCaptureNotification(getDataCaptureText(lang, "selectRowToDeleteData"), "danger");
        return;
      }
      let nextGrid = grid;
      if (rowIndices.length) {
        nextGrid = clearRowsInGrid(nextGrid, rowIndices);
      }
      if (colIndices.length) {
        nextGrid = clearColumnsInGrid(nextGrid, colIndices);
      }
      apiRef.current.replaceGrid(nextGrid);
      hideContextMenu();
      clearAllSelections();
      recomputeSubmitState();

      if (getDataCaptureState().isGroupOnlyGrid === true) {
        void (async () => {
          const flushed = await callDataCaptureRuntime("flushGroupOnlyTableDraftNow", nextGrid);
          if (flushed === false) {
            pushDataCaptureNotification(getDataCaptureText(lang, "draftFlushNeedsProcessCurrency"), "danger");
          }
        })();
      }
    };

    const appendGridRow = () => {
      const grid = getGrid();
      if (!grid || grid.rows >= MAX_GRID_ROWS) return null;
      const next = appendRowInGrid(grid);
      apiRef.current.replaceGrid(next);
      recomputeSubmitState();
      return next.rows - 1;
    };

    const appendGridColumn = () => {
      if (isGroupOnlyFixedColumns()) return null;
      const grid = getGrid();
      if (!grid) return null;
      const next = appendColumnInGrid(grid);
      apiRef.current.replaceGrid(next);
      recomputeSubmitState();
      return next.cols - 1;
    };

    const handleUndoLastPaste = () => {
      undoPasteFromHistory();
      recomputeSubmitState();
    };

    const api = {
      insertColumnLeft,
      insertColumnRight,
      deleteColumn,
      clearColumn,
      insertRowAbove,
      insertRowBelow,
      deleteRow,
      clearRow,
      deleteSelectedRowData,
      addNewRow: appendGridRow,
      addNewColumn: appendGridColumn,
      undoLastPaste: handleUndoLastPaste,
    };

    registerDataCaptureRuntime(api);
    return () => unregisterDataCaptureRuntime(Object.keys(api));
  }, []);

  useEffect(() => {
    if (!engineReady) return undefined;

    document.addEventListener("keydown", handleDocumentGridKeydown);
    document.addEventListener("click", handleDocumentGridOutsideClick);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("keydown", handleDocumentGridKeydown);
      document.removeEventListener("click", handleDocumentGridOutsideClick);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [engineReady]);

  const onCellMouseDown = useCallback((e) => {
    handleCellMouseDown(withTargetEvent(e, e.currentTarget));
  }, []);

  const onCellMouseOver = useCallback((e) => {
    handleCellMouseOver(withTargetEvent(e, e.currentTarget));
  }, []);

  const onCellClick = useCallback((e) => {
    handleCellClick(e, e.currentTarget);
  }, []);

  const onCellKeyDown = useCallback((e) => {
    handleCellKeydown(e);
  }, []);

  const onCellContextMenu = useCallback((e) => {
    e.preventDefault();
    showContextMenu(e, e.currentTarget);
  }, []);

  const onColumnHeaderMouseDown = useCallback((e) => {
    handleColumnHeaderMousedown(e);
  }, []);

  const onColumnHeaderMouseOver = useCallback((e) => {
    handleColumnHeaderMouseover(e);
  }, []);

  const onColumnHeaderClick = useCallback((e) => {
    handleColumnHeaderClick(e, getColumnIndexFromHeader(e.currentTarget));
  }, []);

  const onColumnHeaderContextMenu = useCallback((e) => {
    e.preventDefault();
    showColumnContextMenu(e, e.currentTarget);
  }, []);

  const onRowHeaderMouseDown = useCallback((e) => {
    handleRowHeaderMousedown(e);
  }, []);

  const onRowHeaderMouseOver = useCallback((e) => {
    handleRowHeaderMouseover(e);
  }, []);

  const onRowHeaderClick = useCallback((e) => {
    handleRowHeaderClick(e, getRowIndexFromHeader(e.currentTarget));
  }, []);

  const onRowHeaderContextMenu = useCallback((e) => {
    e.preventDefault();
    showRowContextMenu(e, e.currentTarget);
  }, []);

  return useMemo(
    () => ({
      onCellMouseDown,
      onCellMouseOver,
      onCellClick,
      onCellKeyDown,
      onCellContextMenu,
      onColumnHeaderMouseDown,
      onColumnHeaderMouseOver,
      onColumnHeaderClick,
      onColumnHeaderContextMenu,
      onRowHeaderMouseDown,
      onRowHeaderMouseOver,
      onRowHeaderClick,
      onRowHeaderContextMenu,
    }),
    [
      onCellMouseDown,
      onCellMouseOver,
      onCellClick,
      onCellKeyDown,
      onCellContextMenu,
      onColumnHeaderMouseDown,
      onColumnHeaderMouseOver,
      onColumnHeaderClick,
      onColumnHeaderContextMenu,
      onRowHeaderMouseDown,
      onRowHeaderMouseOver,
      onRowHeaderClick,
      onRowHeaderContextMenu,
    ],
  );
}
