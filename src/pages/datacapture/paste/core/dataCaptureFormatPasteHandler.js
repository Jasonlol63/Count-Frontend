import { parseAndFillHtmlTableForFormat } from "./dataCaptureFormatHtmlPaste.js";
import {
  buildFormatPreviewFragmentFromClipboardHtml,
  clipboardLooksLikeTable,
  sanitizePastedHTML,
  tsvToHtmlTable,
} from "./dataCaptureFormatPreview.js";
import {
  getFormatPasteAnchorCell,
  resolveFormatPasteStartRow,
} from "./dataCapturePasteApply.js";
import { domGridHasEditableData } from "../../lib/dataCaptureTableSnapshot.js";
import { isGridPasteBlockedTarget } from "./dataCaptureClipboard.js";
import { showFormatEditableGrid, syncFormatPreviewFromDom } from "../../format/dataCaptureFormat.js";
import { resolvePasteCell } from "./dataCaptureClipboard.js";
import {
  getActiveCaptureType,
  recomputeSubmitStateAfterPaste,
  setFormatGridReady,
  toggleFormatDisplay,
} from "../../lib/dataCaptureBridge.js";

function isFormatMode() {
  return getActiveCaptureType() === "2.Format";
}

function isEditableFormField(el) {
  return isGridPasteBlockedTarget(el);
}

function afterFormatPasteFilled(filled, area) {
  if (!filled) return false;
  setFormatGridReady(true);
  syncFormatPreviewFromDom();
  if (area) area.innerHTML = "";
  showFormatEditableGrid();
  toggleFormatDisplay();
  recomputeSubmitStateAfterPaste();
  return true;
}

/** Process HTML/TSV clipboard content into preview + editable grid. */
export function processFormatTableHtml(html, { area = null, startRow = null, anchorCell = null } = {}) {
  if (!html) return false;
  const resolvedStartRow =
    startRow != null ? startRow : resolveFormatPasteStartRow(anchorCell || getFormatPasteAnchorCell());

  const previewFragment = buildFormatPreviewFragmentFromClipboardHtml(html);
  const sanitized = sanitizePastedHTML(html);
  if (!previewFragment && !sanitized) return false;

  const filled = parseAndFillHtmlTableForFormat(sanitized || previewFragment, {
    startRow: resolvedStartRow,
  });
  return afterFormatPasteFilled(filled, area);
}

export function processFormatTsv(text, { area = null, startRow = null, anchorCell = null } = {}) {
  if (!text || !text.includes("\t")) return false;
  const tableHtml = tsvToHtmlTable(text);
  return processFormatTableHtml(tableHtml, { area, startRow, anchorCell });
}

function readClipboard(clipboard) {
  const getData = (type) => {
    try {
      return clipboard?.getData?.(type) || "";
    } catch {
      return "";
    }
  };
  return {
    html: getData("text/html"),
    text: getData("text/plain"),
  };
}

/** Paste handler for #pasteAreaFormat (direct paste into format area). */
export function handleFormatPasteAreaEvent(e) {
  if (!isFormatMode()) return;

  const clipboard = e.clipboardData || window.clipboardData;
  const { html, text } = readClipboard(clipboard);
  const area = document.getElementById("pasteAreaFormat");

  const hasExistingData = domGridHasEditableData();
  const startRow = hasExistingData ? resolveFormatPasteStartRow(getFormatPasteAnchorCell()) : 0;

  if (html && /<table\b/i.test(html)) {
    e.preventDefault();
    e.stopPropagation();
    processFormatTableHtml(html, { area, startRow });
    return;
  }

  if (text && /<table\b/i.test(text)) {
    e.preventDefault();
    e.stopPropagation();
    processFormatTableHtml(text, { area, startRow });
    return;
  }

  if (text && text.includes("\t")) {
    e.preventDefault();
    e.stopPropagation();
    processFormatTsv(text, { area, startRow });
    return;
  }

  setTimeout(() => {
    try {
      const pastedHTML = area?.innerHTML || "";
      if (pastedHTML && /<table\b/i.test(pastedHTML)) {
        const appendStartRow = domGridHasEditableData()
          ? resolveFormatPasteStartRow(getFormatPasteAnchorCell())
          : 0;
        processFormatTableHtml(pastedHTML, { area, startRow: appendStartRow });
      }
    } catch {
      /* ignore */
    }
  }, 0);
}

/**
 * Global bubble-phase intercept: route table paste to format pipeline
 * instead of letting <table> land elsewhere on the page.
 */
export function handleGlobalFormatPaste(e) {
  if (!isFormatMode()) return;
  if (isEditableFormField(e.target)) return;
  if (e.target?.closest?.("#dataTable")) return;
  if (e.defaultPrevented) return;

  const clipboard = e.clipboardData || window.clipboardData;
  if (!clipboard || !clipboardLooksLikeTable(clipboard)) return;

  e.preventDefault();
  e.stopPropagation();

  const hasExistingData = domGridHasEditableData();
  const anchorCell = getFormatPasteAnchorCell();
  const appendMode = hasExistingData;
  const startRow = appendMode ? resolveFormatPasteStartRow(anchorCell) : 0;

  const pasteAreaFormat = document.getElementById("pasteAreaFormat");

  const { html, text } = readClipboard(clipboard);

  if (html && /<table\b/i.test(html)) {
    processFormatTableHtml(html, { area: pasteAreaFormat, startRow, anchorCell });
    return;
  }

  if (text && text.includes("\t")) {
    processFormatTsv(text, { area: pasteAreaFormat, startRow, anchorCell });
  }
}

/** Legacy-compatible entry used by handleFormatPasteFromClipboard. */
export function handleFormatPasteFromClipboard(clipboard, fallbackHTML, options = {}) {
  if (!isFormatMode() || !clipboard) return false;

  const { html, text } = readClipboard(clipboard);
  const htmlToUse = html && /<table\b/i.test(html) ? html : fallbackHTML || "";

  if (htmlToUse && /<table\b/i.test(htmlToUse)) {
    setTimeout(() => processFormatTableHtml(htmlToUse, options), 10);
    return true;
  }

  if (text && text.includes("\t")) {
    setTimeout(() => processFormatTsv(text, options), 10);
    return true;
  }

  return false;
}

/**
 * Phase 4e: 2.Format grid cell paste — route table HTML/TSV through format pipeline
 * instead of the full legacy paste body.
 */
export function handleFormatCellPaste(e, pastedData) {
  const anchorCell = resolvePasteCell(e.target);
  const startRow = resolveFormatPasteStartRow(anchorCell);

  const clipboard = e.clipboardData || window.clipboardData;
  if (clipboard && handleFormatPasteFromClipboard(clipboard, null, { startRow, anchorCell })) {
    return true;
  }

  const html = (() => {
    try {
      return clipboard?.getData?.("text/html") || "";
    } catch {
      return "";
    }
  })();

  if (html && /<table\b/i.test(html)) {
    return processFormatTableHtml(html, { startRow, anchorCell });
  }

  if (pastedData && pastedData.includes("\t")) {
    return processFormatTsv(pastedData, { startRow, anchorCell });
  }

  return false;
}
