/**
 * Shared money helpers (legacy `js/money-decimal.js` / window.MoneyDecimal).
 * Align with backend TransactionMoneyFormat:
 * - Store / submit: plain high precision (normal ≤6 dp, RATE ≤8 dp); never round-to-2 for payload.
 * - UI display only: half-up to {@link UI_SCALE} (2).
 */
import Decimal from "./decimalEngine.js";

/** Display-only fractional digits (Transaction UI and money cells). */
export const UI_SCALE = 2;
/** Max fractional digits for normal amounts (PAYMENT / Bank Process / Domain / …). */
export const NORMAL_AMOUNT_SCALE = 6;
/** Max fractional digits for RATE amounts and exchange / middleman rates. */
export const RATE_AMOUNT_SCALE = 8;

export function cleanMoneyInput(value) {
  if (value === null || value === undefined) return "";
  let s = String(value).trim();
  if (s === "") return "";
  let negativeByParentheses = false;
  if (/^\(.*\)$/.test(s)) {
    negativeByParentheses = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[,$\s]/g, "");
  if (/^-?\d+,\d+$/.test(s)) s = s.replace(",", ".");
  if (negativeByParentheses && s.charAt(0) !== "-") s = "-" + s;
  return s;
}

export function toDecimal(value, fallback) {
  const cleaned = cleanMoneyInput(value);
  if (cleaned === "") {
    if (fallback !== undefined) return new Decimal(fallback);
    throw new Error("Money value is empty");
  }
  if (!/^-?(?:\d+|\d*\.\d+)$/.test(cleaned)) {
    if (fallback !== undefined) return new Decimal(fallback);
    throw new Error("Invalid money value: " + value);
  }
  return new Decimal(cleaned);
}

export function stripTrailingZeros(value) {
  if (value === null || value === undefined || value === "") return value;
  let s = String(value);
  if (s.indexOf("e") !== -1 || s.indexOf("E") !== -1) {
    s = new Decimal(s).toFixed();
  }
  if (s.indexOf(".") === -1) return s;
  s = s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return s === "-0" ? "0" : s;
}

/**
 * Fractional digit count after trailing-zero strip (0 for integers).
 * Matches backend TransactionMoneyFormat.decimalPlaces.
 */
export function countDecimalPlaces(value) {
  const plain = toPlainAmount(value);
  if (!plain.includes(".")) return 0;
  return plain.split(".")[1].length;
}

/** Submit / store: plain string, no round-to-2. */
export function toPlainAmount(value) {
  return stripTrailingZeros(toDecimal(value, 0).toString());
}

export function isWithinMaxScale(value, maxScale) {
  try {
    return countDecimalPlaces(value) <= maxScale;
  } catch {
    return false;
  }
}

/**
 * @throws {Error} when fractional digits exceed maxScale
 * @returns {string} plain amount
 */
export function assertMaxScale(value, maxScale, label = "Amount") {
  const plain = toPlainAmount(value);
  if (countDecimalPlaces(plain) > maxScale) {
    throw new Error(`${label} cannot have more than ${maxScale} decimal places`);
  }
  return plain;
}

export function requireNormalAmount(value, label = "Amount") {
  return assertMaxScale(value, NORMAL_AMOUNT_SCALE, label);
}

export function requireRateAmount(value, label = "Amount") {
  return assertMaxScale(value, RATE_AMOUNT_SCALE, label);
}

/**
 * System / expression results: keep exact value when ≤ maxScale;
 * half-up only when exceeding maxScale (never round-to-2 for storage).
 */
export function normalizeComputedAmount(value, maxScale) {
  const plain = toPlainAmount(value);
  if (countDecimalPlaces(plain) > maxScale) {
    return stripTrailingZeros(formatFixedHalfUp(plain, maxScale));
  }
  return plain;
}

export function normalizeComputedNormal(value) {
  return normalizeComputedAmount(value, NORMAL_AMOUNT_SCALE);
}

export function normalizeComputedRate(value) {
  return normalizeComputedAmount(value, RATE_AMOUNT_SCALE);
}

export function formatFixed(value, scale) {
  const fixed = toDecimal(value, 0).toFixed(scale, Decimal.ROUND_DOWN);
  return fixed === "-0" ? "0" : fixed;
}

export function formatFixedHalfUp(value, scale) {
  const fixed = toDecimal(value, 0).toFixed(scale, Decimal.ROUND_HALF_UP);
  return fixed === "-0" ? "0" : fixed;
}

/**
 * Display only: half-up to {@link UI_SCALE}, fixed fraction (e.g. number inputs).
 */
export function formatUiFixed(value) {
  return formatFixedHalfUp(value ?? "0", UI_SCALE);
}

/**
 * Display only: half-up to {@link UI_SCALE} + thousands separators.
 * Prefer this for Transaction grids / footers / history money cells.
 */
export function formatUiMoney(value) {
  const rounded = formatFixedHalfUp(value ?? "0", UI_SCALE);
  return formatThousands(rounded, UI_SCALE);
}

export function formatDisplay(value, scale) {
  return stripTrailingZeros(formatFixed(value, scale === undefined ? RATE_AMOUNT_SCALE : scale));
}

export function formatThousands(value, scale) {
  const display = formatFixed(value, scale === undefined ? UI_SCALE : scale);
  const negative = display.charAt(0) === "-";
  const unsigned = negative ? display.slice(1) : display;
  const parts = unsigned.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (negative ? "-" : "") + parts.join(".");
}

export function add(a, b) {
  return toDecimal(a, 0).plus(toDecimal(b, 0));
}
export function sub(a, b) {
  return toDecimal(a, 0).minus(toDecimal(b, 0));
}
export function mul(a, b) {
  return toDecimal(a, 0).times(toDecimal(b, 0));
}
export function div(a, b) {
  return toDecimal(a, 0).div(toDecimal(b, 1));
}
export function abs(a) {
  return toDecimal(a, 0).abs();
}
export function max(a, b) {
  return Decimal.max(toDecimal(a, 0), toDecimal(b, 0));
}
export function min(a, b) {
  return Decimal.min(toDecimal(a, 0), toDecimal(b, 0));
}
export function cmp(a, b) {
  return toDecimal(a, 0).cmp(toDecimal(b, 0));
}

/** Same shape as legacy `window.MoneyDecimal`. */
export const MoneyDecimal = {
  Decimal,
  UI_SCALE,
  NORMAL_AMOUNT_SCALE,
  RATE_AMOUNT_SCALE,
  cleanMoneyInput,
  toDecimal,
  stripTrailingZeros,
  countDecimalPlaces,
  toPlainAmount,
  isWithinMaxScale,
  assertMaxScale,
  requireNormalAmount,
  requireRateAmount,
  normalizeComputedAmount,
  normalizeComputedNormal,
  normalizeComputedRate,
  formatFixed,
  formatFixedHalfUp,
  formatUiFixed,
  formatUiMoney,
  formatDisplay,
  formatThousands,
  add,
  sub,
  mul,
  div,
  abs,
  max,
  min,
  cmp,
};

export default MoneyDecimal;
