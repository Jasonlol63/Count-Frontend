import { useCallback, useRef, useState } from "react";
import { readCaptureSessionFromStorage } from "../lib/summaryStorage.js";
import { validateSummarySubmitTotalPure } from "../submit/summarySubmitTotalPure.js";
import {
  buildSubmitRowsFromModel,
  validateRowsForSubmit,
} from "../submit/buildSubmitRowsFromModel.js";
import { executeSummarySubmit } from "../submit/summarySubmitExecution.js";
import { pushSummaryNotification } from "../lib/summaryNotify.js";
import { useSummaryContext } from "../context/SummaryContext.jsx";
import { fetchSummaryAccountList } from "../lib/summaryApi.js";

export function useSummarySubmitPure({
  captureScope,
  companyId,
  onSuccess,
  mutationsBlocked = false,
  rateInput = "",
  t,
}) {
  const { rows, accounts } = useSummaryContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inFlightRef = useRef(false);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const submitSummary = useCallback(async () => {
    if (mutationsBlocked) {
      pushSummaryNotification("Error", t("readOnlyBlocked"), "error");
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsSubmitting(true);

    try {
      const totalValidation = validateSummarySubmitTotalPure(rows, rateInput);
      if (!totalValidation.ok) {
        pushSummaryNotification(
          "Error",
          totalValidation.message || t("totalValidationFailed"),
          "error"
        );
        return;
      }

      const session = readCaptureSessionFromStorage(captureScope);
      if (!session?.processData) {
        pushSummaryNotification("Error", t("noProcessData"), "error");
        return;
      }

      const accountList =
        accounts.length > 0 ? accounts : await fetchSummaryAccountList(captureScope);

      const rowValidation = validateRowsForSubmit(rows);
      if (!rowValidation.ok) {
        pushSummaryNotification("Error", rowValidation.message, "error");
        return;
      }

      const summaryRows = buildSubmitRowsFromModel(
        rows,
        session.processData,
        accountList,
        rateInput
      );

      if (summaryRows.length === 0) {
        pushSummaryNotification(
          "Warning",
          t("noDataToSubmit") || "No data to submit.",
          "error"
        );
        return;
      }

      const result = await executeSummarySubmit({
        captureScope,
        companyId,
        parsedProcessData: session.processData,
        summaryRows,
        onSuccess: () => onSuccessRef.current?.(),
      });

      if (!result.ok) {
        pushSummaryNotification("Error", result.message || t("submissionFailed"), "error");
      }
    } catch (error) {
      console.error("Summary submit failed:", error);
      pushSummaryNotification("Error", `${t("submissionFailed")} ${error?.message || error}`, "error");
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  }, [captureScope, companyId, rows, accounts, rateInput, mutationsBlocked, t]);

  return { submitSummary, isSubmitting };
}
