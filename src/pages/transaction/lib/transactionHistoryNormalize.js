/** Spring TransactionDTO.HistoryResult → Payment History table rows (legacy snake_case). */

function normalizeHistoryRow(raw) {
  if (!raw || typeof raw !== "object") return null;
  const rowType = raw.rowType ?? raw.row_type ?? null;
  const isBf = String(rowType || "").toLowerCase() === "bf";
  return {
    id: raw.id ?? null,
    row_type: isBf ? "bf" : null,
    date: raw.date ?? "-",
    is_bank_process_transaction: Boolean(
      raw.isBankProcessTransaction ?? raw.is_bank_process_transaction ?? false,
    ),
    card_owner: raw.cardOwner ?? raw.card_owner ?? "",
    product: raw.product ?? "",
    currency: String(raw.currency ?? raw.currencyCode ?? "").trim().toUpperCase(),
    rate: raw.rate ?? "-",
    win_loss: String(raw.winLoss ?? raw.win_loss ?? "0.00"),
    cr_dr: String(raw.crDr ?? raw.cr_dr ?? "0.00"),
    balance: String(raw.balance ?? "0.00"),
    description: raw.description ?? "",
    remark: raw.remark ?? "",
    sms: raw.sms ?? "",
    created_by: raw.createdBy ?? raw.created_by ?? "",
  };
}

function normalizeHistoryAccount(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    id: raw.id,
    account_id: String(raw.accountId ?? raw.account_id ?? "").trim(),
    name: String(raw.name ?? "").trim(),
  };
}

export function buildSpringHistoryRequest({
  companyId,
  accountId,
  dateFrom,
  dateTo,
  currency,
} = {}) {
  const tenantId = Number(companyId);
  const accountDbId = Number(accountId);
  if (!Number.isFinite(tenantId) || tenantId <= 0 || !Number.isFinite(accountDbId) || accountDbId <= 0) {
    throw new Error("invalidRequest");
  }

  const currencyCodes = String(currency || "")
    .split(",")
    .map((code) => String(code || "").trim().toUpperCase())
    .filter(Boolean);

  return {
    tenantId,
    accountId: accountDbId,
    dateFrom: String(dateFrom || "").trim(),
    dateTo: String(dateTo || "").trim(),
    currencyCodes,
  };
}

/**
 * Spring history payload → shape expected by TransactionPaymentHistoryPage / TransactionHistoryTable.
 */
export function normalizeSpringHistoryResponse(json) {
  if (!json?.success || !json.data) {
    return {
      success: false,
      message: json?.message || "failedToLoadHistory",
      data: [],
      account: null,
      date_range: null,
    };
  }

  const payload = json.data;
  const historyRaw = Array.isArray(payload.history)
    ? payload.history
    : Array.isArray(payload)
      ? payload
      : [];
  const rows = historyRaw.map(normalizeHistoryRow).filter(Boolean);
  const account = normalizeHistoryAccount(payload.account);
  const rangeRaw = payload.dateRange ?? payload.date_range ?? null;
  const date_range = rangeRaw
    ? {
        from: rangeRaw.from ?? rangeRaw.date_from ?? "",
        to: rangeRaw.to ?? rangeRaw.date_to ?? "",
      }
    : null;

  return {
    success: true,
    message: json.message || "",
    data: rows,
    account,
    date_range,
  };
}
