import { useRef } from "react";
import DataCaptureGrid from "./DataCaptureGrid.jsx";
import GroupOnlyTableSizeControl from "./GroupOnlyTableSizeControl.jsx";
import { CAPTURE_TYPE_OPTIONS } from "../lib/dataCaptureFormRules.js";
import { callDataCaptureRuntime } from "../lib/dataCaptureRuntime.js";
import { useDataCaptureGridViewportFit } from "../hooks/useDataCaptureGridViewportFit.js";

function captureTypeLabel(opt, t) {
  if (opt === "1.Text") return t("captureTypeText");
  if (opt === "2.Format") return t("captureTypeFormat");
  if (opt === "CITIBET") return t("captureTypeCitibet");
  if (opt === "4.RETURN") return t("captureTypeReturn");
  return opt;
}

/**
 * Bottom section: capture type, grid, submit.
 */
export default function DataCaptureTableSection({
  t,
  captureType,
  citibetMode = false,
  formatGridReady = false,
  hideCaptureTypeSelector = false,
  groupOnlyTable = false,
  onCaptureTypeChange,
  submitDisabled = true,
  isSubmitting = false,
  onSubmit,
  onReset,
  engineReady = false,
}) {
  const tableAreaRef = useRef(null);
  useDataCaptureGridViewportFit(groupOnlyTable, engineReady, tableAreaRef);

  const formatPasteMode = captureType === "2.Format" && !formatGridReady;
  const containerClass = [
    "excel-table-container",
    groupOnlyTable ? "excel-table-container--group-only" : "",
    citibetMode ? "citibet-mode" : "",
    captureType === "1.Text" ? "capture-type-text" : "",
    captureType === "2.Format" ? "capture-type-format" : "",
    formatPasteMode ? "format-paste-mode" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const gridBody = (
    <>
      <DataCaptureGrid engineReady={engineReady} />
      <div id="tablePreviewFormat" className="table-preview-format" style={{ display: "none" }}>
        <iframe
          id="tablePreviewFrameFormat"
          className="table-preview-frame-format"
          title="Format Table Preview"
        />
      </div>
      <div
        id="pasteAreaFormat"
        className="paste-area-format"
        style={{ display: "none" }}
        contentEditable
        suppressContentEditableWarning
        data-placeholder="在此直接粘贴整张表格（支持Excel/Sheets复制的表格格式）..."
      />
    </>
  );

  return (
    <div className="bottom-section">
      <div className={containerClass}>
        <div
          className={`excel-table-header dc-table-header-bar${hideCaptureTypeSelector ? " dc-table-header-bar--group-only" : ""}`.trim()}
        >
          <div className="dc-table-header-main">
            <span className="dc-table-header-title">{t("dataCaptureTable")}</span>
            {hideCaptureTypeSelector ? (
              <>
                <button
                  type="button"
                  className="btn btn-cancel dc-table-header-reset-btn"
                  onClick={() => onReset?.()}
                >
                  {t("reset")}
                </button>
                <button
                  type="button"
                  className="btn btn-cancel dc-table-header-delete-btn"
                  disabled={!engineReady}
                  title={t("selectRowToDeleteData")}
                  onClick={() => callDataCaptureRuntime("deleteSelectedRowData")}
                >
                  {t("deleteRowData")}
                </button>
              </>
            ) : null}
          </div>
          {!hideCaptureTypeSelector ? (
            <div className="dc-table-header-controls">
              <select
                id="dataCaptureTypeSelector"
                className="data-capture-type-selector"
                value={captureType}
                onChange={onCaptureTypeChange}
                aria-label={t("captureFormatAria")}
              >
                {CAPTURE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {captureTypeLabel(opt, t)}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-cancel" onClick={() => onReset?.()}>
                {t("reset")}
              </button>
            </div>
          ) : null}
          {hideCaptureTypeSelector ? (
            <GroupOnlyTableSizeControl t={t} engineReady={engineReady} />
          ) : null}
        </div>
        <div className="excel-table-scroll-body" ref={tableAreaRef}>
          {gridBody}
        </div>
      </div>

      <div className="form-actions">
        <button
          id="dataCaptureSubmitBtn"
          type="button"
          className="btn btn-save"
          disabled={submitDisabled || isSubmitting}
          style={{
            opacity: submitDisabled || isSubmitting ? 0.6 : 1,
            cursor: submitDisabled || isSubmitting ? "not-allowed" : "pointer",
          }}
          onClick={() => {
            void onSubmit?.();
          }}
        >
          {isSubmitting ? t("submitting") : t("submit")}
        </button>
      </div>
    </div>
  );
}
