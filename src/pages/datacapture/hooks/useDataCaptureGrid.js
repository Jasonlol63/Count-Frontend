import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useDataCaptureContext } from "../context/DataCaptureContext.jsx";
import {
  clearGridCells,
  clearCellsInGrid,
  createEmptyGrid,
  resizeGrid,
  snapshotToGrid,
} from "../grid/gridModel.js";
import {
  DEFAULT_GRID_COLS,
  DEFAULT_GRID_ROWS,
  resolveDataCaptureGridDimensions,
  resolveRestoreGridDimensions,
} from "../grid/dataCaptureGridMeta.js";
import {
  clearCaptureTableUiAfterGridClear,
  restoreCaptureTableFromData,
} from "../grid/dataCaptureGridClearRestore.js";
import { toggleBridgeFormatDisplay } from "../lib/dataCaptureBridge.js";
import { callDataCaptureRuntime, getDataCaptureState, registerDataCaptureRuntime, unregisterDataCaptureRuntime } from "../lib/dataCaptureRuntime.js";
import { useDataCaptureGridWindowBridges } from "./useDataCaptureGridWindowBridges.js";

/** Minimum rows/cols to consider the grid already built. */
function gridLooksInitialized(dims) {
  return dims.rows >= 1 && dims.cols >= 1;
}

function gridDimsFromModel(grid) {
  if (!grid) return { rows: 0, cols: 0 };
  return { rows: grid.rows, cols: grid.cols };
}

/**
 * Grid lifecycle — React model init, resize, clear, restore.
 */
export function useDataCaptureGrid(engineReady, groupOnly = false) {
  useDataCaptureGridWindowBridges();

  const { gridRef, replaceGrid, updateCell } = useDataCaptureContext();
  const dimensionsRef = useRef(resolveDataCaptureGridDimensions(groupOnly));
  const groupOnlyRef = useRef(groupOnly);
  groupOnlyRef.current = groupOnly;

  const initializeGrid = useCallback(
    (rows = DEFAULT_GRID_ROWS, cols = DEFAULT_GRID_COLS) => {
      const r = Math.max(1, Number(rows) || DEFAULT_GRID_ROWS);
      const c = Math.max(1, Number(cols) || DEFAULT_GRID_COLS);
      dimensionsRef.current = { rows: r, cols: c };
      replaceGrid(createEmptyGrid(r, c));
      toggleBridgeFormatDisplay();
      callDataCaptureRuntime("recomputeSubmitState");
      return dimensionsRef.current;
    },
    [replaceGrid],
  );

  const ensureGridReady = useCallback(
    (rows = DEFAULT_GRID_ROWS, cols = DEFAULT_GRID_COLS) => {
      const r = Math.max(1, Number(rows) || DEFAULT_GRID_ROWS);
      const c = Math.max(1, Number(cols) || DEFAULT_GRID_COLS);
      const current = gridRef.current;

      if (!current || !gridLooksInitialized(gridDimsFromModel(current))) {
        initializeGrid(r, c);
        return { rows: r, cols: c };
      }

      if (current.rows !== r || current.cols !== c) {
        replaceGrid(resizeGrid(current, r, c));
      }

      dimensionsRef.current = { rows: r, cols: c };
      toggleBridgeFormatDisplay();
      callDataCaptureRuntime("recomputeSubmitState");
      return { rows: r, cols: c };
    },
    [gridRef, initializeGrid, replaceGrid],
  );

  const populateGridFromSnapshot = useCallback(
    (tableData) => {
      if (!tableData?.rows?.length) return false;
      const { rows: requiredRows, cols: requiredCols } = resolveRestoreGridDimensions(
        groupOnlyRef.current,
        tableData,
      );
      replaceGrid(snapshotToGrid(tableData, requiredRows, requiredCols));
      return true;
    },
    [replaceGrid],
  );

  const clearGridCellsPure = useCallback(() => {
    const current = gridRef.current;
    if (!current) return;
    replaceGrid(clearGridCells(current));
  }, [gridRef, replaceGrid]);

  const readGridDimensionsBridge = useCallback(() => {
    return gridDimsFromModel(gridRef.current);
  }, [gridRef]);

  const clearCellsAt = useCallback(
    (positions) => {
      const current = gridRef.current;
      if (!current || !positions?.length) return;
      replaceGrid(clearCellsInGrid(current, positions));
    },
    [gridRef, replaceGrid],
  );

  const handlersRef = useRef({});
  handlersRef.current = {
    initializeGrid,
    ensureGridReady,
    populateGridFromSnapshot,
    clearGridCellsPure,
    replaceGrid,
    updateCell,
    clearCellsAt,
    gridRef,
  };

  useLayoutEffect(() => {
    const api = {
      buildGridReact: (rows, cols) => handlersRef.current.initializeGrid(rows, cols),
      initializeTable: (rows, cols) => handlersRef.current.initializeGrid(rows, cols),
      ensureGridReady: (rows, cols) => handlersRef.current.ensureGridReady(rows, cols),
      populateGridFromSnapshot: (tableData) => handlersRef.current.populateGridFromSnapshot(tableData),
      clearGridCells: () => handlersRef.current.clearGridCellsPure(),
      updateCell: (rowIndex, colIndex, patch) => handlersRef.current.updateCell(rowIndex, colIndex, patch),
      clearCellsAt: (positions) => handlersRef.current.clearCellsAt(positions),
      getGridModel: () => handlersRef.current.gridRef.current,
      replaceGrid: (grid) => handlersRef.current.replaceGrid(grid),
      getGridDimensions: readGridDimensionsBridge,
      clearCaptureTable: () => {
        const groupOnly = getDataCaptureState().isGroupOnlyGrid === true;
        const { rows, cols } = resolveDataCaptureGridDimensions(groupOnly);
        handlersRef.current.ensureGridReady(rows, cols);
        handlersRef.current.clearGridCellsPure();
        clearCaptureTableUiAfterGridClear();
      },
      restoreCaptureTable: restoreCaptureTableFromData,
    };

    registerDataCaptureRuntime(api);
    return () => unregisterDataCaptureRuntime(Object.keys(api));
  }, [readGridDimensionsBridge]);

  useLayoutEffect(() => {
    getDataCaptureState().isGroupOnlyGrid = groupOnly;
    return () => {
      getDataCaptureState().isGroupOnlyGrid = false;
    };
  }, [groupOnly]);

  useEffect(() => {
    if (!engineReady) return;
    const { rows, cols } = resolveDataCaptureGridDimensions(groupOnly);
    handlersRef.current.initializeGrid(rows, cols);
  }, [engineReady, groupOnly]);

  return {
    initializeGrid,
    ensureGridReady,
    dimensions: dimensionsRef.current,
  };
}
