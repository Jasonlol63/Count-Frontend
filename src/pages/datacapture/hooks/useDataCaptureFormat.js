import { useEffect, useLayoutEffect } from "react";
import {
  clearFormatStyles,
  getFormatGridReady,
  getFormatPreviewHtml,
  setFormatGridReady,
  shouldRestoreFormatFromPreview,
  syncFormatPreviewFromDom,
  toggleTableDisplayForFormat,
} from "../format/dataCaptureFormat.js";
import { readInitialCaptureType } from "../lib/dataCaptureFormRules.js";
import { registerDataCaptureRuntime, unregisterDataCaptureRuntime } from "../lib/dataCaptureRuntime.js";
import { parseAndFillHtmlTableForFormat } from "../paste/core/dataCaptureFormatHtmlPaste.js";
import {
  buildFormatPreviewFragmentFromClipboardHtml,
  renderFormatPreview,
  sanitizePastedHTML,
} from "../paste/core/dataCaptureFormatPreview.js";
import {
  handleFormatPasteAreaEvent,
  handleFormatPasteFromClipboard,
  handleGlobalFormatPaste,
  processFormatTableHtml,
  processFormatTsv,
} from "../paste/core/dataCaptureFormatPasteHandler.js";

function readInitialFormatReady() {
  if (readInitialCaptureType() !== "2.Format") return false;
  if (!shouldRestoreFormatFromPreview()) return false;
  return Boolean(getFormatPreviewHtml());
}

/** 2.Format display toggling + format paste area bridges. */
export function useDataCaptureFormat() {
  useLayoutEffect(() => {
    if (readInitialFormatReady()) {
      setFormatGridReady(true);
    }

    const api = {
      toggleFormatDisplay: toggleTableDisplayForFormat,
      clearFormatStyles,
      setFormatGridReady,
      getFormatGridReady,
      syncFormatPreviewFromDom,
      parseHtmlFormat: parseAndFillHtmlTableForFormat,
      renderFormatPreview,
      buildFormatPreview: buildFormatPreviewFragmentFromClipboardHtml,
      sanitizePastedHtml: sanitizePastedHTML,
      processFormatHtml: processFormatTableHtml,
      processFormatTsv,
      handleFormatClipboard: handleFormatPasteFromClipboard,
      initFormatPaste: () => {},
    };

    registerDataCaptureRuntime(api);
    return () => unregisterDataCaptureRuntime(Object.keys(api));
  }, []);

  useEffect(() => {
    const area = document.getElementById("pasteAreaFormat");
    if (!area) return undefined;

    const onAreaPaste = (e) => handleFormatPasteAreaEvent(e);
    area.addEventListener("paste", onAreaPaste);

    const onGlobalPaste = (e) => handleGlobalFormatPaste(e);
    document.addEventListener("paste", onGlobalPaste);

    return () => {
      area.removeEventListener("paste", onAreaPaste);
      document.removeEventListener("paste", onGlobalPaste);
    };
  }, []);
}
