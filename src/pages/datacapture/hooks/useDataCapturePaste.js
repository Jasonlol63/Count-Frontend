import { useEffect, useLayoutEffect, useRef } from "react";
import {
  parseCitibetFormatBasedPaste,
  parseCitibetMajorPaymentReport,
  parseCitibetPaymentReport,
} from "../paste/vendors/dataCaptureCitibetParsers.js";
import { handleCellPasteEvent as handleCellPasteEventCore } from "../paste/core/dataCapturePasteHandler.js";
import { handleGlobalGridPaste as handleGlobalGridPasteCore } from "../paste/core/dataCapturePasteHandler.js";
import { handleGenericPaste } from "../paste/core/dataCaptureGenericPaste.js";
import { parsePastedData } from "../paste/core/dataCaptureParsePastedData.js";
import { parseAndFillHtmlTableForText } from "../paste/core/dataCaptureTextHtmlPaste.js";
import { detectHtmlTableInClipboard } from "../paste/core/dataCaptureClipboard.js";
import { parseAndFillHtmlTableForWbet,
  parseAndFillHtmlTableForWbetApi,
} from "../paste/vendors/dataCaptureWbetHtmlPaste.js";
import { parseAndFillHTMLTable } from "../paste/core/dataCaptureParseGenericHtml.js";
import { registerDataCaptureRuntime, unregisterDataCaptureRuntime } from "../lib/dataCaptureRuntime.js";

/**
 * Phase 4+: Paste orchestration fully in React (no js/datacapture.js).
 */
export function useDataCapturePaste() {
  const handlerRef = useRef((e) => {
    handleCellPasteEventCore(e);
  });
  handlerRef.current = (e) => {
    handleCellPasteEventCore(e);
  };

  useLayoutEffect(() => {
    const api = {
      handleCellPaste: (e) => handlerRef.current(e),
      parseCitibetMajor: parseCitibetMajorPaymentReport,
      parseCitibetPayment: parseCitibetPaymentReport,
      parseCitibetFormat: parseCitibetFormatBasedPaste,
      parseHtmlText: parseAndFillHtmlTableForText,
      detectHtmlTable: detectHtmlTableInClipboard,
      parseHtmlWbet: parseAndFillHtmlTableForWbet,
      parseHtmlWbetApi: parseAndFillHtmlTableForWbetApi,
      handleGenericPaste,
      parseGenericHtml: parseAndFillHTMLTable,
      parsePastedData,
    };

    registerDataCaptureRuntime(api);
    return () => unregisterDataCaptureRuntime(Object.keys(api));
  }, []);

  useEffect(() => {
    const onGlobalPaste = (e) => {
      handleGlobalGridPasteCore(e);
    };
    document.addEventListener("paste", onGlobalPaste);
    return () => document.removeEventListener("paste", onGlobalPaste);
  }, []);
}
