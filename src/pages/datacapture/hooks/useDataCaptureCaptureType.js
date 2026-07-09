import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { getFormatPreviewHtml, shouldRestoreFormatFromPreview } from "../format/dataCaptureFormat.js";
import {
  isCitibetCaptureType,
  normalizeCaptureType,
  readInitialCaptureType,
} from "../lib/dataCaptureFormRules.js";
import { domGridHasEditableData } from "../lib/dataCaptureTableSnapshot.js";
import {
  callDataCaptureRuntime,
  registerDataCaptureRuntime,
  unregisterDataCaptureRuntime,
} from "../lib/dataCaptureRuntime.js";
import {
  parseHtmlFormat,
  toggleBridgeFormatDisplay,
} from "../lib/dataCaptureBridge.js";

/**
 * Phase 2: Capture type switching + 2.Format view orchestration in React.
 */
export function useDataCaptureCaptureType() {
  const [captureType, setCaptureType] = useState(readInitialCaptureType);
  const [formatGridReady, setFormatGridReady] = useState(() => {
    if (readInitialCaptureType() !== "2.Format") return false;
    if (!shouldRestoreFormatFromPreview()) return false;
    return Boolean(getFormatPreviewHtml());
  });

  const captureTypeRef = useRef(captureType);
  captureTypeRef.current = captureType;

  const citibetMode = isCitibetCaptureType(captureType);

  const applyCaptureType = useCallback((nextType) => {
    const t = normalizeCaptureType(nextType) || "1.Text";
    const previous = captureTypeRef.current;

    setCaptureType(t);
    captureTypeRef.current = t;

    const container = document.querySelector(".excel-table-container");
    if (container) {
      if (isCitibetCaptureType(t)) container.classList.add("citibet-mode");
      else container.classList.remove("citibet-mode");
    }

    if (t === "2.Format") {
      const previewHtml = getFormatPreviewHtml();
      const legacyReady = callDataCaptureRuntime("getFormatGridReady") === true;

      if (domGridHasEditableData()) {
        callDataCaptureRuntime("syncFormatPreviewFromDom");
        callDataCaptureRuntime("setFormatGridReady", true);
        setFormatGridReady(true);
      } else if (previewHtml && shouldRestoreFormatFromPreview()) {
        const filled = parseHtmlFormat(previewHtml);
        if (filled || legacyReady) {
          callDataCaptureRuntime("setFormatGridReady", true);
          setFormatGridReady(true);
        } else {
          callDataCaptureRuntime("setFormatGridReady", false);
          setFormatGridReady(false);
        }
      } else if (legacyReady) {
        setFormatGridReady(true);
      } else {
        callDataCaptureRuntime("setFormatGridReady", false);
        setFormatGridReady(false);
      }
    } else {
      callDataCaptureRuntime("setFormatGridReady", false);
      setFormatGridReady(false);
      if (previous === "2.Format") {
        callDataCaptureRuntime("clearFormatStyles");
      }
    }

    toggleBridgeFormatDisplay();
    callDataCaptureRuntime("recomputeSubmitState");
  }, []);

  const handleCaptureTypeChange = useCallback(
    (e) => {
      applyCaptureType(e.target.value);
    },
    [applyCaptureType],
  );

  const handlersRef = useRef({});
  handlersRef.current = { applyCaptureType };

  useLayoutEffect(() => {
    const api = {
      applyCaptureType: (type) => handlersRef.current.applyCaptureType(type),
      getCaptureType: () => captureTypeRef.current,
      onFormatGridReady: (ready) => setFormatGridReady(Boolean(ready)),
      onCaptureTypeApplied: (t) => {
        const s = normalizeCaptureType(t) || "1.Text";
        setCaptureType(s);
        captureTypeRef.current = s;
      },
    };

    registerDataCaptureRuntime(api);
    return () => unregisterDataCaptureRuntime(Object.keys(api));
  }, []);

  useLayoutEffect(() => {
    toggleBridgeFormatDisplay();
  }, [captureType, formatGridReady]);

  return {
    captureType,
    citibetMode,
    formatGridReady,
    applyCaptureType,
    handleCaptureTypeChange,
  };
}
