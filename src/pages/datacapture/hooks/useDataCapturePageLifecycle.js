import { useEffect } from "react";
import { clearStaleFormatPreviewForFreshEntry } from "../format/dataCaptureFormat.js";
import { readInitialCaptureType } from "../lib/dataCaptureFormRules.js";
import { pushDataCaptureNotification } from "../lib/dataCaptureNotify.js";
import {
  shouldRestoreFromUrl,
  stripSearchParamsFromUrl,
} from "../lib/dataCaptureStorage.js";
import { resolveDataCaptureGridDimensions } from "../grid/dataCaptureGridMeta.js";

/**
 * Page lifecycle — first-load bootstrap using runtime callbacks from parent.
 */
export function useDataCapturePageLifecycle({
  engineReady,
  groupOnlyGrid,
  submit,
  reset,
  recomputeSubmitState,
  refreshSubmittedProcesses,
  applyGroupOnlyPersistedForm,
  applyCaptureType,
  ensureGridReady,
}) {
  useEffect(() => {
    if (!engineReady) return;

    const dcFormGate = document.getElementById("dataCaptureForm");
    if (!dcFormGate) return;

    const urlParams = new URLSearchParams(window.location.search);
    const shouldRestore = shouldRestoreFromUrl();
    const alreadyInit = dcFormGate.dataset.dcPageInit === "1";

    clearStaleFormatPreviewForFreshEntry(shouldRestore);

    if (!alreadyInit) {
      dcFormGate.dataset.dcPageInit = "1";

      if (!shouldRestore) {
        applyCaptureType?.(readInitialCaptureType());
        const { rows, cols } = resolveDataCaptureGridDimensions(groupOnlyGrid);
        void ensureGridReady?.(rows, cols);
        void refreshSubmittedProcesses?.();
      }

      if (urlParams.get("success") === "1") {
        pushDataCaptureNotification("Data captured successfully!", "success");
        stripSearchParamsFromUrl(["success"]);
      } else if (urlParams.get("error") === "1") {
        pushDataCaptureNotification("Failed to capture data. Please try again.", "danger");
        stripSearchParamsFromUrl(["error"]);
      } else if (urlParams.get("submitted") === "1") {
        pushDataCaptureNotification("Data captured successfully!", "success");
        if (groupOnlyGrid) {
          void applyGroupOnlyPersistedForm?.();
        }
        stripSearchParamsFromUrl(["submitted", "group_only"]);
      }
    }

    if (shouldRestore) {
      const { rows, cols } = resolveDataCaptureGridDimensions(groupOnlyGrid);
      void ensureGridReady?.(rows, cols);
    }

    recomputeSubmitState?.();
  }, [
    engineReady,
    groupOnlyGrid,
    submit,
    reset,
    recomputeSubmitState,
    refreshSubmittedProcesses,
    applyGroupOnlyPersistedForm,
    applyCaptureType,
    ensureGridReady,
  ]);
}
