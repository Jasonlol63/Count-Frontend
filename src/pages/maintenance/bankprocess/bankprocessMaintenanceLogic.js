import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { fetchCurrencyListByTenantId, normalizeCurrencyRow } from "../../../utils/api/currencyApi.js";
import { syncCompanySessionApi } from "../../../utils/company/companySessionSync.js";
import { formatDmyFromDate, formatSpringDateTimeToDmy } from "../shared/maintenanceDateHelpers.js";

export function formatDmy(d) {
  return formatDmyFromDate(d);
}

export function formatAmount(value) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0.00";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function toUpperDisplay(value) {
  if (value === null || value === undefined) return "-";
  const str = String(value).trim();
  return str ? str.toUpperCase() : "-";
}

/** Rows already soft-deleted in Maintenance cannot be selected for delete. */
export function isBankprocessMaintenanceRowSelectable(row) {
  if (!row) return false;
  return !(row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true);
}

/**
 * One Post/Resend batch: same DTS Created + bank process + period type + transaction date.
 * Clicking any checkbox selects every selectable row in that batch.
 */
export function bankprocessMaintenanceBatchKey(row) {
  const ts = String(row?.dts_created ?? "").trim();
  const bpId = Number(row?.source_bank_process_id) || 0;
  const pt = String(row?.period_type ?? "monthly").trim().toLowerCase() || "monthly";
  const txDate = String(row?.date ?? "").trim();
  if (ts && bpId > 0) {
    return `${ts}|${bpId}|${pt}|${txDate}`;
  }
  if (ts) return ts;
  const tid = row?.transaction_id;
  return tid != null && tid !== "" ? `__tid_${tid}` : "";
}

/** @param {Array<{ transaction_id?: number, dts_created?: string, source_bank_process_id?: number, period_type?: string, date?: string, is_deleted?: unknown }>} rows */
export function bankprocessMaintenanceIdsInBatch(rows, batchKey) {
  if (!batchKey || !Array.isArray(rows)) return [];
  const ids = [];
  for (const row of rows) {
    if (!isBankprocessMaintenanceRowSelectable(row)) continue;
    if (bankprocessMaintenanceBatchKey(row) !== batchKey) continue;
    const tid = Number(row.transaction_id);
    if (Number.isFinite(tid) && tid > 0) ids.push(tid);
  }
  return ids;
}

/**
 * @param {number[]} selectedIds
 * @param {Array<{ transaction_id?: number, dts_created?: string, source_bank_process_id?: number, period_type?: string, date?: string, is_deleted?: unknown }>} rows
 * @param {number} clickedTransactionId
 */
export function toggleBankprocessMaintenanceBatchSelection(selectedIds, rows, clickedTransactionId) {
  const clickedId = Number(clickedTransactionId);
  if (!Number.isFinite(clickedId) || clickedId <= 0) return selectedIds;

  const clickedRow = rows.find((r) => Number(r.transaction_id) === clickedId);
  if (!clickedRow || !isBankprocessMaintenanceRowSelectable(clickedRow)) return selectedIds;

  const batchKey = bankprocessMaintenanceBatchKey(clickedRow);
  const batchIds = bankprocessMaintenanceIdsInBatch(rows, batchKey);
  if (batchIds.length === 0) return selectedIds;

  const prev = Array.isArray(selectedIds) ? selectedIds : [];
  const selecting = !prev.includes(clickedId);
  if (selecting) {
    const next = new Set(prev);
    batchIds.forEach((id) => next.add(id));
    return [...next];
  }
  return prev.filter((id) => !batchIds.includes(id));
}

function resolveBankprocessTenantId(companyId) {
  const tid = Number(companyId);
  return Number.isFinite(tid) && tid > 0 ? tid : null;
}

/** Bank Process Maintenance has no Group ledger — `companyId` (the UI pill id) is always the tenant. */
export async function fetchCompanyCurrencies(companyId) {
  const tenantId = resolveBankprocessTenantId(companyId);
  if (!tenantId) return [];
  const rows = await fetchCurrencyListByTenantId(tenantId);
  return rows
    .map((row) => normalizeCurrencyRow(row))
    .filter((row) => Number.isFinite(row.id) && row.id > 0 && String(row.code || "").trim());
}

/** Spring `MaintenanceBankProcessDTO` row → legacy grid row shape used by the table components. */
function normalizeBankprocessRow(row) {
  return {
    transaction_id: Number(row?.id) || 0,
    transaction_type: row?.transactionType ?? null,
    dts_created: formatSpringDateTimeToDmy(row?.createdAt),
    account: row?.toAccountCode ?? "",
    from_account: row?.fromAccountCode ?? "",
    amount: row?.amount ?? 0,
    currency: row?.currencyCode ?? "",
    description: row?.description ?? "",
    remark: row?.remark ?? "",
    created_by: row?.createdBy ?? "",
    is_deleted: row?.deleted === true,
    deleted_by: row?.deletedBy ?? "",
    dts_deleted: formatSpringDateTimeToDmy(row?.deletedAt),
    source_bank_process_id: Number(row?.bankProcessId) || 0,
    period_type: row?.periodType ?? "monthly",
    date: row?.transactionDate ?? "",
  };
}

export async function searchBankprocessData({
  dateFrom,
  dateTo,
  companyId,
  currencyCodes,
  allCurrencies,
  query,
  signal,
}) {
  const tenantId = resolveBankprocessTenantId(companyId);
  if (!tenantId) return [];

  const codes = Array.isArray(currencyCodes) ? currencyCodes.filter(Boolean) : [];
  const request = {
    tenantId,
    dateFrom,
    dateTo,
    currencyCodes: allCurrencies ? [] : codes,
    q: query?.trim() ? query.trim().toUpperCase() : null,
  };

  const response = await fetch(buildApiUrl("api/maintenance/bankprocess-maintenance/list"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.message || "Search failed");
  }
  return (Array.isArray(result.data) ? result.data : []).map(normalizeBankprocessRow);
}

export async function deleteBankprocessData(transactionIds, companyId) {
  const tenantId = resolveBankprocessTenantId(companyId);
  if (!tenantId) {
    throw new Error("tenantIdRequired");
  }
  const response = await fetch(buildApiUrl("api/maintenance/bankprocess-maintenance/delete"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, transactionIds }),
  });
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.message || "Delete failed");
  }
  return result;
}

export async function updateSessionCompany(companyId) {
  const json = await syncCompanySessionApi(companyId);
  if (!json?.success) {
    throw new Error(json?.message || "Switch company failed");
  }
  return json.data;
}
