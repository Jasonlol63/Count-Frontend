import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import {
  fetchCurrencyListByTenantId,
  normalizeCurrencyRow,
} from "../../../utils/api/currencyApi.js";
import {
  companiesInGroupList,
  companyRowIsGroupEntity,
} from "../../../utils/company/sharedCompanyFilter.js";
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
  if (value == null || value === "") return "-";
  const str = String(value).trim();
  return str ? str.toUpperCase() : "-";
}

/** Active tenant for Bank Process Maintenance APIs (tenant-only). */
export function resolveBankprocessMaintenanceTenantId({
  tenantId = null,
  companyId = null,
  selectedGroup = null,
  companies = [],
} = {}) {
  const fromExplicit = Number(tenantId ?? companyId);
  if (Number.isFinite(fromExplicit) && fromExplicit > 0) return fromExplicit;

  const g = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
  if (!g || !Array.isArray(companies) || companies.length === 0) return null;

  const inGroup = companiesInGroupList(companies, g);
  const entity = inGroup.find((c) => companyRowIsGroupEntity(c, g)) || inGroup[0] || null;
  const id = Number(entity?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Spring LocalDateTime → dd/MM/yyyy HH:mm:ss (Dts Created column). */
export function formatBankprocessMaintenanceCreatedAt(value) {
  if (value == null || value === "") return "";
  if (Array.isArray(value) && value.length >= 3) {
    const [y, m, d, hh = 0, mm = 0, ss = 0] = value;
    return `${pad2(d)}/${pad2(m)}/${y} ${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
  }
  const raw = String(value).trim();
  if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) return raw;
  const m = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (m) {
    if (m[4] != null) {
      return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6] || "00"}`;
    }
    return `${m[3]}/${m[2]}/${m[1]}`;
  }
  return raw;
}

function formatTransactionDate(value) {
  if (value == null || value === "") return "";
  if (Array.isArray(value) && value.length >= 3) {
    const [y, m, d] = value;
    return `${pad2(d)}/${pad2(m)}/${y}`;
  }
  const raw = String(value).trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return raw;
}

/**
 * Spring BankProcessMaintenanceRow → table row fields.
 */
export function normalizeSpringBankprocessMaintenanceRow(row) {
  if (!row || typeof row !== "object") return null;
  const id = row.id ?? row.transactionId ?? null;
  const remarkRaw = row.remark ?? "";
  const isDeleted = row.deleted === true || row.deleted === 1 || row.deleted === "1";
  const periodType = row.periodType != null ? String(row.periodType).trim().toLowerCase() : "monthly";
  return {
    transaction_id: id,
    transaction_type: String(row.transactionType || "").toUpperCase(),
    dts_created: formatBankprocessMaintenanceCreatedAt(row.createdAt),
    account: String(row.toAccountCode || "").trim() || "-",
    from_account: String(row.fromAccountCode || "").trim() || "-",
    amount: row.amount,
    currency: String(row.currencyCode || "").trim().toUpperCase(),
    description: row.description ?? "",
    remark: remarkRaw ? String(remarkRaw).toUpperCase() : remarkRaw,
    created_by: row.createdBy ?? "",
    is_deleted: isDeleted ? 1 : 0,
    deleted_by: row.deletedBy ?? "",
    dts_deleted: formatBankprocessMaintenanceCreatedAt(row.deletedAt),
    source_bank_process_id: row.bankProcessId ?? null,
    period_type: periodType || "monthly",
    date: formatTransactionDate(row.transactionDate),
  };
}

function sortBankprocessMaintenanceRows(data) {
  if (!Array.isArray(data)) return [];
  return [...data].sort((a, b) => {
    const cmp = parseMaintenanceSortTime(b) - parseMaintenanceSortTime(a);
    if (cmp !== 0) return cmp;
    return Number(b?.transaction_id || 0) - Number(a?.transaction_id || 0);
  });
}

function parseMaintenanceSortTime(row) {
  const created = String(row?.dts_created || "").trim();
  const createdMatch = created.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}:\d{2}:\d{2}))?$/);
  if (!createdMatch) return 0;
  const timePart = createdMatch[4] || "00:00:00";
  const iso = `${createdMatch[3]}-${createdMatch[2]}-${createdMatch[1]}T${timePart}`;
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? ts : 0;
}

export function buildSpringBankprocessMaintenanceRequest({
  tenantId,
  dateFrom,
  dateTo,
  currencyCodes,
  query,
} = {}) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) {
    throw new Error("tenantIdRequired");
  }
  const codes = (Array.isArray(currencyCodes) ? currencyCodes : [])
    .map((c) => String(c || "").trim().toUpperCase())
    .filter(Boolean);
  const q = String(query || "").trim();
  return {
    tenantId: tid,
    dateFrom: String(dateFrom || "").trim(),
    dateTo: String(dateTo || "").trim(),
    currencyCodes: codes,
    q: q || null,
  };
}

/** Rows already soft-deleted in Maintenance cannot be selected for delete. */
export function isBankprocessMaintenanceRowSelectable(row) {
  if (!row) return false;
  return !(row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true);
}

/**
 * One Post batch: same DTS Created + bank process + period type + transaction date.
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

/** Spring POST /api/currency/list?tenant_id= */
export async function fetchCompanyCurrencies(tenantId, signal) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) return [];
  const rows = await fetchCurrencyListByTenantId(tid, signal);
  return rows.map((row) => normalizeCurrencyRow(row)).filter((row) => row.code);
}

export async function searchBankprocessData({
  tenantId,
  dateFrom,
  dateTo,
  currencyCodes,
  allCurrencies,
  query,
  signal,
}) {
  const codes = allCurrencies
    ? []
    : (Array.isArray(currencyCodes) ? currencyCodes : []).filter(Boolean);
  const body = buildSpringBankprocessMaintenanceRequest({
    tenantId,
    dateFrom,
    dateTo,
    currencyCodes: codes,
    query,
  });

  const response = await fetch(buildApiUrl("api/maintenance/bankprocess-maintenance/list"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-cache",
    body: JSON.stringify(body),
    signal,
  });
  const data = await response.json();
  if (!data?.success) {
    throw new Error(data?.message || "Search failed");
  }

  const rows = Array.isArray(data.data) ? data.data : [];
  const normalized = rows.map(normalizeSpringBankprocessMaintenanceRow).filter(Boolean);
  return sortBankprocessMaintenanceRows(normalized);
}

/**
 * Spring POST /api/maintenance/bankprocess-maintenance/delete body.
 * Matches TransactionDTO.BankProcessMaintenanceDeleteRequest.
 */
export function buildSpringBankprocessMaintenanceDeleteRequest({ tenantId, transactionIds } = {}) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) {
    throw new Error("tenantIdRequired");
  }
  const ids = [];
  const seen = new Set();
  for (const raw of Array.isArray(transactionIds) ? transactionIds : []) {
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  if (ids.length === 0) {
    throw new Error("Please select at least one record");
  }
  return {
    tenantId: tid,
    transactionIds: ids,
  };
}

/**
 * Soft-delete via Spring POST /api/maintenance/bankprocess-maintenance/delete.
 */
export async function deleteBankprocessData(transactionIds, tenantId) {
  const body = buildSpringBankprocessMaintenanceDeleteRequest({
    tenantId,
    transactionIds,
  });

  const response = await fetch(buildApiUrl("api/maintenance/bankprocess-maintenance/delete"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-cache",
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!result?.success) {
    throw new Error(result?.message || "Delete failed");
  }
  return result;
}

export async function updateSessionCompany(companyId) {
  const res = await fetch(buildApiUrl(`auth/switch-tenant?tenant_id=${companyId}`), {
    credentials: "include",
  });
  const result = await res.json();
  if (!result.success) {
    throw new Error(result.error || "Switch company failed");
  }
  return result.data;
}
