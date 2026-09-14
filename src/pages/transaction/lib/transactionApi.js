import { fetchAccountListByTenantId } from "../../account/accountListApi.js";
import { fetchCurrencyListByTenantId, normalizeCurrencyRow } from "../../../utils/api/currencyApi.js";
import { getCachedOwnerCompanies } from "../../../utils/company/sharedCompanyFilter.js";
import {
  persistCurrencyDisplayOrder,
  readCurrencyDisplayOrder,
} from "../../../utils/company/currencyDisplayOrder.js";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { deriveCategoryList, normalizeTransactionAccountOption } from "./transactionAccountHelpers.js";
import { resolveGroupEntityRowFromSnap } from "./transactionScope.js";
import { buildSpringSearchRequest, normalizeSpringSearchToGrid } from "./transactionSearchNormalize.js";
import { buildSpringHistoryRequest, normalizeSpringHistoryResponse } from "./transactionHistoryNormalize.js";
import { buildSpringSubmitRequest, normalizeSpringSubmitResponse, isSpringSubmitType } from "./transactionSubmitNormalize.js";

export const transactionQueryKeys = {
  searchRoot: () => ["tx-search"],
  search: ({
    companyId,
    viewGroup,
    subsidiaryAccountsOnly,
    dateFrom,
    dateTo,
    showInactive,
    showCaptureOnly,
    hideZeroBalance,
    categories,
    currencyCodes,
    typeSearch,
    typeAccountIds,
  }) => [
    "tx-search",
    {
      companyId: Number(companyId ?? 0),
      viewGroup: viewGroup ? String(viewGroup).trim().toUpperCase() : "",
      subsidiaryAccountsOnly: !!subsidiaryAccountsOnly,
      dateFrom: String(dateFrom || ""),
      dateTo: String(dateTo || ""),
      showInactive: !!showInactive,
      showCaptureOnly: !!showCaptureOnly,
      hideZeroBalance: !!hideZeroBalance,
      categories: Array.isArray(categories) ? [...categories].sort() : [],
      currencyCodes: Array.isArray(currencyCodes) ? [...currencyCodes].sort() : [],
      typeSearch: !!typeSearch,
      typeAccountIds: Array.isArray(typeAccountIds)
        ? [...typeAccountIds].map((id) => Number(id)).filter((id) => id > 0).sort((a, b) => a - b)
        : [],
    },
  ],
  categories: () => ["tx-categories"],
  /** scopeKey from transactionScopeCacheKey — separates group-only vs subsidiary drill-down. */
  accounts: (scopeKey) => ["tx-accounts", String(scopeKey || "")],
  companyCurrencies: (scopeKey) => ["tx-company-currencies", String(scopeKey || "")],
  userCurrencyOrder: () => ["tx-user-currency-order"],
  history: ({ companyId, viewGroup, groupId, groupAggregate, accountDbId, dateFrom, dateTo, currency, virtualCompanyCode }) => [
    "tx-history",
    Number(companyId ?? 0),
    viewGroup ? String(viewGroup).trim().toUpperCase() : "",
    groupId ? String(groupId).trim().toUpperCase() : "",
    groupAggregate ? "g" : "c",
    String(accountDbId || ""),
    String(dateFrom || ""),
    String(dateTo || ""),
    String(currency || "").toUpperCase().trim(),
    String(virtualCompanyCode || "").toUpperCase().trim(),
  ],
  contraInbox: ({ companyId, viewGroup, groupId, groupAggregate } = {}) => [
    "tx-contra-inbox",
    Number(companyId ?? 0),
    viewGroup ? String(viewGroup).trim().toUpperCase() : "",
    groupId ? String(groupId).trim().toUpperCase() : "",
    groupAggregate ? "g" : "c",
  ],
  contraInboxRoot: () => ["tx-contra-inbox"],
};

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function isSpringOk(json) {
  return json?.success === true || json?.status === "success";
}

async function postSpringJson(path, body, signal) {
  const res = await fetch(buildApiUrl(path), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  return safeJson(res);
}

/** UI company pill id, or Group tenant id from owner-companies cache. */
export function resolveTransactionSpringTenantId({ companyId, groupId } = {}) {
  const cid = companyId != null && companyId !== "" ? Number(companyId) : 0;
  if (Number.isFinite(cid) && cid > 0) return cid;
  const row = resolveGroupEntityRowFromSnap(getCachedOwnerCompanies() || [], groupId);
  const id = Number(row?.id ?? row?.tenant_id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function currencyOrderStorageKey({ companyId, groupId } = {}) {
  const cid = companyId != null && companyId !== "" ? Number(companyId) : 0;
  if (Number.isFinite(cid) && cid > 0) return cid;
  const gid = groupId != null ? String(groupId).trim().toUpperCase() : "";
  return gid ? `g:${gid}` : null;
}

export async function getCategories() {
  return { success: true, data: deriveCategoryList() };
}

export async function getAccounts({ companyId, groupId, role, status = "active", signal } = {}) {
  const tenantId = resolveTransactionSpringTenantId({ companyId, groupId });
  if (!tenantId) {
    return { success: true, data: [] };
  }
  const rows = await fetchAccountListByTenantId(tenantId, signal);
  const wantStatus = String(status || "active").trim().toLowerCase();
  const wantRole = role ? String(role).trim().toUpperCase() : "";
  const data = rows
    .map((row) => normalizeTransactionAccountOption(row))
    .filter(Boolean)
    .filter((row) => {
      if (wantStatus && String(row.status || "").toLowerCase() !== wantStatus) return false;
      if (wantRole && String(row.role || "").toUpperCase() !== wantRole) return false;
      return true;
    });
  return { success: true, data };
}

export async function getCompanyCurrencies({ companyId, groupId, signal } = {}) {
  const tenantId = resolveTransactionSpringTenantId({ companyId, groupId });
  if (!tenantId) {
    return { success: true, data: [] };
  }
  const rows = await fetchCurrencyListByTenantId(tenantId, signal);
  const data = rows
    .map((row) => normalizeCurrencyRow(row))
    .filter((row) => Number.isFinite(row.id) && row.id > 0 && String(row.code || "").trim());
  return { success: true, data };
}

export async function getUserCurrencyOrder({ companyId, groupId } = {}) {
  const orderKey = currencyOrderStorageKey({ companyId, groupId });
  const order = orderKey ? readCurrencyDisplayOrder(orderKey) : null;
  const cid = companyId != null && companyId !== "" ? Number(companyId) : 0;
  const gid = groupId != null ? String(groupId).trim().toUpperCase() : "";
  return {
    success: true,
    data: {
      order: Array.isArray(order) && order.length ? order : null,
      company_id: Number.isFinite(cid) && cid > 0 ? cid : null,
      group_id: gid || null,
    },
  };
}

/** Pill drag order — Spring has no user-level currency order API; persist in localStorage. */
export async function saveUserCurrencyOrder(order, { companyId, groupId } = {}) {
  const codes = Array.isArray(order)
    ? [...new Set(order.map((c) => String(c || "").trim().toUpperCase()).filter(Boolean))]
    : [];
  const orderKey = currencyOrderStorageKey({ companyId, groupId });
  if (orderKey && codes.length) persistCurrencyDisplayOrder(orderKey, codes);
  return { success: true, data: { order: codes } };
}

function logTxSearchResponse(body) {
  if (typeof window === "undefined" || !body) return;
  if (window.DEBUG_TRANSACTION_SEARCH && body.data) {
    console.log("✅ 搜索成功:", body.data);
    console.log(
      "📊 行数:",
      (body.data.left_table?.length || 0) + (body.data.right_table?.length || 0),
    );
  }
  const d = body.data?.debug_win_loss;
  if (!d) return;
  try {
    console.groupCollapsed("[Transaction List] Win/Loss 诊断 (debug_wl_total)");
    console.log("bucket_sums_hp", d.bucket_sums_hp);
    console.log("totals_summary_from_api", d.totals_summary_from_api);
    const small = d.nonzero_sorted_smallest_abs || [];
    console.log("nonzero 按 |W/L| 升序（前 20 条）", small.slice(0, 20));
    if ((d.bucket_mismatch_rows || []).length > 0) {
      console.warn("bucket_mismatch_rows", d.bucket_mismatch_rows);
    }
    console.log("完整 debug_win_loss", d);
    console.groupEnd();
  } catch (e) {
    console.warn("[Transaction List] debug_win_loss 打印失败", e);
  }
}

/**
 * Spring has no type-account index. `null` = skip ID filter (use period /search).
 * Empty array would mean "no matching accounts".
 */
export async function fetchTypeAccountSearch() {
  return null;
}

/** Fall back to period /search grid — Spring has no all-time type_transaction_search. */
export async function fetchTypeTransactionSearch({
  companyId,
  groupId,
  dateFrom,
  dateTo,
  currencyCodes,
  signal,
} = {}) {
  const result = await searchTransactions({
    companyId,
    groupId,
    dateFrom,
    dateTo,
    currencyCodes,
    hideZeroBalance: false,
    signal,
  });
  if (!result?.success) {
    throw new Error(result?.message || "Type transaction search failed");
  }
  return result.data ?? null;
}

export async function searchTransactions({
  companyId,
  groupId,
  dateFrom,
  dateTo,
  hideZeroBalance,
  currencyCodes,
  categories,
  signal,
} = {}) {
  const springTenantId = resolveTransactionSpringTenantId({ companyId, groupId });
  if (!springTenantId) {
    return { success: false, message: "tenantIdRequired", data: null };
  }
  const request = buildSpringSearchRequest({
    companyId: springTenantId,
    dateFrom,
    dateTo,
    currencyCodes,
    categories,
    showAllZeroBalance: !hideZeroBalance,
  });
  const json = await postSpringJson("api/transaction/search", request, signal);
  logTxSearchResponse(json);
  if (!isSpringOk(json)) {
    return { success: false, message: json?.message || "Transaction search failed", data: null };
  }
  return { success: true, message: json.message || "", data: normalizeSpringSearchToGrid(json.data) };
}

/** Spring has no SSE ticket API. */
export async function fetchRealtimeTicket() {
  return { success: true, data: { enabled: false } };
}

export async function submitTransaction({ companyId, groupId, payload }) {
  const springTenantId = resolveTransactionSpringTenantId({ companyId, groupId });
  const springType = String(payload?.transaction_type || "").toUpperCase().trim();
  if (!springTenantId) {
    return { success: false, message: "tenantIdRequired", data: null };
  }
  if (!isSpringSubmitType(springType)) {
    return { success: false, message: "unsupportedSpringSubmitType", data: null };
  }
  try {
    const request = buildSpringSubmitRequest({ companyId: springTenantId, payload });
    const json = await postSpringJson("api/transaction/submit", request);
    return normalizeSpringSubmitResponse(json);
  } catch (e) {
    return { success: false, message: e?.message || "submitFailed", data: null };
  }
}

export async function getHistory({
  companyId,
  groupId,
  accountId,
  dateFrom,
  dateTo,
  currency,
  signal,
} = {}) {
  const springTenantId = resolveTransactionSpringTenantId({ companyId, groupId });
  const springAccountId = Number(accountId);
  if (!springTenantId || !Number.isFinite(springAccountId) || springAccountId <= 0) {
    return { success: false, message: "tenantIdRequired", data: [] };
  }
  const request = buildSpringHistoryRequest({
    companyId: springTenantId,
    accountId: springAccountId,
    dateFrom,
    dateTo,
    currency,
  });
  const json = await postSpringJson("api/transaction/history", request, signal);
  return normalizeSpringHistoryResponse(json);
}

/**
 * Contra Inbox: one row of `POST api/pending` → the snake_case shape TransactionHeader.jsx renders
 * (see its `it.from_account_code` / `it.to_account_code` / `it.submitted_by` usage).
 */
function normalizeContraInboxRow(row) {
  const r = row && typeof row === "object" ? row : {};
  return {
    id: r.id ?? null,
    transaction_id: r.id ?? null,
    transaction_type: String(r.transactionType || "").toUpperCase(),
    transaction_date: r.transactionDate ?? "",
    from_account_code: r.fromAccountCode ?? "",
    to_account_code: r.toAccountCode ?? "",
    currency: String(r.currencyCode || "").toUpperCase(),
    amount: r.amount ?? "",
    description: r.description ?? "",
    remark: r.remark ?? "",
    created_by: r.createdBy ?? "",
    submitted_by: r.createdBy ?? "",
  };
}

/** PENDING manual transactions awaiting Owner/Admin/Manager approval — backs the Contra Inbox badge/popover. */
export async function loadContraInbox({ companyId, groupId, signal } = {}) {
  const tenantId = resolveTransactionSpringTenantId({ companyId, groupId });
  if (!tenantId) {
    return { success: true, data: [] };
  }
  const json = await postSpringJson("api/pending", { tenantId }, signal);
  if (!isSpringOk(json)) {
    return { success: false, message: json?.message || "loadContraInboxFailed", data: [] };
  }
  return { success: true, data: (Array.isArray(json.data) ? json.data : []).map(normalizeContraInboxRow) };
}

export async function approveContra({ transactionId, companyId, groupId } = {}) {
  const tenantId = resolveTransactionSpringTenantId({ companyId, groupId });
  const id = Number(transactionId);
  if (!tenantId || !Number.isFinite(id) || id <= 0) {
    return { success: false, message: "invalidRequest", data: null };
  }
  const json = await postSpringJson("api/approved", { tenantId, id });
  return { success: isSpringOk(json), message: json?.message || "", data: null };
}

export async function rejectContra({ transactionId, companyId, groupId } = {}) {
  const tenantId = resolveTransactionSpringTenantId({ companyId, groupId });
  const id = Number(transactionId);
  if (!tenantId || !Number.isFinite(id) || id <= 0) {
    return { success: false, message: "invalidRequest", data: null };
  }
  const json = await postSpringJson("api/rejected", { tenantId, id });
  return { success: isSpringOk(json), message: json?.message || "", data: null };
}

