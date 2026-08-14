import { useEffect, useLayoutEffect, useRef } from "react";
import { getBridgeCaptureType } from "../lib/dataCaptureBridge.js";
import {
  normalizeGroupOnlyDraftCurrencyId,
  saveGroupOnlyTableDraft,
} from "../lib/dataCaptureGroupOnlyTableDraft.js";
import { resolvePayrollDraftProcessKey } from "../lib/dataCaptureGamesPayrollProcesses.js";
import { captureTableSnapshot } from "../lib/dataCaptureTableSnapshot.js";
import { getDataCaptureState } from "../lib/dataCaptureRuntime.js";
import { useDataCaptureContext } from "../context/DataCaptureContext.jsx";

/**
 * Debounced server sync when the group-only / Games-payroll capture grid changes.
 * Only reacts to grid edits — not process/currency selection alone.
 */
export function useGroupOnlyTableDraftAutosave({
  enabled,
  groupPayrollUi = true,
  captureScope,
  draftBucket,
  payrollDraftServerSync = true,
  selectedProcess,
  currencyId,
  captureType,
}) {
  const { gridVersion } = useDataCaptureContext();
  const selectedProcessRef = useRef(selectedProcess);
  const currencyIdRef = useRef(currencyId);
  const skipAfterRestoreRef = useRef(false);

  selectedProcessRef.current = selectedProcess;
  currencyIdRef.current = currencyId;

  useLayoutEffect(() => {
    skipAfterRestoreRef.current = true;
  }, [selectedProcess?.id, currencyId, draftBucket]);

  useEffect(() => {
    if (!enabled || !draftBucket) return;
    const processKey = resolvePayrollDraftProcessKey(selectedProcessRef.current, groupPayrollUi);
    if (!processKey) return;
    const cid = normalizeGroupOnlyDraftCurrencyId(currencyIdRef.current);
    if (!cid) return;
    if (getDataCaptureState().isRestoring) {
      skipAfterRestoreRef.current = true;
      return;
    }
    try {
      if (new URLSearchParams(window.location.search).get("restore") === "1") return;
    } catch {
      /* ignore */
    }

    if (skipAfterRestoreRef.current) {
      skipAfterRestoreRef.current = false;
      return;
    }

    const activeCaptureType = getBridgeCaptureType(captureType || "1.Text");
    const tableData = captureTableSnapshot(activeCaptureType);
    saveGroupOnlyTableDraft(
      draftBucket,
      processKey,
      cid,
      {
        tableData,
        captureType: activeCaptureType,
      },
      { captureScope, serverSync: payrollDraftServerSync },
    );
  }, [enabled, groupPayrollUi, captureScope, draftBucket, payrollDraftServerSync, captureType, gridVersion, currencyId]);
}
