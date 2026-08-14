function normalizeSourceExpressionForCompare(value) {
  const compact = String(value ?? "").trim().replace(/\s+/g, "");
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(compact)) {
    const numeric = Number(compact);
    if (Number.isFinite(numeric)) return String(numeric);
  }
  return compact;
}

/**
 * Strip trailing *(...) Source suffix.
 * When expectedSourcePercent is supplied, only a text-equivalent Source suffix
 * may be removed; an unrelated formula-body multiplier must be preserved.
 */
export function removeTrailingSourcePercentExpression(formulaText, expectedSourcePercent = null) {
  if (!formulaText) return "";
  let result = String(formulaText).trim();
  let previous = "";
  const expected =
    expectedSourcePercent == null
      ? null
      : normalizeSourceExpressionForCompare(expectedSourcePercent);

  while (result && previous !== result) {
    previous = result;
    const lastStarIndex = result.lastIndexOf("*");
    if (lastStarIndex < 0) break;

    const beforeStar = result.substring(0, lastStarIndex);
    const afterStar = result.substring(lastStarIndex);
    const openParens = (beforeStar.match(/\(/g) || []).length;
    const closeParens = (beforeStar.match(/\)/g) || []).length;
    const isStarInsideParens = openParens > closeParens;

    const trailingPattern = /^\*\s*\(([0-9.+\-*/\s]+)\)\s*$/;
    const trailingMatch = afterStar.match(trailingPattern);
    const trailingMatchesExpected =
      expected == null ||
      normalizeSourceExpressionForCompare(trailingMatch?.[1] ?? "") === expected;
    if (!isStarInsideParens && trailingMatch && trailingMatchesExpected) {
      result = beforeStar.trim();
      continue;
    }
    break;
  }

  return result;
}

export const removeTrailingSourcePercentSuffix = removeTrailingSourcePercentExpression;

/** Parse trailing *(source) from a formula/display string; null if not a Source suffix. */
export function parseTrailingSourceParenValue(formulaText) {
  if (!formulaText) return null;
  const trimmed = String(formulaText).trim();
  const lastStar = trimmed.lastIndexOf("*");
  if (lastStar < 0) return null;

  const beforeStar = trimmed.substring(0, lastStar);
  const afterStar = trimmed.substring(lastStar);
  const openParens = (beforeStar.match(/\(/g) || []).length;
  const closeParens = (beforeStar.match(/\)/g) || []).length;
  if (openParens > closeParens) return null;

  const m = afterStar.match(/^\*\s*\(([0-9.+\-*/\s]+)\)\s*$/);
  return m ? m[1].trim() : null;
}
