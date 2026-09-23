/**
 * Member Win/Loss — Spring Boot `/api/member/*` (+ `/api/transaction/search` fallback).
 * Copied from Count-frontend/src/pages/member/memberWinLossApi.js (desktop) — a dedicated,
 * purpose-built member-facing API, much simpler than the old PHP action-router endpoints it
 * replaces (`account_currency_api.php`, `account_link_api.php`, `history_api.php?member_view=1`).
 *
 * Big simplifications vs. the old mobile code:
 * - `/api/member/profile` resolves "self + every account visible via Account Link" from the
 *   session directly — no `account_id`/`company_id`/`group_id` scope params needed at all.
 * - `/api/member/history` takes a `currencyCodes` array and returns everything in ONE call —
 *   mobile's old code ran one `history_api.php` call per currency when more than one was
 *   selected; that loop is gone.
 * - `/api/member/mini-grid-balances` batches every (account × currency) closing balance into
 *   ONE call — mobile's old code ran `fetchAccountHistoryClosingBalance` once per pair.
 * - Dates are YMD, passed straight through (no `ymdToDmy` conversion — that was only for the
 *   old PHP endpoints).
 */
import { buildApiUrl } from "../utils/apiUrl.js";
import { normalizeNumber } from "./memberHelpers.js";

async function getSpringJson(path, signal) {
  const res = await fetch(buildApiUrl(path), { credentials: "include", cache: "no-store", signal });
  return res.json().catch(() => ({}));
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
  return res.json().catch(() => ({}));
}

/** GET /api/member/profile — self + every account visible via Account Link. */
export async function fetchMemberLinkedAccounts(signal) {
  const json = await getSpringJson("api/member/profile", signal);
  if (!json?.success || !json.data?.hasAccountLink) return [];
  const list = Array.isArray(json.data.linkedAccounts) ? json.data.linkedAccounts : [];
  return list.map((a) => ({ id: Number(a.id), account_id: String(a.accountCode || ""), name: String(a.name || "") }));
}

/** POST /api/member/account-currencies — one account's own currencies. */
export async function fetchMemberAccountCurrencyRows(accountId, signal) {
  const json = await postSpringJson("api/member/account-currencies", Number(accountId), signal);
  if (!json?.success || !Array.isArray(json.data)) return [];
  return json.data
    .map((c) => String(c.code || "").trim().toUpperCase())
    .filter(Boolean)
    .map((code) => ({ code }));
}

/** accountId → Set(currency codes), for every linked account — one batched request. */
export async function fetchMemberBatchAccountCurrencies(accountIds, signal) {
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
      if (code) set.add(code);
    });
    map.set(id, set);
  });
  return map;
}

/** POST /api/member/history — Win/Loss report rows for one account, all requested currencies in one call. */
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
  if (!json?.success) throw new Error(json?.message || "History request failed");
  return Array.isArray(json.data?.history) ? json.data.history : [];
}

/** POST /api/member/mini-grid-balances — closing balance per (account, currency), batched. */
export async function fetchMemberMiniGridBalances({ accountIds, currencyCodes, dateFrom, dateTo, signal }) {
  const ids = [...new Set((accountIds || []).map((id) => Number(id)).filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;
  const json = await postSpringJson(
    "api/member/mini-grid-balances",
    { accountIds: ids, currencyCodes: Array.isArray(currencyCodes) ? currencyCodes : [], dateFrom: String(dateFrom || ""), dateTo: String(dateTo || "") },
    signal,
  );
  if (!json?.success) throw new Error(json?.message || "Mini grid balances request failed");
  (Array.isArray(json.data) ? json.data : []).forEach((row) => {
    const id = Number(row.accountId);
    const cu = String(row.currency || "").trim().toUpperCase();
    if (!id || !cu) return;
    map.set(`${id}|${cu}`, normalizeNumber(row.balance));
  });
  return map;
}
