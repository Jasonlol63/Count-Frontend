/**
 * Payment History / TX type styles — semantic CSS modifiers (see transaction-history-types.css).
 */

const TYPE_MODIFIER = {
  CONTRA: "m-tx-hist-card--contra",
  PAYMENT: "m-tx-hist-card--payment",
  RECEIVE: "m-tx-hist-card--receive",
  CLAIM: "m-tx-hist-card--claim",
  PROFIT: "m-tx-hist-card--profit",
  WIN: "m-tx-hist-card--profit",
  LOSE: "m-tx-hist-card--profit",
  RATE: "m-tx-hist-card--rate",
  ADJUSTMENT: "m-tx-hist-card--adjustment",
  CLEAR: "m-tx-hist-card--clear",
};

const BF_MODIFIER = "m-tx-hist-card--bf";
const DEFAULT_MODIFIER = "m-tx-hist-card--default";

/** @param {object|null|undefined} row */
export function normalizeHistoryType(row) {
  if (!row || row.row_type === "bf") return "BF";
  const raw = String(row.transaction_type || row.product || "")
    .trim()
    .toUpperCase();
  if (!raw || raw === "-") return "";
  return raw;
}

/** Display label for type badge (BF / bank process / type). */
export function historyTypeLabel(row) {
  if (!row) return "—";
  if (row.row_type === "bf") return "B/F";
  if (row.is_bank_process_transaction) {
    return String(row.card_owner || row.product || "BANK").trim().toUpperCase() || "BANK";
  }
  const t = normalizeHistoryType(row);
  return t || "—";
}

function historyTypeModifier(row) {
  if (!row || row.row_type === "bf") return BF_MODIFIER;
  if (row.is_bank_process_transaction) return DEFAULT_MODIFIER;
  const t = normalizeHistoryType(row);
  return TYPE_MODIFIER[t] || DEFAULT_MODIFIER;
}

/** @deprecated Badge tint comes from card modifier; kept for API compatibility. */
export function historyTypeBadgeClass(row) {
  return historyTypeModifier(row);
}

/** Card shell modifier class (pairs with m-tx-hist-card). */
export function historyTypeCardClass(row) {
  return historyTypeModifier(row);
}
