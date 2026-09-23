export function formatCurrency(value) {
  return parseFloat(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Hero headline — same full precision as Overview cards (no K/M rounding). */
export function formatCurrencyHero(value) {
  return formatCurrency(value);
}

export function formatSignedChange(value) {
  const n = parseFloat(value) || 0;
  const body = formatCurrency(Math.abs(n));
  if (n > 0) return `+${body}`;
  if (n < 0) return `-${body}`;
  return body;
}

export function formatPercent(pct) {
  const n = parseFloat(pct) || 0;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

/**
 * Absolute percent for badges where an arrow already shows direction.
 *
 * Pass `clamped` when the compare object says the true change exceeded ±999.9% and was capped
 * (`buildKpiCompare`'s `clamped` flag). The figure really is that extreme — e.g. −1770% — so
 * showing "999.9%" as though it were exact misleads; the trailing "+" marks it as capped. Desktop
 * renders it the same way (`Count/docs/dashboard-springboot-kpi.md` §7.3).
 */
export function formatPercentMagnitude(pct, { clamped = false } = {}) {
  const n = Math.abs(parseFloat(pct) || 0);
  return `${n.toFixed(1)}${clamped ? "+" : ""}%`;
}

/** Compact axis label, e.g. 150000 -> "150K", -75000 -> "-75K". */
export function formatCompactAxis(value) {
  const n = parseFloat(value) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(abs % 1_000_000 ? 1 : 0)}M`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}K`;
  return `${sign}${Math.round(abs)}`;
}
