import { parseBalanceValue } from "../transactionFormat.js";

/** CSS classes for signed money: positive blue, negative red, zero/dash neutral. */
export function moneyToneClass(value, { forceTone = null } = {}) {
  if (forceTone === "pos") return "m-money m-money--pos";
  if (forceTone === "neg") return "m-money m-money--neg";

  const n = parseBalanceValue(String(value ?? "").replace(/,/g, ""));
  if (n != null) {
    if (n < 0) return "m-money m-money--neg";
    if (n > 0) return "m-money m-money--pos";
  }
  return "m-money m-money--neutral";
}
