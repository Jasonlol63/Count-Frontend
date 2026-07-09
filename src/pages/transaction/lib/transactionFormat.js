import { MoneyDecimal } from "../../../utils/money/moneyDecimal.js";

function cleanNumberLike(value) {
  if (value === "-" || value === null || value === undefined) return null;
  const cleaned = String(value).replace(/,/g, "").trim();
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function toUpperDisplay(value) {
  if (value === null || value === undefined) return "-";
  const str = String(value).trim();
  return str ? str.toUpperCase() : "-";
}

/** Payment History Remark：优先 remark，否则 sms（与 js/transaction.js getHistoryRemark 一致）。 */
export function getHistoryRemark(row) {
  if (row?.remark != null && String(row.remark).trim() !== "") {
    return toUpperDisplay(row.remark);
  }
  return toUpperDisplay(row?.sms || "-");
}

// Keep legacy behavior: show '-' stays '-', otherwise always 2 decimals with thousand separators.
export function formatMoney2(value) {
  const n = cleanNumberLike(value);
  if (n === null) return value === "-" ? "-" : "0.00";
  const fixed = (Math.trunc((n + Number.EPSILON) * 100) / 100).toFixed(2);
  const parts = fixed.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

/**
 * Main grid + totals: align with legacy MoneyDecimal-style display (avoid trunc quirks on pre-rounded API strings).
 */
export function formatPaymentHistoryMoney(value) {
  if (value === "-" || value === null || value === undefined) return "-";
  const cleaned = String(value).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return "0.00";
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Payment History modal: half-up to cents then thousands; zero displays as "-". */
export function formatPaymentHistoryMoneyHalfUp(value) {
  if (value === "-" || value === null || value === undefined) return "-";
  const cleaned = String(value).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return "-";
  try {
    const rounded = MoneyDecimal.formatFixedHalfUp(cleaned, 2);
    if (MoneyDecimal.toDecimal(rounded).isZero()) return "-";
    return MoneyDecimal.formatThousands(rounded, 2);
  } catch {
    return "-";
  }
}

/** Transaction main grid + footers: same rounding as history; zero displays as "0.00". */
export function formatTransactionGridMoneyHalfUp(value) {
  if (value === "-" || value === null || value === undefined) return "-";
  const cleaned = String(value).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return "0.00";
  try {
    const rounded = MoneyDecimal.formatFixedHalfUp(cleaned, 2);
    if (MoneyDecimal.toDecimal(rounded).isZero()) return "0.00";
    return MoneyDecimal.formatThousands(rounded, 2);
  } catch {
    return "0.00";
  }
}

export function formatHistoryMoney(v) {
  return v === "-" ? "-" : formatPaymentHistoryMoneyHalfUp(v);
}

/** Payment History Balance column: show 0.00 when cleared (legacy PHP showed 0.00, not "-"). */
export function formatHistoryBalanceMoney(v) {
  if (v === "-" || v === null || v === undefined) return "-";
  const cleaned = String(v).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return "0.00";
  try {
    const rounded = MoneyDecimal.formatFixedHalfUp(cleaned, 2);
    if (MoneyDecimal.toDecimal(rounded).isZero()) return "0.00";
    return MoneyDecimal.formatThousands(rounded, 2);
  } catch {
    return "0.00";
  }
}

const RATE_MAX_DECIMALS = 8;
const RATE_HISTORY_MAX_DECIMALS = 6;

/** Same as legacy `js/transaction.js` countDecimalPlaces (RATE token width checks). */
export function countRateDecimalPlaces(value) {
  const str = String(value ?? "").trim();
  if (!str.includes(".")) return 0;
  return str.split(".")[1].length;
}

function truncateDecimalString(value, scale) {
  const str = String(value ?? "").trim();
  if (!str || !str.includes(".")) return str || "0";
  const negative = str.startsWith("-");
  const unsigned = negative ? str.slice(1) : str;
  const [intPartRaw, fracRaw = ""] = unsigned.split(".");
  const intPart = intPartRaw === "" ? "0" : intPartRaw;
  const frac = fracRaw.slice(0, Math.max(0, scale));
  if (!frac) return negative ? `-${intPart}` : intPart;
  return negative ? `-${intPart}.${frac}` : `${intPart}.${frac}`;
}

function normalizeRateForSubmit(value) {
  try {
    const normalized = MoneyDecimal.toDecimal(value || "0").toString();
    return truncateDecimalString(normalized, RATE_MAX_DECIMALS);
  } catch {
    return "0";
  }
}

function hasTokenExceedingRateDecimals(token) {
  return countRateDecimalPlaces(token) > RATE_MAX_DECIMALS;
}

/** Payment History Rate column — same as `js/transaction.js` formatRateForHistoryDisplay. */
export function formatRateForHistoryDisplay(value) {
  if (value === "-" || value === null || value === undefined) return "-";
  const s = String(value).trim();
  if (s === "" || s === "-") return "-";
  try {
    const normalized = MoneyDecimal.toDecimal(s.replace(/,/g, "").trim() || "0").toString();
    const truncated = truncateDecimalString(normalized, RATE_HISTORY_MAX_DECIMALS);
    if (!truncated.includes(".")) return truncated;
    return truncated.replace(/(\.\d*?[1-9])0+$/u, "$1").replace(/\.0+$/u, "");
  } catch {
    return s;
  }
}

/**
 * RATE exchange-rate field: same as legacy `js/transaction.js` parseRateExpression.
 * On success, `value` is the **8dp-truncated normalized string** (not a JS number).
 */
export function parseRateExpression(rawValue) {
  const invalid = () => ({ valid: false, value: "0" });
  const raw = String(rawValue ?? "").trim();
  if (!raw) return invalid();

  const normalized = raw.replace(/÷/g, "/").replace(/\s+/g, "");
  if (!normalized) return invalid();

  if (/^\/\d*\.?\d+$/.test(normalized)) {
    if (hasTokenExceedingRateDecimals(normalized.slice(1))) return invalid();
    let divisor;
    try {
      divisor = MoneyDecimal.toDecimal(normalized.slice(1));
    } catch {
      return invalid();
    }
    if (divisor.lte(0)) return invalid();
    const out = normalizeRateForSubmit(MoneyDecimal.div("1", divisor).toString());
    return { valid: true, value: out };
  }

  if (!/^[0-9.*/]+$/.test(normalized)) return invalid();
  if (/^[*/]|[*/]$|[*/]{2,}/.test(normalized)) return invalid();

  const tokens = normalized.split(/([*/])/).filter(Boolean);
  if (tokens.length === 0) return invalid();
  if (!/^\d*\.?\d+$/.test(tokens[0])) return invalid();
  if (hasTokenExceedingRateDecimals(tokens[0])) return invalid();

  let result;
  try {
    result = MoneyDecimal.toDecimal(tokens[0]);
  } catch {
    return invalid();
  }
  if (result.lte(0)) return invalid();

  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const numToken = tokens[i + 1];
    if (!numToken || !/^\d*\.?\d+$/.test(numToken)) return invalid();
    if (hasTokenExceedingRateDecimals(numToken)) return invalid();
    let value;
    try {
      value = MoneyDecimal.toDecimal(numToken);
    } catch {
      return invalid();
    }
    if (op === "*") {
      result = result.times(value);
    } else if (op === "/") {
      if (value.isZero()) return invalid();
      result = result.div(value);
    } else {
      return invalid();
    }
  }

  if (result.lte(0)) return invalid();
  const out = normalizeRateForSubmit(result.toString());
  return { valid: true, value: out };
}

export function formatRateAmount(value) {
  try {
    return MoneyDecimal.formatFixedHalfUp(value || "0", 2);
  } catch {
    return "0.00";
  }
}

export function parseBalanceValue(value) {
  const n = cleanNumberLike(value);
  return n === null ? null : n;
}

export function formatDmy(date) {
  const d = date instanceof Date ? date : new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const y = d.getFullYear();
  return `${day}/${m}/${y}`;
}

export function buildClientRequestId() {
  if (typeof window !== "undefined" && window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `tx_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

