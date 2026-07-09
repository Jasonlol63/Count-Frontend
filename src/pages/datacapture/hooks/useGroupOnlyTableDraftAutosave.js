import { useEffect, useLayoutEffect, useRef } from "react";
import { getBridgeCaptureType } from "../lib/dataCaptureBridge.js";
import {
  normalizeGroupOnlyDraftCurrencyId,
  saveGroupOnlyTableDraft,
} from "../lib/dataCaptureGroupOnlyTableDraft.js";
import { isGroupOnlyProcessId } from "../lib/dataCaptureGroupOnlyProcesses.js";
import { captureTableSnapshot } from "../lib/dataCaptureTableSnapshot.js";
import { getDataCaptureState } from "../lib/dataCaptureRuntime.js";
import { useDataCaptureContext } from "../context/DataCaptureContext.jsx";

/**
 * Debounced server sync when the group-only capture grid changes.
 * Only reacts to grid edits — not process/currency selection alone.
 */
export function useGroupOnlyTableDraftAutosave({
  enabled,
  captureScope,
  selectedGroup,
  selectedProcessId,
  currencyId,
  captureType,
}) {
  const { gridVersion } = useDataCaptureContext();
  const processIdRef = useRef(selectedProcessId);
  const currencyIdRef = useRef(currencyId);
  const skipAfterRestoreRef = useRef(false);

  processIdRef.current = selectedProcessId;
  currencyIdRef.current = currencyId;

  useLayoutEffect(() => {
    skipAfterRestoreRef.current = true;
  }, [selectedProcessId, currencyId]);

  useEffect(() => {
    if (!enabled || !selectedGroup || !processIdRef.current) return;
    if (!isGroupOnlyProcessId(processIdRef.current)) return;
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
      selectedGroup,
      processIdRef.current,
      cid,
      {
        tableData,
        captureType: activeCaptureType,
      },
      { captureScope },
    );
  }, [enabled, captureScope, selectedGroup, captureType, gridVersion, currencyId]);
}
