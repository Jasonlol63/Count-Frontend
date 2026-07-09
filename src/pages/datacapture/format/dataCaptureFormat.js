/**
 * 2.Format — preview storage, grid-ready flag, table visibility + style cleanup.
 */
import {
  getFormatPasteAnchorCell,
  resolveFormatPasteStartRow,
} from "../paste/core/dataCapturePasteApply.js";
import {
  getBridgeCaptureType,
  getIsRestoring,
  onFormatGridReady,
  parseHtmlFormat,
  processFormatHtml,
} from "../lib/dataCaptureBridge.js";
import {
  buildFormatPreviewHtmlFromTableSnapshot,
  captureTableSnapshot,
  domGridHasEditableData,
  tableSnapshotHasData,
} from "../lib/dataCaptureTableSnapshot.js";

export const FORMAT_PREVIEW_HTML_KEY = "capturedFormatPreviewHtml";
export const FORMAT_PREVIEW_HTML_KEY_LEGACY = "captured655PreviewHtml";

/** Preview HTML is session-only; legacy keys lived in localStorage and caused reload residue. */
const formatPreviewStorage =
  typeof sessionStorage !== "undefined" ? sessionStorage : null;

export function isHardPageReload() {
  try {
    const nav = performance.getEntriesByType?.("navigation")?.[0];
    return nav?.type === "reload";
  } catch {
    return false;
  }
}

/** Drop stale preview on hard refresh (not on ?restore=1 Back flow). */
export function clearStaleFormatPreviewForFreshEntry(shouldRestore = false) {
  try {
    localStorage.removeItem(FORMAT_PREVIEW_HTML_KEY);
    localStorage.removeItem(FORMAT_PREVIEW_HTML_KEY_LEGACY);
  } catch {
    /* ignore */
  }
  if (shouldRestore) return;
  if (!isHardPageReload()) return;
  clearFormatPreviewHtml();
  setFormatGridReady(false);
}

/** Whether switching to 2.Format may hydrate the grid from cached preview HTML. */
export function shouldRestoreFormatFromPreview() {
  if (getIsRestoring()) return true;
  try {
    if (new URLSearchParams(window.location.search).get("restore") === "1") return true;
  } catch {
    /* ignore */
  }
  return !isHardPageReload();
}

/** Whether 2.Format grid has been filled from a paste (legacy `isFormatGridReady`). */
let formatGridReady = false;

export function getFormatGridReady() {
  return formatGridReady;
}

export function setFormatGridReady(value) {
  formatGridReady = !!value;
  onFormatGridReady(formatGridReady);
}

export function getFormatPreviewHtml() {
  try {
    if (!formatPreviewStorage) return "";
    return (
      formatPreviewStorage.getItem(FORMAT_PREVIEW_HTML_KEY) ||
      formatPreviewStorage.getItem(FORMAT_PREVIEW_HTML_KEY_LEGACY) ||
      ""
    );
  } catch {
    return "";
  }
}

export function setFormatPreviewHtml(html) {
  try {
    if (!formatPreviewStorage) return;
    formatPreviewStorage.setItem(FORMAT_PREVIEW_HTML_KEY, html ? String(html) : "");
  } catch {
    /* ignore */
  }
}

export function clearFormatPreviewHtml() {
  try {
    formatPreviewStorage?.removeItem(FORMAT_PREVIEW_HTML_KEY);
    formatPreviewStorage?.removeItem(FORMAT_PREVIEW_HTML_KEY_LEGACY);
    localStorage.removeItem(FORMAT_PREVIEW_HTML_KEY);
    localStorage.removeItem(FORMAT_PREVIEW_HTML_KEY_LEGACY);
  } catch {
    /* ignore */
  }
}

export function clearFormatStyles() {
  const tableBody = document.getElementById("tableBody");
  if (tableBody) {
    tableBody.querySelectorAll("td[contenteditable='true']").forEach((cell) => {
      cell.removeAttribute("style");
      const essentialClasses = ["selected", "multi-selected"];
      Array.from(cell.classList).forEach((cls) => {
        if (!essentialClasses.includes(cls)) {
          cell.classList.remove(cls);
        }
      });
    });
  }

  const tableHeader = document.getElementById("tableHeader");
  if (tableHeader) {
    const headerRow = tableHeader.querySelector("tr");
    if (headerRow) {
      headerRow.querySelectorAll("th").forEach((cell, index) => {
        if (index === 0) return;
        cell.removeAttribute("style");
        const essentialClasses = ["column-selected", "column-active", "row-selected", "row-active"];
        Array.from(cell.classList).forEach((cls) => {
          if (!essentialClasses.includes(cls)) {
            cell.classList.remove(cls);
          }
        });
        const expectedNumber = index;
        const currentText = cell.textContent.trim();
        if (currentText === "") {
          cell.textContent = String(expectedNumber);
          cell.innerHTML = String(expectedNumber);
        }
      });
    }
  }
}

/** 2.Format: empty state — show paste area, hide editable grid. */
export function showFormatPasteArea() {
  const dataTable = document.getElementById("dataTable");
  const pasteAreaFormat = document.getElementById("pasteAreaFormat");
  const tablePreviewFormat = document.getElementById("tablePreviewFormat");
  if (dataTable) dataTable.style.display = "none";
  if (pasteAreaFormat) pasteAreaFormat.style.display = "block";
  if (tablePreviewFormat) tablePreviewFormat.style.display = "none";
}

/** 2.Format with data: show editable #dataTable (same view as back-from-summary). */
export function showFormatEditableGrid() {
  const dataTable = document.getElementById("dataTable");
  const pasteAreaFormat = document.getElementById("pasteAreaFormat");
  const tablePreviewFormat = document.getElementById("tablePreviewFormat");
  if (dataTable) dataTable.style.display = "table";
  if (pasteAreaFormat) pasteAreaFormat.style.display = "none";
  if (tablePreviewFormat) tablePreviewFormat.style.display = "none";
}

/** Keep preview cache aligned with the live grid (incl. append pastes). */
export function syncFormatPreviewFromDom(captureType = "2.Format") {
  const tableData = captureTableSnapshot(captureType);
  if (!tableSnapshotHasData(tableData)) return false;
  const html = buildFormatPreviewHtmlFromTableSnapshot(tableData);
  if (!html) return false;
  setFormatPreviewHtml(html);
  return true;
}

/** Merge table HTML still in #pasteAreaFormat into the editable grid (append when grid has data). */
function flushPendingFormatPasteArea() {
  const pasteArea = document.getElementById("pasteAreaFormat");
  const pasteHtml = pasteArea?.innerHTML || "";
  if (!pasteHtml || !/<table\b/i.test(pasteHtml)) return false;

  const startRow = domGridHasEditableData()
    ? resolveFormatPasteStartRow(getFormatPasteAnchorCell())
    : 0;

  const processed = processFormatHtml(pasteHtml, {
    area: pasteArea,
    startRow,
  });
  return !!processed;
}

function restoreFormatGridFromPreviewHtml(previewHtml) {
  if (!previewHtml || !shouldRestoreFormatFromPreview()) return false;

  if (domGridHasEditableData()) {
    syncFormatPreviewFromDom();
    setFormatGridReady(true);
    return true;
  }

  const filled = parseHtmlFormat(previewHtml);

  if (filled) {
    setFormatGridReady(true);
    showFormatEditableGrid();
    return true;
  }

  return false;
}

/** Ensure 2.Format grid is filled and visible before submit snapshot. */
export function prepareFormatSubmitSnapshot(captureType) {
  const type = getBridgeCaptureType(captureType || "1.Text");
  if (type !== "2.Format") return true;

  showFormatEditableGrid();

  flushPendingFormatPasteArea();

  if (domGridHasEditableData()) {
    syncFormatPreviewFromDom(type);
    setFormatGridReady(true);
    return true;
  }

  const pasteHtml = document.getElementById("pasteAreaFormat")?.innerHTML || "";
  if (pasteHtml && /<table\b/i.test(pasteHtml)) {
    const processed = processFormatHtml(pasteHtml, {
      area: document.getElementById("pasteAreaFormat"),
    });
    if (processed) {
      syncFormatPreviewFromDom(type);
      setFormatGridReady(true);
      return true;
    }
  }

  const previewHtml = getFormatPreviewHtml();
  if (previewHtml) {
    const restored = restoreFormatGridFromPreviewHtml(previewHtml);
    if (restored && domGridHasEditableData()) {
      syncFormatPreviewFromDom(type);
    }
    return restored;
  }

  return false;
}

export function toggleTableDisplayForFormat() {
  const captureType = getBridgeCaptureType();

  if (captureType === "2.Format") {
    if (domGridHasEditableData() || getFormatGridReady()) {
      showFormatEditableGrid();
    } else {
      const previewHtml = getFormatPreviewHtml();
      if (previewHtml && shouldRestoreFormatFromPreview()) {
        restoreFormatGridFromPreviewHtml(previewHtml);
      }
      if (domGridHasEditableData() || getFormatGridReady()) {
        showFormatEditableGrid();
      } else {
        showFormatPasteArea();
      }
    }
  } else {
    showFormatEditableGrid();
  }

  onFormatGridReady(getFormatGridReady());
}

if (typeof window !== "undefined") {
  try {
    const shouldRestore =
      new URLSearchParams(window.location.search).get("restore") === "1";
    clearStaleFormatPreviewForFreshEntry(shouldRestore);
  } catch {
    /* ignore */
  }
}
