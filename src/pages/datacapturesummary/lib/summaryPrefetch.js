import { buildColumnAEntries } from "../table/summaryColumnAData.js";
import { isGroupPayrollProcessId } from "../../datacapture/lib/dataCaptureGroupOnlyProcesses.js";
import { fetchSummaryAccountList, fetchSummaryTemplates } from "./summaryApi.js";

const inflight = new Map();

function accountsKey(captureScope) {
  const mode = captureScope?.mode ?? "";
  const cid = captureScope?.scopeCompanyId ?? "";
  const gid = captureScope?.groupId ?? "";
  return `accounts:${mode}:${cid}:${gid}`;
}

function templatesKey(companyId, processKey, idProducts) {
  const sorted = [...idProducts].sort().join("|");
  return `templates:${companyId}:${processKey}:${sorted}`;
}

function resolveProcessPrefetchKey(processId, processCode = "") {
  if (processId != null && processId !== "" && Number(processId) > 0) {
    return String(Number(processId));
  }
  const code = String(processCode || processId || "")
    .trim()
    .toUpperCase();
  if (code && isGroupPayrollProcessId(code)) return `code:${code}`;
  if (processId != null && processId !== "") return String(processId);
  return null;
}

function takeInflight(key) {
  const pending = inflight.get(key);
  if (!pending) return null;
  inflight.delete(key);
  return pending;
}

/** Warm summary populate APIs during Data Capture submit (before navigation). */
export function prefetchSummaryPopulateData({
  captureScope,
  companyId,
  processId,
  processCode = "",
  tableData,
}) {
  if (!captureScope || !tableData) return;

  const accKey = accountsKey(captureScope);
  if (!inflight.has(accKey)) {
    inflight.set(accKey, fetchSummaryAccountList(captureScope));
  }

  const { idProducts } = buildColumnAEntries(tableData);
  const processKey = resolveProcessPrefetchKey(processId, processCode);
  if (processKey == null || !idProducts.length) return;

  const tplKey = templatesKey(companyId, processKey, idProducts);
  if (!inflight.has(tplKey)) {
    const code = String(processCode || "").trim().toUpperCase();
    inflight.set(
      tplKey,
      fetchSummaryTemplates({
        captureScope,
        companyId,
        idProducts,
        processId,
        processCode: code || (isGroupPayrollProcessId(processId) ? String(processId).toUpperCase() : ""),
      }),
    );
  }
}

export function consumePrefetchedAccounts(captureScope) {
  const pending = takeInflight(accountsKey(captureScope));
  return pending ?? fetchSummaryAccountList(captureScope);
}

export function consumePrefetchedTemplates({
  captureScope,
  companyId,
  processId,
  processCode = "",
  tableData,
  captureId = null,
}) {
  const { idProducts } = buildColumnAEntries(tableData);
  const code = String(processCode || "").trim().toUpperCase();
  const processKey = resolveProcessPrefetchKey(processId, code);
  if (processKey == null || !idProducts.length) {
    return Promise.resolve({ templates: {}, subsByParent: null, diagnostics: null });
  }

  const pending = takeInflight(templatesKey(companyId, processKey, idProducts));
  if (pending) return pending;

  return fetchSummaryTemplates({
    captureScope,
    companyId,
    idProducts,
    processId,
    processCode: code || (isGroupPayrollProcessId(processId) ? String(processId).toUpperCase() : ""),
    captureId,
  });
}
