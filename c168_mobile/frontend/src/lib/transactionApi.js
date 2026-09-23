/**
 * Transaction Payment — Spring Boot `/api/transaction/*` (+ `/api/pending`, `/api/approved`,
 * `/api/rejected` for Contra Inbox — those three are NOT under `/api/transaction/*`, confirmed
 * against desktop's `pages/transaction/lib/transactionApi.js`).
 *
 * `submitTransaction` now goes to Spring's `POST /api/transaction/submit` for **every** manual
 * type (PAYMENT / CLAIM / CLEAR / CONTRA / ADJUSTMENT / PROFIT / RATE), so nothing in mobile
 * writes the ledger through PHP any more. The legacy payload is still what
 * `AddTransactionSheet` produces and what `useMobileTransaction` reads back for its optimistic
 * deltas — `lib/transactionSubmitNormalize.js` maps it onto the Spring DTO and normalizes the
 * response back.
 */
import { buildApiUrl } from "../utils/apiUrl.js";
import { fetchAccountListByTenantId } from "./accountApi.js";
import { fetchTenantIdByCode } from "./tenantAccessibleApi.js";
import { calculateTotals } from "./transactionPaymentLogic.js";
import {
  buildSpringSubmitRequest,
  normalizeSpringSubmitResponse,
} from "./transactionSubmitNormalize.js";
import MoneyDecimal from "./money/moneyDecimal.js";
import { resolveSavedCurrencyOrder } from "./currencyOrder.js";

export const transactionQueryKeys = {
  searchRoot: () => ["tx-search"],
  categories: () => ["tx-categories"],
  accounts: (scopeKey) => ["tx-accounts", String(scopeKey || "")],
  companyCurrencies: (scopeKey) => ["tx-company-currencies", String(scopeKey || "")],
  userCurrencyOrder: () => ["tx-user-currency-order"],
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

/**
 * Resolve a single Spring tenant id from mobile's scope params ({companyId} or {groupId}).
 * A group is just another tenant — resolved via `auth/tenant-by-code`, same as every other
 * module. Aggregate scope (Groups All / Group All) is NOT handled here — the hook already
 * loops per `transactionScope.mergeCompanyIds` and merges client-side (see
 * `hooks/useMobileTransaction.js`), so each individual call here only ever needs one tenant.
 */
export async function resolveTransactionSpringTenantId({ companyId, groupId } = {}, { signal } = {}) {
  const cid = companyId != null && companyId !== "" ? Number(companyId) : 0;
  if (Number.isFinite(cid) && cid > 0) return cid;
  if (groupId) return fetchTenantIdByCode(groupId, { signal });
  return null;
}

const CATEGORY_PRIORITY = [
  "CAPITAL",
  "BANK",
  "CASH",
  "PROFIT",
  "EXPENSES",
  "COMPANY",
  "PARTNER",
  "STAFF",
  "SUPPLIER",
  "AGENT",
  "MEMBER",
  "DEBTOR",
];

/** Spring has no categories endpoint — same static list desktop derives client-side. */
export async function getCategories() {
  return { success: true, data: [...CATEGORY_PRIORITY] };
}

function normalizeTransactionAccountOption(row) {
  if (!row) return null;
  const code = String(row.account_id || "").trim();
  const name = String(row.name || "").trim();
  const role = String(row.role || "").trim().toUpperCase();
  return {
    id: row.id,
    account_id: code,
    name,
    display_text: name ? `${code} (${name})` : code,
    role,
    currency: null,
    status: row.status,
  };
}

export async function getAccounts({ companyId, viewGroup, groupId, role, status = "active", signal } = {}) {
  const tenantId = await resolveTransactionSpringTenantId({ companyId, groupId: groupId || viewGroup }, { signal });
  if (!tenantId) return { success: true, data: [] };
  const rows = await fetchAccountListByTenantId(tenantId, signal);
  const wantStatus = String(status || "active").trim().toLowerCase();
  const wantRole = role ? String(role).trim().toUpperCase() : "";
  const data = rows
    .map(normalizeTransactionAccountOption)
    .filter(Boolean)
    .filter((row) => {
      if (wantStatus && String(row.status || "").toLowerCase() !== wantStatus) return false;
      if (wantRole && String(row.role || "").toUpperCase() !== wantRole) return false;
      return true;
    });
  return { success: true, data };
}

function normalizeCurrencyRow(raw) {
  return {
    id: Number(raw?.id),
    code: String(raw?.code ?? "").trim().toUpperCase(),
    is_linked: raw?.is_linked != null ? !!raw.is_linked : raw?.isLinked != null ? !!raw.isLinked : false,
  };
}

export async function getCompanyCurrencies({ companyId, viewGroup, groupId, signal } = {}) {
  const tenantId = await resolveTransactionSpringTenantId({ companyId, groupId: groupId || viewGroup }, { signal });
  if (!tenantId) return { success: true, data: [] };
  const res = await fetch(buildApiUrl(`api/currency/list?tenant_id=${encodeURIComponent(tenantId)}`), {
    method: "POST",
    credentials: "include",
    signal,
  });
  const json = await safeJson(res);
  if (!res.ok || !json.success) return { success: true, data: [] };
  const data = (Array.isArray(json.data) ? json.data : [])
    .map(normalizeCurrencyRow)
    .filter((row) => Number.isFinite(row.id) && row.id > 0 && row.code);
  return { success: true, data };
}

/** Spring has no user-level currency order API — localStorage only (lib/currencyOrder.js). */
export async function getUserCurrencyOrder({ companyId, groupId } = {}) {
  const cid = companyId != null && companyId !== "" ? Number(companyId) : 0;
  const hasCid = Number.isFinite(cid) && cid > 0;
  const gid = groupId != null ? String(groupId).trim().toUpperCase() : "";
  const orderKey = hasCid ? cid : gid ? `g:${gid}` : null;
  const order = orderKey ? resolveSavedCurrencyOrder(orderKey, null) : null;
  return {
    success: true,
    data: {
      order: Array.isArray(order) && order.length ? order : null,
      company_id: hasCid ? cid : null,
      group_id: gid || null,
    },
  };
}

export { saveUserCurrencyOrder } from "./currencyOrder.js";

/** Spring has no type-account index — `null` = skip the id filter, fall back to period search. */
export async function fetchTypeAccountSearch() {
  return null;
}

/** No dedicated all-time endpoint — same period /search grid, matching desktop's fallback. */
export async function fetchTypeTransactionSearch({
  companyId,
  viewGroup,
  groupId,
  dateFrom,
  dateTo,
  currencyCodes,
  signal,
} = {}) {
  const result = await searchTransactions({
    companyId,
    viewGroup,
    groupId,
    dateFrom,
    dateTo,
    currencyCodes,
    hideZeroBalance: false,
    signal,
  });
  if (!result?.success) {
    throw new Error(result?.message || result?.error || "Type transaction search failed");
  }
  return result.data ?? null;
}

/** Spring TransactionDTO.SearchResult → grid shape TransactionTablesSection.jsx already reads. */
function normalizeSpringSearchToGrid(data) {
  if (!data || typeof data !== "object") return emptySearchGrid();
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const left = [];
  const right = [];
  for (const row of rows) {
    if (!row || row.accountId == null) continue;
    const gridRow = {
      account_id: String(row.accountCode || "").trim(),
      account_name: String(row.accountName || "").trim(),
      account_db_id: row.accountId,
      role: String(row.role || "").trim().toUpperCase(),
      currency: String(row.currencyCode || "").trim().toUpperCase(),
      bf: String(row.bf ?? "0.00"),
      win_loss: String(row.winLoss ?? "0.00"),
      win_loss_full: String(row.winLoss ?? "0.00"),
      cr_dr: String(row.crDr ?? "0.00"),
      balance: String(row.balance ?? "0.00"),
      balance_full: String(row.balance ?? "0.00"),
      has_crdr_transactions: row.hasCrDrInPeriod ? 1 : 0,
      has_contra_clear_period: 0,
      has_win_loss_transactions: row.hasWinLossInPeriod ? 1 : 0,
      has_win_loss_history: 0,
      has_period_id_product_rows: row.hasWinLossInPeriod ? 1 : 0,
      is_alert: row.alertActive ? 1 : 0,
      is_rate_middleman: 0,
      never_transacted: row.neverTransacted ? 1 : 0,
    };
    if (MoneyDecimal.cmp(gridRow.balance, "0") < 0) right.push(gridRow);
    else left.push(gridRow);
  }
  const totalsRaw = data.totals || {};
  const summary = {
    bf: String(totalsRaw.bf ?? "0.00"),
    win_loss: String(totalsRaw.winLoss ?? "0.00"),
    cr_dr: String(totalsRaw.crDr ?? "0.00"),
    balance: String(totalsRaw.balance ?? "0.00"),
  };
  return {
    left_table: left,
    right_table: right,
    totals: { left: calculateTotals(left), right: calculateTotals(right), summary },
    active_currency_codes: Array.isArray(data.activeCurrencyCodes)
      ? data.activeCurrencyCodes.map((c) => String(c || "").trim().toUpperCase()).filter(Boolean)
      : [],
  };
}

function emptySearchGrid() {
  const zero = { bf: "0.00", win_loss: "0.00", cr_dr: "0.00", balance: "0.00" };
  return { left_table: [], right_table: [], totals: { left: zero, right: zero, summary: zero }, active_currency_codes: [] };
}

/** POST /api/transaction/search — one tenant per call (aggregate looping is the hook's job). */
export async function searchTransactions({
  companyId,
  viewGroup,
  groupId,
  hideZeroBalance,
  currencyCodes,
  categories,
  dateFrom,
  dateTo,
  signal,
} = {}) {
  const tenantId = await resolveTransactionSpringTenantId({ companyId, groupId: groupId || viewGroup }, { signal });
  if (!tenantId) return { success: false, message: "tenantIdRequired", data: null };
  const request = {
    tenantId,
    dateFrom: String(dateFrom || "").trim(),
    dateTo: String(dateTo || "").trim(),
    currencyCodes: Array.isArray(currencyCodes)
      ? currencyCodes.map((c) => String(c || "").trim().toUpperCase()).filter(Boolean)
      : [],
    categories: Array.isArray(categories)
      ? categories.map((c) => String(c || "").trim().toUpperCase()).filter(Boolean)
      : [],
    showAllZeroBalance: !hideZeroBalance,
  };
  const json = await postSpringJson("api/transaction/search", request, signal);
  if (!isSpringOk(json)) {
    return { success: false, message: json?.message || "Transaction search failed", data: null };
  }
  return { success: true, message: json.message || "", data: normalizeSpringSearchToGrid(json.data) };
}

function normalizeHistoryRow(raw) {
  if (!raw || typeof raw !== "object") return null;
  const rowType = raw.rowType ?? null;
  return {
    id: raw.id ?? null,
    row_type: String(rowType || "").toLowerCase() === "bf" ? "bf" : null,
    date: raw.date ?? "-",
    is_bank_process_transaction: Boolean(raw.isBankProcessTransaction ?? false),
    card_owner: raw.cardOwner ?? "",
    product: raw.product ?? "",
    currency: String(raw.currency ?? raw.currencyCode ?? "").trim().toUpperCase(),
    rate: raw.rate ?? "-",
    win_loss: String(raw.winLoss ?? "0.00"),
    cr_dr: String(raw.crDr ?? "0.00"),
    balance: String(raw.balance ?? "0.00"),
    description: raw.description ?? "",
    remark: raw.remark ?? "",
    sms: raw.sms ?? "",
    created_by: raw.createdBy ?? "",
  };
}

/** POST /api/transaction/history — one tenant + one account per call. */
export async function getHistory({
  companyId,
  viewGroup,
  groupId,
  accountId,
  dateFrom,
  dateTo,
  currency,
  signal,
} = {}) {
  const tenantId = await resolveTransactionSpringTenantId({ companyId, groupId: groupId || viewGroup }, { signal });
  const accountDbId = Number(accountId);
  if (!tenantId || !Number.isFinite(accountDbId) || accountDbId <= 0) {
    return { success: false, message: "tenantIdRequired", data: [] };
  }
  const currencyCodes = String(currency || "")
    .split(",")
    .map((c) => String(c || "").trim().toUpperCase())
    .filter(Boolean);
  const json = await postSpringJson(
    "api/transaction/history",
    { tenantId, accountId: accountDbId, dateFrom: String(dateFrom || "").trim(), dateTo: String(dateTo || "").trim(), currencyCodes },
    signal,
  );
  if (!json?.success || !json.data) {
    return { success: false, message: json?.message || "failedToLoadHistory", data: [], account: null, date_range: null };
  }
  const payload = json.data;
  const historyRaw = Array.isArray(payload.history) ? payload.history : Array.isArray(payload) ? payload : [];
  const rows = historyRaw.map(normalizeHistoryRow).filter(Boolean);
  const account = payload.account
    ? { id: payload.account.id, account_id: String(payload.account.accountId ?? "").trim(), name: String(payload.account.name ?? "").trim() }
    : null;
  const rangeRaw = payload.dateRange ?? null;
  const date_range = rangeRaw ? { from: rangeRaw.from ?? "", to: rangeRaw.to ?? "" } : null;
  return { success: true, message: json.message || "", data: rows, account, date_range };
}

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

/** POST /api/pending — PENDING manual transactions awaiting approval (Contra Inbox). */
export async function loadContraInbox({ companyId, viewGroup, groupId, signal } = {}) {
  const tenantId = await resolveTransactionSpringTenantId({ companyId, groupId: groupId || viewGroup }, { signal });
  if (!tenantId) return { success: true, data: [] };
  const json = await postSpringJson("api/pending", { tenantId }, signal);
  if (!isSpringOk(json)) return { success: false, message: json?.message || "loadContraInboxFailed", data: [] };
  return { success: true, data: (Array.isArray(json.data) ? json.data : []).map(normalizeContraInboxRow) };
}

export async function approveContra({ transactionId, companyId, viewGroup, groupId } = {}) {
  const tenantId = await resolveTransactionSpringTenantId({ companyId, groupId: groupId || viewGroup });
  const id = Number(transactionId);
  if (!tenantId || !Number.isFinite(id) || id <= 0) return { success: false, message: "invalidRequest", data: null };
  const json = await postSpringJson("api/approved", { tenantId, id });
  return { success: isSpringOk(json), message: json?.message || "", data: null };
}

export async function rejectContra({ transactionId, companyId, viewGroup, groupId } = {}) {
  const tenantId = await resolveTransactionSpringTenantId({ companyId, groupId: groupId || viewGroup });
  const id = Number(transactionId);
  if (!tenantId || !Number.isFinite(id) || id <= 0) return { success: false, message: "invalidRequest", data: null };
  const json = await postSpringJson("api/rejected", { tenantId, id });
  return { success: isSpringOk(json), message: json?.message || "", data: null };
}

/* ------------------------------------------------------------------ */
/* Submit — Spring `POST /api/transaction/submit`, all manual types.    */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Submit — Spring `POST /api/transaction/submit`, all manual types.    */
/* ------------------------------------------------------------------ */

/**
 * Post a manual transaction to Spring.
 *
 * `payload` is the legacy shape produced by `AddTransactionSheet`; `transactionSubmitNormalize`
 * owns the mapping. `groupAggregate` and `clientRequestId` are accepted but unused: the first was
 * a PHP scope flag (Spring resolves the tenant from `tenantId` alone), and the second was the PHP
 * endpoint's idempotency key, for which the Spring DTO has no counterpart.
 *
 * Errors come back as `{ success:false, message }` rather than throwing — the mapping function
 * signals validation failures with translation keys (`toAccountRequired`, `invalidAmount`, …),
 * matching how every other function in this module already behaves.
 */
export async function submitTransaction({ companyId, viewGroup, groupId, payload }) {
  const tenantId = await resolveTransactionSpringTenantId({
    companyId,
    groupId: groupId || viewGroup,
  });
  if (!tenantId) {
    return { success: false, message: "tenantIdRequired", data: null };
  }

  try {
    const request = buildSpringSubmitRequest({ companyId: tenantId, payload });
    const json = await postSpringJson("api/transaction/submit", request);
    return normalizeSpringSubmitResponse(json);
  } catch (e) {
    return { success: false, message: e?.message || "submitFailed", data: null };
  }
}
