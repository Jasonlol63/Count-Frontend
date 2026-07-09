/** Parse JSON from API responses that may include leading noise. */
import { buildApiUrl } from "../../utils/core/apiUrl.js";

import { memberHistoryClosingBalancesForAllCurrencies, normalizeNumber } from "./memberPageHelpers.js";

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

/** Map get_all_linked_accounts API rows to member page account objects. */
export function mapLinkedAccountsApiList(data) {
  if (!Array.isArray(data)) return [];
  return data.map((acc) => ({
    id: acc.id,
    account_id: acc.account_id || "",
    name: acc.name || "",
  }));
}

/** Map batch account-currencies API rows to accountId → Set(currency codes). */
export function mapBatchCurrencies(data, currencySortOrderRef) {
  const map = new Map();
  (data || []).forEach((row) => {
    const id = Number(row.account_id);
    if (!id) return;
    const set = new Set();
    (row.currencies || []).forEach((c) => {
      const code = String(c.currency_code || c.code || "")
        .trim()
        .toUpperCase();
      if (code) {
        set.add(code);
        const cid = c.currency_id != null ? Number(c.currency_id) : null;
        if (cid && !currencySortOrderRef.current[code]) {
          currencySortOrderRef.current[code] = cid;
        }
      }
    });
    map.set(id, set);
  });
  return map;
}

/** 单账户单币种：与 Payment History 同口径取区间末 Balance */
export async function fetchAccountHistoryClosingBalance(accountId, currency, fromDate, toDate, companyId, signal) {
  const cu = String(currency || "")
    .trim()
    .toUpperCase();
  const params = new URLSearchParams({
    account_id: String(accountId),
    date_from: fromDate,
    date_to: toDate,
    company_id: String(companyId),
    currency: cu,
  });
  const res = await fetch(buildApiUrl(`api/transactions/history_api.php?${params}&_t=${Date.now()}`), {
    credentials: "include",
    cache: "no-store",
    signal,
  });
  const json = await parseJsonResponse(await res.text());
  if (!json?.success) {
    throw new Error(json?.error || json?.message || "History request failed");
  }
  const wanted = new Set([cu]);
  const map = memberHistoryClosingBalancesForAllCurrencies(json.data?.history ?? [], wanted);
  return map.get(cu) ?? normalizeNumber("0");
}
