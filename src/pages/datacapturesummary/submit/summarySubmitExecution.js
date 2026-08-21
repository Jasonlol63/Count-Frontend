import { normalizeGroupCaptureScope } from "../../datacapture/lib/dataCaptureScope.js";
import { resolveDataCaptureEffectiveTenantId } from "../../datacapture/lib/dataCaptureTenant.js";
import { submitSummaryToSpring } from "../lib/summaryApi.js";
import { truncateProcessedAmountTo6Decimals } from "../table/summaryRowAmount.js";
import { pushSummaryNotification } from "../lib/summaryNotify.js";

/** Bank category channel always uses these fixed process codes (see useDataCaptureFormEngine BANK_PROCESSES). */
const BANK_PROCESS_CODES = new Set(["PROFIT", "SALARY", "COMMISSION", "BONUS"]);

function resolveSubmitCategory(processCode) {
  return BANK_PROCESS_CODES.has(String(processCode || "").trim().toUpperCase()) ? "BANK" : "GAME";
}

function toSpringLine(row) {
  return {
    productType: row.productType === "sub" ? "SUB" : "MAIN",
    idProduct: row.idProduct,
    accountId: row.accountId,
    currencyId: row.currencyId != null ? Number(row.currencyId) : null,
    sourcePercent: String(row.sourcePercent ?? "1"),
    enableSourcePercent: !!row.enableSourcePercent,
    formula: row.formula || "",
    processedAmount: truncateProcessedAmountTo6Decimals(row.processedAmount),
    rateValue: row.rateValue || null,
  };
}

function notify(title, message, type = "success") {
  pushSummaryNotification(title, message, type);
}

/**
 * Games / Bank company-scope submit (incl. C168 / bank-only payroll) — Spring,
 * one atomic transaction, no batching. See docs/datacapture-spring-api.md §2.8.
 * Since Phase 1/2 of the Group Spring migration this also covers every Group
 * scope (pure or with an anchor company) — `tenantId` resolves to the Group's
 * own `tenant.id` via `groupEntityTenantId`, and `processCode` fallback lets
 * the backend `ensureBankProcess` resolve/create the process row itself.
 */
async function executeSpringSubmit({ captureScope, companyId, parsedProcessData, summaryRows, onProgress, onSuccess }) {
  const tenantId = resolveDataCaptureEffectiveTenantId(captureScope, companyId);
  if (!tenantId) {
    return { ok: false, message: "tenantId is required" };
  }

  const rawProcess = parsedProcessData.process;
  const numericProcess =
    rawProcess != null && rawProcess !== "" && Number.isFinite(Number(rawProcess))
      ? Number(rawProcess)
      : null;
  const processCode = String(
    parsedProcessData.processCode ||
      parsedProcessData.process_code ||
      (numericProcess == null ? rawProcess : "") ||
      "",
  )
    .trim()
    .toUpperCase();

  const payload = {
    tenantId,
    category: resolveSubmitCategory(processCode),
    processId: numericProcess,
    processCode: numericProcess != null ? null : processCode || null,
    captureDate: parsedProcessData.date,
    currencyId: parsedProcessData.currency != null ? Number(parsedProcessData.currency) : null,
    remark: parsedProcessData.remark || "",
    removeWord: parsedProcessData.removeWord || "",
    replaceWordFrom: parsedProcessData.replaceWordFrom || "",
    replaceWordTo: parsedProcessData.replaceWordTo || "",
    lines: summaryRows.map(toSpringLine),
  };

  onProgress?.({ batchNumber: 1, totalBatches: 1 });

  let json;
  try {
    json = await submitSummaryToSpring(payload);
  } catch (err) {
    return { ok: false, message: err?.message || "Submission failed" };
  }

  const captureId = json?.data?.captureId ?? null;
  if (!captureId) {
    return { ok: false, message: "Submission did not return a capture ID." };
  }

  notify(
    "Success",
    `All data submitted successfully! Capture ID: ${captureId}, total ${summaryRows.length} rows`,
    "success"
  );
  onSuccess?.({ mode: "spring", captureId });
  return { ok: true, mode: "spring", captureId };
}

/**
 * React-owned summary submit execution. Every scope (Games/Bank company scope,
 * incl. C168 / bank-only payroll, and Group scope — pure or with subsidiaries)
 * submits via Spring in one shot; there is no PHP submit path left.
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
  return executeSpringSubmit({
    captureScope: effectiveScope,
    companyId,
    parsedProcessData,
    summaryRows,
    onProgress,
    onSuccess,
  });
}
