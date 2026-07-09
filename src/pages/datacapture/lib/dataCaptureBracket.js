import { MoneyDecimal } from "../../../utils/money/moneyDecimal.js";

/** Matches `convertBracketedToNegative` in `js/datacapture.js`. */
export function convertBracketedToNegative(value) {
  if (!value || typeof value !== "string") return value;

  const trimmed = value.trim();
  const bracketPattern1 = /^\([\d,]+(\.\d+)?\)$/;
  const bracketPattern2 = /^\(\$[\d,]+(\.\d+)?\)$/;

  let hasDollarSign = false;
  let numberStr = "";

  if (bracketPattern2.test(trimmed)) {
    hasDollarSign = true;
    numberStr = trimmed.slice(2, -1);
  } else if (bracketPattern1.test(trimmed)) {
    numberStr = trimmed.slice(1, -1);
  } else {
    return value;
  }

  const numberWithoutCommas = numberStr.replace(/,/g, "");
  try {
    if (typeof MoneyDecimal?.toDecimal === "function") {
      MoneyDecimal.toDecimal(numberWithoutCommas);
    }
    let formattedNumber = "";
    if (numberWithoutCommas.includes(".")) {
      const parts = numberWithoutCommas.split(".");
      const formattedInteger = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      formattedNumber = `-${formattedInteger}${parts[1] ? `.${parts[1]}` : ""}`;
    } else {
      formattedNumber = `-${numberWithoutCommas.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
    }
    if (hasDollarSign) {
      return `-$${formattedNumber.substring(1)}`;
    }
    return formattedNumber;
  } catch {
    return value;
  }
}
