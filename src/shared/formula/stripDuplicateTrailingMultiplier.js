/** Normalize numeric token for equality checks (ignore commas / spacing). */
function normalizeNumericToken(value) {
  const s = String(value ?? "")
    .trim()
    .replace(/,/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Remove consecutive duplicate trailing multipliers, e.g. *0.6720623*0.6720623 → *0.6720623.
 * Handles cases where $N expands to the same literal already present in formula_operators.
 */
export function stripDuplicateTrailingMultiplier(expr) {
  if (!expr) return "";
  let s = String(expr).trim().replace(/\s+/g, "");
  if (!s) return "";

  for (let i = 0; i < 8 && s.length > 0; i += 1) {
    const m = s.match(/^(.*)\*([0-9.]+)\*([0-9.]+)$/);
    if (!m) break;

    const a = normalizeNumericToken(m[2]);
    const b = normalizeNumericToken(m[3]);
    if (a == null || b == null || Math.abs(a - b) >= 1e-9) break;

    s = `${m[1]}*${m[2]}`;
  }

  return s;
}
