import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import {
  resolveCompanyPermissions,
  isBankOnlyCategoryCompany,
} from "../shared/maintenanceCompanyApi.js";
import { fetchProcessListByTenantId } from "../../processlist/processListApi.js";
import { fetchProcesses as fetchDomainReportProcesses } from "../../report/domain/domainReportApi.js";
import { mapGroupPayrollProcesses } from "../../datacapture/lib/dataCaptureGroupOnlyProcesses.js";
import { syncCompanySessionApi } from "../../../utils/company/companySessionSync.js";
import { formatSpringDateTimeToDmy } from "../shared/maintenanceDateHelpers.js";
import {
  pickDefaultSubsidiaryForGroup,
  pickGroupAnchorCompany,
} from "../../../utils/company/sharedCompanyFilter.js";
import { notifyCompanySessionUpdated } from "../../../utils/company/companySessionEvents.js";
import { transactionMaintenanceUsesGroupProcesses } from "./transactionMaintenanceScope.js";

function isFetchAbortError(err, signal) {
  if (signal?.aborted) return true;
  if (err?.name === "AbortError") return true;
  return false;
}

function rethrowIfAborted(err, signal) {
  if (!isFetchAbortError(err, signal)) return;
  if (err?.name === "AbortError") throw err;
  throw new DOMException("The operation was aborted.", "AbortError");
}

function isMaintenanceTransferError(err) {
  if (err?.isMaintenanceTransfer) return true;
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network error") ||
    msg.includes("load failed") ||
    msg.includes("http2") ||
    msg.includes("quic") ||
    msg.includes("err_quic") ||
    msg.includes("incomplete") ||
    msg.includes("unexpected end")
  );
}

function throwMaintenanceTransferError(message = "Failed to fetch") {
  const err = new Error(message);
  err.isMaintenanceTransfer = true;
  throw err;
}

export function fetchCompanyPermissions(companyCode, { hasGame = false, hasBank = false } = {}) {
  return resolveCompanyPermissions({ companyCode, hasGame, hasBank });
}

export { isBankOnlyCategoryCompany };

/** ProcessSelect rows: { id, process_name, description }. */
export function mapProcessesForMaintenanceSelect(apiList) {
  return (Array.isArray(apiList) ? apiList : []).map((row) => {
    const processName = String(
      row.process_name ?? row.process ?? row.process_id ?? "",
    ).trim();
    return {
      id: row.id,
      process_name: processName,
      description: row.description ?? null,
    };
  });
}

export async function fetchProcesses(companyId, scope = null) {
  const payrollChannel = Boolean(scope?.c168Channel || scope?.companyPayrollChannel);
  if (payrollChannel) {
    return [
      { id: "PROFIT", process_name: "PROFIT", description: null },
      { id: "SALARY", process_name: "SALARY", description: null },
      { id: "COMMISSION", process_name: "COMMISSION", description: null },
      { id: "BONUS", process_name: "BONUS", description: null },
    ];
  }
  if (scope && transactionMaintenanceUsesGroupProcesses(scope) && !payrollChannel) {
    const apiList = await fetchDomainReportProcesses(scope, { credentials: "include" });
    return mapProcessesForMaintenanceSelect(mapGroupPayrollProcesses(apiList));
  }
  const effectiveId = scope?.scopeCompanyId ?? companyId;
  const tid = Number(effectiveId);
  if (!Number.isFinite(tid) || tid <= 0) return [];
  const rows = await fetchProcessListByTenantId(tid);
  return mapProcessesForMaintenanceSelect(rows);
}

/**
 * "Bank" for C168 / bank-only payroll companies AND pure Group mode — group payroll submissions
 * (SALARY/COMMISSION/BONUS/PROFIT) always land under category BANK, same tenant as GAME data.
 * Mirrors `transactionMaintenanceUsesGroupProcesses` exactly (same three conditions) so the process
 * dropdown and the actual list-request category filter never disagree.
 * "Games" otherwise — category is a required hard filter server-side.
 */
function resolveTransactionMaintenanceCategory(scope) {
  return transactionMaintenanceUsesGroupProcesses(scope) ? "Bank" : "Games";
}

/**
 * Numeric tenant id(s) for transaction maintenance list.
 * Group entity + subsidiary company share one Spring tenant row; "aggregate" (Groups All / Group All) spans several.
 * Pure Group scope's `scope.scopeCompanyId` is already resolved to the group's real entity tenantId by
 * `resolveCustomerReportScope` (reportScope.js) — transaction maintenance has no separate group-only resolution path.
 */
function resolveTransactionMaintenanceTenantIds({ scope } = {}) {
  if (scope?.mode === "aggregate") {
    const ids = Array.isArray(scope.mergeCompanyIds) ? scope.mergeCompanyIds : [];
    return ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
  }
  const tid = Number(scope?.scopeCompanyId);
  if (Number.isFinite(tid) && tid > 0) return [tid];
  return [];
}

/** Select All 误传占位文案时视为未选 Process。 */
export function normalizeMaintenanceProcessFilter(process) {
  const raw = String(process ?? "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (
    lower === "select all" ||
    lower === "--select all--" ||
    raw === "全部" ||
    raw === "--全部--"
  ) {
    return "";
  }
  return raw;
}

function renumberMaintenanceRows(rows) {
  rows.forEach((row, index) => {
    row.no = index + 1;
  });
  return rows;
}

/** Client-side text filter across visible columns (`q` is not sent to the backend — matches Spring's full-range single fetch). */
export function filterTransactionMaintenanceRowsBySearch(rows, searchTerm) {
  const q = String(searchTerm || "").trim().toUpperCase();
  const list = Array.isArray(rows) ? rows : [];
  if (!q) return list;
  const fields = [
    "process",
    "id_product",
    "account",
    "description",
    "remark",
    "currency",
    "rate",
    "cr",
    "dr",
    "percent",
    "created_by",
    "deleted_by",
    "dts_created",
    "dts_deleted",
  ];
  const filtered = list
    .filter((row) =>
      fields.some((field) => {
        const value = String(row?.[field] ?? "").toUpperCase();
        return value !== "" && value.includes(q);
      }),
    )
    .map((row) => ({ ...row }));
  return renumberMaintenanceRows(filtered);
}

/** Spring `MaintenanceTransactionDTO` row (one row per `data_capture_line`) → legacy grid row shape. */
function normalizeSpringTransactionMaintenanceRow(row, tenantId) {
  return {
    transaction_id: Number(row?.id) || 0,
    dts_created: formatSpringDateTimeToDmy(row?.dtsCreated),
    process: row?.process ?? "",
    id_product: row?.idProduct ?? "",
    account: row?.account ?? "",
    description: row?.description ?? "",
    remark: row?.remark ?? "",
    percent: row?.percent ?? "",
    currency: row?.currency ?? "",
    rate: row?.rate ?? "",
    cr: row?.cr ?? 0,
    dr: row?.dr ?? 0,
    created_by: row?.createdBy ?? "",
    is_deleted: row?.deleted === true,
    deleted_by: row?.deletedBy ?? "",
    dts_deleted: formatSpringDateTimeToDmy(row?.deletedAt),
    _tenant_id: tenantId,
    _dts_created_raw: String(row?.dtsCreated ?? ""),
  };
}

/** Global sort across (possibly several, aggregate-merged) tenants: dtsCreated desc, id desc — mirrors backend TC_ROW_ORDER. */
function compareTransactionMaintenanceRows(a, b) {
  const cmp = String(b._dts_created_raw || "").localeCompare(String(a._dts_created_raw || ""));
  if (cmp !== 0) return cmp;
  return Number(b.transaction_id || 0) - Number(a.transaction_id || 0);
}

async function fetchTransactionMaintenanceOnce({ tenantId, dateFrom, dateTo, process, category, signal }) {
  const request = {
    tenantId,
    dateFrom,
    dateTo,
    process: process || null,
    category,
    q: null,
  };
  let response;
  try {
    response = await fetch(buildApiUrl("api/maintenance/transaction-maintenance/list"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
      cache: "no-store",
    });
  } catch (err) {
    rethrowIfAborted(err, signal);
    if (isMaintenanceTransferError(err)) throw err;
    throwMaintenanceTransferError(err?.message || "Failed to fetch");
  }

  let data;
  try {
    data = await response.json();
  } catch {
    if (!response.ok) {
      const status = response.status || 0;
      if (status >= 500 || status === 0 || status === 413 || status === 524) {
        throwMaintenanceTransferError("Failed to fetch");
      }
      throw new Error(`HTTP ${status}`);
    }
    throwMaintenanceTransferError("Failed to fetch");
  }

  if (!response.ok || !data.success) {
    const detail = data.error || data.message;
    const status = response.status || 0;
    if (!detail && (status >= 500 || status === 0 || status === 413 || status === 524)) {
      throwMaintenanceTransferError("Failed to fetch");
    }
    throw new Error(detail || `HTTP ${status}`);
  }

  return Array.isArray(data.data) ? data.data : [];
}

/**
 * Search transaction maintenance data — one Spring call per resolved tenant (aggregate scope loops + merges).
 * @param {AbortSignal} [opts.signal]
 * @param {(rows: object[]) => void} [opts.onProgress] fires once per completed tenant (aggregate scope), or once overall
 */
export async function searchTransactionData({
  dateFrom,
  dateTo,
  process,
  scope,
  signal,
  onFirstPage,
  onProgress,
}) {
  const processFilter = normalizeMaintenanceProcessFilter(process);
  const category = resolveTransactionMaintenanceCategory(scope);
  const emitProgress = (rows) => {
    if (typeof onProgress === "function") onProgress(rows);
    else if (typeof onFirstPage === "function") onFirstPage(rows);
  };

  const tenantIds = resolveTransactionMaintenanceTenantIds({ scope });
  if (tenantIds.length === 0) return [];

  let merged = [];
  for (const tenantId of tenantIds) {
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    const rows = await fetchTransactionMaintenanceOnce({
      tenantId,
      dateFrom,
      dateTo,
      process: processFilter,
      category,
      signal,
    });
    const normalizedPart = rows.map((row) => normalizeSpringTransactionMaintenanceRow(row, tenantId));
    if (!normalizedPart.length) continue;
    merged = merged.concat(normalizedPart).sort(compareTransactionMaintenanceRows);
    emitProgress(renumberMaintenanceRows([...merged]));
  }
  return renumberMaintenanceRows(merged);
}

export async function updateSessionCompany(companyId) {
  const json = await syncCompanySessionApi(companyId);
  if (!json?.success) {
    throw new Error(json?.message || "Failed to update session company");
  }
  return json.data;
}

/** Group-only: sync anchor subsidiary + view_group before maintenance search APIs run. */
export async function syncTransactionMaintenanceGroupAnchorSession(
  companies,
  groupId,
  sessionCompanyId = null,
  options = {},
) {
  const { notify = true } = options;
  const g = groupId ? String(groupId).trim().toUpperCase() : "";
  if (!g) return false;
  const anchor =
    pickDefaultSubsidiaryForGroup(companies, g, {
      preferredCompanyId: sessionCompanyId,
    }) ?? pickGroupAnchorCompany(companies, g);
  const id = anchor?.id != null ? Number(anchor.id) : Number.NaN;
  if (!Number.isFinite(id) || id <= 0) return false;
  const json = await syncCompanySessionApi(id, g);
  if (json?.success && notify) notifyCompanySessionUpdated();
  return Boolean(json?.success);
}

export function isMaintenanceRecoverableError(err) {
  if (!err || err?.name === "AbortError") return false;
  return isMaintenanceTransferError(err);
}

export function getMaintenanceSearchUserMessage(
  err,
  { loadingMessage = "Loading data…", narrowRangeMessage = "Loading is taking longer. Try a shorter date range or select a Process." } = {},
) {
  if (!err || isMaintenanceRecoverableError(err)) {
    return loadingMessage;
  }
  const detail = String(err?.message || "").trim();
  return detail || narrowRangeMessage;
}

export function formatAmount(value) {
  if (value === null || value === undefined || value === '') return '-';
  const val = parseFloat(value);
  if (isNaN(val)) return '-';
  return val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
