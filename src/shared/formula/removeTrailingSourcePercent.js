/** Strip trailing *(...) Source suffix only; never strip row coefficients like *0.9. */
export function removeTrailingSourcePercentExpression(formulaText) {
  if (!formulaText) return "";
  let result = String(formulaText).trim();
  let previous = "";

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
    if (!isStarInsideParens && trailingPattern.test(afterStar)) {
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
