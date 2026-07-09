import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDataCaptureContext } from "../context/DataCaptureContext.jsx";
import {
  GROUP_ONLY_GRID_COLS,
  GROUP_ONLY_GRID_ROWS,
  MAX_GRID_ROWS,
} from "../grid/dataCaptureGridMeta.js";
import { callDataCaptureRuntime } from "../lib/dataCaptureRuntime.js";

const GROUP_ONLY_TABLE_SIZE_MAX_COLS = 50;
const DEFAULT_ADD_ROWS_TEXT = "1";
const DEFAULT_ADD_COLS_TEXT = "0";

function readGridDimensions(gridRef, gridVersion) {
  void gridVersion;
  const grid = gridRef.current;
  return {
    rows: grid?.rows ?? GROUP_ONLY_GRID_ROWS,
    cols: grid?.cols ?? GROUP_ONLY_GRID_COLS,
  };
}

function parseAddCount(text, max) {
  const trimmed = String(text).trim();
  if (trimmed === "") {
    return { valid: false, value: 0 };
  }
  const n = Math.floor(Number(trimmed));
  if (!Number.isFinite(n) || n < 0) {
    return { valid: false, value: 0 };
  }
  return { valid: true, value: Math.min(n, max) };
}

/**
 * Group-only add row/column control — Apply appends rows/cols; reset restores 11×11.
 */
export default function GroupOnlyTableSizeControl({ t, engineReady = false }) {
  const { gridRef, gridVersion } = useDataCaptureContext();
  const [open, setOpen] = useState(false);
  const [draftAddRowsText, setDraftAddRowsText] = useState(DEFAULT_ADD_ROWS_TEXT);
  const [draftAddColsText, setDraftAddColsText] = useState(DEFAULT_ADD_COLS_TEXT);
  const rootRef = useRef(null);

  const { rows: currentRows, cols: currentCols } = useMemo(
    () => readGridDimensions(gridRef, gridVersion),
    [gridRef, gridVersion],
  );

  const maxAddRows = Math.max(0, MAX_GRID_ROWS - currentRows);
  const maxAddCols = Math.max(0, GROUP_ONLY_TABLE_SIZE_MAX_COLS - currentCols);

  const parsedAddRows = parseAddCount(draftAddRowsText, maxAddRows);
  const parsedAddCols = parseAddCount(draftAddColsText, maxAddCols);
  const previewAddRows = parsedAddRows.valid ? parsedAddRows.value : 0;
  const previewAddCols = parsedAddCols.valid ? parsedAddCols.value : 0;
  const previewTotalRows = Math.min(currentRows + previewAddRows, MAX_GRID_ROWS);
  const previewTotalCols = Math.min(currentCols + previewAddCols, GROUP_ONLY_TABLE_SIZE_MAX_COLS);

  const canApply =
    parsedAddRows.valid && parsedAddCols.valid && (previewAddRows > 0 || previewAddCols > 0);

  const openPopover = useCallback(() => {
    setDraftAddRowsText(DEFAULT_ADD_ROWS_TEXT);
    setDraftAddColsText(DEFAULT_ADD_COLS_TEXT);
    setOpen(true);
  }, []);

  const applyAddDimensions = useCallback(
    (addRows, addCols) => {
      if (!engineReady) return;
      const { rows: baseRows, cols: baseCols } = readGridDimensions(gridRef, gridVersion);
      const nextRows = Math.min(baseRows + addRows, MAX_GRID_ROWS);
      const nextCols = Math.min(baseCols + addCols, GROUP_ONLY_TABLE_SIZE_MAX_COLS);
      callDataCaptureRuntime("ensureGridReady", nextRows, nextCols);
      setDraftAddRowsText(DEFAULT_ADD_ROWS_TEXT);
      setDraftAddColsText(DEFAULT_ADD_COLS_TEXT);
      setOpen(false);
    },
    [engineReady, gridRef, gridVersion],
  );

  const handleApply = useCallback(() => {
    if (!canApply) return;
    applyAddDimensions(previewAddRows, previewAddCols);
  }, [applyAddDimensions, canApply, previewAddCols, previewAddRows]);

  const handleResetTable = useCallback(() => {
    if (!engineReady) return;
    callDataCaptureRuntime("ensureGridReady", GROUP_ONLY_GRID_ROWS, GROUP_ONLY_GRID_COLS);
    setDraftAddRowsText(DEFAULT_ADD_ROWS_TEXT);
    setDraftAddColsText(DEFAULT_ADD_COLS_TEXT);
    setOpen(false);
  }, [engineReady]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div className="dc-table-size" ref={rootRef}>
      <div className="dc-table-size-trigger-row">
        <span className="dc-table-size-label">{t("tableSize")}</span>
        <button
          type="button"
          className="dc-table-size-trigger"
          aria-expanded={open}
          aria-haspopup="dialog"
          disabled={!engineReady}
          onClick={() => (open ? setOpen(false) : openPopover())}
        >
          <span className="dc-table-size-trigger-value">{currentRows}</span>
          <span className="dc-table-size-trigger-caret" aria-hidden="true">
            ▾
          </span>
        </button>
        <button
          type="button"
          className="dc-table-size-reset-icon"
          title={t("tableSizeResetTitle")}
          aria-label={t("tableSizeResetTitle")}
          disabled={!engineReady}
          onClick={handleResetTable}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              fill="currentColor"
              d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08a5.99 5.99 0 0 1-5.65 4c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
            />
          </svg>
        </button>
      </div>

      {open ? (
        <div className="dc-table-size-popover" role="dialog" aria-label={t("tableSize")}>
          <div className="dc-table-size-popover-header">
            <span>{t("tableSize")}</span>
            <button
              type="button"
              className="dc-table-size-popover-close"
              aria-label={t("cancel")}
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>

          <div className="dc-table-size-fields">
            <label className="dc-table-size-field">
              <span className="dc-table-size-field-label">{t("tableSizeAddRows")}</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={draftAddRowsText}
                disabled={maxAddRows < 1}
                onChange={(e) => setDraftAddRowsText(e.target.value)}
              />
            </label>
            <label className="dc-table-size-field">
              <span className="dc-table-size-field-label">{t("tableSizeAddColumns")}</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={draftAddColsText}
                disabled={maxAddCols < 1}
                onChange={(e) => setDraftAddColsText(e.target.value)}
              />
            </label>
          </div>

          <p className="dc-table-size-summary">
            {t("tableSizeAddSummary", {
              currentRows,
              addRows: previewAddRows,
              totalRows: previewTotalRows,
              currentCols,
              addCols: previewAddCols,
              totalCols: previewTotalCols,
            })}
          </p>

          <div className="dc-table-size-actions">
            <button type="button" className="btn btn-cancel dc-table-size-clear-btn" onClick={handleResetTable}>
              {t("clear")}
            </button>
            <button
              type="button"
              className="btn btn-save dc-table-size-apply-btn"
              disabled={!canApply}
              onClick={handleApply}
            >
              {t("apply")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
