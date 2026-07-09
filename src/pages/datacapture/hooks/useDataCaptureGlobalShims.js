import { useLayoutEffect } from "react";
import { unsetWindowProperty } from "../../../utils/core/unsetWindowProperty.js";
import { callDataCaptureRuntime } from "../lib/dataCaptureRuntime.js";
import { pushDataCaptureNotification } from "../lib/dataCaptureNotify.js";

/** Minimal global shims for grid modules that still call `window.showNotification`. */
export function useDataCaptureGlobalShims() {
  useLayoutEffect(() => {
    const resetForm = () => callDataCaptureRuntime("reset");
    const submitDataCaptureForm = () => callDataCaptureRuntime("submit");

    window.showNotification = pushDataCaptureNotification;
    window.resetForm = resetForm;
    window.submitDataCaptureForm = submitDataCaptureForm;

    return () => {
      unsetWindowProperty("showNotification", pushDataCaptureNotification);
      unsetWindowProperty("resetForm", resetForm);
      unsetWindowProperty("submitDataCaptureForm", submitDataCaptureForm);
    };
  }, []);
}
