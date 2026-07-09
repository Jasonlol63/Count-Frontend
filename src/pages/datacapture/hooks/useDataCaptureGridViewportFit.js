import { useEffect, useRef } from "react";
import { useDataCaptureContext } from "../context/DataCaptureContext.jsx";
import {
  DEFAULT_GRID_COLS,
  DEFAULT_GRID_ROWS,
  GROUP_ONLY_GRID_COLS,
  GROUP_ONLY_GRID_ROWS,
  MAX_GRID_ROWS,
} from "../grid/dataCaptureGridMeta.js";
import { callDataCaptureRuntime } from "../lib/dataCaptureRuntime.js";

const ROW_HEIGHT_FALLBACK = 30;
const ROW_HEIGHT_MIN = 28;

function measureViewport(areaEl) {
  if (!areaEl) {
    return null;
  }

  const table = areaEl.querySelector(".excel-table");
  const thead = table?.querySelector("thead");
  const sampleRow = table?.querySelector("tbody tr");
  const naturalRowHeight = sampleRow?.getBoundingClientRect().height || ROW_HEIGHT_FALLBACK;
  const theadHeight = thead?.getBoundingClientRect().height || naturalRowHeight;
  const availableBodyHeight = areaEl.clientHeight - theadHeight;

  if (availableBodyHeight <= 0 || naturalRowHeight <= 0) {
    return null;
  }

  return {
    availableBodyHeight,
    fitRows: Math.ceil(availableBodyHeight / ROW_HEIGHT_MIN),
    naturalRowHeight,
  };
}

function clearRowStretch(areaEl) {
  const tbody = areaEl?.querySelector(".excel-table tbody");
  if (!tbody) return;
  tbody.style.height = "";
  tbody.querySelectorAll("tr").forEach((tr) => {
    tr.style.height = "";
  });
}

function applyRowStretch(areaEl, rowCount, availableBodyHeight) {
  const tbody = areaEl?.querySelector(".excel-table tbody");
  if (!tbody || rowCount <= 0 || availableBodyHeight <= 0) return;

  const rows = tbody.querySelectorAll("tr");
  if (rows.length === 0) return;

  const rowHeight = Math.max(ROW_HEIGHT_MIN, availableBodyHeight / rowCount);
  tbody.style.height = `${availableBodyHeight}px`;
  rows.forEach((tr) => {
    tr.style.height = `${rowHeight}px`;
  });
}

/**
 * Grow row count (group-only) up to viewport / Z row, then stretch rows to fill
 * the scroll area so there is no blank band below the last row.
 */
export function useDataCaptureGridViewportFit(groupOnly, engineReady, areaRef) {
  const { gridRef, gridVersion } = useDataCaptureContext();
  const rafRef = useRef(0);
  const minRows = groupOnly ? GROUP_ONLY_GRID_ROWS : DEFAULT_GRID_ROWS;
  const minCols = groupOnly ? GROUP_ONLY_GRID_COLS : DEFAULT_GRID_COLS;
  const maxRowCap = groupOnly ? MAX_GRID_ROWS : DEFAULT_GRID_ROWS;

  useEffect(() => {
    if (!engineReady) return undefined;

    const syncGridToViewport = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const areaEl = areaRef?.current;
        if (!areaEl) return;

        const viewport = measureViewport(areaEl);
        if (!viewport) return;

        const { availableBodyHeight, fitRows: measuredFitRows } = viewport;
        const targetRows = Math.max(minRows, Math.min(maxRowCap, measuredFitRows));
        const grid = gridRef.current;
        const currentRows = grid?.rows ?? minRows;
        const currentCols = grid?.cols ?? minCols;

        if (targetRows > currentRows) {
          callDataCaptureRuntime("ensureGridReady", targetRows, currentCols);
          rafRef.current = requestAnimationFrame(syncGridToViewport);
          return;
        }

        const rowsForLayout = Math.max(currentRows, minRows);

        if (rowsForLayout * ROW_HEIGHT_MIN >= availableBodyHeight - 1) {
          clearRowStretch(areaEl);
          return;
        }

        applyRowStretch(areaEl, rowsForLayout, availableBodyHeight);
      });
    };

    syncGridToViewport();

    const areaEl = areaRef?.current;
    if (!areaEl) return undefined;

    const resizeObserver = new ResizeObserver(syncGridToViewport);
    resizeObserver.observe(areaEl);

    const tableContainer = areaEl.closest(".excel-table-container");
    if (tableContainer && tableContainer !== areaEl) {
      resizeObserver.observe(tableContainer);
    }

    const topSection = document.querySelector("body.datacapture-page .top-section");
    if (topSection) {
      resizeObserver.observe(topSection);
    }

    window.addEventListener("resize", syncGridToViewport);

    const lateSync = window.setTimeout(syncGridToViewport, 120);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.clearTimeout(lateSync);
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncGridToViewport);
    };
  }, [areaRef, engineReady, gridRef, gridVersion, groupOnly, maxRowCap, minCols, minRows]);
}
