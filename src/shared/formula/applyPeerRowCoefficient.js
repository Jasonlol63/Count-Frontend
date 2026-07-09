import { removeTrailingSourcePercentExpression } from "./removeTrailingSourcePercent.js";
import { extractRowCoefficientTail } from "./mergeFormulaTail.js";
import { resolveTemplateFormulaBaseAndPercent } from "./resolveFormulaForDisplay.js";
import { formatSourcePercent } from "./formatSourcePercent.js";
import { isSourceOne } from "./isMisplacedCommission.js";

function formulaCoreWithoutTail(base) {
  const tail = extractRowCoefficientTail(base);
  if (!tail) return String(base ?? "").trim();
  return String(base).slice(0, -tail.length).trim();
}

function peerGroupKey(row) {
  const process = String(row.process ?? row._process ?? row.process_code ?? "").trim().toLowerCase();
  const currency = String(row.currency ?? row._currency ?? row.currency_code ?? "").trim().toLowerCase();
  const product = String(row.product ?? row.id_product ?? "").trim().toLowerCase();
  const [base] = resolveTemplateFormulaBaseAndPercent(row);
  const core = formulaCoreWithoutTail(base).toLowerCase();
  return `${process}|${currency}|${product}|${core}`;
}

function buildDisplayWithSource(base, source, enable) {
  const b = String(base ?? "").trim();
  if (!b) return "";
  if (!enable || isSourceOne(source)) return b;
  return `${b} * (${formatSourcePercent(source)})`;
}

/**
 * Same product peers: rows missing row coefficient inherit *0.9 from a sibling.
 * Preserves Source (e.g. 红股 0.1) — only补占成.
 */
export function applyPeerRowCoefficientInferenceToDisplayRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const tailByPeerKey = new Map();
  for (const row of rows) {
    const [base] = resolveTemplateFormulaBaseAndPercent(row);
    const tail = extractRowCoefficientTail(base);
    if (tail) {
      tailByPeerKey.set(peerGroupKey(row), tail);
    }
  }

  return rows.map((row) => {
    const [base, source, enable] = resolveTemplateFormulaBaseAndPercent(row);
    if (extractRowCoefficientTail(base)) {
      return {
        ...row,
        formula: buildDisplayWithSource(base, source, enable),
        formula_edit: base,
        source: formatSourcePercent(source),
      };
    }

    const inherited = tailByPeerKey.get(peerGroupKey(row));
    if (!inherited) return row;

    const patchedBase = `${base}${inherited}`;
    return {
      ...row,
      formula: buildDisplayWithSource(patchedBase, source, enable),
      formula_edit: patchedBase,
      source: formatSourcePercent(source),
    };
  });
}

/** Strip accidental *(source) from user formula input — edit box is base-only. */
export function normalizeMaintenanceFormulaInput(raw) {
  return removeTrailingSourcePercentExpression(String(raw ?? "").trim());
}
