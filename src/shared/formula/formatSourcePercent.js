/** Format source_percent for display (.14 → 0.14, 1 → 1). Mirrors PHP/legacy formatSourcePercentForDisplay. */
export function formatSourcePercent(value) {
  if (value === null || value === undefined || value === false) return "1";
  const valueStr = String(value).trim().replace(/%/g, "");
  if (valueStr === "") return "1";

  if (/[+\-*/]/.test(valueStr)) {
    if (!/^[0-9.+\-*/()\s]+$/.test(valueStr)) return valueStr;
    try {
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${valueStr});`)();
      if (typeof result !== "number" || !Number.isFinite(result)) return valueStr;
      return formatNumericSource(result);
    } catch {
      return valueStr;
    }
  }

  const num = Number(valueStr);
  if (!Number.isFinite(num)) return valueStr;
  return formatNumericSource(num);
}

function formatNumericSource(num) {
  if (Math.abs(num - Math.round(num)) < 1e-9) {
    return String(Math.round(num));
  }
  let s = num.toFixed(6);
  s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s !== "" ? s : "0";
}

export const formatSourcePercentForDisplay = formatSourcePercent;
