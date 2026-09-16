/**
 * Footer labels that must survive paste over-select cleanup.
 * Trailing `:` / `=` (e.g. Monkey King All Total, OBET "SPORT TOTAL =") are stripped.
 */
export function normalizePasteSummaryLabel(text) {
  return String(text ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[:：=]+$/g, "")
    .trim()
    .toUpperCase();
}

export function isKeptPasteSummaryLabel(text) {
  const normalized = normalizePasteSummaryLabel(text);
  if (!normalized) return false;
  // iview allGames footer uses Total(1) / Total(12).
  if (/^TOTAL\(\d+\)$/.test(normalized)) return true;
  // 4D/GLX workbook + GamingSoft invoice: last EXTRA FEE row is sparse vs agent rows.
  if (/\bEXTRA\s*FEES?\b/.test(normalized)) return true;
  return (
    normalized === "SUBTOTAL" ||
    normalized === "SUB TOTAL" ||
    normalized === "TOTAL AMOUNT" ||
    normalized === "TOTAL" ||
    normalized === "GRAND TOTAL" ||
    normalized === "GRANDTOTAL" ||
    normalized === "ALL TOTAL" ||
    normalized === "ALLTOTAL" ||
    normalized === "SPORT TOTAL" ||
    normalized === "SPORTTOTAL" ||
    // 3win8 agency_transaction: colspan=3 "Page Total" / "Overall Total" footers
    // are narrower than agent rows and used to be dropped as trailing junk.
    normalized === "PAGE TOTAL" ||
    normalized === "PAGETOTAL" ||
    normalized === "OVERALL TOTAL" ||
    normalized === "OVERALLTOTAL" ||
    /^SUB\s*\([A-Z]{3}\)$/.test(normalized)
  );
}
