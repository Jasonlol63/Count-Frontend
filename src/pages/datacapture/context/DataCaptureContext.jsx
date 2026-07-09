import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { createEmptyGrid, setCell } from "../grid/gridModel.js";

const DataCaptureContext = createContext(null);

function normalizeDescriptionNames(names) {
  if (!Array.isArray(names)) return [];
  return names.map((n) => String(n).trim().toUpperCase()).filter(Boolean);
}

export function DataCaptureProvider({ children }) {
  const [selectedDescriptions, setSelectedDescriptionsState] = useState([]);
  const [grid, setGridState] = useState(null);
  const [gridVersion, setGridVersion] = useState(0);
  const gridRef = useRef(grid);
  gridRef.current = grid;

  const setSelectedDescriptions = useCallback((names) => {
    const next = normalizeDescriptionNames(names);
    setSelectedDescriptionsState(next);
  }, []);

  const confirmDescriptions = useCallback(
    (names) => {
      setSelectedDescriptions(names);
    },
    [setSelectedDescriptions],
  );

  const clearSelectedDescriptions = useCallback(() => {
    setSelectedDescriptions([]);
  }, [setSelectedDescriptions]);

  const bumpGridVersion = useCallback(() => {
    setGridVersion((v) => v + 1);
  }, []);

  const replaceGrid = useCallback(
    (nextGrid) => {
      setGridState(nextGrid);
      bumpGridVersion();
    },
    [bumpGridVersion],
  );

  const setGrid = useCallback((updater) => {
    setGridState((prev) => {
      const base = prev || createEmptyGrid();
      const next = typeof updater === "function" ? updater(base) : updater;
      return next;
    });
  }, []);

  const updateCell = useCallback((rowIndex, colIndex, patch) => {
    setGridState((prev) => {
      if (!prev) return prev;
      return setCell(prev, rowIndex, colIndex, patch);
    });
  }, []);

  const value = useMemo(
    () => ({
      selectedDescriptions,
      setSelectedDescriptions,
      confirmDescriptions,
      clearSelectedDescriptions,
      grid,
      gridRef,
      gridVersion,
      setGrid,
      updateCell,
      replaceGrid,
      bumpGridVersion,
    }),
    [
      selectedDescriptions,
      setSelectedDescriptions,
      confirmDescriptions,
      clearSelectedDescriptions,
      grid,
      gridVersion,
      setGrid,
      updateCell,
      replaceGrid,
      bumpGridVersion,
    ],
  );

  return <DataCaptureContext.Provider value={value}>{children}</DataCaptureContext.Provider>;
}

export function useDataCaptureContext() {
  const ctx = useContext(DataCaptureContext);
  if (!ctx) {
    throw new Error("useDataCaptureContext must be used within DataCaptureProvider");
  }
  return ctx;
}

/** Optional accessor for modules that may run outside Provider during tests. */
export function useDataCaptureContextOptional() {
  return useContext(DataCaptureContext);
}
