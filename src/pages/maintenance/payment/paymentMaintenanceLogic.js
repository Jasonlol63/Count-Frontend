import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { fetchCurrencyListByTenantId, normalizeCurrencyRow } from "../../../utils/api/currencyApi.js";
import { syncCompanySessionApi } from "../../../utils/company/companySessionSync.js";
import { formatSpringDateTimeToDmy } from "../shared/maintenanceDateHelpers.js";
import { paymentMaintenanceScopeApiParams } from "./paymentMaintenanceScope.js";
import {
  mergeCurrencyCodesWithSavedOrder,
  resolvePaymentMaintenanceCurrencyOrder,
} from "../../../utils/company/currencyDisplayOrder.js";

/**
 * Group entity + subsidiary company share one Spring tenant row; "aggregate" (Groups All / Group All) spans several.
 * Pure Group scope's `scope.scopeCompanyId` is already resolved to the group's real entity tenantId by
 * `resolveCustomerReportScope`, so payment maintenance has no separate group-only resolution path.
 */
function resolvePaymentMaintenanceTenantIds({ companyId, scope } = {}) {
  if (scope?.mode === "aggregate") {
    const ids = Array.isArray(scope.mergeCompanyIds) ? scope.mergeCompanyIds : [];
    return ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
  }
  const tid = Number(companyId ?? scope?.scopeCompanyId);
  if (Number.isFinite(tid) && tid > 0) return [tid];
  return [];
}

/** Default currency pill for group vs subsidiary company scope. */
export function pickPaymentMaintenanceCurrency(currList, scope) {
  if (!Array.isArray(currList) || currList.length === 0) return null;
  if (scope?.mode === "company") {
    return currList[0]?.code || null;
  }
  const hasMYR = currList.some((c) => String(c?.code || "").toUpperCase() === "MYR");
  return hasMYR ? "MYR" : currList[0]?.code || null;
}

/** Currencies for active group ledger vs subsidiary company (no cross-scope bleed); unions across aggregate scope. */
export async function fetchCompanyCurrencies(_companyId, scope = null) {
  const tenantIds = resolvePaymentMaintenanceTenantIds({ scope });
  if (tenantIds.length === 0) return [];

  if (tenantIds.length === 1) {
    const rows = await fetchCurrencyListByTenantId(tenantIds[0]);
    return rows
      .map((row) => normalizeCurrencyRow(row))
      .filter((row) => Number.isFinite(row.id) && row.id > 0 && String(row.code || "").trim());
  }

  const perTenant = await Promise.all(
    tenantIds.map((tenantId) => fetchCurrencyListByTenantId(tenantId).catch(() => [])),
  );
  const byCode = new Map();
  for (const row of perTenant.flat()) {
    const normalized = normalizeCurrencyRow(row);
    if (!Number.isFinite(normalized.id) || normalized.id <= 0) continue;
    const code = String(normalized.code || "").trim().toUpperCase();
    if (code && !byCode.has(code)) byCode.set(code, normalized);
  }
  return [...byCode.values()];
}

/** Storage key for currency order: numeric company id, or `g:GROUPCODE` for pure Group ledger. */
export function resolvePaymentMaintenanceCurrencyOrderKey(scope) {
  const { companyId, groupId } = paymentMaintenanceScopeApiParams(scope);
  const cid = companyId != null ? Number(companyId) : NaN;
  if (Number.isFinite(cid) && cid > 0) return cid;
  const gid = groupId ? String(groupId).trim().toUpperCase() : "";
  return gid ? `g:${gid}` : null;
}

/**
 * Reorder currency rows for pill display only (selection logic keeps using the raw API list).
 * Local Payment Maintenance drag order wins; otherwise follows the shared Dashboard order.
 */
export function orderPaymentMaintenanceCurrencies(currList, scope) {
  if (!Array.isArray(currList) || currList.length === 0) return currList || [];
  const orderKey = resolvePaymentMaintenanceCurrencyOrderKey(scope);
  if (orderKey == null) return currList;
  const savedOrder = resolvePaymentMaintenanceCurrencyOrder(orderKey);
  if (!savedOrder?.length) return currList;
  const byCode = new Map(currList.map((row) => [String(row?.code || "").toUpperCase(), row]));
  const orderedCodes = mergeCurrencyCodesWithSavedOrder(
    currList.map((row) => row?.code),
    savedOrder,
  );
  return orderedCodes.map((code) => byCode.get(code)).filter(Boolean);
}

/** Spring `MaintenancePaymentDTO` row → legacy grid row shape used by the table components. */
function normalizePaymentRow(row, tenantId) {
  return {
    transaction_id: Number(row?.id) || 0,
    transaction_type: row?.transactionType ?? null,
    dts_created: formatSpringDateTimeToDmy(row?.createdAt),
    account: row?.toAccountCode ?? "",
    from_account: row?.fromAccountCode ?? "",
    amount: row?.amount ?? 0,
    currency: row?.currencyCode ?? "",
    description: row?.description ?? "",
    remark: row?.remark ? String(row.remark).toUpperCase() : row?.remark,
    created_by: row?.createdBy ?? "",
    is_deleted: row?.deleted === true,
    deleted_by: row?.deletedBy ?? "",
    dts_deleted: formatSpringDateTimeToDmy(row?.deletedAt),
    _tenant_id: tenantId,
    _created_at_raw: String(row?.createdAt ?? ""),
  };
}

/** Global sort across (possibly several, aggregate-merged) tenants: createdAt desc, id desc. */
function sortPaymentMaintenanceRows(rows) {
  return [...rows].sort((a, b) => {
    const cmp = String(b._created_at_raw || "").localeCompare(String(a._created_at_raw || ""));
    if (cmp !== 0) return cmp;
    return Number(b.transaction_id || 0) - Number(a.transaction_id || 0);
  });
}

async function fetchPaymentMaintenancePage({ tenantId, dateFrom, dateTo, transactionType, currencyCodes, q, signal }) {
  const request = {
    tenantId,
    dateFrom,
    dateTo,
    transactionType: transactionType || null,
    currencyCodes: Array.isArray(currencyCodes) ? currencyCodes : [],
    q,
  };
  const response = await fetch(buildApiUrl("api/maintenance/payment-maintenance/list"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.message || "Search failed");
  }
  return Array.isArray(data.data) ? data.data : [];
}

/**
 * Search payment data
 * @param {object} opts
 * @param {AbortSignal} [opts.signal] — cancel in-flight request when company / filters change
 */
export async function searchPaymentData({
  dateFrom,
  dateTo,
  transactionType,
  query,
  companyId,
  currency,
  scope,
  signal,
}) {
  const tenantIds = resolvePaymentMaintenanceTenantIds({ companyId, scope });
  if (tenantIds.length === 0) return [];

  const q = query?.trim() ? query.trim().toUpperCase() : null;
  const currencyCodes = currency ? [String(currency).toUpperCase()] : [];

  const perTenant = await Promise.all(
    tenantIds.map((tenantId) =>
      fetchPaymentMaintenancePage({ tenantId, dateFrom, dateTo, transactionType, currencyCodes, q, signal }).then(
        (rows) => rows.map((row) => normalizePaymentRow(row, tenantId)),
      ),
    ),
  );

  return sortPaymentMaintenanceRows(perTenant.flat());
}

/**
 * Delete payment records — groups selected ids by originating tenant (relevant only in aggregate scope).
 * @param {number[]} transactionIds
 * @param {object} scope
 * @param {Array<object>} rows currently-loaded rows (carry `_tenant_id` from the search response)
 */
export async function deletePaymentRecords(transactionIds, scope = null, rows = []) {
  const ids = Array.isArray(transactionIds)
    ? transactionIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
    : [];
  if (ids.length === 0) {
    throw new Error("Please select at least one record");
  }

  const rowById = new Map((Array.isArray(rows) ? rows : []).map((r) => [Number(r.transaction_id), r]));
  const fallbackTenantId = resolvePaymentMaintenanceTenantIds({ scope })[0] ?? null;

  const idsByTenant = new Map();
  for (const id of ids) {
    const tenantId = Number(rowById.get(id)?._tenant_id) || fallbackTenantId;
    if (!tenantId) continue;
    if (!idsByTenant.has(tenantId)) idsByTenant.set(tenantId, []);
    idsByTenant.get(tenantId).push(id);
  }
  if (idsByTenant.size === 0) {
    throw new Error("tenantIdRequired");
  }

  let lastResult = null;
  for (const [tenantId, tenantTransactionIds] of idsByTenant) {
    const response = await fetch(buildApiUrl("api/maintenance/payment-maintenance/delete"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ tenantId, transactionIds: tenantTransactionIds }),
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || "Delete failed");
    }
    lastResult = data;
  }
  return lastResult;
}

/**
 * Update session company
 */
export async function updateSessionCompany(companyId) {
  const json = await syncCompanySessionApi(companyId);
  if (!json?.success) {
    throw new Error(json?.message || "Failed to update session company");
  }
  return json.data;
}

/**
 * Bank Process description stripping
 */
export function stripBankProcessDescriptionPrefix(text) {
  const s = String(text || '');
  const m = s.match(/^\s*process:\s*(.*)$/i);
  return m ? m[1].trim() : s;
}

/** Virtual rollup rows from the API use transaction_id 0; they are not real DB rows. */
export function isPaymentMaintenanceRowSelectable(row) {
  const id = row?.transaction_id;
  if (id === null || id === undefined || id === "") return false;
  const n = Number(id);
  return Number.isFinite(n) && n !== 0;
}

/** Stable unique key per rendered row (avoids duplicate React keys when transaction_id is 0). */
export function getPaymentMaintenanceRowRenderKey(row, index) {
  if (isPaymentMaintenanceRowSelectable(row)) {
    return `t-${row.transaction_id}`;
  }
  return `v-${index}-${String(row.dts_created ?? "")}-${String(row.amount ?? "")}-${String(row.description ?? "").slice(0, 48)}`;
}

/**
 * Format amount
 */
export function formatAmount(num) {
  try {
    if (num === null || num === undefined || num === '') return '0.00';
    return parseFloat(num).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch (_) {
    return '0.00';
  }
}
