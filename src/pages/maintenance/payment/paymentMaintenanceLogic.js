import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { fetchDomainCompanyPermissions } from "../shared/maintenanceCompanyApi.js";
import { fetchReportScopeCurrencies } from "../../report/shared/reportCompanyApi.js";
import { paymentMaintenanceScopeApiParams } from "./paymentMaintenanceScope.js";

function appendPaymentScopeToParams(params, scope) {
  const {
    companyId,
    viewGroup,
    groupId,
    reportScope,
    groupOnly,
    groupAggregate,
    subsidiaryAccountsOnly,
  } = paymentMaintenanceScopeApiParams(scope);
  if (companyId) params.append("company_id", String(companyId));
  const vg = viewGroup ? String(viewGroup).trim().toUpperCase() : "";
  if (vg) params.append("view_group", vg);
  const gid = groupId ? String(groupId).trim().toUpperCase() : "";
  if (gid) params.append("group_id", gid);
  if (reportScope) params.append("report_scope", reportScope);
  if (groupOnly) params.append("group_only", "1");
  if (groupAggregate) params.append("group_aggregate", "1");
  if (subsidiaryAccountsOnly) params.append("subsidiary_accounts_only", "1");
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

export async function fetchCompanyPermissions(companyCode) {
  return fetchDomainCompanyPermissions(companyCode, { emptyForC168: true });
}

/** Currencies for active group ledger vs subsidiary company (no cross-scope bleed). */
export async function fetchCompanyCurrencies(_companyId, scope = null) {
  if (!scope) return [];
  return fetchReportScopeCurrencies(scope);
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
  companyId,
  currency,
  scope,
  signal,
}) {
  const params = new URLSearchParams();
  params.append("date_from", dateFrom);
  params.append("date_to", dateTo);
  if (transactionType) params.append("transaction_type", transactionType);
  if (companyId && scope?.mode !== "group") {
    params.append("company_id", String(companyId));
  }
  appendPaymentScopeToParams(params, scope);
  if (currency) params.append("currency", currency);
  
  const url = buildApiUrl(`api/payment_maintenance/search_api.php?${params.toString()}`);
  const response = await fetch(url, { credentials: "include", signal });
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.message || 'Search failed');
  }
  
  const merged = mergeProfitRows(data.data || []);
  return sortAndNormalizePaymentRows(merged);
}

/**
 * Delete payment records
 */
export async function deletePaymentRecords(transactionIds, scope = null) {
  const payload = { transaction_ids: transactionIds };
  const {
    companyId,
    viewGroup,
    groupId,
    reportScope,
    groupOnly,
    groupAggregate,
    subsidiaryAccountsOnly,
  } = paymentMaintenanceScopeApiParams(scope);
  if (companyId) payload.company_id = companyId;
  if (viewGroup) payload.view_group = viewGroup;
  if (groupId) payload.group_id = groupId;
  if (reportScope) payload.report_scope = reportScope;
  if (groupOnly) payload.group_only = "1";
  if (groupAggregate) payload.group_aggregate = "1";
  if (subsidiaryAccountsOnly) payload.subsidiary_accounts_only = "1";

  const response = await fetch(buildApiUrl("api/payment_maintenance/delete_api.php"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.message || 'Delete failed');
  }
  return data;
}

/**
 * Update session company
 */
export async function updateSessionCompany(companyId) {
  const response = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${companyId}`), {
    credentials: "include",
  });
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Failed to update session company');
  }
  return result.data;
}

/**
 * Bank Process description stripping
 */
export function stripBankProcessDescriptionPrefix(text) {
  const s = String(text || '');
  const m = s.match(/^\s*process:\s*(.*)$/i);
  return m ? m[1].trim() : s;
}

/**
 * Merge profit rows for display
 */
function mergeProfitRows(data) {
  if (!Array.isArray(data) || data.length === 0) return data || [];
  const type = (row) => (row.transaction_type || '').toUpperCase();
  const acc = (row) => (row.account || '').toString().toUpperCase();
  const isProfitRow = (row) => (type(row) === 'WIN' || type(row) === 'LOSE') && acc(row).startsWith('PROFIT');
  const isWinLoseRow = (row) => type(row) === 'WIN' || type(row) === 'LOSE';
  const key = (row) => [row.dts_created, String(row.amount || ''), (row.currency || '').toUpperCase()].join('\t');
  
  const profitByKey = {};
  data.forEach(row => {
    if (!isProfitRow(row)) return;
    const k = key(row);
    if (!profitByKey[k]) profitByKey[k] = [];
    profitByKey[k].push(row.account || 'PROFIT');
  });

  return data.filter(row => {
    if (isProfitRow(row)) return false;
    if (isWinLoseRow(row)) {
      const k = key(row);
      const fromCandidates = profitByKey[k];
      if (fromCandidates && fromCandidates.length > 0) {
        row.from_account = fromCandidates[0];
        const desc = (row.description || '').trim();
        if (!desc || desc === '-' || desc === 'PROFIT' || desc.toUpperCase() === 'WIN' || desc.toUpperCase() === 'LOSE') {
          const toAccountLabel = row.account || '';
          row.description = toAccountLabel ? `PROFIT FROM ${toAccountLabel}` : 'PROFIT';
        }
        fromCandidates.shift();
      }
    }
    return true;
  });
}

function parseMaintenanceSortTime(row) {
  const created = String(row?.dts_created || "").trim();
  const createdMatch = created.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2}:\d{2})$/);
  if (!createdMatch) return 0;
  const iso = `${createdMatch[3]}-${createdMatch[2]}-${createdMatch[1]}T${createdMatch[4]}`;
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? ts : 0;
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

function sortAndNormalizePaymentRows(data) {
  if (!Array.isArray(data)) return [];
  return [...data]
    .sort((a, b) => {
      const cmp = parseMaintenanceSortTime(b) - parseMaintenanceSortTime(a);
      if (cmp !== 0) return cmp;
      return Number(b?.transaction_id || 0) - Number(a?.transaction_id || 0);
    })
    .map((row) => ({
      ...row,
      // Keep behavior aligned with legacy payment_maintenance.js display.
      remark: row?.remark ? String(row.remark).toUpperCase() : row?.remark,
    }));
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
