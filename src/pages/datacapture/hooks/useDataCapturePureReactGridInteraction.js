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
import {
  clearAllSelections,
  getSelectedCellPositions,
} from "../grid/dataCaptureGridSelection.js";
import { clearCellsInGrid } from "../grid/gridModel.js";
import { undoLastPaste as undoPasteFromHistory, commitGridUndoCheckpoint } from "../grid/dataCaptureGridPasteHistory.js";
import {
  appendColumnInGrid,
  appendRowInGrid,
  clearCellRangeInGrid,
  clearColumnsInGrid,
  clearRowsInGrid,
  deleteColumnsInGrid,
  deleteRowsInGrid,
  insertColumnInGrid,
  insertRowInGrid,
  shiftCellsLeftInGrid,
  shiftCellsUpInGrid,
} from "../grid/gridRowColumnModel.js";
import {
  getSelectedColumnIndicesFromDom,
  getSelectedRowIndicesFromDom,
  resolveDeleteSelectionBounds,
} from "../grid/dataCaptureDeleteSelection.js";
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
  const clickedElement = e.target;
  if (clickedElement?.closest?.("#deleteDialog")) return;

  const dataTable = document.getElementById("dataTable");

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
  return getSelectedColumnIndicesFromDom();
}

function getSelectedRowIndices() {
  return getSelectedRowIndicesFromDom();
}

function resolveSelectionBoundsFromOverride(selectionOverride, grid) {
  if (selectionOverride) return selectionOverride;
  return resolveDeleteSelectionBounds(grid);
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

    const resolveSelectionBounds = (selectionOverride = null) =>
      resolveSelectionBoundsFromOverride(selectionOverride, getGrid());

    const applyGridChange = (nextGrid) => {
      apiRef.current.replaceGrid(nextGrid);
      commitGridUndoCheckpoint(nextGrid);
    };

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

    const deleteColumn = (selectionOverride = null) => {
      if (isGroupOnlyFixedColumns()) return;
      const grid = getGrid();
      if (!grid) return;
      const bounds = resolveSelectionBounds(selectionOverride);
      const indices = bounds?.colIndices?.length
        ? bounds.colIndices
        : getSelectedColumnIndices();
      if (!indices.length) {
        pushDataCaptureNotification("Select a column to delete", "danger");
        return;
      }
      if (grid.cols - indices.length < 1) {
        pushDataCaptureNotification("Cannot delete the last column", "danger");
        hideContextMenu();
        return;
      }
      applyGridChange(deleteColumnsInGrid(grid, indices));
      hideContextMenu();
      clearAllSelections();
      recomputeSubmitState();
    };

    const clearColumn = () => {
      const grid = getGrid();
      if (!grid) return;
      const indices = getSelectedColumnIndices();
      if (!indices.length) return;
      applyGridChange(clearColumnsInGrid(grid, indices));
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

    const deleteRow = (selectionOverride = null) => {
      const grid = getGrid();
      if (!grid) return;
      const bounds = resolveSelectionBounds(selectionOverride);
      const indices = bounds?.rowIndices?.length
        ? bounds.rowIndices
        : getSelectedRowIndices();
      if (!indices.length) {
        pushDataCaptureNotification("Select a row to delete", "danger");
        return;
      }
      if (grid.rows - indices.length < 1) {
        pushDataCaptureNotification("Cannot delete the last row", "danger");
        hideContextMenu();
        return;
      }
      applyGridChange(deleteRowsInGrid(grid, indices));
      hideContextMenu();
      clearAllSelections();
      recomputeSubmitState();
    };

    const clearRow = () => {
      const grid = getGrid();
      if (!grid) return;
      const indices = getSelectedRowIndices();
      if (!indices.length) return;
      applyGridChange(clearRowsInGrid(grid, indices));
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
      applyGridChange(nextGrid);
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

    const clearSelectedCellsInGrid = () => {
      const grid = getGrid();
      if (!grid) return;

      let nextGrid = grid;

      // Clear ONLY the cells actually selected. Using the rectangular bounding box
      // here would also wipe unselected cells that happen to fall inside the box
      // (e.g. selecting A1 + B2 would otherwise also clear A2 and B1).
      const positions = getSelectedCellPositions();
      if (positions.length) {
        nextGrid = clearCellsInGrid(
          nextGrid,
          positions.map((p) => ({ row: p.rowIndex, col: p.colIndex })),
        );
      } else {
        // Fallback for header (row/column) selections where individual cells
        // aren't tracked: clear the resolved rectangle.
        const bounds = resolveSelectionBounds();
        if (!bounds) return;
        nextGrid = clearCellRangeInGrid(
          nextGrid,
          bounds.minRow,
          bounds.maxRow,
          bounds.minCol,
          bounds.maxCol,
        );
      }

      applyGridChange(nextGrid);
      hideContextMenu();
      recomputeSubmitState();
    };

    const shiftSelectedCellsLeft = (selectionOverride = null) => {
      const grid = getGrid();
      if (!grid) return;
      const bounds = resolveSelectionBounds(selectionOverride);
      if (!bounds) {
        pushDataCaptureNotification("Select cells to delete", "danger");
        return;
      }
      applyGridChange(
        shiftCellsLeftInGrid(grid, bounds.minRow, bounds.maxRow, bounds.minCol, bounds.maxCol),
      );
      hideContextMenu();
      clearAllSelections();
      recomputeSubmitState();
    };

    const shiftSelectedCellsUp = (selectionOverride = null) => {
      const grid = getGrid();
      if (!grid) return;
      const bounds = resolveSelectionBounds(selectionOverride);
      if (!bounds) {
        pushDataCaptureNotification("Select cells to delete", "danger");
        return;
      }
      applyGridChange(
        shiftCellsUpInGrid(grid, bounds.minRow, bounds.maxRow, bounds.minCol, bounds.maxCol),
      );
      hideContextMenu();
      clearAllSelections();
      recomputeSubmitState();
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
      clearSelectedCellsInGrid,
      shiftSelectedCellsLeft,
      shiftSelectedCellsUp,
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
