/** Spring `/api/member/*` + `/api/transaction/search` fetch helpers for the Member Win/Loss page. */
import { buildApiUrl } from "../../utils/core/apiUrl.js";
import { normalizeNumber } from "./memberPageHelpers.js";

/** Parse JSON from API responses that may include leading noise. */
export function parseJsonResponse(text) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    if (start === -1) throw new Error("Invalid JSON response");
    let depth = 0;
    let inString = false;
    let escaped = false;
    let quote = "";
    let end = -1;
    for (let i = start; i < raw.length; i += 1) {
      const ch = raw[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (inString) {
        if (ch === "\\") escaped = true;
        else if (ch === quote) inString = false;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inString = true;
        quote = ch;
        continue;
      }
      if (ch === "{") depth += 1;
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) throw new Error("Invalid JSON response");
    return JSON.parse(raw.slice(start, end + 1));
  }
}

async function getSpringJson(path, signal) {
  const res = await fetch(buildApiUrl(path), { credentials: "include", cache: "no-store", signal });
  return parseJsonResponse(await res.text());
}

async function postSpringJson(path, body, signal) {
  const res = await fetch(buildApiUrl(path), {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  return parseJsonResponse(await res.text());
}

/**
 * GET /api/member/profile — self + every account visible via Account Link (bidirectional,
 * or unidirectional with the logged-in account as source). Empty array when there's no link.
 */
export async function fetchMemberLinkedAccounts(signal) {
  const json = await getSpringJson("api/member/profile", signal);
  if (!json?.success || !json.data?.hasAccountLink) return [];
  const list = Array.isArray(json.data.linkedAccounts) ? json.data.linkedAccounts : [];
  return list.map((a) => ({ id: Number(a.id), account_id: String(a.accountCode || ""), name: String(a.name || "") }));
}

/** POST /api/member/account-currencies (body: accountId) — one account's own currencies: [{currency_id, currency_code}]. */
export async function fetchMemberAccountCurrencyRows(accountId, signal) {
  const json = await postSpringJson("api/member/account-currencies", Number(accountId), signal);
  if (!json?.success || !Array.isArray(json.data)) return [];
  return json.data
    .map((c) => ({
      currency_id: c.id != null ? Number(c.id) : null,
      currency_code: String(c.code || "").trim().toUpperCase(),
    }))
    .filter((c) => c.currency_code);
}

/** accountId → Set(currency codes), for every linked account — one batched request. */
export async function fetchMemberBatchAccountCurrencies(accountIds, currencySortOrderRef, signal) {
  const ids = [...new Set((accountIds || []).map((id) => Number(id)).filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;
  const json = await postSpringJson("api/member/account-currencies/batch", { accountIds: ids }, signal);
  if (!json?.success || !Array.isArray(json.data)) return map;
  json.data.forEach((entry) => {
    const id = Number(entry.accountId);
    if (!id) return;
    const set = new Set();
    (Array.isArray(entry.currencies) ? entry.currencies : []).forEach((c) => {
      const code = String(c.code || "").trim().toUpperCase();
      if (!code) return;
      set.add(code);
      const currencyId = c.id != null ? Number(c.id) : null;
      if (currencyId && !currencySortOrderRef.current[code]) {
        currencySortOrderRef.current[code] = currencyId;
      }
    });
    map.set(id, set);
  });
  return map;
}

/** POST /api/member/history — Win/Loss report rows for one account (self, or visible via Account Link). */
export async function fetchMemberHistoryRows({ accountId, dateFrom, dateTo, currencyCodes, signal }) {
  const json = await postSpringJson(
    "api/member/history",
    {
      accountId: Number(accountId) || undefined,
      dateFrom: String(dateFrom || ""),
      dateTo: String(dateTo || ""),
      currencyCodes: Array.isArray(currencyCodes) ? currencyCodes : [],
    },
    signal,
  );
  if (!json?.success) {
    throw new Error(json?.message || "History request failed");
  }
  return Array.isArray(json.data?.history) ? json.data.history : [];
}

/**
 * POST /api/member/mini-grid-balances — closing balance per (account, currency), in one call.
 * Returns a Map keyed `${accountId}|${CURRENCY}` → MoneyDecimal, same shape the mini grid's
 * balance map already expects.
 */
export async function fetchMemberMiniGridBalances({ accountIds, currencyCodes, dateFrom, dateTo, signal }) {
  const ids = [...new Set((accountIds || []).map((id) => Number(id)).filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;
  const json = await postSpringJson(
    "api/member/mini-grid-balances",
    {
      accountIds: ids,
      currencyCodes: Array.isArray(currencyCodes) ? currencyCodes : [],
      dateFrom: String(dateFrom || ""),
      dateTo: String(dateTo || ""),
    },
    signal,
  );
  if (!json?.success) {
    throw new Error(json?.message || "Mini grid balances request failed");
  }
  (Array.isArray(json.data) ? json.data : []).forEach((row) => {
    const id = Number(row.accountId);
    const cu = String(row.currency || "").trim().toUpperCase();
    if (!id || !cu) return;
    map.set(`${id}|${cu}`, normalizeNumber(row.balance));
  });
  return map;
}

/**
 * POST /api/transaction/search — tenant-wide summary, filtered to one account. Used only as a
 * fallback currency source when the account has no configured currencies of its own (see
 * getAvailableCurrenciesFromSummaryOnly); currency_id is not available from this endpoint.
 */
export async function fetchMemberCurrencySummaryRows({ tenantId, accountId, dateFrom, dateTo, signal }) {
  const json = await postSpringJson(
    "api/transaction/search",
    {
      tenantId: Number(tenantId),
      dateFrom: String(dateFrom || ""),
      dateTo: String(dateTo || ""),
      currencyCodes: [],
      categories: [],
      showAllZeroBalance: true,
    },
    signal,
  );
  if (!json?.success) {
    throw new Error(json?.message || "Currency summary request failed");
  }
  const rows = Array.isArray(json.data?.rows) ? json.data.rows : [];
  return rows
    .filter((r) => Number(r.accountId) === Number(accountId))
    .map((r) => ({
      currency: String(r.currencyCode || "").trim().toUpperCase(),
      currency_id: null,
    }));
}
