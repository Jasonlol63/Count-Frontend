import { buildColumnAEntries } from "../table/summaryColumnAData.js";
import { fetchSummaryAccountList, fetchSummaryTemplates } from "./summaryApi.js";

const inflight = new Map();

function accountsKey(captureScope) {
  const mode = captureScope?.mode ?? "";
  const cid = captureScope?.scopeCompanyId ?? "";
  const gid = captureScope?.groupId ?? "";
  return `accounts:${mode}:${cid}:${gid}`;
}

function templatesKey(companyId, processId, idProducts) {
  const sorted = [...idProducts].sort().join("|");
  return `templates:${companyId}:${processId}:${sorted}`;
}

function takeInflight(key) {
  const pending = inflight.get(key);
  if (!pending) return null;
  inflight.delete(key);
  return pending;
}

/** Warm summary populate APIs during Data Capture submit (before navigation). */
export function prefetchSummaryPopulateData({ captureScope, companyId, processId, tableData }) {
  if (!captureScope || !tableData) return;

  const accKey = accountsKey(captureScope);
  if (!inflight.has(accKey)) {
    inflight.set(accKey, fetchSummaryAccountList(captureScope));
  }

  const { idProducts } = buildColumnAEntries(tableData);
  const pid = processId != null && processId !== "" ? processId : null;
  if (pid == null || !idProducts.length) return;

  const tplKey = templatesKey(companyId, pid, idProducts);
  if (!inflight.has(tplKey)) {
    inflight.set(
      tplKey,
      fetchSummaryTemplates({
        captureScope,
        companyId,
        idProducts,
        processId: pid,
      })
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
  tableData,
  captureId = null,
}) {
  const { idProducts } = buildColumnAEntries(tableData);
  const pid = processId != null && processId !== "" ? processId : null;
  if (pid == null || !idProducts.length) {
    return fetchSummaryTemplates({
      captureScope,
      companyId,
      idProducts,
      processId: pid,
      captureId,
    });
  }

  const pending = takeInflight(templatesKey(companyId, pid, idProducts));
  if (pending) return pending;

  return fetchSummaryTemplates({
    captureScope,
    companyId,
    idProducts,
    processId: pid,
    captureId,
  });
}
