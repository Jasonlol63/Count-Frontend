import { buildApiUrl } from "../utils/apiUrl.js";
import { fetchOwnerCompaniesForMobile, fetchTenantIdByCode } from "./tenantAccessibleApi.js";
import { switchSessionTenant } from "./authApi.js";
import { fetchBankProcessListByTenantId, fetchProcessListByTenantId } from "./processApi.js";

/** Load accessible companies — Spring `GET /auth/tenant-accessible`. */
export async function fetchOwnerCompanies(signal) {
  return fetchOwnerCompaniesForMobile(signal);
}

/** Switch active tenant (company scope) — Spring `POST /auth/switch-tenant`. */
export async function updateSessionCompany(companyId, signal) {
  const { ok, json } = await switchSessionTenant(companyId, { signal });
  if (!ok || !json?.success) {
    throw new Error(json?.message || json?.error || "Failed to switch company");
  }
  return json.data;
}

function uniqueProcessNames(rows, pickName) {
  const names = (Array.isArray(rows) ? rows : [])
    .map((row) => String(pickName(row) ?? "").trim())
    .filter(Boolean);
  return [...new Set(names)];
}

/**
 * Process options for the Transaction Maintenance filter — Spring `/api/process/process-list`.
 * Group scope reads BANK-category processes (payroll: SALARY/COMMISSION/BONUS/PROFIT) for the
 * group's own tenant; company scope reads GAME-category processes for that company's tenant.
 * Same category split as Domain Report's process dropdown (lib/reportApi.js) and the same
 * reasoning: a group is just another tenant, resolved via `auth/tenant-by-code`.
 * @returns {Promise<string[]>} process names
 */
export async function fetchMaintenanceProcessOptions({ scope, signal }) {
  if (scope?.mode === "group" && scope.groupId) {
    const tenantId = await fetchTenantIdByCode(scope.groupId, { signal });
    if (!tenantId) return [];
    const rows = await fetchBankProcessListByTenantId(tenantId, signal);
    return uniqueProcessNames(rows, (r) => r.process_name);
  }
  if (!(Number(scope?.companyId) > 0)) return [];
  const rows = await fetchProcessListByTenantId(scope.companyId, signal);
  return uniqueProcessNames(rows, (r) => r.process_name);
}


/** Virtual rollup rows use transaction_id 0 — not real DB rows, not selectable for delete. */
export function isPaymentRowSelectable(row) {
  const id = row?.transaction_id;
  if (id === null || id === undefined || id === "") return false;
  const n = Number(id);
  return Number.isFinite(n) && n !== 0;
}

export function paymentRowKey(row, index) {
  if (isPaymentRowSelectable(row)) return `t-${row.transaction_id}`;
  return `v-${index}-${String(row.dts_created ?? "")}-${String(row.amount ?? "")}`;
}

function parsePaymentSortTime(row) {
  const m = String(row?.dts_created || "").match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2}:\d{2})$/,
  );
  if (!m) return 0;
  const ts = Date.parse(`${m[3]}-${m[2]}-${m[1]}T${m[4]}`);
  return Number.isFinite(ts) ? ts : 0;
}

function sortPaymentRows(rows) {
  return [...rows].sort((a, b) => {
    const cmp = parsePaymentSortTime(b) - parsePaymentSortTime(a);
    if (cmp !== 0) return cmp;
    return Number(b?.transaction_id || 0) - Number(a?.transaction_id || 0);
  });
}

/** Group is just another tenant — resolve scope to the tenant id(s) to query. */
async function resolvePaymentMaintenanceTenantIds(scope, { signal } = {}) {
  if (scope?.mode === "groupsAll") {
    const ids = Array.isArray(scope.groupIds) ? scope.groupIds : [];
    const resolved = await Promise.all(ids.map((gid) => fetchTenantIdByCode(gid, { signal })));
    return resolved.filter((id) => Number.isFinite(id) && id > 0);
  }
  if (scope?.mode === "group" && scope.groupId) {
    const id = await fetchTenantIdByCode(scope.groupId, { signal });
    return id ? [id] : [];
  }
  const cid = Number(scope?.companyId);
  return Number.isFinite(cid) && cid > 0 ? [cid] : [];
}

/** Spring `MaintenancePaymentDTO` row → mobile's old grid row shape (snake_case). */
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
  };
}

function formatSpringDateTimeToDmy(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return raw;
  const [, y, mo, d, h, mi, s] = match;
  return `${d}/${mo}/${y} ${h}:${mi}:${s}`;
}

async function fetchPaymentMaintenancePage({ tenantId, dateFrom, dateTo, transactionType, signal }) {
  const res = await fetch(buildApiUrl("api/maintenance/payment-maintenance/list"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenantId,
      dateFrom,
      dateTo,
      transactionType: transactionType || null,
      currencyCodes: [],
      q: null,
    }),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json?.message || "Search failed");
  return Array.isArray(json.data) ? json.data : [];
}

/**
 * Payment Maintenance search — Spring `POST /api/maintenance/payment-maintenance/list`.
 * `dateFrom`/`dateTo` are already dd/mm/yyyy (mobile's page converts before calling).
 * @returns {Promise<Array>} rows
 */
export async function searchPaymentMaintenance({ scope, dateFrom, dateTo, transactionType, signal }) {
  const tenantIds = await resolvePaymentMaintenanceTenantIds(scope, { signal });
  if (!tenantIds.length) return [];
  const perTenant = await Promise.all(
    tenantIds.map((tenantId) =>
      fetchPaymentMaintenancePage({ tenantId, dateFrom, dateTo, transactionType, signal }).then((rows) =>
        rows.map((row) => normalizePaymentRow(row, tenantId)),
      ),
    ),
  );
  return sortPaymentRows(perTenant.flat());
}

/** Delete selected payment records — grouped by tenant (relevant for groupsAll aggregate). */
export async function deletePaymentRecords({ scope, transactionIds, rows = [], signal }) {
  const ids = (Array.isArray(transactionIds) ? transactionIds : [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (!ids.length) throw new Error("Please select at least one record");

  const rowById = new Map((Array.isArray(rows) ? rows : []).map((r) => [Number(r.transaction_id), r]));
  const tenantIds = await resolvePaymentMaintenanceTenantIds(scope, { signal });
  const fallbackTenantId = tenantIds[0] ?? null;

  const idsByTenant = new Map();
  for (const id of ids) {
    const tenantId = Number(rowById.get(id)?._tenant_id) || fallbackTenantId;
    if (!tenantId) continue;
    if (!idsByTenant.has(tenantId)) idsByTenant.set(tenantId, []);
    idsByTenant.get(tenantId).push(id);
  }
  if (!idsByTenant.size) throw new Error("tenantIdRequired");

  let lastResult = null;
  for (const [tenantId, tenantTransactionIds] of idsByTenant) {
    const res = await fetch(buildApiUrl("api/maintenance/payment-maintenance/delete"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ tenantId, transactionIds: tenantTransactionIds }),
      signal,
    });
    const json = await res.json();
    if (!json.success) throw new Error(json?.message || "Delete failed");
    lastResult = json;
  }
  return lastResult?.data || {};
}

export function formatMaintenanceAmount(value) {
  if (value === null || value === undefined || value === "") return "-";
  const val = parseFloat(value);
  if (Number.isNaN(val)) return "-";
  return val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

