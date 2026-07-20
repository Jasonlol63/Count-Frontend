import { MoneyDecimal } from "../../../utils/money/moneyDecimal.js";
import { calculateTotals } from "./transactionPaymentLogic.js";

/**
 * Spring TransactionDTO.SearchResult → grid shape for TransactionTablesSection.
 * Positive balance → left_table; negative → right_table.
 */
export function normalizeSpringSearchToGrid(data) {
  if (!data || typeof data !== "object") {
    return emptyGrid();
  }

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
      has_crdr_transactions: 0,
      has_contra_clear_period: 0,
      has_win_loss_transactions: row.hasWinLossInPeriod ? 1 : 0,
      has_win_loss_history: 0,
      has_period_id_product_rows: row.hasWinLossInPeriod ? 1 : 0,
      is_alert: 0,
      is_rate_middleman: 0,
    };

    if (MoneyDecimal.cmp(gridRow.balance, "0") < 0) {
      right.push(gridRow);
    } else {
      left.push(gridRow);
    }
  }

  const totalsRaw = data.totals || {};
  const summary = {
    bf: String(totalsRaw.bf ?? "0.00"),
    win_loss: String(totalsRaw.winLoss ?? totalsRaw.win_loss ?? "0.00"),
    cr_dr: String(totalsRaw.crDr ?? totalsRaw.cr_dr ?? "0.00"),
    balance: String(totalsRaw.balance ?? "0.00"),
  };

  return {
    left_table: left,
    right_table: right,
    totals: {
      left: calculateTotals(left),
      right: calculateTotals(right),
      summary,
    },
    active_currency_codes: Array.isArray(data.activeCurrencyCodes)
      ? data.activeCurrencyCodes.map((c) => String(c || "").trim().toUpperCase()).filter(Boolean)
      : [],
  };
}

function emptyGrid() {
  const zero = { bf: "0.00", win_loss: "0.00", cr_dr: "0.00", balance: "0.00" };
  return {
    left_table: [],
    right_table: [],
    totals: { left: zero, right: zero, summary: zero },
    active_currency_codes: [],
  };
}

export function buildSpringSearchRequest({ companyId, dateFrom, dateTo, currencyCodes, categories } = {}) {
  const tenantId = Number(companyId);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    throw new Error("tenantIdRequired");
  }
  return {
    tenantId,
    dateFrom: String(dateFrom || "").trim(),
    dateTo: String(dateTo || "").trim(),
    currencyCodes: Array.isArray(currencyCodes)
      ? currencyCodes.map((c) => String(c || "").trim().toUpperCase()).filter(Boolean)
      : [],
    categories: Array.isArray(categories)
      ? categories.map((c) => String(c || "").trim().toUpperCase()).filter(Boolean)
      : [],
  };
}
