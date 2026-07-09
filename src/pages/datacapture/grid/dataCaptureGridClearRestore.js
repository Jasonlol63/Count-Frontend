/**
 * Reset / restore grid snapshot.
 */
import { clearAllSelections } from "./dataCaptureGridSelection.js";
import {
  clearFormatPreviewHtml,
  clearFormatStyles,
  setFormatGridReady,
  setFormatPreviewHtml,
  showFormatEditableGrid,
  showFormatPasteArea,
  toggleTableDisplayForFormat,
} from "../format/dataCaptureFormat.js";
import { normalizeCaptureType } from "../lib/dataCaptureFormRules.js";
import { resolveRestoreGridDimensions } from "./dataCaptureGridMeta.js";
import {
  buildFormatPreviewHtmlFromTableSnapshot,
  tableSnapshotHasData,
} from "../lib/dataCaptureTableSnapshot.js";
import { callDataCaptureRuntime, getDataCaptureState } from "../lib/dataCaptureRuntime.js";

/** Format / selection chrome reset — thead/tbody structure is owned by React. */
export function clearCaptureTableUiAfterGridClear() {
  clearFormatStyles();

  const pasteAreaFormat = document.getElementById("pasteAreaFormat");
  if (pasteAreaFormat) {
    pasteAreaFormat.innerHTML = "";
  }

  const tablePreviewFormat = document.getElementById("tablePreviewFormat");
  if (tablePreviewFormat) {
    tablePreviewFormat.style.display = "none";
  }

  const captureType = callDataCaptureRuntime("getCaptureType") || "1.Text";
  if (captureType === "2.Format") {
    clearFormatPreviewHtml();
  }

  setFormatGridReady(false);

  if (captureType === "2.Format") {
    showFormatPasteArea();
  } else {
    showFormatEditableGrid();
  }
  clearAllSelections();
}

export async function restoreCaptureTableFromData(tableData, savedType) {
  const type = normalizeCaptureType(savedType || "1.Text") || "1.Text";

  const groupOnly = getDataCaptureState().isGroupOnlyGrid === true;

  if (!tableData?.rows?.length) {
    callDataCaptureRuntime("applyCaptureType", type);
    const { rows, cols } = resolveRestoreGridDimensions(groupOnly, null);
    callDataCaptureRuntime("ensureGridReady", rows, cols);
    return;
  }

  const { rows: requiredRows, cols: requiredCols } = resolveRestoreGridDimensions(
    groupOnly,
    tableData,
  );

  callDataCaptureRuntime("ensureGridReady", requiredRows, requiredCols);

  await new Promise((resolve) => {
    setTimeout(resolve, 100);
  });

  callDataCaptureRuntime("populateGridFromSnapshot", tableData);

  const hasData = tableSnapshotHasData(tableData);
  if (hasData) {
    setFormatGridReady(true);
    try {
      const html = buildFormatPreviewHtmlFromTableSnapshot(tableData);
      if (html) {
        setFormatPreviewHtml(html);
      }
      showFormatEditableGrid();
    } catch {
      /* ignore */
    }
  } else {
    setFormatGridReady(false);
    clearFormatPreviewHtml();
  }

  callDataCaptureRuntime("applyCaptureType", type);

  const captureType = callDataCaptureRuntime("getCaptureType") || type;
  if (captureType === "2.Format") {
    setTimeout(() => {
      toggleTableDisplayForFormat();
    }, 100);
  }
}
