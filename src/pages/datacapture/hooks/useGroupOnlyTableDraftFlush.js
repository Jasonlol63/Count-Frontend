import { useLayoutEffect, useRef } from "react";
import { getBridgeCaptureType } from "../lib/dataCaptureBridge.js";
import {
  clearGroupOnlyTableDraft,
  normalizeGroupOnlyDraftCurrencyId,
  saveGroupOnlyTableDraft,
} from "../lib/dataCaptureGroupOnlyTableDraft.js";
import { isGroupPayrollDraftProcessId } from "../lib/dataCaptureGroupOnlyProcesses.js";
import { captureTableSnapshot, tableSnapshotHasData } from "../lib/dataCaptureTableSnapshot.js";
import { registerDataCaptureRuntime, unregisterDataCaptureRuntime } from "../lib/dataCaptureRuntime.js";

/**
 * Registers immediate group-only draft sync after row-data delete (server + localStorage).
 */
export function useGroupOnlyTableDraftFlush({
  enabled,
  captureScope,
  draftBucket,
  payrollDraftServerSync = true,
  selectedProcessId,
  currencyId,
  captureType,
}) {
  const stateRef = useRef({
    enabled,
    captureScope,
    draftBucket,
    payrollDraftServerSync,
    selectedProcessId,
    currencyId,
    captureType,
  });
  stateRef.current = {
    enabled,
    captureScope,
    draftBucket,
    payrollDraftServerSync,
    selectedProcessId,
    currencyId,
    captureType,
  };

  useLayoutEffect(() => {
    const flushGroupOnlyTableDraftNow = async (gridOverride = null) => {
      const {
        enabled: on,
        captureScope: scope,
        draftBucket: bucket,
        payrollDraftServerSync: serverSync,
        selectedProcessId: processId,
        currencyId: cid,
        captureType: type,
      } = stateRef.current;
      if (!on || !bucket || !isGroupPayrollDraftProcessId(processId)) return false;
      const currencyKey = normalizeGroupOnlyDraftCurrencyId(cid);
      if (!currencyKey) return false;

      const activeCaptureType = getBridgeCaptureType(type || "1.Text");
      const tableData = captureTableSnapshot(activeCaptureType, gridOverride ?? undefined);
      const payload = { tableData, captureType: activeCaptureType };
      const draftOptions = { captureScope: scope, flush: true, serverSync };

      if (tableSnapshotHasData(tableData)) {
        await saveGroupOnlyTableDraft(bucket, processId, currencyKey, payload, draftOptions);
      } else {
        await clearGroupOnlyTableDraft(bucket, processId, currencyKey, { captureScope: scope });
      }
      return true;
    };

    registerDataCaptureRuntime({ flushGroupOnlyTableDraftNow });
    return () => unregisterDataCaptureRuntime(["flushGroupOnlyTableDraftNow"]);
  }, []);
}
