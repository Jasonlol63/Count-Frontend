import { useLayoutEffect, useRef } from "react";
import { getBridgeCaptureType } from "../lib/dataCaptureBridge.js";
import {
  clearGroupOnlyTableDraft,
  normalizeGroupOnlyDraftCurrencyId,
  saveGroupOnlyTableDraft,
} from "../lib/dataCaptureGroupOnlyTableDraft.js";
import { isGroupOnlyProcessId } from "../lib/dataCaptureGroupOnlyProcesses.js";
import { captureTableSnapshot, tableSnapshotHasData } from "../lib/dataCaptureTableSnapshot.js";
import { registerDataCaptureRuntime, unregisterDataCaptureRuntime } from "../lib/dataCaptureRuntime.js";

/**
 * Registers immediate group-only draft sync after row-data delete (server + localStorage).
 */
export function useGroupOnlyTableDraftFlush({
  enabled,
  captureScope,
  selectedGroup,
  selectedProcessId,
  currencyId,
  captureType,
}) {
  const stateRef = useRef({
    enabled,
    captureScope,
    selectedGroup,
    selectedProcessId,
    currencyId,
    captureType,
  });
  stateRef.current = {
    enabled,
    captureScope,
    selectedGroup,
    selectedProcessId,
    currencyId,
    captureType,
  };

  useLayoutEffect(() => {
    const flushGroupOnlyTableDraftNow = async (gridOverride = null) => {
      const {
        enabled: on,
        captureScope: scope,
        selectedGroup: groupId,
        selectedProcessId: processId,
        currencyId: cid,
        captureType: type,
      } = stateRef.current;
      if (!on || !groupId || !isGroupOnlyProcessId(processId)) return false;
      const currencyKey = normalizeGroupOnlyDraftCurrencyId(cid);
      if (!currencyKey) return false;

      const activeCaptureType = getBridgeCaptureType(type || "1.Text");
      const tableData = captureTableSnapshot(activeCaptureType, gridOverride ?? undefined);
      const payload = { tableData, captureType: activeCaptureType };

      if (tableSnapshotHasData(tableData)) {
        await saveGroupOnlyTableDraft(groupId, processId, currencyKey, payload, {
          captureScope: scope,
          flush: true,
        });
      } else {
        await clearGroupOnlyTableDraft(groupId, processId, currencyKey, { captureScope: scope });
      }
      return true;
    };

    registerDataCaptureRuntime({ flushGroupOnlyTableDraftNow });
    return () => unregisterDataCaptureRuntime(["flushGroupOnlyTableDraftNow"]);
  }, []);
}
