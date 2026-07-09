import {
  computeDisplayConvertedAmount,
  formatFrankfurterUnitRate,
} from "../../../utils/dashboard/frankfurterRates.js";
import {
  DASHBOARD_CURRENCY_COLORS,
  DASHBOARD_CURRENCY_FALLBACK_PALETTE,
} from "./dashboardConstants.js";

export function getCurrencyColor(code, fallbackIndex = 0) {
  const key = String(code || "").toUpperCase();
  if (DASHBOARD_CURRENCY_COLORS[key]) return DASHBOARD_CURRENCY_COLORS[key];
  return DASHBOARD_CURRENCY_FALLBACK_PALETTE[fallbackIndex % DASHBOARD_CURRENCY_FALLBACK_PALETTE.length];
}

export function buildEarningsPieSlices(rows, { useConverted = false } = {}) {
  return rows
    .filter((row) => row.earnings != null)
    .map((row, index) => {
      const originalEarnings = row.earnings;
      const earnings = useConverted
        ? row.earningsConverted != null
          ? row.earningsConverted
          : null
        : row.earnings;
      if (earnings == null) return null;
      return {
        code: row.code,
        earnings,
        originalEarnings,
        earningsConverted: row.earningsConverted,
        value: Math.abs(earnings),
        fill: getCurrencyColor(row.code),
      };
    })
    .filter((row) => row && row.value > 0)
    .sort((a, b) => b.value - a.value);
}

/** Gap between donut sectors; tighter when several small slices need room. */
export function resolveEarningsPiePaddingAngle(sliceCount) {
  if (sliceCount <= 1) return 0;
  if (sliceCount >= 4) return 2;
  return 3;
}

const PIE_RADIAN = Math.PI / 180;

/** Same polar→cartesian mapping as Recharts (startAngle=0, clockwise). */
export function polarToCartesian(cx, cy, radius, angleDeg) {
  return {
    x: cx + Math.cos(-PIE_RADIAN * angleDeg) * radius,
    y: cy + Math.sin(-PIE_RADIAN * angleDeg) * radius,
  };
}

/** Place tooltip outside the donut ring; keep clear of center badge and shell edges. */
export function computeSectorTooltipPosition(sector, shellWidth, shellHeight) {
  const cx = sector?.cx;
  const cy = sector?.cy;
  const outerRadius = sector?.outerRadius;
  const innerRadius = sector?.innerRadius;
  const midAngle = sector?.midAngle;
  if (cx == null || cy == null || outerRadius == null || midAngle == null) {
    return null;
  }
  if (shellWidth <= 0 || shellHeight <= 0) {
    return null;
  }

  const innerR = innerRadius ?? outerRadius * 0.58;
  const estW = 108;
  const estH = 82;
  const pad = 6;
  const halfDiag = Math.hypot(estW, estH) / 2;
  const minRadialFromCenter = innerR + halfDiag + 14;

  let radial = outerRadius + 42;
  let left = cx;
  let top = cy;

  for (let i = 0; i < 14; i += 1) {
    const pt = polarToCartesian(cx, cy, radial, midAngle);
    left = pt.x;
    top = pt.y;
    const dist = Math.hypot(left - cx, top - cy);
    const fitsX = left - estW / 2 >= pad && left + estW / 2 <= shellWidth - pad;
    const fitsY = top - estH / 2 >= pad && top + estH / 2 <= shellHeight - pad;
    const clearsCenter = dist >= minRadialFromCenter;
    if (fitsX && fitsY && clearsCenter) break;
    radial += 12;
  }

  left = Math.max(estW / 2 + pad, Math.min(shellWidth - estW / 2 - pad, left));
  top = Math.max(estH / 2 + pad, Math.min(shellHeight - estH / 2 - pad, top));

  return { left, top, placeAbove: top <= cy, radial: true };
}

function resolveRowShareAmount(row, useConverted) {
  if (useConverted) {
    if (row.earningsConverted == null) return null;
    return parseFloat(row.earningsConverted) || 0;
  }
  if (row.earnings == null) return null;
  return parseFloat(row.earnings) || 0;
}

/**
 * Share % by currency code.
 * Non-base currencies: abs(amount) / sum(abs) × 100.
 * Base (display) currency: 100% − sum(other shares), capped at 0 — never exceeds 100%.
 */
export function buildEarningsShareByCode(rows, baseCode, { useConverted = false } = {}) {
  const base = String(baseCode || "").toUpperCase();
  const entries = (rows || [])
    .map((row) => {
      const code = String(row.code || "").toUpperCase();
      const amount = resolveRowShareAmount(row, useConverted);
      if (amount == null) return null;
      return { code, abs: Math.abs(amount) };
    })
    .filter(Boolean);

  const shareByCode = {};
  for (const row of rows || []) {
    shareByCode[String(row.code || "").toUpperCase()] = 0;
  }

  const absTotal = entries.reduce((sum, entry) => sum + entry.abs, 0);
  if (!absTotal) return shareByCode;

  let othersSum = 0;
  for (const { code, abs } of entries) {
    if (code === base) continue;
    const pct = (abs / absTotal) * 100;
    shareByCode[code] = pct;
    othersSum += pct;
  }

  if (entries.some((entry) => entry.code === base)) {
    shareByCode[base] = Math.max(0, 100 - othersSum);
  }

  return shareByCode;
}

export function computePieCenterMetrics(rows, selectedCode, { useConverted = false } = {}) {
  const selected = String(selectedCode || "").toUpperCase();
  const match = (rows || []).find((row) => String(row.code || "").toUpperCase() === selected);
  const shareByCode = buildEarningsShareByCode(rows, selectedCode, { useConverted });
  const pct = (shareByCode[selected] ?? 0).toFixed(1);
  return { pct, code: selected || match?.code || "—" };
}

/** Pie center badge: unit rate of the active filter currency vs display base. */
export function computePieCenterRateMetrics(selectedCode, baseCode, rates) {
  const selected = String(selectedCode || "").toUpperCase();
  const base = String(baseCode || "").toUpperCase();
  const code = selected || base || "—";
  const rateLabel = formatFrankfurterUnitRate(code, base, rates);
  return { rate: rateLabel, code };
}

/**
 * Primary amount in the display (filter) currency; optional native subtitle when converted.
 */
export function resolveEarningsRowDisplayAmounts(row, baseCode, rates, useConverted) {
  const code = String(row?.code || "").toUpperCase();
  const base = String(baseCode || "").toUpperCase();
  const native = row?.earnings;
  if (native == null) return { primary: null, native: null };
  if (!useConverted || code === base) {
    return { primary: native, native: null };
  }
  const converted =
    row.earningsConverted != null
      ? row.earningsConverted
      : computeDisplayConvertedAmount(native, code, base, rates);
  if (converted == null) return { primary: null, native };
  return { primary: converted, native };
}

export function computeCurrencySharePct(row, shareByCode) {
  const code = String(row?.code || "").toUpperCase();
  return shareByCode?.[code] ?? 0;
}

export function companiesInGroupList(companies, gid) {
  if (!gid) {
    return companies.filter(
      (c) => c.company_id && String(c.company_id).trim() !== "" && (!c.group_id || String(c.group_id).trim() === "")
    );
  }
  return companies.filter(
    (c) =>
      c.company_id &&
      String(c.company_id).trim() !== "" &&
      c.group_id &&
      String(c.group_id).toUpperCase() === String(gid).toUpperCase()
  );
}

export function sortIds(ids) {
  return [...ids].sort((a, b) => a - b);
}
