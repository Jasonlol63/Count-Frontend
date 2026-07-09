import { parseBalanceValue } from "./transactionFormat.js";
import { MoneyDecimal } from "../../../utils/money/moneyDecimal.js";
import { resolveSavedCurrencyOrder } from "../../../utils/company/currencyDisplayOrder.js";

export const TRANSACTION_CURRENCY_FILTER_KEY_PREFIX = "transaction_currency_filter_v1_";
export const TX_LIST_SESSION_PREFIX = "count168_txlist_v1_";
export const TX_LIST_INVALIDATE_LS_KEY = "count168_tx_invalidate_ts";
export const TX_DATA_CHANGED_EVENT = "tx-data-changed";

/** @param {string|null|undefined} role */
export function getRoleClass(role) {
  if (!role) return "";
  const roleLower = String(role).toLowerCase().trim();
  const roleMap = {
    capital: "transaction-role-capital",
    bank: "transaction-role-bank",
    cash: "transaction-role-cash",
    profit: "transaction-role-profit",
    expenses: "transaction-role-expenses",
    company: "transaction-role-company",
    partner: "transaction-role-partner",
    staff: "transaction-role-staff",
    upline: "transaction-role-upline",
    agent: "transaction-role-agent",
    member: "transaction-role-member",
    debtor: "transaction-role-debtor",
    none: "transaction-role-none",
  };
  return roleMap[roleLower] || "";
}

export function getRoleSortOrder(role) {
  if (!role) return 999;
  const roleLower = String(role).toLowerCase().trim();
  const roleOrder = {
    capital: 1,
    bank: 2,
    cash: 3,
    profit: 4,
    expenses: 5,
    company: 6,
    staff: 7,
    upline: 8,
    agent: 9,
    member: 10,
    none: 11,
  };
  return roleOrder[roleLower] ?? 999;
}

export function sortByRole(data) {
  return [...(data || [])].sort((a, b) => {
    const roleA = getRoleSortOrder(a.role);
    const roleB = getRoleSortOrder(b.role);
    if (roleA !== roleB) return roleA - roleB;
    return String(a.account_id || "").localeCompare(String(b.account_id || ""));
  });
}

/** 与 search_api.php 去重键一致：account_db_id + currency（防止异常重复行）。 */
export function dedupeRowsByAccountAndCurrency(rows) {
  const out = [];
  const indexByKey = new Map();
  const norm = (v) => String(v || "").toUpperCase().trim();
  const keyOf = (row) => {
    const currency = norm(row?.currency);
    // Prefer stable UI identity (account_id). account_db_id is fallback only.
    const accountCode = norm(row?.account_id);
    const accountDbId = norm(row?.account_db_id);
    const anchor = accountCode || `DB:${accountDbId}`;
    return `${anchor}_${currency}`;
  };
  const toAbs = (v) => Math.abs(parseBalanceValue(v) ?? 0);
  const toBoolFlag = (v) => {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    return parseInt(String(v || "0"), 10) !== 0;
  };
  const scoreRow = (row) => {
    if (!row || typeof row !== "object") return 0;
    // Prefer rows that actually carry transaction signals / non-zero metrics.
    const score =
      toAbs(row.win_loss) * 100 +
      toAbs(row.cr_dr) * 80 +
      toAbs(row.balance) * 20 +
      toAbs(row.bf) * 10 +
      (toBoolFlag(row.has_win_loss_transactions) ? 5000 : 0) +
      (toBoolFlag(row.has_crdr_transactions) ? 5000 : 0) +
      (toBoolFlag(row.has_win_loss_history) ? 2000 : 0) +
      (toBoolFlag(row.has_period_id_product_rows) ? 1500 : 0);
    return score;
  };

  for (const row of rows || []) {
    const k = keyOf(row);
    if (!indexByKey.has(k)) {
      indexByKey.set(k, out.length);
      out.push(row);
      continue;
    }
    const idx = indexByKey.get(k);
    const prev = out[idx];
    if (scoreRow(row) >= scoreRow(prev)) {
      out[idx] = row;
    }
  }
  return out;
}

/** 去重左右表并按行重算 totals（修复竞态/缓存叠行导致的重复 CAPITAL 等）。 */
/** Merge multiple search_api payloads (group/company All modes). */
export function mergeSearchApiDataList(dataList) {
  const left = [];
  const right = [];
  for (const d of dataList) {
    if (!d || typeof d !== "object") continue;
    if (Array.isArray(d.left_table)) left.push(...d.left_table);
    if (Array.isArray(d.right_table)) right.push(...d.right_table);
  }
  return sanitizeSearchApiData({ left_table: left, right_table: right });
}

export function sanitizeSearchApiData(data) {
  if (!data || typeof data !== "object") return data;
  const left = dedupeRowsByAccountAndCurrency(data.left_table);
  const right = dedupeRowsByAccountAndCurrency(data.right_table);
  const totalsLeft = calculateTotals(left);
  const totalsRight = calculateTotals(right);
  return {
    ...data,
    left_table: left,
    right_table: right,
    totals: {
      left: totalsLeft,
      right: totalsRight,
      summary: applySummaryWinLossDisplayTolerance(calculateTotals([...left, ...right])),
    },
  };
}

/** True when ending balance is non-zero (2dp display tolerance). */
export function rowHasNonZeroBalance(row) {
  const num = parseBalanceValue(row.balance);
  if (num === null) return true;
  try {
    return MoneyDecimal.toDecimal(String(num), 0).abs().gt("0.00001");
  } catch {
    return Math.abs(num) > 1e-5;
  }
}

/** @deprecated Prefer {@link applyZeroBalanceFilter} — kept for legacy callers. */
export function rowPassesHideZeroBalanceFilter(showZero, row) {
  if (showZero) return true;
  return rowHasNonZeroBalance(row);
}

export function normalizeRateRowsByCrDr(leftRows, rightRows, isRate) {
  const safeLeft = Array.isArray(leftRows) ? leftRows : [];
  const safeRight = Array.isArray(rightRows) ? rightRows : [];
  if (!isRate) {
    return { leftRows: [...safeLeft], rightRows: [...safeRight] };
  }
  const normalizedLeft = [];
  const normalizedRight = [];
  safeLeft.forEach((row) => {
    const crDr = parseBalanceValue(row?.cr_dr);
    if (crDr === null || Math.abs(crDr) < 1e-5) {
      normalizedLeft.push(row);
      return;
    }
    if (crDr > 0) normalizedLeft.push(row);
    else normalizedRight.push(row);
  });
  safeRight.forEach((row) => {
    const crDr = parseBalanceValue(row?.cr_dr);
    if (crDr === null || Math.abs(crDr) < 1e-5) {
      normalizedRight.push(row);
      return;
    }
    if (crDr > 0) normalizedLeft.push(row);
    else normalizedRight.push(row);
  });
  return { leftRows: normalizedLeft, rightRows: normalizedRight };
}

/**
 * Show Payment Only / Show Win/Loss Only 行筛选 — 与 `js/transaction.js` `applyZeroBalanceFilterAndRender`
 * 内「先应用 Show Payment Only / Show Win/Loss 过滤」分支一致（含仅 W/L、双勾选+Show 0 balance 的 OR 规则）。
 * Show Win/Loss Only：优先 has_win_loss_transactions（本期有 W/L 动账），再兜底 net win_loss_full 非零（与 hasCrdr 对称）。
 */
export function applyPaymentWinLossFilters(rawLeft, rawRight, { showPaymentOnly, showCaptureOnly, showZeroBalance = false }) {
  const safeLeft = Array.isArray(rawLeft) ? rawLeft : [];
  const safeRight = Array.isArray(rawRight) ? rawRight : [];
  if (!showPaymentOnly && !showCaptureOnly) {
    return { filteredLeft: safeLeft, filteredRight: safeRight };
  }

  const eps = "0.00001";

  const flagToBool = (v) => {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    return parseInt(String(v || "0"), 10) !== 0;
  };

  const hasCrdr = (row) => {
    const byFlag =
      typeof row.has_crdr_transactions === "boolean"
        ? row.has_crdr_transactions
        : typeof row.has_crdr_transactions === "number"
          ? row.has_crdr_transactions !== 0
          : parseInt(String(row.has_crdr_transactions || "0"), 10) !== 0;
    const crdr = parseBalanceValue(row.cr_dr);
    let byValue = false;
    if (crdr !== null) {
      try {
        byValue = MoneyDecimal.toDecimal(crdr, 0).abs().gt(eps);
      } catch {
        byValue = Math.abs(crdr) > 1e-5;
      }
    }
    return byFlag || byValue;
  };

  const isZeroBalance = (row) => {
    const bal = parseBalanceValue(row.balance);
    if (bal === null) return false;
    try {
      return MoneyDecimal.toDecimal(bal, 0).abs().lte(eps);
    } catch {
      return Math.abs(bal) <= 1e-5;
    }
  };

  const winLossAmountNonZero = (row) => {
    const probeFull =
      row.win_loss_full !== undefined && row.win_loss_full !== null && String(row.win_loss_full).trim() !== ""
        ? String(row.win_loss_full).replace(/,/g, "").trim()
        : null;
    const probes = probeFull != null ? [probeFull, row.win_loss] : [row.win_loss];
    for (const candidate of probes) {
      const wl = parseBalanceValue(candidate);
      if (wl === null) continue;
      try {
        if (MoneyDecimal.toDecimal(wl, 0).abs().gt(eps)) return true;
      } catch {
        if (Math.abs(wl) > 1e-5) return true;
      }
    }
    return false;
  };

  const hasWinLoss = (row) => {
    if (flagToBool(row.has_win_loss_transactions) || flagToBool(row.has_period_id_product_rows)) {
      return true;
    }
    return winLossAmountNonZero(row);
  };

  let shouldShow = () => true;
  if (showPaymentOnly && showCaptureOnly) {
    shouldShow = showZeroBalance
      ? (row) => isZeroBalance(row) || hasCrdr(row) || hasWinLoss(row)
      : (row) => hasCrdr(row) || hasWinLoss(row);
  } else if (showPaymentOnly) {
    shouldShow = showZeroBalance ? (row) => isZeroBalance(row) || hasCrdr(row) : hasCrdr;
  } else if (showCaptureOnly) {
    shouldShow = showZeroBalance ? (row) => isZeroBalance(row) || hasWinLoss(row) : hasWinLoss;
  }

  return {
    filteredLeft: safeLeft.filter(shouldShow),
    filteredRight: safeRight.filter(shouldShow),
  };
}

export function applyZeroBalanceFilter(
  filteredLeft,
  filteredRight,
  showZeroBalance,
  { showCaptureOnly = false, showPaymentOnly = false } = {},
) {
  // Any visibility toggle: keep upstream rows (incl. balance 0.00 when W/L or Payment filter matched).
  if (showZeroBalance || showCaptureOnly || showPaymentOnly) {
    return { left: filteredLeft, right: filteredRight };
  }
  // Default: hide rows whose ending balance is 0.00.
  return {
    left: filteredLeft.filter(rowHasNonZeroBalance),
    right: filteredRight.filter(rowHasNonZeroBalance),
  };
}

/** Same as `js/transaction.js` winLossFullRawForTotals: sum full-precision W/L before half-up. */
function winLossFullRawForTotals(row) {
  const raw =
    row && row.win_loss_full !== undefined && row.win_loss_full !== null && String(row.win_loss_full).trim() !== ""
      ? row.win_loss_full
      : row && row.win_loss != null
        ? row.win_loss
        : "0";
  const s = raw === "-" ? "0" : String(raw).replace(/,/g, "").trim();
  try {
    MoneyDecimal.toDecimal(s, 0);
    return s;
  } catch {
    return "0";
  }
}

function cleanMoneyCell(value) {
  const s = String(value ?? "")
    .replace(/,/g, "")
    .trim();
  if (!s || s === "-") return "0";
  return s;
}

/** Match `js/transaction.js` calculateTotals (bf/cr_dr sum; win_loss from win_loss_full; balance = bf+wl+cr). */
export function calculateTotals(rows) {
  let bfAcc = MoneyDecimal.toDecimal("0", 0);
  let wlAcc = MoneyDecimal.toDecimal("0", 0);
  let crAcc = MoneyDecimal.toDecimal("0", 0);
  for (const row of rows || []) {
    try {
      bfAcc = bfAcc.plus(MoneyDecimal.toDecimal(cleanMoneyCell(row?.bf), 0));
    } catch {
      /* skip bad row */
    }
    try {
      wlAcc = wlAcc.plus(MoneyDecimal.toDecimal(winLossFullRawForTotals(row), 0));
    } catch {
      /* skip */
    }
    try {
      crAcc = crAcc.plus(MoneyDecimal.toDecimal(cleanMoneyCell(row?.cr_dr), 0));
    } catch {
      /* skip */
    }
  }
  const bfTot = MoneyDecimal.formatFixed(bfAcc.toString(), 2);
  const wlTot = MoneyDecimal.formatFixedHalfUp(wlAcc.toString(), 2);
  const crTot = MoneyDecimal.formatFixed(crAcc.toString(), 2);
  const balTot = MoneyDecimal.formatFixedHalfUp(MoneyDecimal.add(MoneyDecimal.add(bfTot, wlTot), crTot).toString(), 2);
  return { bf: bfTot, win_loss: wlTot, cr_dr: crTot, balance: balTot };
}

/**
 * Bottom Summary only: when `?tx_wl_tol=1`, show Total Win/Loss as 0.00 if |W/L| ≤ RM1.00 (legacy `transaction.php`).
 * Does not alter per-side totals or API data.
 */
export function applySummaryWinLossDisplayTolerance(totals) {
  if (totals == null || typeof totals !== "object") return totals;
  let tolActive = false;
  try {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search || "").get("tx_wl_tol") === "1") {
      tolActive = true;
    }
  } catch {
    return totals;
  }
  if (!tolActive) return totals;
  const tolRaw = "1.00";
  let tol;
  try {
    tol = MoneyDecimal.toDecimal(String(tolRaw).replace(/,/g, "").trim(), 0).abs();
  } catch {
    return totals;
  }
  if (tol.isZero()) return totals;
  let absWl;
  try {
    absWl = MoneyDecimal.toDecimal(String(totals.win_loss ?? "0").replace(/,/g, "").trim(), 0).abs();
  } catch {
    return totals;
  }
  if (absWl.gt(tol)) return totals;
  const bf2 = String(totals.bf ?? "0").replace(/,/g, "").trim();
  const cr2 = String(totals.cr_dr ?? "0").replace(/,/g, "").trim();
  const wl0 = MoneyDecimal.formatFixedHalfUp("0", 2);
  const balance2 = MoneyDecimal.formatFixedHalfUp(MoneyDecimal.add(MoneyDecimal.add(bf2, wl0), cr2).toString(), 2);
  return { bf: totals.bf, win_loss: wl0, cr_dr: totals.cr_dr, balance: balance2 };
}

/** Merge left+right footer totals (each already `calculateTotals` output). */
export function mergeTotals(leftT, rightT) {
  const bf = MoneyDecimal.formatFixed(MoneyDecimal.add(String(leftT?.bf ?? "0"), String(rightT?.bf ?? "0")).toString(), 2);
  const wl = MoneyDecimal.formatFixedHalfUp(MoneyDecimal.add(String(leftT?.win_loss ?? "0"), String(rightT?.win_loss ?? "0")).toString(), 2);
  const cr = MoneyDecimal.formatFixed(MoneyDecimal.add(String(leftT?.cr_dr ?? "0"), String(rightT?.cr_dr ?? "0")).toString(), 2);
  const bal = MoneyDecimal.formatFixedHalfUp(MoneyDecimal.add(MoneyDecimal.add(bf, wl), cr).toString(), 2);
  return { bf, win_loss: wl, cr_dr: cr, balance: bal };
}

/** Map search grid row → AccountSelect option (legacy accountDataMap match). */
export function resolveGridRowToAccountOption(row, accountOptions) {
  const list = Array.isArray(accountOptions) ? accountOptions : [];
  const dbId = row?.account_db_id != null && String(row.account_db_id).trim() !== "" ? String(row.account_db_id).trim() : "";
  const code = String(row?.account_id || "").trim();
  if (dbId) {
    const byDb = list.find((o) => String(o.id) === dbId);
    if (byDb) return byDb;
    const n = parseInt(dbId, 10);
    if (!Number.isNaN(n)) {
      const byNum = list.find((o) => parseInt(String(o.id), 10) === n);
      if (byNum) return byNum;
    }
  }
  if (code) {
    const u = code.toUpperCase();
    const byCode = list.find((o) => String(o.account_id || "").trim().toUpperCase() === u);
    if (byCode) return byCode;
  }
  if (!dbId && !code) return null;
  return {
    id: dbId || code,
    account_id: code || dbId,
    display_text: code ? `${code}${row.account_name ? ` - ${row.account_name}` : ""}` : String(dbId),
    currency: row.currency || null,
  };
}

/** One row per currency code (scope APIs may return same code with different currency ids). */
export function dedupeCurrencyRowsByCode(rows) {
  const byCode = new Map();
  for (const row of rows) {
    const code = String(row?.code || row?.currency || "")
      .trim()
      .toUpperCase();
    if (!code || byCode.has(code)) continue;
    byCode.set(code, { ...row, code });
  }
  return [...byCode.values()];
}

/**
 * Apply saved API/global/local order to currency rows from get_company_currencies_api.
 */
export function orderCurrencyRows(orderedData, orderData, explicitCompanyId = null) {
  let ordered = dedupeCurrencyRowsByCode(orderedData);
  try {
    const companyId =
      explicitCompanyId != null && explicitCompanyId !== ""
        ? Number(explicitCompanyId)
        : orderData?.data?.company_id;
    const savedOrder = resolveSavedCurrencyOrder(
      companyId,
      orderData?.success ? orderData?.data?.order : null,
    );
    if (!savedOrder?.length) return ordered;

    const normalized = [];
    savedOrder.forEach((code) => {
      const upper = String(code || "")
        .trim()
        .toUpperCase();
      if (!upper || upper === "ALL") return;
      if (!normalized.includes(upper)) normalized.push(upper);
    });
    const byCode = new Map(
      ordered.map((c) => [
        String(c.code || c.currency || "")
          .trim()
          .toUpperCase(),
        c,
      ]),
    );
    const out = [];
    normalized.forEach((upper) => {
      if (byCode.has(upper)) {
        out.push(byCode.get(upper));
        byCode.delete(upper);
      }
    });
    byCode.forEach((c) => out.push(c));
    return out;
  } catch {
    return ordered;
  }
}

/** Transaction page cold boot: MYR when available, otherwise first listed currency. */
export function pickTransactionDefaultCurrency(codes) {
  const list = (codes || []).map((c) => String(c || "").toUpperCase().trim()).filter(Boolean);
  if (list.includes("MYR")) return "MYR";
  return list[0] || "";
}

export function readTransactionCurrencyFilterState(companyId) {
  if (!companyId) return null;
  try {
    const raw = localStorage.getItem(TRANSACTION_CURRENCY_FILTER_KEY_PREFIX + companyId);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return null;
    const showAll = !!o.showAll;
    const currencies = Array.isArray(o.currencies) ? o.currencies.map((c) => String(c || "").trim()).filter(Boolean) : [];
    return { showAll, currencies };
  } catch {
    return null;
  }
}

/** Row count after the same client filters as the main grid (for search-complete toasts). */
export function countDisplayedRows(rawSearchData, searchState, txType) {
  if (!rawSearchData) return 0;
  const rawLeft = dedupeRowsByAccountAndCurrency(rawSearchData.left_table || []);
  const rawRight = dedupeRowsByAccountAndCurrency(rawSearchData.right_table || []);
  const pf = applyPaymentWinLossFilters(rawLeft, rawRight, {
    showPaymentOnly: searchState.showPaymentOnly,
    showCaptureOnly: searchState.showCaptureOnly,
    showZeroBalance: searchState.showZeroBalance,
  });
  const z = applyZeroBalanceFilter(pf.filteredLeft, pf.filteredRight, searchState.showZeroBalance, {
    showCaptureOnly: searchState.showCaptureOnly,
    showPaymentOnly: searchState.showPaymentOnly,
  });
  const norm = normalizeRateRowsByCrDr(z.left, z.right, txType === "RATE");
  return (norm.leftRows?.length || 0) + (norm.rightRows?.length || 0);
}

/** Read cached transaction list payload from sessionStorage (same format as saveTxListToSession). */
export function readTxListFromSessionStorage(sessionKey) {
  if (!sessionKey) return null;
  try {
    const raw = sessionStorage.getItem(sessionKey);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o?.data || (o.v !== 1 && o.v !== 2)) return null;
    const invalidateTs = parseInt(localStorage.getItem(TX_LIST_INVALIDATE_LS_KEY) || "0", 10) || 0;
    const savedAt = o.v === 2 && typeof o.savedAt === "number" ? o.savedAt : 0;
    if (invalidateTs > savedAt) return null;
    return sanitizeSearchApiData(o.data);
  } catch {
    return null;
  }
}

export function buildTxListSessionKey({
  companyId,
  dateFrom,
  dateTo,
  selectedCategories,
  showInactive,
  showCaptureOnly,
  hideZeroBalance,
  showAllCurrencies,
  selectedCurrencies,
}) {
  if (!dateFrom || !dateTo) return null;
  let cat = "";
  if (selectedCategories.length > 0 && !selectedCategories.includes("")) {
    cat = [...selectedCategories].sort().join(",");
  }
  let cur = "";
  if (!showAllCurrencies && selectedCurrencies.length > 0) {
    cur = [...selectedCurrencies].sort().join(",");
  }
  const cid = companyId != null ? String(companyId) : "";
  const hideZero = hideZeroBalance ? "0" : "1";
  return (
    TX_LIST_SESSION_PREFIX +
    [cid, dateFrom, dateTo, cat, showInactive ? "1" : "0", showCaptureOnly ? "1" : "0", hideZero, cur, showAllCurrencies ? "1" : "0"].join("|")
  );
}
