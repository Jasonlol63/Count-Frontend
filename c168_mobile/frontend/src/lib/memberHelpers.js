import MoneyDecimal from "./money/moneyDecimal.js";

export function scopeQueryFields(compId, gid) {
  return gid ? { group_id: gid } : { company_id: String(compId) };
}

export function hasScope(compId, gid) {
  return Boolean(compId) || Boolean(gid);
}

export function parseJsonResponse(text) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    if (start === -1) return {};
    try {
      return JSON.parse(raw.slice(start));
    } catch {
      return {};
    }
  }
}

export function mapLinkedAccountsApiList(data) {
  if (!Array.isArray(data)) return [];
  return data.map((acc) => ({
    id: acc.id,
    account_id: acc.account_id || "",
    name: acc.name || "",
  }));
}

export function normalizeNumber(value) {
  try {
    return MoneyDecimal.toDecimal(value || "0", 0);
  } catch {
    return MoneyDecimal.toDecimal("0", 0);
  }
}

export function computeTableTotals(rows) {
  let totalWinLoss = normalizeNumber("0");
  let totalCrDr = normalizeNumber("0");
  let closingBalance = normalizeNumber("0");
  (rows || []).forEach((row) => {
    totalWinLoss = totalWinLoss.plus(normalizeNumber(row.win_loss));
    totalCrDr = totalCrDr.plus(normalizeNumber(row.cr_dr));
    if (row.balance !== "-" && row.balance != null && String(row.balance).trim() !== "") {
      closingBalance = normalizeNumber(row.balance);
    }
  });
  return { totalWinLoss, totalCrDr, closingBalance };
}

export function groupHistoryForDisplay(historyRows, isAllSelected, selectedCurrencies, availableCurrencies) {
  const map = new Map();
  const rows = Array.isArray(historyRows) ? historyRows : [];
  for (const row of rows) {
    const c = String(row.currency || "-").trim() || "-";
    if (!map.has(c)) map.set(c, []);
    map.get(c).push(row);
  }
  if (isAllSelected) {
    const order = availableCurrencies.length > 0 ? availableCurrencies : Array.from(map.keys());
    return order.map((c) => [c, map.get(c) || []]).filter(([, list]) => list.length > 0);
  }
  if (!selectedCurrencies.length) return [];
  return selectedCurrencies.map((c) => [c, map.get(c) || []]);
}

export function applyCurrencyAllToggle() {
  return { isAllSelected: true, selectedCurrencies: [] };
}

/**
 * Currency pill toggle — desktop Member parity:
 * - From ALL → clicking a code selects only that code
 * - Otherwise multi-select add/remove; empty selection allowed
 */
export function applyCurrencyToggle(available, isAllSelected, selectedCurrencies, code) {
  const cu = String(code || "")
    .trim()
    .toUpperCase();
  if (!available?.length) {
    return { isAllSelected: true, selectedCurrencies: [] };
  }
  if (!cu) {
    return { isAllSelected: Boolean(isAllSelected), selectedCurrencies: [...(selectedCurrencies || [])] };
  }
  if (isAllSelected) {
    return { isAllSelected: false, selectedCurrencies: [cu] };
  }
  const current = (selectedCurrencies || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean);
  if (current.includes(cu)) {
    const next = current.filter((c) => c !== cu);
    return { isAllSelected: false, selectedCurrencies: next };
  }
  const availSet = new Set(available.map((c) => String(c || "").trim().toUpperCase()).filter(Boolean));
  const next = [...current, cu].filter((c) => availSet.has(c));
  if (next.length === availSet.size) {
    return { isAllSelected: true, selectedCurrencies: [] };
  }
  return { isAllSelected: false, selectedCurrencies: next };
}

/** YYYY-MM-DD → DD/MM/YYYY for history_api */
export function ymdToDmy(ymd) {
  const [y, m, d] = String(ymd || "").split("-");
  if (!y || !m || !d) return "";
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

export function todayYmd() {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Currencies shown in mobile Balances strip — follows Member currency filter. */
export function getMemberMiniGridCurrencies(availableCurrencies, isAllSelected, selectedCurrencies) {
  const available = (availableCurrencies || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean);
  if (isAllSelected) return available;
  const selected = (selectedCurrencies || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean);
  return available.filter((c) => selected.includes(c));
}

/** Map get_batch_account_currencies rows → accountId → Set(codes). */
export function mapBatchAccountCurrencies(data) {
  const map = new Map();
  (data || []).forEach((row) => {
    const id = Number(row.account_id);
    if (!id) return;
    const set = new Set();
    (row.currencies || []).forEach((c) => {
      const code = String(c.currency_code || c.code || "")
        .trim()
        .toUpperCase();
      if (code) set.add(code);
    });
    map.set(id, set);
  });
  return map;
}

/**
 * Desktop parity: only treat a currency as “held” when batch currencies say so.
 * Empty set / not loaded → allow (same as desktop).
 */
export function accountHoldsMiniGridCurrency(linkedAccountCurrenciesMap, linkedCurrenciesLoaded, accountId, currencyUpper) {
  const cu = String(currencyUpper || "")
    .trim()
    .toUpperCase();
  if (!cu) return true;
  if (!linkedCurrenciesLoaded) return true;
  const set = linkedAccountCurrenciesMap?.get(Number(accountId));
  if (!set || set.size === 0) return true;
  return set.has(cu);
}

/** Last non-empty balance per currency from history rows → Decimal map. */
export function memberHistoryClosingBalancesForAllCurrencies(rows, wantedUpperSet) {
  const map = new Map();
  wantedUpperSet.forEach((cu) => map.set(cu, normalizeNumber("0")));
  (rows || []).forEach((row) => {
    const rc = String(row.currency || "")
      .trim()
      .toUpperCase();
    if (!wantedUpperSet.has(rc)) return;
    if (row.balance !== "-" && row.balance != null && String(row.balance).trim() !== "") {
      map.set(rc, normalizeNumber(row.balance));
    }
  });
  return map;
}

/** Sum balances per currency — skip currencies an account does not hold. */
export function computeMiniGridTotals(
  balanceMap,
  orderUpper,
  accounts,
  linkedAccountCurrenciesMap = null,
  linkedCurrenciesLoaded = false,
) {
  const totalsByCu = new Map();
  (orderUpper || []).forEach((cu) => totalsByCu.set(cu, normalizeNumber("0")));
  (accounts || []).forEach((acc) => {
    const id = Number(acc.id);
    if (id <= 0) return;
    (orderUpper || []).forEach((cu) => {
      if (
        linkedCurrenciesLoaded &&
        !accountHoldsMiniGridCurrency(linkedAccountCurrenciesMap, linkedCurrenciesLoaded, id, cu)
      ) {
        return;
      }
      const dec = balanceMap?.get(`${id}|${cu}`);
      if (dec != null && typeof dec.plus === "function") {
        totalsByCu.set(cu, totalsByCu.get(cu).plus(dec));
      }
    });
  });
  return totalsByCu;
}

