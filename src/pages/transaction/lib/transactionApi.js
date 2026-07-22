import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { fetchAccountListByTenantId } from "../../account/accountListApi.js";
import { fetchCurrencyListByTenantId, normalizeCurrencyRow } from "../../../utils/api/currencyApi.js";
import {
  deriveCategoryList,
  normalizeTransactionAccountOption,
} from "./transactionAccountHelpers.js";
import {
  buildSpringSearchRequest,
  normalizeSpringSearchToGrid,
} from "./transactionSearchNormalize.js";
import {
  buildSpringHistoryRequest,
  normalizeSpringHistoryResponse,
} from "./transactionHistoryNormalize.js";
import {
  buildSpringSubmitRequest,
  isSpringSubmitType,
  normalizeSpringSubmitResponse,
} from "./transactionSubmitNormalize.js";
import { persistUserCurrencyDisplayOrder } from "../../../utils/company/currencyDisplayOrder.js";

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

export async function getCategories() {
  return { success: true, data: deriveCategoryList() };
}

function appendViewGroup(params, viewGroup) {
  const vg = viewGroup != null ? String(viewGroup).trim().toUpperCase() : "";
  if (vg) params.set("view_group", vg);
}

/** Append company_id / view_group / group_id (same rules as transactionScopeApiParams). */
function appendTransactionScope(
  target,
  { companyId, viewGroup, groupId, groupAggregate, subsidiaryAccountsOnly },
  kind = "params",
) {
  const cid = companyId != null && companyId !== "" ? Number(companyId) : 0;
  if (Number.isFinite(cid) && cid > 0) {
    if (kind === "form") target.append("company_id", String(cid));
    else target.set("company_id", String(cid));
  }
  const vg = viewGroup != null ? String(viewGroup).trim().toUpperCase() : "";
  if (vg) {
    if (kind === "form") target.append("view_group", vg);
    else target.set("view_group", vg);
  }
  const gid = groupId != null ? String(groupId).trim().toUpperCase() : "";
  if (gid) {
    if (kind === "form") target.append("group_id", gid);
    else target.set("group_id", gid);
  }
  if (groupAggregate) {
    if (kind === "form") target.append("group_aggregate", "1");
    else target.set("group_aggregate", "1");
  }
  if (subsidiaryAccountsOnly) {
    if (kind === "form") target.append("subsidiary_accounts_only", "1");
    else target.set("subsidiary_accounts_only", "1");
  }
}

export async function getAccounts({ companyId, viewGroup, groupId, role, status = "active", signal } = {}) {
  void viewGroup;
  void groupId;
  const tid = Number(companyId);
  if (!Number.isFinite(tid) || tid <= 0) {
    return { success: true, data: [] };
  }
  try {
    const rows = await fetchAccountListByTenantId(tid, signal);
    let options = rows.map(normalizeTransactionAccountOption).filter(Boolean);
    if (role) {
      const want = String(role).trim().toUpperCase();
      options = options.filter((a) => String(a.role || "").toUpperCase() === want);
    }
    if (status) {
      const wantStatus = String(status).trim().toLowerCase();
      options = options.filter((a) => String(a.status || "").toLowerCase() === wantStatus);
    }
    return { success: true, data: options };
  } catch (err) {
    return { success: false, message: err?.message || "failedToLoadAccounts", data: [] };
  }
}

export async function getCompanyCurrencies({
  companyId,
  viewGroup,
  groupId,
  groupAggregate,
  subsidiaryAccountsOnly,
  signal,
} = {}) {
  void viewGroup;
  void groupId;
  void groupAggregate;
  void subsidiaryAccountsOnly;
  const tid = Number(companyId);
  if (!Number.isFinite(tid) || tid <= 0) {
    return { success: true, data: [] };
  }
  try {
    const rows = await fetchCurrencyListByTenantId(tid, signal);
    const data = rows
      .map((row) => normalizeCurrencyRow(row))
      .filter((row) => row.code);
    return { success: true, data };
  } catch (err) {
    return { success: false, message: err?.message || "failedToLoadCurrencies", data: [] };
  }
}

export async function getUserCurrencyOrder({ companyId, signal } = {}) {
  void signal;
  const cid = Number(companyId);
  return {
    success: true,
    data: {
      order: null,
      company_id: Number.isFinite(cid) && cid > 0 ? cid : null,
    },
  };
}

/** Persist pill order in browser only (no Spring endpoint yet). */
export async function saveUserCurrencyOrder(order, { companyId } = {}) {
  const codes = Array.isArray(order) ? order.map((c) => String(c || "").trim()).filter(Boolean) : [];
  persistUserCurrencyDisplayOrder(codes);
  void companyId;
  return { success: true, data: { order: codes } };
}

function appendTxSearchWlDebugToPath(pathWithQuery) {
  if (typeof window === "undefined") return pathWithQuery;
  const wl =
    new URLSearchParams(window.location.search || "").get("tx_debug_wl") === "1" ||
    window.DEBUG_TRANSACTION_WL_TOTAL === true;
  if (!wl) return pathWithQuery;
  const sep = pathWithQuery.includes("?") ? "&" : "?";
  return `${pathWithQuery}${sep}debug_wl_total=1`;
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

/** All-time account ids that ever had the given form transaction type (PM-aligned). */
export async function fetchTypeAccountSearch({
  companyId,
  viewGroup,
  groupId,
  groupAggregate,
  subsidiaryAccountsOnly,
  transactionType,
  signal,
} = {}) {
  const params = new URLSearchParams();
  appendTransactionScope(params, {
    companyId,
    viewGroup,
    groupId,
    groupAggregate,
    subsidiaryAccountsOnly,
  });
  params.set("transaction_type", String(transactionType || "").toUpperCase().trim());

  const res = await fetch(buildApiUrl(`api/transactions/type_account_search_api.php?${params.toString()}`), {
    credentials: "include",
    cache: "no-cache",
    headers: { "Cache-Control": "no-cache" },
    signal,
  });
  const body = await safeJson(res);
  if (!body?.success) {
    throw new Error(body?.message || body?.error || "Type account search failed");
  }
  const ids = body?.data?.account_ids;
  return Array.isArray(ids) ? ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0) : [];
}

/** Type search: one grid row per approved transaction (all history, PM-aligned). */
export async function fetchTypeTransactionSearch({
  companyId,
  viewGroup,
  groupId,
  groupAggregate,
  subsidiaryAccountsOnly,
  transactionType,
  currencyCodes,
  signal,
} = {}) {
  const params = new URLSearchParams();
  appendTransactionScope(params, {
    companyId,
    viewGroup,
    groupId,
    groupAggregate,
    subsidiaryAccountsOnly,
  });
  params.set("transaction_type", String(transactionType || "").toUpperCase().trim());
  if (Array.isArray(currencyCodes) && currencyCodes.length > 0) {
    params.set("currency", currencyCodes.join(","));
  }

  const res = await fetch(buildApiUrl(`api/transactions/type_transaction_search_api.php?${params.toString()}`), {
    credentials: "include",
    cache: "no-cache",
    headers: { "Cache-Control": "no-cache" },
    signal,
  });
  const body = await safeJson(res);
  if (!body?.success) {
    throw new Error(body?.message || body?.error || "Type transaction search failed");
  }
  return body?.data ?? null;
}

export async function searchTransactions({
  companyId,
  dateFrom,
  dateTo,
  currencyCodes,
  categories,
  signal,
  // BP-only v1: ignore legacy / filter params until those flows migrate
  viewGroup,
  groupId,
  groupAggregate,
  subsidiaryAccountsOnly,
  showInactive,
  showCaptureOnly,
  hideZeroBalance,
  typeSearch,
  typeAccountIds,
  typeSearchFormType,
} = {}) {
  void viewGroup;
  void groupId;
  void groupAggregate;
  void subsidiaryAccountsOnly;
  void showInactive;
  void showCaptureOnly;
  void hideZeroBalance;
  void typeSearch;
  void typeAccountIds;
  void typeSearchFormType;

  try {
    const body = buildSpringSearchRequest({
      companyId,
      dateFrom,
      dateTo,
      currencyCodes,
      categories,
    });
    const res = await fetch(buildApiUrl("api/transaction/search"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
      cache: "no-cache",
      signal,
    });
    const json = await safeJson(res);
    if (!json?.success) {
      return json;
    }
    const grid = normalizeSpringSearchToGrid(json.data);
    const payload = { success: true, message: json.message || "", data: grid };
    logTxSearchResponse(payload);
    return payload;
  } catch (err) {
    return {
      success: false,
      message: err?.message || "searchFailed",
      data: null,
    };
  }
}

export async function submitTransaction({
  companyId,
  viewGroup,
  groupId,
  groupAggregate,
  payload,
  clientRequestId,
}) {
  const txType = String(payload?.transaction_type || "").toUpperCase().trim();

  if (isSpringSubmitType(txType)) {
    try {
      void viewGroup;
      void groupId;
      void groupAggregate;
      void clientRequestId;
      const body = buildSpringSubmitRequest({ companyId, payload });
      const res = await fetch(buildApiUrl("api/transaction/submit"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
        cache: "no-cache",
      });
      const json = await safeJson(res);
      return normalizeSpringSubmitResponse(json);
    } catch (err) {
      return {
        success: false,
        message: err?.message || "submitFailed",
        data: null,
      };
    }
  }

  const fd = new FormData();
  appendTransactionScope(fd, { companyId, viewGroup, groupId, groupAggregate }, "form");
  if (clientRequestId) fd.append("client_request_id", clientRequestId);
  Object.entries(payload || {}).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    fd.append(k, String(v));
  });
  const res = await fetch(buildApiUrl("api/transactions/submit_api.php"), {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  return safeJson(res);
}

export async function getHistory({
  companyId,
  viewGroup,
  groupId,
  groupAggregate,
  subsidiaryAccountsOnly,
  accountId,
  dateFrom,
  dateTo,
  currency,
  virtualCompanyCode,
  pureTypeSearch,
  signal,
} = {}) {
  void viewGroup;
  void groupId;
  void groupAggregate;
  void subsidiaryAccountsOnly;
  void virtualCompanyCode;
  void pureTypeSearch;

  try {
    const body = buildSpringHistoryRequest({
      companyId,
      accountId,
      dateFrom,
      dateTo,
      currency,
    });
    const res = await fetch(buildApiUrl("api/transaction/history"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
      signal,
    });
    const json = await safeJson(res);
    return normalizeSpringHistoryResponse(json);
  } catch (err) {
    return {
      success: false,
      message: err?.message || "failedToLoadHistory",
      data: [],
      account: null,
      date_range: null,
    };
  }
}

export async function loadContraInbox({ companyId, viewGroup, groupId, groupAggregate, signal } = {}) {
  const params = new URLSearchParams();
  appendTransactionScope(params, { companyId, viewGroup, groupId, groupAggregate });
  const res = await fetch(buildApiUrl(`api/transactions/contra_inbox_api.php?${params.toString()}`), {
    credentials: "include",
    cache: "no-cache",
    signal,
  });
  return safeJson(res);
}

export async function approveContra({ transactionId, companyId, viewGroup, groupId, groupAggregate }) {
  const fd = new FormData();
  fd.append("transaction_id", String(transactionId));
  appendTransactionScope(fd, { companyId, viewGroup, groupId, groupAggregate }, "form");
  const res = await fetch(buildApiUrl("api/transactions/contra_approve_api.php"), { method: "POST", body: fd, credentials: "include" });
  return safeJson(res);
}

export async function rejectContra({ transactionId, companyId, viewGroup, groupId, groupAggregate }) {
  const fd = new FormData();
  fd.append("transaction_id", String(transactionId));
  appendTransactionScope(fd, { companyId, viewGroup, groupId, groupAggregate }, "form");
  const res = await fetch(buildApiUrl("api/transactions/contra_reject_api.php"), { method: "POST", body: fd, credentials: "include" });
  return safeJson(res);
}

