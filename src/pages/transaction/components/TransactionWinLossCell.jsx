import { formatTransactionGridMoneyHalfUp } from "../lib/transactionFormat.js";

function parseMoneyNumber(value) {
  if (value === "-" || value === null || value === undefined) return null;
  const cleaned = String(value).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Money column: positive #172a9f, negative #b91c1c. */
export default function TransactionWinLossCell({ value, formatMoney = formatTransactionGridMoneyHalfUp }) {
  const display = formatMoney(value);
  const n = parseMoneyNumber(value);
  if (n === null || n === 0) return display;

  const tone = n > 0 ? "pos" : "neg";
  return <span className={`transaction-amount transaction-amount--${tone}`}>{display}</span>;
}
