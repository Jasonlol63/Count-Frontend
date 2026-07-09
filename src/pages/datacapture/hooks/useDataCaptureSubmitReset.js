import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { spaPath } from "../../../utils/routing/pageRoutes.js";
import {
  applyGroupOnlyCaptureRestoreFilter,
  captureSessionMatchesScope,
  loadCaptureSession,
  saveCaptureSession,
  shouldRestoreFromUrl,
  stripRestoreParamFromUrl,
} from "../lib/dataCaptureStorage.js";
import { isGroupOnlyProcessId } from "../lib/dataCaptureGroupOnlyProcesses.js";
import {
  cancelAllScheduledServerDraftSaves,
  flushGroupOnlyTableDraftToServer,
  saveGroupOnlyTableDraft,
} from "../lib/dataCaptureGroupOnlyTableDraft.js";
import {
  captureTableSnapshot,
  pickRicherTableSnapshot,
  tableSnapshotHasData,
  trimSnapshotToFilledRows,
} from "../lib/dataCaptureTableSnapshot.js";
import {
  getActiveDescriptions,
  isSubmitReady,
  validateDataCaptureForm,
} from "../lib/dataCaptureFormRules.js";
import { fetchProcessDetail, fetchGroupProcessIdByCode } from "../lib/dataCaptureApi.js";
import {
  applyConvertTableOnSubmitToGrid,
  convertTableFormatForSubmit,
} from "../lib/dataCaptureConvertTableOnSubmit.js";
import {
  clearFormatPreviewHtml,
  prepareFormatSubmitSnapshot,
  setFormatGridReady,
} from "../format/dataCaptureFormat.js";
import { clearCaptureTableUiAfterGridClear } from "../grid/dataCaptureGridClearRestore.js";
import { createEmptyGrid, clearGridCells } from "../grid/gridModel.js";
import { resolveDataCaptureGridDimensions } from "../grid/dataCaptureGridMeta.js";
import { buildSpaPath } from "../../../utils/core/apiUrl.js";
import { pushDataCaptureNotification } from "../lib/dataCaptureNotify.js";
import { translateDataCaptureMessage } from "../../../translateFile/pages/dataCaptureTranslate.js";
import { markSummaryFreshNavigation } from "../../datacapturesummary/lib/summaryStorage.js";
import { dataCaptureScopeLedgerCompanyId } from "../lib/dataCaptureScope.js";
import { prefetchRouteModule } from "../../../utils/routing/routePrefetch.js";
import { prefetchSummaryPopulateData } from "../../datacapturesummary/lib/summaryPrefetch.js";
import { useDataCaptureContext } from "../context/DataCaptureContext.jsx";
import {
  applyBridgeCaptureType,
  getBridgeCaptureType,
  toggleBridgeFormatDisplay,
} from "../lib/dataCaptureBridge.js";
import {
  callDataCaptureRuntime,
  getDataCaptureState,
  registerDataCaptureRuntime,
  unregisterDataCaptureRuntime,
} from "../lib/dataCaptureRuntime.js";

function buildProcessCapturePayload(form, captureType, currencies, selectedDescriptions) {
  const currencyOpt = (currencies || []).find((c) => String(c.id) === String(form.currencyId));
  return {
    date: form.captureDate,
    process: form.selectedProcess?.id,
    processName: form.selectedProcess?.displayText || "",
    processCode: form.selectedProcess?.process_id || "",
    dataCaptureType: captureType,
    descriptions: getActiveDescriptions(form.descriptionDisplay, selectedDescriptions),
    currency: form.currencyId,
    currencyName: currencyOpt?.code || "",
    removeWord: form.removeWord || "",
    replaceWordFrom: form.replaceFrom || "",
    replaceWordTo: form.replaceTo || "",
    remark: form.remark || "",
  };
}

/**
 * Phase 1 migration: Submit, Reset, and Restore orchestration in React.
 * Submit-time table transform lives in dataCaptureConvertTableOnSubmit.js (Phase 5b).
 */
export function useDataCaptureSubmitReset({
  captureScope,
  form,
  captureType,
  mutationsBlocked = false,
  navigate,
  t,
  requireDescriptions = true,
  groupPayrollUi = false,
  groupLedgerCapture = false,
  groupPayrollCapture = false,
  payrollDraftBucket = null,
  payrollDraftServerSync = true,
  selectedGroup = null,
}) {
  const { selectedDescriptions, clearSelectedDescriptions, gridRef, gridVersion, replaceGrid } =
    useDataCaptureContext();
  const [submitDisabled, setSubmitDisabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitInFlightRef = useRef(false);
  const restoreInFlightRef = useRef(false);
  const captureTypeRef = useRef(captureType);
  captureTypeRef.current = captureType;

  const recomputeSubmitState = useCallback(() => {
    const activeCaptureType = captureTypeRef.current;
    const tableData = captureTableSnapshot(activeCaptureType, gridRef.current);

    if (
      activeCaptureType === "2.Format" &&
      tableSnapshotHasData(tableData) &&
      callDataCaptureRuntime("getFormatGridReady") === false
    ) {
      callDataCaptureRuntime("setFormatGridReady", true);
      toggleBridgeFormatDisplay();
    }

    const ready = isSubmitReady({
      selectedProcess: form.selectedProcess,
      descriptions: selectedDescriptions,
      descriptionDisplay: form.descriptionDisplay,
      currencyId: form.currencyId,
      captureType: activeCaptureType,
      tableData,
      requireDescriptions,
      requireTableData: groupPayrollUi,
    });
    setSubmitDisabled(!ready);
  }, [form.selectedProcess, form.currencyId, form.descriptionDisplay, requireDescriptions, groupPayrollUi, selectedDescriptions, gridRef]);

  useEffect(() => {
    recomputeSubmitState();
  }, [recomputeSubmitState]);

  useEffect(() => {
    recomputeSubmitState();
  }, [gridVersion, recomputeSubmitState]);

  const submit = useCallback(async () => {
    if (submitInFlightRef.current) return;
    if (mutationsBlocked) {
      pushDataCaptureNotification(t("readOnlyBlocked"), "danger");
      return;
    }

    const activeCaptureType = captureTypeRef.current;

    const tableData = captureTableSnapshot(activeCaptureType, gridRef.current);
    const validation = validateDataCaptureForm({
      selectedProcess: form.selectedProcess,
      descriptions: selectedDescriptions,
      descriptionDisplay: form.descriptionDisplay,
      currencyId: form.currencyId,
      captureType: activeCaptureType,
      tableData,
      requireDescriptions,
      requireTableData: groupPayrollUi,
    });
    if (!validation.ok) {
      pushDataCaptureNotification(translateDataCaptureMessage(localStorage.getItem("login_lang") === "zh" ? "zh" : "en", validation.message), "danger");
      return;
    }

    if (activeCaptureType === "2.Format") {
      prepareFormatSubmitSnapshot(activeCaptureType);
    }

    const preConvertSnapshot = captureTableSnapshot(activeCaptureType, gridRef.current);
    const formatSnapshotBeforeConvert =
      activeCaptureType === "2.Format" ? trimSnapshotToFilledRows(preConvertSnapshot) : null;

    submitInFlightRef.current = true;
    setIsSubmitting(true);
    prefetchRouteModule("/datacapturesummary");
    try {
      const processData = buildProcessCapturePayload(form, activeCaptureType, form.currencies, selectedDescriptions);
      if (groupPayrollUi && isGroupOnlyProcessId(processData.process)) {
        const code =
          form.selectedProcess?.process_id ||
          processData.processCode ||
          String(processData.process || "").toUpperCase();
        let numericId;
        try {
          numericId = await fetchGroupProcessIdByCode(captureScope, code, form.currencyId);
        } catch (resolveErr) {
          pushDataCaptureNotification(
            resolveErr?.message || t("failedCaptureData"),
            "danger"
          );
          return;
        }
        processData.process = numericId;
        processData.processCode = String(code).trim().toUpperCase();
      }

      const capturedAfterConvert = convertTableFormatForSubmit(activeCaptureType, preConvertSnapshot);
      const finalTableData =
        activeCaptureType === "2.Format" && formatSnapshotBeforeConvert
          ? pickRicherTableSnapshot(formatSnapshotBeforeConvert, capturedAfterConvert)
          : capturedAfterConvert;
      if (activeCaptureType === "2.Format" && !tableSnapshotHasData(finalTableData)) {
        pushDataCaptureNotification(t("pleaseEnterTableData"), "danger");
        return;
      }

      const draftBucket = payrollDraftBucket || selectedGroup;
      if (
        groupPayrollUi &&
        draftBucket &&
        isGroupOnlyProcessId(form.selectedProcess?.id)
      ) {
        const draftPayload = {
          tableData: preConvertSnapshot,
          captureType: activeCaptureType,
        };
        const draftOptions = { captureScope, serverSync: payrollDraftServerSync };
        saveGroupOnlyTableDraft(draftBucket, form.selectedProcess.id, form.currencyId, draftPayload, draftOptions);
        await flushGroupOnlyTableDraftToServer(
          draftBucket,
          form.selectedProcess.id,
          form.currencyId,
          draftPayload,
          captureScope,
          draftOptions,
        );
      }

      saveCaptureSession(finalTableData, processData, activeCaptureType, {
        groupPayrollUi,
        groupOnly: groupLedgerCapture,
        groupPayrollCapture,
        payrollPrefsKey: draftBucket,
        selectedGroup,
        scope: captureScope,
        scopeCompanyId:
          captureScope?.scopeCompanyId != null && Number(captureScope.scopeCompanyId) > 0
            ? Number(captureScope.scopeCompanyId)
            : null,
      });

      prefetchSummaryPopulateData({
        captureScope,
        companyId: dataCaptureScopeLedgerCompanyId(captureScope, processData),
        processId: processData.process,
        tableData: finalTableData,
      });

      markSummaryFreshNavigation();
      if (typeof navigate === "function") {
        navigate(spaPath("datacapturesummary", { search: "?success=1" }));
        return;
      }
      window.location.assign(buildSpaPath("datacapturesummary?success=1"));
    } catch (error) {
      console.error("Error submitting data:", error);
      pushDataCaptureNotification(t("failedCaptureData"), "danger");
    } finally {
      submitInFlightRef.current = false;
      setIsSubmitting(false);
    }
  }, [form, captureType, mutationsBlocked, navigate, t, requireDescriptions, groupPayrollUi, groupLedgerCapture, groupPayrollCapture, payrollDraftBucket, payrollDraftServerSync, selectedGroup, captureScope, selectedDescriptions, gridRef]);

  const reset = useCallback(() => {
    const draftBucket = payrollDraftBucket || selectedGroup;
    const groupOnlyProcessId =
      groupPayrollUi && draftBucket && isGroupOnlyProcessId(form.selectedProcess?.id)
        ? form.selectedProcess.id
        : null;

    if (groupPayrollUi && draftBucket) {
      if (groupOnlyProcessId && form.currencyId) {
        const activeCaptureType = getBridgeCaptureType(captureType || "1.Text");
        const tableData = captureTableSnapshot(activeCaptureType, gridRef.current);
        if (tableSnapshotHasData(tableData)) {
          saveGroupOnlyTableDraft(
            draftBucket,
            groupOnlyProcessId,
            form.currencyId,
            { tableData, captureType: activeCaptureType },
            { captureScope, flush: true, serverSync: payrollDraftServerSync },
          );
        } else {
          cancelAllScheduledServerDraftSaves();
        }
      }
      callDataCaptureRuntime("clearGroupOnlyProcessForTableReset");
    } else {
      callDataCaptureRuntime("reactFormReset");
      clearSelectedDescriptions();
    }

    const { rows, cols } = resolveDataCaptureGridDimensions(groupPayrollUi);
    callDataCaptureRuntime("ensureGridReady", rows, cols);
    const current = gridRef.current;
    if (current) {
      replaceGrid(clearGridCells(current));
    } else {
      replaceGrid(createEmptyGrid(rows, cols));
    }
    clearCaptureTableUiAfterGridClear();

    clearFormatPreviewHtml();
    setFormatGridReady(false);

    applyBridgeCaptureType("1.Text");

    recomputeSubmitState();
  }, [
    recomputeSubmitState,
    groupPayrollUi,
    payrollDraftBucket,
    payrollDraftServerSync,
    selectedGroup,
    captureScope,
    captureType,
    form.selectedProcess?.id,
    form.currencyId,
    clearSelectedDescriptions,
    gridRef,
    replaceGrid,
  ]);

  const restoreFromStorage = useCallback(async () => {
    if (!shouldRestoreFromUrl()) return;
    if (restoreInFlightRef.current) return;
    restoreInFlightRef.current = true;

    const session = loadCaptureSession(captureScope);
    if (!session || !captureSessionMatchesScope(session, captureScope)) {
      restoreInFlightRef.current = false;
      getDataCaptureState().isRestoring = false;
      stripRestoreParamFromUrl();
      return;
    }

    getDataCaptureState().isRestoring = true;
    const { tableData, processData, captureType: savedType } = session;
    const restoringGroupLedger =
      processData.groupOnlyCapture === true && processData.groupPayrollCapture !== true;

    try {
      if (restoringGroupLedger) {
        applyGroupOnlyCaptureRestoreFilter(processData);
      }

      await callDataCaptureRuntime("syncRestoreForm", processData);

      await callDataCaptureRuntime("reloadProcesses");
      await callDataCaptureRuntime("refreshSubmittedProcesses");

      await new Promise((r) => setTimeout(r, 300));

      await callDataCaptureRuntime("syncRestoreForm", processData);

      const pid = processData.process != null ? String(processData.process) : "";
      if (pid && captureScope && !restoringGroupLedger && !isGroupOnlyProcessId(pid)) {
        const res = await fetchProcessDetail(pid, captureScope);
        if (res.success && res.data) {
          await callDataCaptureRuntime("syncRestoreForm", {
            ...processData,
            currency: processData.currency || res.data.currency_id,
          });
        }
      }

      await callDataCaptureRuntime("restoreCaptureTable", tableData, savedType);
      await callDataCaptureRuntime("syncRestoreForm", processData);

      stripRestoreParamFromUrl();
    } catch (err) {
      console.error("React restore failed:", err);
    } finally {
      restoreInFlightRef.current = false;
      getDataCaptureState().isRestoring = false;
      recomputeSubmitState();
    }
  }, [captureScope, recomputeSubmitState]);

  const handlersRef = useRef({});
  handlersRef.current = { submit, reset, restoreFromStorage, recomputeSubmitState };

  useLayoutEffect(() => {
    const runConvert = () => applyConvertTableOnSubmitToGrid(captureTypeRef.current);
    const api = {
      convertTableOnSubmit: runConvert,
      recomputeSubmitState: () => handlersRef.current.recomputeSubmitState(),
      submit: () => handlersRef.current.submit(),
      reset: () => handlersRef.current.reset(),
      restoreFromStorage: () => handlersRef.current.restoreFromStorage(),
    };

    registerDataCaptureRuntime(api);
    return () => unregisterDataCaptureRuntime(Object.keys(api));
  }, []);

  return {
    submitDisabled,
    isSubmitting,
    submit,
    reset,
    restoreFromStorage,
    recomputeSubmitState,
  };
}
