import { useLayoutEffect, useRef } from "react";
import { getBridgeCaptureType } from "../lib/dataCaptureBridge.js";
import {
  clearGroupOnlyTableDraft,
  normalizeGroupOnlyDraftCurrencyId,
  saveGroupOnlyTableDraft,
} from "../lib/dataCaptureGroupOnlyTableDraft.js";
import { resolvePayrollDraftProcessKey } from "../lib/dataCaptureGamesPayrollProcesses.js";
import { captureTableSnapshot, tableSnapshotHasData } from "../lib/dataCaptureTableSnapshot.js";
import { registerDataCaptureRuntime, unregisterDataCaptureRuntime } from "../lib/dataCaptureRuntime.js";

/**
 * Registers immediate group-only / Games-payroll draft sync after row-data
 * delete or process switch (server + localStorage).
 */
export function useGroupOnlyTableDraftFlush({
  enabled,
  groupPayrollUi = true,
  captureScope,
  draftBucket,
  payrollDraftServerSync = true,
  selectedProcess,
  currencyId,
  captureType,
}) {
  const stateRef = useRef({
    enabled,
    groupPayrollUi,
    captureScope,
    draftBucket,
    payrollDraftServerSync,
    selectedProcess,
    currencyId,
    captureType,
  });
  stateRef.current = {
    enabled,
    groupPayrollUi,
    captureScope,
    draftBucket,
    payrollDraftServerSync,
    selectedProcess,
    currencyId,
    captureType,
  };

  useLayoutEffect(() => {
    /**
     * @returns {Promise<true|false|null>}
     *   true  — draft saved or cleared
     *   false — draft session needs process + currency
     *   null  — not a draft session (e.g. Games process without enable_save_draft)
     */
    const flushGroupOnlyTableDraftNow = async (gridOverride = null) => {
      const {
        enabled: on,
        groupPayrollUi: groupUi,
        captureScope: scope,
        draftBucket: bucket,
        payrollDraftServerSync: serverSync,
        selectedProcess: process,
        currencyId: cid,
        captureType: type,
      } = stateRef.current;
      if (!on || !bucket) return null;
      const processKey = resolvePayrollDraftProcessKey(process, groupUi);
      if (!processKey) {
        // Group payroll always expects a matched process; Games non-draft processes are no-ops.
        return groupUi ? false : null;
      }
      const currencyKey = normalizeGroupOnlyDraftCurrencyId(cid);
      if (!currencyKey) return false;

      const activeCaptureType = getBridgeCaptureType(type || "1.Text");
      const tableData = captureTableSnapshot(activeCaptureType, gridOverride ?? undefined);
      const payload = { tableData, captureType: activeCaptureType };
      const draftOptions = { captureScope: scope, flush: true, serverSync };

      if (tableSnapshotHasData(tableData)) {
        await saveGroupOnlyTableDraft(bucket, processKey, currencyKey, payload, draftOptions);
      } else {
        // Empty grid → permanently remove local + server draft for this process/currency.
        await clearGroupOnlyTableDraft(bucket, processKey, currencyKey, {
          captureScope: scope,
          serverSync,
        });
      }
      return true;
    };

    registerDataCaptureRuntime({ flushGroupOnlyTableDraftNow });
    return () => unregisterDataCaptureRuntime(["flushGroupOnlyTableDraftNow"]);
  }, []);
}
