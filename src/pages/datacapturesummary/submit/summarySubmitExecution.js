import { fetchGroupProcessIdByCode } from "../../datacapture/lib/dataCaptureApi.js";
import { normalizeGroupCaptureScope } from "../../datacapture/lib/dataCaptureScope.js";
import { isGroupLedgerCapture } from "../../../utils/company/c168CaptureChannel.js";
import { submitSummaryPayload, submitSummaryToSpring } from "../lib/summaryApi.js";
import { SUMMARY_SUBMIT_MAX_ROWS_PER_BATCH } from "./summarySubmitTotalPure.js";
import { pushSummaryNotification } from "../lib/summaryNotify.js";

const BATCH_SUCCESS_REDIRECT_MS = 2000;

function notify(title, message, type = "success") {
  pushSummaryNotification(title, message, type);
}

/**
 * Spring `lines[]` shape (`DataCaptureLineDTO`) from a {@link buildSubmitRowsFromModel} row.
 * Drops fields the Spring endpoint doesn't read (display-only text, batching bookkeeping) —
 * see docs/datacapture-spring-api.md §2.2 "Summary Submit（Spring）".
 */
function toSpringLine(row) {
  return {
    productType: row.productType === "sub" ? "SUB" : "MAIN",
    idProduct: row.idProduct || null,
    idProductMain: row.idProductMain || null,
    idProductSub: row.idProductSub || null,
    descriptionMain: row.descriptionMain || null,
    descriptionSub: row.descriptionSub || null,
    formulaVariant: row.formulaVariant != null ? Number(row.formulaVariant) : null,
    displayOrder: row.displayOrder != null ? Number(row.displayOrder) : null,
    accountId: row.accountId != null ? Number(row.accountId) : null,
    currencyId: row.currencyId != null ? Number(row.currencyId) : null,
    sourceColumns: row.sourceColumns || null,
    sourcePercent: row.sourcePercent || null,
    enableSourcePercent: Number(row.enableSourcePercent) === 1,
    formula: row.formula || null,
    processedAmount: row.processedAmount != null ? String(row.processedAmount) : null,
    rateValue: row.rateValue || null,
  };
}

/** Spring header envelope (`DataCaptureSummarySubmitDTO`) — tenantId is the plain numeric tenant.id. */
function buildSpringSubmitEnvelope(processData, summaryRows, tenantId) {
  return {
    tenantId,
    category: processData?.category || null,
    processId: processData?.process != null ? Number(processData.process) : null,
    processCode: processData?.processCode || processData?.process_code || "",
    captureDate: processData?.date,
    currencyId: processData?.currency != null ? Number(processData.currency) : null,
    remark: processData?.remark || "",
    removeWord: processData?.removeWord || "",
    replaceWordFrom: processData?.replaceWordFrom || "",
    replaceWordTo: processData?.replaceWordTo || "",
    lines: summaryRows.map(toSpringLine),
  };
}

/* ---- Legacy AP/IG group-ledger path (still PHP — get_group_process_id not yet on Spring) ---- */

function buildLegacySummarySubmitPayload(processData, summaryRows) {
  if (!processData) return null;
  const groupPayrollCapture = processData.groupPayrollCapture === true;
  const groupLedger = processData.groupOnlyCapture === true && !groupPayrollCapture;
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
    captureSelectedGroup:
      groupLedger || groupPayrollCapture
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

async function executeLegacyGroupLedgerSubmit({
  effectiveScope,
  companyId,
  parsedProcessData,
  summaryRows,
  onProgress,
  onSuccess,
}) {
  const baseDataRaw = buildLegacySummarySubmitPayload(parsedProcessData, summaryRows);
  const baseData = await ensureGroupSubmitProcessId(effectiveScope, parsedProcessData, baseDataRaw);
  if (!baseData) {
    return { ok: false, message: "No process data found. Please return to Data Capture page." };
  }

  const isGroup = isGroupLedgerCapture(effectiveScope, baseData);
  let finalCaptureId = null;
  const batchSize = Math.max(1, Math.min(SUMMARY_SUBMIT_MAX_ROWS_PER_BATCH, summaryRows.length));
  const totalBatches = Math.ceil(summaryRows.length / batchSize);

  for (let i = 0; i < summaryRows.length; i += batchSize) {
    const batchRows = summaryRows.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    onProgress?.({ batchNumber, totalBatches });

    const payload = {
      ...baseData,
      summaryRows: batchRows,
      company_id: isGroup ? null : (effectiveScope?.scopeCompanyId ?? null),
    };
    if (finalCaptureId != null) {
      payload.captureId = finalCaptureId;
    }

    const result = await submitSummaryPayload(effectiveScope, payload);
    if (!result?.success) {
      return {
        ok: false,
        message: result?.message || `Submission failed (batch ${batchNumber}/${totalBatches})`,
      };
    }
    finalCaptureId = result.captureId ?? finalCaptureId;
  }

  if (!finalCaptureId) {
    return { ok: false, message: "Submission did not return a capture ID." };
  }

  notify("Success", `All data submitted successfully! Capture ID: ${finalCaptureId}, total ${summaryRows.length} rows`, "success");
  await new Promise((resolve) => window.setTimeout(resolve, BATCH_SUCCESS_REDIRECT_MS));
  onSuccess?.({ mode: "legacy-group-ledger", captureId: finalCaptureId });
  return { ok: true, mode: "legacy-group-ledger", captureId: finalCaptureId };
}

/* ---- Spring path (Games / Bank, company-scope — the common case) ---- */

async function executeSpringSubmit({ tenantId, parsedProcessData, summaryRows, onProgress, onSuccess }) {
  const payload = buildSpringSubmitEnvelope(parsedProcessData, summaryRows, tenantId);

  onProgress?.({ batchNumber: 1, totalBatches: 1 });

  let result;
  try {
    result = await submitSummaryToSpring(payload);
  } catch (error) {
    return { ok: false, message: error?.message || "Submission failed" };
  }

  const captureId = result?.data?.captureId ?? null;
  if (!captureId) {
    return { ok: false, message: "Submission did not return a capture ID." };
  }

  notify("Success", `All data submitted successfully! Capture ID: ${captureId}, total ${summaryRows.length} rows`, "success");
  await new Promise((resolve) => window.setTimeout(resolve, BATCH_SUCCESS_REDIRECT_MS));
  onSuccess?.({ mode: "spring", captureId });
  return { ok: true, mode: "spring", captureId };
}

/**
 * React-owned summary submit execution.
 * Games / Bank company-scope submits go to the Spring `POST /api/datacapture-summary/submit`
 * (single request, one DB transaction). True AP/IG group-ledger submits still resolve their
 * process id via the PHP `get_group_process_id` endpoint, so they keep using the legacy
 * PHP submit + batching path until that resolver is migrated (see
 * docs/datacapture-spring-api.md §4).
 */
export async function executeSummarySubmit({
  captureScope,
  companyId,
  parsedProcessData,
  summaryRows,
  onProgress,
  onSuccess,
}) {
  if (!parsedProcessData) {
    return { ok: false, message: "No process data found. Please return to Data Capture page." };
  }

  const effectiveScope = normalizeGroupCaptureScope(captureScope, parsedProcessData);

  if (isGroupLedgerCapture(effectiveScope, parsedProcessData)) {
    return executeLegacyGroupLedgerSubmit({
      effectiveScope,
      companyId,
      parsedProcessData,
      summaryRows,
      onProgress,
      onSuccess,
    });
  }

  const tenantId =
    parsedProcessData.tenantId != null && Number(parsedProcessData.tenantId) > 0
      ? Number(parsedProcessData.tenantId)
      : effectiveScope?.scopeCompanyId != null && Number(effectiveScope.scopeCompanyId) > 0
        ? Number(effectiveScope.scopeCompanyId)
        : Number(companyId) > 0
          ? Number(companyId)
          : null;

  if (!tenantId) {
    return { ok: false, message: "Missing tenant id for submit." };
  }

  return executeSpringSubmit({ tenantId, parsedProcessData, summaryRows, onProgress, onSuccess });
}
