import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import {
  DEFAULT_PERMISSIONS_BANKPROCESS,
  fetchDomainCompanyPermissions,
} from "../shared/maintenanceCompanyApi.js";
import { formatDmyFromDate } from "../shared/maintenanceDateHelpers.js";

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
 * Legacy Maintenance – Bank: one Post/Resend batch shares the same DTS Created timestamp.
 * Clicking any checkbox selects every selectable row in that batch.
 */
export function bankprocessMaintenanceBatchKey(row) {
  const ts = String(row?.dts_created ?? "").trim();
  if (ts) return ts;
  const tid = row?.transaction_id;
  return tid != null && tid !== "" ? `__tid_${tid}` : "";
}

/** @param {Array<{ transaction_id?: number, dts_created?: string, is_deleted?: unknown }>} rows */
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
 * @param {Array<{ transaction_id?: number, dts_created?: string, is_deleted?: unknown }>} rows
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

export async function fetchCompanyPermissions(companyCode) {
  return fetchDomainCompanyPermissions(companyCode, {
    excludeGames: true,
    defaultPermissions: DEFAULT_PERMISSIONS_BANKPROCESS,
  });
}

export async function fetchCompanyCurrencies(companyId) {
  let url = buildApiUrl("api/transactions/get_company_currencies_api.php");
  if (companyId) {
    url += `?company_id=${encodeURIComponent(companyId)}`;
  }
  const response = await fetch(url);
  const data = await response.json();
  return data.success ? (data.data || []) : [];
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
  const params = new URLSearchParams({
    date_from: dateFrom,
    date_to: dateTo,
  });
  if (companyId) params.set("company_id", String(companyId));
  const codes = Array.isArray(currencyCodes) ? currencyCodes.filter(Boolean) : [];
  if (!allCurrencies && codes.length) {
    params.set("currency", codes.join(","));
  }
  if (query?.trim()) params.set("q", query.trim().toUpperCase());

  const response = await fetch(buildApiUrl(`api/bankprocess_maintenance/search_api.php?${params.toString()}`), {
    credentials: "include",
    signal,
  });
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.message || "Search failed");
  }
  return Array.isArray(result.data) ? result.data : [];
}

export async function deleteBankprocessData(transactionIds) {
  const response = await fetch(buildApiUrl("api/bankprocess_maintenance/delete_api.php"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction_ids: transactionIds }),
  });
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.message || "Delete failed");
  }
  return result;
}

export async function updateSessionCompany(companyId) {
  const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${companyId}`));
  const result = await res.json();
  if (!result.success) {
    throw new Error(result.error || "Switch company failed");
  }
  return result.data;
}
