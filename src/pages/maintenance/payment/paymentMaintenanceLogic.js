import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import {
  fetchCurrencyListByTenantId,
  normalizeCurrencyRow,
} from "../../../utils/api/currencyApi.js";
import { fetchDomainCompanyPermissions } from "../shared/maintenanceCompanyApi.js";
import {
  companiesInGroupList,
  companyRowIsGroupEntity,
} from "../../../utils/company/sharedCompanyFilter.js";

/**
 * Active tenant for Payment Maintenance APIs.
 * UI may still show Group / Company pills; APIs only receive this numeric tenant id.
 */
export function resolvePaymentMaintenanceTenantId({
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

/** Default currency pill: prefer MYR, else first code. */
export function pickPaymentMaintenanceCurrency(currList) {
  if (!Array.isArray(currList) || currList.length === 0) return null;
  const hasMYR = currList.some((c) => String(c?.code || "").toUpperCase() === "MYR");
  return hasMYR ? "MYR" : currList[0]?.code || null;
}

export async function fetchCompanyPermissions(companyCode) {
  return fetchDomainCompanyPermissions(companyCode, { emptyForC168: true });
}

/** Spring POST /api/currency/list?tenant_id= */
export async function fetchCompanyCurrencies(tenantId, signal) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) return [];
  const rows = await fetchCurrencyListByTenantId(tid, signal);
  return rows.map((row) => normalizeCurrencyRow(row)).filter((row) => row.code);
}

/**
 * Spring POST /api/maintenance/payment-maintenance/list body (tenant-only).
 */
export function buildSpringPaymentMaintenanceRequest({
  tenantId,
  dateFrom,
  dateTo,
  transactionType,
  currency,
  query,
} = {}) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) {
    throw new Error("tenantIdRequired");
  }
  const type = String(transactionType || "").trim().toUpperCase();
  const code = String(currency || "").trim().toUpperCase();
  const q = String(query || "").trim();
  return {
    tenantId: tid,
    dateFrom: String(dateFrom || "").trim(),
    dateTo: String(dateTo || "").trim(),
    transactionType: type || null,
    currencyCodes: code ? [code] : [],
    q: q || null,
  };
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Spring LocalDateTime → dd/MM/yyyy HH:mm:ss for existing table display. */
export function formatPaymentMaintenanceCreatedAt(value) {
  if (value == null || value === "") return "";
  if (Array.isArray(value) && value.length >= 3) {
    const [y, m, d, hh = 0, mm = 0, ss = 0] = value;
    return `${pad2(d)}/${pad2(m)}/${y} ${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
  }
  const raw = String(value).trim();
  if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) return raw;
  const m = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (m) {
    return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6] || "00"}`;
  }
  return raw;
}

/**
 * Spring PaymentMaintenanceRow → table row fields (aligned to backend camelCase).
 */
export function normalizeSpringPaymentMaintenanceRow(row) {
  if (!row || typeof row !== "object") return null;
  const id = row.id ?? row.transactionId ?? null;
  const remarkRaw = row.remark ?? "";
  const isDeleted = row.deleted === true || row.deleted === 1 || row.deleted === "1";
  return {
    transaction_id: id,
    transaction_type: String(row.transactionType || "").toUpperCase(),
    dts_created: formatPaymentMaintenanceCreatedAt(row.createdAt),
    account: String(row.toAccountCode || "").trim() || "-",
    from_account: String(row.fromAccountCode || "").trim() || "-",
    amount: row.amount,
    currency: String(row.currencyCode || "").trim().toUpperCase(),
    description: row.description ?? "",
    remark: remarkRaw ? String(remarkRaw).toUpperCase() : remarkRaw,
    created_by: row.createdBy ?? "",
    is_deleted: isDeleted ? 1 : 0,
    deleted_by: row.deletedBy ?? "",
    dts_deleted: formatPaymentMaintenanceCreatedAt(row.deletedAt),
  };
}

function sortPaymentMaintenanceRows(data) {
  if (!Array.isArray(data)) return [];
  return [...data].sort((a, b) => {
    const cmp = parseMaintenanceSortTime(b) - parseMaintenanceSortTime(a);
    if (cmp !== 0) return cmp;
    return Number(b?.transaction_id || 0) - Number(a?.transaction_id || 0);
  });
}

/**
 * Search via Spring POST /api/maintenance/payment-maintenance/list (tenantId only).
 * @param {object} opts
 * @param {AbortSignal} [opts.signal]
 */
export async function searchPaymentData({
  tenantId,
  dateFrom,
  dateTo,
  transactionType,
  query,
  currency,
  signal,
}) {
  const body = buildSpringPaymentMaintenanceRequest({
    tenantId,
    dateFrom,
    dateTo,
    transactionType,
    currency,
    query,
  });

  const response = await fetch(buildApiUrl("api/maintenance/payment-maintenance/list"), {
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
  const normalized = rows.map(normalizeSpringPaymentMaintenanceRow).filter(Boolean);
  return sortPaymentMaintenanceRows(normalized);
}

/**
 * Spring POST /api/maintenance/payment-maintenance/delete body.
 * Matches TransactionDTO.PaymentMaintenanceDeleteRequest.
 */
export function buildSpringPaymentMaintenanceDeleteRequest({ tenantId, transactionIds } = {}) {
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
 * Soft-delete via Spring POST /api/maintenance/payment-maintenance/delete.
 */
export async function deletePaymentRecords(transactionIds, tenantId) {
  const body = buildSpringPaymentMaintenanceDeleteRequest({
    tenantId,
    transactionIds,
  });

  const response = await fetch(buildApiUrl("api/maintenance/payment-maintenance/delete"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-cache",
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!data?.success) {
    throw new Error(data?.message || "Delete failed");
  }
  return data;
}

/** Spring auth/switch-tenant?tenant_id= */
export async function updateSessionCompany(tenantId) {
  const response = await fetch(buildApiUrl(`auth/switch-tenant?tenant_id=${tenantId}`), {
    credentials: "include",
  });
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || "Failed to update session company");
  }
  return result.data;
}

export function stripBankProcessDescriptionPrefix(text) {
  const s = String(text || "");
  const m = s.match(/^\s*process:\s*(.*)$/i);
  return m ? m[1].trim() : s;
}

function parseMaintenanceSortTime(row) {
  const created = String(row?.dts_created || "").trim();
  const createdMatch = created.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2}:\d{2})$/);
  if (!createdMatch) return 0;
  const iso = `${createdMatch[3]}-${createdMatch[2]}-${createdMatch[1]}T${createdMatch[4]}`;
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? ts : 0;
}

export function isPaymentMaintenanceRowSelectable(row) {
  if (row?.is_deleted === 1 || row?.is_deleted === "1" || row?.is_deleted === true) {
    return false;
  }
  const id = row?.transaction_id;
  if (id === null || id === undefined || id === "") return false;
  const n = Number(id);
  return Number.isFinite(n) && n !== 0;
}

export function getPaymentMaintenanceRowRenderKey(row, index) {
  if (isPaymentMaintenanceRowSelectable(row)) {
    return `t-${row.transaction_id}`;
  }
  return `v-${index}-${String(row.dts_created ?? "")}-${String(row.amount ?? "")}-${String(row.description ?? "").slice(0, 48)}`;
}

export function formatAmount(num) {
  try {
    if (num === null || num === undefined || num === "") return "0.00";
    return parseFloat(num).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch (_) {
    return "0.00";
  }
}
