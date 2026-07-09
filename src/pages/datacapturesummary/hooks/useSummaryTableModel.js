import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";

import {
  buildInitialSummaryRows,
  populateSummaryRowsPure,
} from "../table/summaryTemplatePopulatePure.js";

import { bindSummaryFormulaContext } from "../lib/summaryFormulaContext.js";

import {
  consumePrefetchedAccounts,
  consumePrefetchedTemplates,
} from "../lib/summaryPrefetch.js";

import { useSummaryContext } from "../context/SummaryContext.jsx";

import { stripSummarySuccessParamFromUrl } from "../lib/summaryStorage.js";

import {
  saveSummaryRefreshStatePure,
  clearSummaryRefreshDraftStorage,
  loadSummarySessionSnapshotWithFallback,
  summaryRowsLookPopulated,
} from "../lib/summaryRefreshStatePure.js";

import { restoreRateValuesOnRows } from "../lib/summaryRefreshRestore.js";

import { mapRowsWithAmountRecalc } from "../table/summaryRowAmount.js";

import { pushSummaryNotification } from "../lib/summaryNotify.js";
import { resolveDataCaptureScopeFromSessionMeta } from "../../datacapture/lib/dataCaptureScope.js";

function readCaptureId() {
  try {
    const stored = localStorage.getItem("capturedCaptureId");
    if (stored != null && stored !== "") {
      const n = parseInt(stored, 10);
      if (!Number.isNaN(n) && n > 0) return n;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Pure React table populate — replaces useSummaryTablePopulate + legacy init.
 */
export function useSummaryTableModel({
  enabled,
  tableData,
  hasCaptureData,
  processId,
  processCode,
  processData,
  companyId,
  captureScope,
  freshFromCapture,
  serverState,
  serverStateLoading = false,
  serverStateQueryEnabled = false,
  searchParams,
  t,
}) {
  const { replaceRows, setDataPopulating, setAccounts, setTableChromeVisible, rows, dataPopulating } =
    useSummaryContext();

  const populateStartedRef = useRef(false);
  const populateChainRef = useRef(Promise.resolve());
  const repopulateAttemptRef = useRef(0);

  const processMeta = { processId, processCode };

  const snapshotScopeCandidates = useMemo(() => {
    const candidates = [];
    if (processData) {
      const fromMeta = resolveDataCaptureScopeFromSessionMeta(processData);
      if (fromMeta) candidates.push(fromMeta);
    }
    candidates.push(null);
    return candidates;
  }, [processData]);

  const executePopulate = useCallback(
    async () => {
      if (!enabled || !hasCaptureData || !tableData) return false;

      setDataPopulating(true);

      try {
        if (freshFromCapture) {
          clearSummaryRefreshDraftStorage(captureScope, processMeta);
        }

        bindSummaryFormulaContext({
          tableData,
          processData,
          processId,
          processCode,
          companyId,
          captureScope,
          serverState,
          freshFromCapture,
        });

        const accounts = await consumePrefetchedAccounts(captureScope);

        if (!freshFromCapture) {
          const snapshot = loadSummarySessionSnapshotWithFallback(
            captureScope,
            processMeta,
            snapshotScopeCandidates,
          );
          if (snapshot?.rows?.length) {
            let restoredRows = restoreRateValuesOnRows(snapshot.rows, captureScope);
            restoredRows = mapRowsWithAmountRecalc(restoredRows);
            setAccounts(accounts);
            replaceRows(restoredRows);
            saveSummaryRefreshStatePure(restoredRows, processMeta, captureScope);
            setTableChromeVisible(true);
            document.body.classList.add("page-ready");
            return true;
          }
        }

        const captureId = readCaptureId();
        const populatedRows = await populateSummaryRowsPure({
          tableData,
          processId,
          processCode,
          companyId,
          captureScope,
          captureId,
          serverState,
          freshFromCapture,
          loadTemplates: () =>
            consumePrefetchedTemplates({
              captureScope,
              companyId,
              processId,
              tableData,
              captureId,
            }),
        });

        setAccounts(accounts);
        replaceRows(populatedRows);

        if (summaryRowsLookPopulated(populatedRows)) {
          saveSummaryRefreshStatePure(populatedRows, processMeta, captureScope);
        }

        setTableChromeVisible(true);

        document.body.classList.add("page-ready");

        if (freshFromCapture && searchParams?.get("success") === "1") {
          stripSummarySuccessParamFromUrl();
        }

        return summaryRowsLookPopulated(populatedRows);
      } catch (error) {
        console.error("Pure summary populate failed:", error);

        pushSummaryNotification(
          t?.("error") || "Error",
          error?.message || t?.("loadPageFailed") || "Failed to load summary table.",
          "error"
        );
        return false;
      } finally {
        setDataPopulating(false);
      }
    },
    [
      enabled,
      hasCaptureData,
      tableData,
      processId,
      processCode,
      processData,
      companyId,
      captureScope,
      freshFromCapture,
      serverState,
      searchParams,
      t,
      replaceRows,
      setAccounts,
      setDataPopulating,
      setTableChromeVisible,
      snapshotScopeCandidates,
    ]
  );

  const runPopulate = useCallback(() => {
    const task = populateChainRef.current.then(() => executePopulate());
    populateChainRef.current = task.catch(() => {});
    return task;
  }, [executePopulate]);

  useLayoutEffect(() => {
    if (!enabled || !hasCaptureData || !tableData) return;
    if (!freshFromCapture && serverStateQueryEnabled && serverStateLoading) return;
    if (populateStartedRef.current) return;

    populateStartedRef.current = true;

    const skeletonRows = buildInitialSummaryRows(tableData);
    if (skeletonRows.length) {
      replaceRows(skeletonRows);
    }
    setTableChromeVisible(true);

    void runPopulate();
  }, [
    enabled,
    hasCaptureData,
    tableData,
    freshFromCapture,
    serverStateQueryEnabled,
    serverStateLoading,
    runPopulate,
    replaceRows,
    setTableChromeVisible,
  ]);

  useEffect(() => {
    if (!enabled || !hasCaptureData || !tableData || dataPopulating) return;
    if (summaryRowsLookPopulated(rows)) return;
    if (!freshFromCapture && serverStateQueryEnabled && serverStateLoading) return;
    if (repopulateAttemptRef.current >= 3) return;

    const timer = window.setTimeout(() => {
      repopulateAttemptRef.current += 1;
      void runPopulate();
    }, 120);

    return () => window.clearTimeout(timer);
  }, [
    enabled,
    hasCaptureData,
    tableData,
    dataPopulating,
    rows,
    freshFromCapture,
    serverStateQueryEnabled,
    serverStateLoading,
    runPopulate,
  ]);

  return { runPopulate };
}
