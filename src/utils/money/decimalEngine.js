/**
 * Single configured Decimal constructor for the SPA (parity with legacy `js/decimal.min.js` + MoneyDecimal defaults).
 * Prefer importing `MoneyDecimal` helpers from `moneyDecimal.js`; use this only when you need a raw `Decimal` instance.
 */
import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_DOWN });

export default Decimal;
export { Decimal };
