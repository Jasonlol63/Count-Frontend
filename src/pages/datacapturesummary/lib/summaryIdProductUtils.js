/** Id Product text normalization for Summary rows. */
export function normalizeSummaryIdProductText(text) {
  if (!text || typeof text !== "string") return "";
  return text.trim();
}

/** Collapse internal whitespace for Id Product equality checks. */
export function normalizeSummaryIdProductSpaces(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, "");
}

/**
 * Exact Id Product equality (trim + optional space collapse).
 * "*REVERT* TT683951A" !== "TT683951A".
 */
export function summaryIdProductsEqual(a, b) {
  const left = String(a || "").trim();
  const right = String(b || "").trim();
  if (!left || !right) return false;
  if (left === right) return true;
  return normalizeSummaryIdProductSpaces(left) === normalizeSummaryIdProductSpaces(right);
}

/**
 * Safe suffix expansion for truncated Id Product refs only.
 * Allows "(T07)" → "FOO(T07)" but rejects "*REVERT* TT683951A" ← "TT683951A".
 */
export function isSafeIdProductSuffixMatch(fullId, shortId) {
  const full = String(fullId || "").trim();
  const short = String(shortId || "").trim();
  if (!full || !short) return false;
  if (summaryIdProductsEqual(full, short)) return true;
  if (!full.endsWith(short) || full.length <= short.length) return false;

  const before = full.slice(0, full.length - short.length);
  // Asterisk-wrapped decorations (*REVERT*) are distinct products, not truncations.
  if (/\*[^*]+\*\s*$/i.test(before)) return false;
  // Parenthetical short forms may be glued: "FOO(T07)" ← "(T07)".
  if (/^\s*\([^)]*\)\s*$/.test(short)) return true;
  // Mid-token splice (e.g. XTT683951A) is never a valid expansion.
  if (/[A-Za-z0-9]$/.test(before)) return false;
  // Standalone product-looking codes (letter+digit, len>=6) must not soft-match a longer decorated id.
  if (/[A-Za-z]/.test(short) && /\d/.test(short) && short.length >= 6 && before.trim() !== "") {
    return false;
  }
  return true;
}

export function getSummaryProductValuesFromCell(cell) {
  if (!cell) return { main: "", sub: "" };
  const main = cell.getAttribute("data-main-product") || "";
  const sub = cell.getAttribute("data-sub-product") || "";
  const text = cell.textContent.trim();
  if (!main && !sub && text) {
    const parts = text.split(" / ");
    return { main: parts[0] || "", sub: parts[1] || "" };
  }
  return { main, sub };
}
