import { parseTrailingSourceParenValue } from "./removeTrailingSourcePercent.js";
import { isMisplacedCommission } from "./isMisplacedCommission.js";
import { hasRowCoefficientTail } from "./mergeFormulaTail.js";
import { resolveTemplateFormulaBaseAndPercent } from "./resolveFormulaForDisplay.js";

/**
 * Score a template row for Maintenance dedup — higher score wins (tie: larger id).
 */
export function scoreTemplateRowForMaintenanceDedup(row) {
  const [base, source] = resolveTemplateFormulaBaseAndPercent(row);
  let score = base.length;

  if (hasRowCoefficientTail(base)) {
    score += 100;
  }

  const sourceNum = Number(String(source).trim());
  if (
    String(source).trim() !== "" &&
    String(source).trim() !== "1" &&
    !isMisplacedCommission(sourceNum)
  ) {
    score += 200;
  }

  const displayMisplaced = parseTrailingSourceParenValue(row?.formula_display);
  if (displayMisplaced != null && isMisplacedCommission(displayMisplaced)) {
    score -= 200;
  }

  const dbPct = String(row?.source_percent ?? "").trim();
  if (dbPct !== "" && isMisplacedCommission(dbPct)) {
    score -= 150;
  }

  return score;
}

export function buildMaintenanceDedupKey(row) {
  const processDisplay = row._processDisplay ?? row.process_code ?? row.process ?? "";
  const accountDisplay = row.account_code ?? row.account_display ?? row.account ?? "";
  const currencyDisplay = row.currency_code ?? row.currency_display ?? row.currency ?? "";
  const product = row.id_product ?? row.product ?? "";
  const productType = row.product_type ?? "main";
  const descriptionKey = String(row.description ?? "").trim().toLowerCase();

  return [
    String(processDisplay).trim().toLowerCase(),
    String(accountDisplay).trim().toLowerCase(),
    String(currencyDisplay).trim().toLowerCase(),
    String(product).trim().toLowerCase(),
    productType,
    descriptionKey,
  ].join("|");
}

/** Dedup raw DB rows by maintenance key, keeping highest score then largest id. */
export function dedupTemplateRowsForMaintenance(rows) {
  const byKey = new Map();

  for (const row of rows) {
    const key = buildMaintenanceDedupKey(row);
    const currentId = Number(row.id) || 0;
    const score = scoreTemplateRowForMaintenanceDedup(row);

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { row, score, id: currentId });
      continue;
    }

    const shouldReplace =
      score > existing.score || (score === existing.score && currentId > existing.id);
    if (shouldReplace) {
      byKey.set(key, { row, score, id: currentId });
    }
  }

  return Array.from(byKey.values()).map((v) => v.row);
}
