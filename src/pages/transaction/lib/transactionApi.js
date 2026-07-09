import { buildApiUrl } from "../../../utils/core/apiUrl.js";

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
  const res = await fetch(buildApiUrl("api/transactions/get_categories_api.php"), { credentials: "include" });
  return safeJson(res);
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

export async function getAccounts({ companyId, viewGroup, groupId, role, status = "active", currency, signal } = {}) {
  const params = new URLSearchParams();
  appendTransactionScope(params, { companyId, viewGroup, groupId });
  if (role) params.set("role", role);
  if (status) params.set("status", status);
  if (currency) params.set("currency", currency);
  const res = await fetch(buildApiUrl(`api/transactions/get_accounts_api.php?${params.toString()}`), {
    credentials: "include",
    signal,
  });
  return safeJson(res);
}

export async function getCompanyCurrencies({
  companyId,
  viewGroup,
  groupId,
  groupAggregate,
  subsidiaryAccountsOnly,
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
  const cid = companyId != null && companyId !== "" ? Number(companyId) : 0;
  const useScopeCurrencyApi =
    (groupAggregate && !(Number.isFinite(cid) && cid > 0) && (viewGroup || groupId)) ||
    (Number.isFinite(cid) && cid > 0 && subsidiaryAccountsOnly);
  const path = useScopeCurrencyApi
    ? "api/transactions/get_scope_account_currencies_api.php"
    : "api/transactions/get_company_currencies_api.php";
  const res = await fetch(buildApiUrl(`${path}?${params.toString()}`), {
    credentials: "include",
    signal,
  });
  return safeJson(res);
}

export async function getUserCurrencyOrder({ companyId, signal } = {}) {
  const params = new URLSearchParams({ _t: String(Date.now()) });
  const cid = companyId != null && companyId !== "" ? Number(companyId) : 0;
  if (Number.isFinite(cid) && cid > 0) params.set("company_id", String(cid));
  const res = await fetch(
    buildApiUrl(`api/transactions/user_currency_order_api.php?${params.toString()}`),
    { credentials: "include", signal },
  );
  return safeJson(res);
}

/** Same contract as legacy JS: POST JSON `{ order: string[] }` (see api/transactions/user_currency_order_api.php). */
export async function saveUserCurrencyOrder(order, { companyId } = {}) {
  const codes = Array.isArray(order) ? order.map((c) => String(c || "").trim()).filter(Boolean) : [];
  const body = { order: codes };
  const cid = companyId != null && companyId !== "" ? Number(companyId) : 0;
  if (Number.isFinite(cid) && cid > 0) {
    body.company_id = cid;
  }
  const res = await fetch(buildApiUrl("api/transactions/user_currency_order_api.php"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  return safeJson(res);
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

export async function searchTransactions({
  companyId,
  viewGroup,
  groupId,
  groupAggregate,
  subsidiaryAccountsOnly,
  dateFrom,
  dateTo,
  showInactive,
  showCaptureOnly,
  hideZeroBalance,
  currencyCodes,
  categories,
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
  params.set("date_from", String(dateFrom || ""));
  params.set("date_to", String(dateTo || ""));
  params.set("show_inactive", showInactive ? "1" : "0");
  params.set("show_capture_only", showCaptureOnly ? "1" : "0");
  params.set("hide_zero_balance", hideZeroBalance ? "1" : "0");
  if (Array.isArray(currencyCodes) && currencyCodes.length > 0) params.set("currency", currencyCodes.join(","));
  if (Array.isArray(categories) && categories.length > 0) params.set("category", categories.join(","));

  const base = `api/transactions/search_api.php?${params.toString()}`;
  const withDebug = appendTxSearchWlDebugToPath(base);
  const url = buildApiUrl(withDebug);

  const res = await fetch(url, {
    credentials: "include",
    cache: "no-cache",
    headers: { "Cache-Control": "no-cache" },
    signal,
  });
  const body = await safeJson(res);
  logTxSearchResponse(body);
  return body;
}

export async function submitTransaction({
  companyId,
  viewGroup,
  groupId,
  groupAggregate,
  payload,
  clientRequestId,
}) {
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
  if (accountId != null && accountId !== "") params.set("account_id", String(accountId));
  if (dateFrom) params.set("date_from", String(dateFrom));
  if (dateTo) params.set("date_to", String(dateTo));
  if (currency) params.set("currency", String(currency));
  if (virtualCompanyCode) params.set("virtual_company_code", String(virtualCompanyCode));

  const res = await fetch(buildApiUrl(`api/transactions/history_api.php?${params.toString()}&_t=${Date.now()}`), {
    credentials: "include",
    cache: "no-cache",
    headers: { "Cache-Control": "no-cache" },
    signal,
  });
  const body = await safeJson(res);
  /** PHP returns { data: { account, date_range, history: Row[] } }; normalize to rows + meta for React. */
  if (
    body?.success &&
    body.data &&
    typeof body.data === "object" &&
    !Array.isArray(body.data) &&
    Array.isArray(body.data.history)
  ) {
    return {
      ...body,
      data: body.data.history,
      account: body.data.account,
      date_range: body.data.date_range,
    };
  }
  return body;
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

