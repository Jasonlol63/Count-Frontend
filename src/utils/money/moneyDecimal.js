/**
 * ES module parity with legacy `js/money-decimal.js` (window.MoneyDecimal).
 * Import from React/Vite: `import { MoneyDecimal, formatThousands } from '../../utils/money/moneyDecimal.js'`.
 */
import Decimal from "./decimalEngine.js";

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

export function formatFixed(value, scale) {
  const fixed = toDecimal(value, 0).toFixed(scale, Decimal.ROUND_DOWN);
  return fixed === "-0" ? "0" : fixed;
}

export function formatFixedHalfUp(value, scale) {
  const fixed = toDecimal(value, 0).toFixed(scale, Decimal.ROUND_HALF_UP);
  return fixed === "-0" ? "0" : fixed;
}

export function formatDisplay(value, scale) {
  return stripTrailingZeros(formatFixed(value, scale === undefined ? 8 : scale));
}

export function formatThousands(value, scale) {
  const display = formatFixed(value, scale === undefined ? 2 : scale);
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
  cleanMoneyInput,
  toDecimal,
  stripTrailingZeros,
  formatFixed,
  formatFixedHalfUp,
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
