import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadActiveCaptureSession, markCaptureRestorePending } from "../../datacapture/lib/dataCaptureStorage.js";
import { saveGroupOnlyProcessPrefsFromProcessData } from "../../datacapture/lib/dataCaptureGroupOnlyProcessPersistence.js";
import { isGroupLedgerCapture } from "../../../utils/company/c168CaptureChannel.js";
import { clearSummaryCaptureRoundStorage } from "../lib/summaryStorage.js";
import { saveSummaryRefreshStatePure } from "../lib/summaryRefreshStatePure.js";
import { mergeRowsWithSummaryDomDraft } from "../lib/summaryRefreshDomSync.js";
import { deleteSummaryTemplate } from "../lib/summaryApi.js";
import { useSummaryContext } from "../context/SummaryContext.jsx";
import { useSummarySubmitPure } from "./useSummarySubmitPure.js";
import { pushSummaryNotification } from "../lib/summaryNotify.js";
import { computeSummaryTotal } from "../table/summaryRowData.js";
import { rowsHaveCompleteFormulaCurrency } from "../table/summaryRowAmount.js";
import { syncSubOrderTemplates } from "../table/summarySubOrderResequence.js";
import { saveSummaryTemplatePure } from "../formula/summarySaveTemplatePure.js";
import {
  SUMMARY_SUBMIT_TOTAL_MAX,
  SUMMARY_SUBMIT_TOTAL_MIN,
} from "../submit/summarySubmitTotalPure.js";
import { MoneyDecimal } from "../../../utils/money/moneyDecimal.js";

function buildSummaryRestoreCapturePath(companyId, options = {}) {
  const groupOnly = options.groupOnly === true;
  const params = new URLSearchParams({ restore: "1" });
  if (groupOnly) {
    params.set("group_only", "1");
  } else if (companyId != null && String(companyId).trim() !== "") {
    params.set("company_id", String(companyId));
  }
  const groupId = options.groupId ? String(options.groupId).trim().toUpperCase() : "";
  if (groupId) {
    params.set("group_id", groupId);
  }
  return `/datacapture?${params.toString()}`;
}

function buildSummarySubmittedCapturePath(companyId, options = {}) {
  const groupOnly = options.groupOnly === true;
  const params = new URLSearchParams({ submitted: "1" });
  if (groupOnly) {
    params.set("group_only", "1");
  } else if (companyId != null && String(companyId).trim() !== "") {
    params.set("company_id", String(companyId));
  }
  const groupId = options.groupId ? String(options.groupId).trim().toUpperCase() : "";
  if (groupId) {
    params.set("group_id", groupId);
  }
  return `/datacapture?${params.toString()}`;
}

function clearSummarySessionAfterSubmit(options = {}) {
  window.isNavigatingAwayByBackOrSubmit = true;
  if (options.groupOnly === true) {
    const session = loadActiveCaptureSession();
    if (session?.processData) {
      saveGroupOnlyProcessPrefsFromProcessData(session.processData, session.processData.captureSelectedGroup);
    }
  }
  try {
    localStorage.removeItem("capturedTableRateValues");
    localStorage.removeItem("capturedTableRateValuesByProductId");
    localStorage.removeItem("capturedTableFormulaSourceForRefresh");
    localStorage.removeItem("capturedCaptureId");
  } catch {
    /* ignore */
  }
  clearSummaryCaptureRoundStorage();
}

export function useSummaryPageActionsPure({

  captureScope,

  companyId,

  mutationsBlocked,

  t,

  processId,

  processCode,

  runPopulate,

  showConfirmDelete,

  showNotification,

  tableData,

  replaceRows,

}) {

  const navigate = useNavigate();

  const {

    rows,

    deleteSelectedRows,

    toggleAllRate,

    applyRateBatch,

    globalRateInput,

    setGlobalRateInput,

  } = useSummaryContext();

  const rateSelectAllRef = useRef(null);

  const [rateSelectAllLabel, setRateSelectAllLabel] = useState(() => t("selectAll"));

  const [deleteCount, setDeleteCount] = useState(0);

  const [refreshing, setRefreshing] = useState(false);



  const submitTotalValid = useMemo(() => {

    const total = computeSummaryTotal(rows, globalRateInput);

    const min = MoneyDecimal.toDecimal(SUMMARY_SUBMIT_TOTAL_MIN);

    const max = MoneyDecimal.toDecimal(SUMMARY_SUBMIT_TOTAL_MAX);

    return (

      MoneyDecimal.cmp(total, min) >= 0 &&

      MoneyDecimal.cmp(total, max) <= 0 &&

      rowsHaveCompleteFormulaCurrency(rows)

    );

  }, [rows, globalRateInput]);



  const { submitSummary, isSubmitting } = useSummarySubmitPure({

    captureScope,

    companyId,

    mutationsBlocked,

    rateInput: globalRateInput,

    t,

    onSuccess: () => {

      const session = loadActiveCaptureSession();

      const groupOnly = isGroupLedgerCapture(captureScope, session?.processData);
      const groupId =
        captureScope?.groupId ||
        captureScope?.viewGroup ||
        session?.processData?.captureSelectedGroup ||
        null;

      clearSummarySessionAfterSubmit({ groupOnly });

      navigate(buildSummarySubmittedCapturePath(companyId, { groupOnly, groupId }), { replace: true });

    },

  });



  useEffect(() => {

    const count = rows.filter((r) => r.deleteChecked).length;

    setDeleteCount(count);

  }, [rows]);



  useEffect(() => {

    setRateSelectAllLabel(t("selectAll"));

  }, [t]);



  const navigateBack = useCallback(() => {
    const { rows: syncedRows } = mergeRowsWithSummaryDomDraft(rows);
    replaceRows?.(syncedRows);
    saveSummaryRefreshStatePure(syncedRows, { processId, processCode }, captureScope);

    window.isNavigatingAwayByBackOrSubmit = true;

    const session = loadActiveCaptureSession();

    const groupOnly = isGroupLedgerCapture(captureScope, session?.processData);

    const groupId =
      session?.processData?.captureSelectedGroup ||
      captureScope?.groupId ||
      captureScope?.viewGroup;

    markCaptureRestorePending({
      companyId: groupOnly ? null : companyId,
      groupId,
      groupOnly,
    });

    navigate(buildSummaryRestoreCapturePath(companyId, { groupOnly, groupId }), { replace: true });
  }, [navigate, companyId, rows, processId, processCode, captureScope, replaceRows]);



  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { rows: syncedRows } = mergeRowsWithSummaryDomDraft(rows);
      replaceRows?.(syncedRows);
      saveSummaryRefreshStatePure(syncedRows, { processId, processCode }, captureScope);
      await runPopulate?.();
    } finally {
      setRefreshing(false);
    }
  }, [rows, processId, processCode, runPopulate, captureScope, replaceRows]);



  const handleToggleRateSelectAll = useCallback(() => {

    const btn = rateSelectAllRef.current;

    const mode = btn?.dataset?.rateSelectMode || "all";

    const nextChecked = mode !== "clear";

    toggleAllRate(nextChecked);

    if (btn) {

      btn.dataset.rateSelectMode = nextChecked ? "clear" : "all";

      btn.textContent = nextChecked ? t("clearAll") : t("selectAll");

    }

    setRateSelectAllLabel(nextChecked ? t("clearAll") : t("selectAll"));

  }, [toggleAllRate, t]);



  const handleRateBatchSubmit = useCallback(() => {

    const raw = String(globalRateInput || "").trim();

    if (!raw) {

      pushSummaryNotification(t("info") || "Info", t("enterRateValue") || "Please enter a Rate value", "info");

      return;

    }

    const count = applyRateBatch(raw);

    if (count > 0) {

      const notify = showNotification || pushSummaryNotification;

      notify(

        t("success") || "Success",

        t("rateUpdatedRows", { count }) || `Rate Value updated for ${count} row(s)`,

        "success"

      );

      saveSummaryRefreshStatePure(rows, { processId, processCode }, captureScope);

    } else {

      pushSummaryNotification(

        t("info") || "Info",

        t("noRateRowsChecked") || "No rows with Rate checkbox checked",

        "info"

      );

    }

  }, [applyRateBatch, globalRateInput, t, showNotification, rows, processId, processCode, captureScope]);



  const handleDeleteSelected = useCallback(() => {

    const count = rows.filter((r) => r.deleteChecked).length;

    if (count <= 0) return;

    const message = t("confirmDeleteRows", { count }) || `Delete ${count} row(s)?`;

    const onConfirm = async () => {

      const result = deleteSelectedRows();

      if (result.templatesToDelete?.length) {
        for (const tpl of result.templatesToDelete) {
          try {
            await deleteSummaryTemplate({
              captureScope,
              companyId,
              processId,
              templateKey: tpl.templateKey,
              productType: tpl.productType || "main",
              templateId: tpl.templateId,
              formulaVariant: tpl.formulaVariant,
            });
          } catch (e) {
            console.warn("Template delete failed:", tpl, e);
          }
        }
      }

      const nextRows = result.nextRows || rows;
      const parentsToSync = new Set(
        (result.templatesToDelete || [])
          .filter((t) => t.productType === "sub")
          .map((t) => String(t.templateKey || "").split("_")[0])
          .filter(Boolean)
      );
      for (const parent of parentsToSync) {
        await syncSubOrderTemplates(nextRows, parent, (row) =>
          saveSummaryTemplatePure(row, { captureScope, companyId, processId })
        );
      }

      saveSummaryRefreshStatePure(nextRows, { processId, processCode }, captureScope);

      const notify = showNotification || pushSummaryNotification;

      notify(
        t("success") || "Success",
        t("rowsDeleted", { count: result.removed + result.cleared }) ||
          `${result.removed + result.cleared} row(s) deleted successfully!`,
        "success"
      );

    };

    if (typeof showConfirmDelete === "function") {

      showConfirmDelete(message, onConfirm);

      return;

    }

    if (window.confirm(message)) onConfirm();

  }, [
    rows,
    deleteSelectedRows,
    t,
    showConfirmDelete,
    showNotification,
    captureScope,
    companyId,
    processId,
    processCode,
  ]);



  return {

    rateInput: globalRateInput,

    setRateInput: setGlobalRateInput,

    rateSelectAllLabel,

    rateSelectAllRef,

    deleteCount,

    deleteDisabled: deleteCount <= 0,

    submitDisabled: !submitTotalValid || isSubmitting,

    submitting: isSubmitting,

    refreshing,

    handleBack: navigateBack,

    handleRefresh,

    handleRateBatchSubmit,

    handleToggleRateSelectAll,

    handleDeleteSelected,

    handleSubmitSummary: submitSummary,

  };

}


