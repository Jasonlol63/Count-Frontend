import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { appendDataCaptureScopeParams, fetchGroupProcessIdByCode } from "../../datacapture/lib/dataCaptureApi.js";
import { normalizeGroupCaptureScope } from "../../datacapture/lib/dataCaptureScope.js";
import { isGroupLedgerCapture } from "../../../utils/company/c168CaptureChannel.js";
import { submitSummaryPayload } from "../lib/summaryApi.js";
import { SUMMARY_SUBMIT_MAX_ROWS_PER_BATCH } from "./summarySubmitTotalPure.js";
import { pushSummaryNotification } from "../lib/summaryNotify.js";

function buildSummarySubmitPayload(processData, summaryRows) {
  if (!processData) return null;
  const groupPayrollCapture = processData.groupPayrollCapture === true;
  const groupLedger =
    processData.groupOnlyCapture === true && !groupPayrollCapture;
  return {
    captureDate: processData.date,
    processId: processData.process,
    processName: processData.processName,
    processCode: processData.processCode || processData.process_code || "",
    currencyId: processData.currency,
    currencyName: processData.currencyName,
    remark: processData.remark || "",
    groupPayrollUi: processData.groupPayrollUi === true || groupLedger || groupPayrollCapture,
    groupPayrollCapture,
    groupOnlyCapture: groupLedger,
    captureSelectedGroup: groupLedger || groupPayrollCapture
      ? String(processData.captureSelectedGroup || "").trim().toUpperCase()
      : undefined,
    captureScopeMode: groupLedger ? "group" : "company",
    scopeCompanyId:
      processData.scopeCompanyId != null && Number(processData.scopeCompanyId) > 0
        ? Number(processData.scopeCompanyId)
        : undefined,
    summaryRows: Array.isArray(summaryRows) ? summaryRows : [],
  };
}

const BATCH_DELAY_MS = 300;
const QUICK_SUBMIT_REDIRECT_MS = 600;
const BATCH_SUCCESS_REDIRECT_MS = 2000;

function notify(title, message, type = "success") {
  pushSummaryNotification(title, message, type);
}

async function ensureGroupSubmitProcessId(effectiveScope, parsedProcessData, baseData) {
  if (!baseData || !isGroupLedgerCapture(effectiveScope, parsedProcessData)) return baseData;

  const processCode = String(
    parsedProcessData?.processCode ||
      parsedProcessData?.process_code ||
      parsedProcessData?.processName ||
      parsedProcessData?.process_name ||
      parsedProcessData?.process ||
      "",
  )
    .trim()
    .toUpperCase();

  if (!processCode) {
    throw new Error("Missing process code for group submit");
  }

  const resolvedProcessId = await fetchGroupProcessIdByCode(
    effectiveScope,
    processCode,
    parsedProcessData?.currency,
  );

  return {
    ...baseData,
    processId: resolvedProcessId,
    processName: processCode,
  };
}

async function postSubmitBatch(captureScope, batchData, options = {}) {
  const isGroup = isGroupLedgerCapture(captureScope, batchData);
  const payload = {
    ...batchData,
    immediateAck: options.immediateAck ? 1 : 0,
    company_id: isGroup ? null : (captureScope?.scopeCompanyId ?? null),
  };
  if (options.captureId != null) {
    payload.captureId = options.captureId;
  }

  return submitSummaryPayload(captureScope, payload);
}

async function recordSubmittedProcess(captureScope, parsedProcessData) {
  if (!parsedProcessData?.process) return;
  try {
    const formData = new FormData();
    formData.append("action", "save_submission");
    formData.append("process_id", parsedProcessData.process);
    const selectedDate =
      parsedProcessData.date ||
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
    formData.append("date_submitted", selectedDate);
    formData.append("capture_date", selectedDate);
    const scopeParams = new URLSearchParams();
    appendDataCaptureScopeParams(scopeParams, captureScope);
    scopeParams.forEach((value, key) => {
      formData.append(key, value);
    });
    await fetch(buildApiUrl("api/processes/submitted_processes_api.php"), {
      method: "POST",
      body: formData,
      credentials: "include",
    });
  } catch (error) {
    console.warn("Failed to record submitted process:", error);
  }
}

function verifySubmitPayload(submitData) {
  let jsonData;
  try {
    jsonData = JSON.stringify(submitData);
  } catch (error) {
    return {
      ok: false,
      message: `Data serialization failed: ${error.message}. The data may be too large or contain circular references.`,
    };
  }
  if (!jsonData) {
    return { ok: false, message: "The data is empty after serialization. Please check whether the data is correct." };
  }
  try {
    JSON.parse(jsonData);
  } catch (error) {
    return { ok: false, message: `Failed to verify data after serialization: ${error.message}` };
  }
  return { ok: true, jsonData };
}

/**
 * React-owned summary submit execution (batching + quick-ack fallback).
 */
export async function executeSummarySubmit({
  captureScope,
  companyId,
  parsedProcessData,
  summaryRows,
  onProgress,
  onSuccess,
}) {
  const effectiveScope = normalizeGroupCaptureScope(captureScope, parsedProcessData);
  const baseDataRaw = buildSummarySubmitPayload(parsedProcessData, summaryRows);
  const baseData = await ensureGroupSubmitProcessId(
    effectiveScope,
    parsedProcessData,
    baseDataRaw,
  );
  if (!baseData) {
    return { ok: false, message: "No process data found. Please return to Data Capture page." };
  }

  const verify = verifySubmitPayload(baseData);
  if (!verify.ok) {
    return { ok: false, message: verify.message };
  }

  const submitBatch = async (batchData, captureId, batchNumber, totalBatches, options = {}) => {
    onProgress?.({ batchNumber, totalBatches });
    return postSubmitBatch(effectiveScope, batchData, {
      captureId,
      immediateAck: options.immediateAck,
    });
  };

  try {
    const quickResult = await submitBatch(baseData, null, 1, 1, { immediateAck: true });
    if (quickResult?.success && quickResult.queued) {
      await recordSubmittedProcess(effectiveScope, {
        ...parsedProcessData,
        process: baseData.processId ?? parsedProcessData?.process,
        date: baseData.captureDate ?? parsedProcessData?.date,
      });
      notify("Success", "Data received by server. Processing in background...", "success");
      await new Promise((resolve) => window.setTimeout(resolve, QUICK_SUBMIT_REDIRECT_MS));
      onSuccess?.({ mode: "quick" });
      return { ok: true, mode: "quick" };
    }
  } catch (quickError) {
    console.warn("Immediate-ack submit failed, fallback to batched submit:", quickError);
  }

  let finalCaptureId = null;
  const failedProblemRows = [];
  const batchSize = Math.max(1, Math.min(SUMMARY_SUBMIT_MAX_ROWS_PER_BATCH, summaryRows.length));
  const totalBatches = Math.ceil(summaryRows.length / batchSize);

  async function submitWithBinarySplit(rows, batchData, batchNumber, total) {
    async function helper(subRows) {
      if (!subRows?.length) return;

      if (subRows.length === 1) {
        try {
          const result = await submitBatch({ ...batchData, summaryRows: subRows }, finalCaptureId, batchNumber, total);
          finalCaptureId = result.captureId ?? finalCaptureId;
        } catch (err) {
          failedProblemRows.push(subRows[0]);
          console.warn("Single row still failed, marking as problematic row:", { error: err, row: subRows[0] });
        }
        return;
      }

      try {
        const result = await submitBatch({ ...batchData, summaryRows: subRows }, finalCaptureId, batchNumber, total);
        finalCaptureId = result.captureId ?? finalCaptureId;
        return;
      } catch {
        const mid = Math.floor(subRows.length / 2);
        await helper(subRows.slice(0, mid));
        await helper(subRows.slice(mid));
      }
    }

    await helper(rows);
  }

  for (let i = 0; i < summaryRows.length; i += batchSize) {
    const batchRows = summaryRows.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const batchData = { ...baseData, summaryRows: batchRows };

    try {
      const result = await submitBatch(batchData, finalCaptureId, batchNumber, totalBatches);
      finalCaptureId = result.captureId ?? finalCaptureId;
      if (batchNumber < totalBatches) {
        await new Promise((resolve) => window.setTimeout(resolve, BATCH_DELAY_MS));
      }
    } catch (error) {
      if (error.isSizeError && batchRows.length > 1) {
        const halfSize = Math.max(1, Math.min(Math.floor(batchRows.length / 2), SUMMARY_SUBMIT_MAX_ROWS_PER_BATCH));
        for (let j = 0; j < batchRows.length; j += halfSize) {
          const smallerBatch = batchRows.slice(j, j + halfSize);
          const result = await submitBatch(
            { ...batchData, summaryRows: smallerBatch },
            finalCaptureId,
            batchNumber,
            totalBatches
          );
          finalCaptureId = result.captureId ?? finalCaptureId;
          if (j + halfSize < batchRows.length) {
            await new Promise((resolve) => window.setTimeout(resolve, BATCH_DELAY_MS));
          }
        }
      } else if (batchRows.length > 1) {
        console.warn(
          `Batch ${batchNumber}/${totalBatches} failed with non-size error. Splitting batch to locate problematic rows.`,
          error
        );
        await submitWithBinarySplit(batchRows, batchData, batchNumber, totalBatches);
      } else {
        failedProblemRows.push(batchRows[0]);
        let errorMessage = error.message || "Unknown error";
        if (error.status) {
          errorMessage = `Server error (${error.status}): ${errorMessage}`;
        }
        return {
          ok: false,
          message: `Submission failed (batch ${batchNumber}/${totalBatches}): ${errorMessage}`,
        };
      }
    }
  }

  if (!finalCaptureId) {
    return { ok: false, message: "Submission did not return a capture ID." };
  }

  try {
    localStorage.setItem("capturedCaptureId", String(finalCaptureId));
  } catch {
    /* ignore */
  }

  notify(
    "Success",
    `All data submitted successfully! Capture ID: ${finalCaptureId}, total ${summaryRows.length} rows`,
    "success"
  );

  await recordSubmittedProcess(effectiveScope, parsedProcessData);

  try {
    localStorage.removeItem("capturedCaptureId");
  } catch {
    /* ignore */
  }
  await new Promise((resolve) => window.setTimeout(resolve, BATCH_SUCCESS_REDIRECT_MS));
  onSuccess?.({ mode: "batched", captureId: finalCaptureId, failedProblemRows });
  return { ok: true, mode: "batched", captureId: finalCaptureId, failedProblemRows };
}
