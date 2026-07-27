import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { spaPath } from "../../../utils/routing/pageRoutes.js";
import {
  applyGroupOnlyCaptureRestoreFilter,
  captureSessionRestorable,
  loadRestoreCaptureSession,
  saveCaptureSession,
  shouldRestoreFromUrl,
  stripRestoreParamFromUrl,
} from "../lib/dataCaptureStorage.js";
import { isGroupOnlyProcessId, isGroupPayrollDraftProcessId } from "../lib/dataCaptureGroupOnlyProcesses.js";
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
import { resolveDataCaptureTenantId } from "../lib/dataCaptureTenant.js";
import { saveBankCaptureDraft } from "../lib/dataCaptureSpringApi.js";
import { prefetchRouteModule } from "../../../utils/routing/routePrefetch.js";
import { prefetchSummaryPopulateData } from "../../datacapturesummary/lib/summaryPrefetch.js";
import { useDataCaptureContext } from "../context/DataCaptureContext.jsx";
import {
  getBridgeCaptureType,
  toggleBridgeFormatDisplay,
} from "../lib/dataCaptureBridge.js";
import {
  callDataCaptureRuntime,
  getDataCaptureState,
  registerDataCaptureRuntime,
  unregisterDataCaptureRuntime,
} from "../lib/dataCaptureRuntime.js";

function buildProcessCapturePayload(form, captureType, currencies, selectedDescriptions, captureScope, options = {}) {
  const currencyOpt = (currencies || []).find((c) => String(c.id) === String(form.currencyId));
  const proc = form.selectedProcess;
  const processCode = String(proc?.processId ?? proc?.process_id ?? "").trim().toUpperCase();
  const processDisplay =
    String(proc?.displayText || "").trim() ||
    processCode ||
    (proc?.id != null ? String(proc.id) : "");
  const tenantId = resolveDataCaptureTenantId(captureScope);
  const category = options.category === "BANK" ? "BANK" : options.category === "GAME" ? "GAME" : null;
  return {
    date: form.captureDate,
    tenantId,
    category,
    process: proc?.id,
    processName: processDisplay,
    processCode,
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
  companies = [],
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
  selectedPermission = null,
}) {
  const { selectedDescriptions, clearSelectedDescriptions, gridRef, gridVersion, replaceGrid } =
    useDataCaptureContext();
  const [submitDisabled, setSubmitDisabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitInFlightRef = useRef(false);
  const restoreInFlightRef = useRef(false);
  const captureTypeRef = useRef(captureType);
  captureTypeRef.current = captureType;

  /** Bank payroll UI (C168 / bank-only / group ledger) or Bank category permission. */
  const isBankCaptureMode = Boolean(groupPayrollUi || selectedPermission === "Bank");

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
      requireDescriptions: isBankCaptureMode ? false : requireDescriptions,
      requireTableData: isBankCaptureMode,
    });
    setSubmitDisabled(!ready);
  }, [
    form.selectedProcess,
    form.currencyId,
    form.descriptionDisplay,
    requireDescriptions,
    isBankCaptureMode,
    selectedDescriptions,
    gridRef,
  ]);

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
      requireDescriptions: isBankCaptureMode ? false : requireDescriptions,
      requireTableData: isBankCaptureMode,
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
      const processData = buildProcessCapturePayload(
        form,
        activeCaptureType,
        form.currencies,
        selectedDescriptions,
        captureScope,
        { category: isBankCaptureMode ? "BANK" : "GAME" },
      );

      // Bank four-code UI stores process as "salary"/… — resolve to process.id when possible.
      // Phase 1: if resolve fails, still enter Summary with processCode (header + Id Product rows).
      if (isBankCaptureMode) {
        const code =
          form.selectedProcess?.processId ??
          form.selectedProcess?.process_id ??
          processData.processCode ??
          String(processData.process || "").toUpperCase();
        const normalizedCode = String(code || "").trim().toUpperCase();
        processData.processCode = normalizedCode;
        processData.category = "BANK";
        if (isGroupOnlyProcessId(processData.process) || isGroupOnlyProcessId(normalizedCode)) {
          try {
            const numericId = await fetchGroupProcessIdByCode(
              captureScope,
              normalizedCode,
              form.currencyId,
            );
            processData.process = numericId;
          } catch (resolveErr) {
            console.warn(
              "Bank process id resolve skipped — Summary will use processCode",
              resolveErr,
            );
            processData.process = null;
          }
        }
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
        isGroupPayrollDraftProcessId(form.selectedProcess?.id)
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

      // Phase 2: BANK draft DB — Submit only; PROFIT excluded.
      if (
        isBankCaptureMode &&
        isGroupPayrollDraftProcessId(form.selectedProcess?.id) &&
        tableSnapshotHasData(preConvertSnapshot)
      ) {
        const tenantId =
          processData.tenantId ?? resolveDataCaptureTenantId(captureScope);
        const processCode =
          processData.processCode ||
          form.selectedProcess?.processId ||
          String(form.selectedProcess?.id || "").toUpperCase();
        try {
          await saveBankCaptureDraft({
            tenantId,
            processCode,
            currencyId: form.currencyId,
            tableData: preConvertSnapshot,
          });
          if (processData.process == null) {
            // ensureBankProcess may have created the row; keep code for Summary.
            processData.processCode = String(processCode).trim().toUpperCase();
          }
        } catch (draftErr) {
          console.warn("Bank draft save failed — continuing to Summary", draftErr);
        }
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
        tenantId: processData.tenantId ?? resolveDataCaptureTenantId(captureScope),
      });

      prefetchSummaryPopulateData({
        captureScope,
        companyId: dataCaptureScopeLedgerCompanyId(captureScope, processData),
        processId: processData.process,
        tableData: finalTableData,
      });

      markSummaryFreshNavigation();
      if (typeof navigate === "function") {
        navigate(spaPath("datacapturesummary"));
        return;
      }
      window.location.assign(buildSpaPath("datacapturesummary"));
    } catch (error) {
      console.error("Error submitting data:", error);
      pushDataCaptureNotification(t("failedCaptureData"), "danger");
    } finally {
      submitInFlightRef.current = false;
      setIsSubmitting(false);
    }
  }, [form, captureType, mutationsBlocked, navigate, t, requireDescriptions, isBankCaptureMode, groupPayrollUi, groupLedgerCapture, groupPayrollCapture, payrollDraftBucket, payrollDraftServerSync, selectedGroup, captureScope, selectedDescriptions, gridRef]);

  const reset = useCallback(() => {
    const draftBucket = payrollDraftBucket || selectedGroup;
    const groupOnlyProcessId =
      groupPayrollUi && draftBucket && isGroupPayrollDraftProcessId(form.selectedProcess?.id)
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

    // Keep current capture type (e.g. stay on 2.Format after Reset).
    toggleBridgeFormatDisplay();

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

    const session = loadRestoreCaptureSession(captureScope, companies);
    if (!session || !captureSessionRestorable(session, captureScope)) {
      console.warn("Data Capture restore: no matching session in storage", {
        scope: captureScope,
        hasSession: Boolean(session),
      });
      restoreInFlightRef.current = false;
      getDataCaptureState().isRestoring = false;
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
        const res = await fetchProcessDetail(pid, captureScope, processData.date);
        if (res.success && res.data) {
          await callDataCaptureRuntime("syncRestoreForm", {
            ...processData,
            currency:
              processData.currency ||
              (res.data.currencyId ?? res.data.currency_id),
          });
        }
      }

      await callDataCaptureRuntime("restoreCaptureTable", tableData, savedType);
      await callDataCaptureRuntime("syncRestoreForm", processData);

      stripRestoreParamFromUrl();
      getDataCaptureState().restoreCompleted = true;
    } catch (err) {
      console.error("React restore failed:", err);
    } finally {
      restoreInFlightRef.current = false;
      getDataCaptureState().isRestoring = false;
      recomputeSubmitState();
    }
  }, [captureScope, companies, recomputeSubmitState]);

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
