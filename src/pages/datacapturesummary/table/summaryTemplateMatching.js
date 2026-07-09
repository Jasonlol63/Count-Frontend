import { normalizeSummaryIdProductText } from "../lib/summaryIdProductUtils.js";

function normalizeSpacesId(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, "");
}

function rowIdMatches(row, templateIdProduct) {
  const targetNorm = normalizeSummaryIdProductText(templateIdProduct);
  const mainRaw = String(row.idProduct || "").trim();
  const mainNorm = normalizeSummaryIdProductText(mainRaw);
  if (!targetNorm || !mainNorm) return false;
  if (mainNorm === targetNorm) return true;
  if (mainRaw.startsWith(`${templateIdProduct} `) || mainRaw.startsWith(`${templateIdProduct}(`)) {
    return true;
  }
  return normalizeSpacesId(mainRaw) === normalizeSpacesId(templateIdProduct);
}

/**
 * Find best main row for a template (ported from applyMainTemplateToRow matching priorities).
 * @param {import('./summaryRowData.js').SummaryRowData[]} rows
 * @param {string} idProduct
 * @param {object} mainTemplate
 * @param {Set<string>} appliedKeys
 */
export function findMainRowForTemplate(rows, idProduct, mainTemplate, appliedKeys) {
  const templateAccountId = mainTemplate.account_id != null ? String(mainTemplate.account_id) : null;
  const templateFormulaVariant =
    mainTemplate.formula_variant != null ? String(mainTemplate.formula_variant) : null;
  const templateRowIndex =
    mainTemplate.row_index != null && !Number.isNaN(Number(mainTemplate.row_index))
      ? Number(mainTemplate.row_index)
      : null;
  const templateId = mainTemplate.id != null ? String(mainTemplate.id) : null;

  const candidates = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.productType === "main" && rowIdMatches(row, idProduct))
    .filter(({ row }) => !appliedKeys.has(row.key))
    .map(({ row, index }) => ({
      row,
      index,
      accountId: row.accountId ? String(row.accountId) : null,
      accountDisplay: row.account || "",
      formulaVariant: row.formulaVariant != null ? String(row.formulaVariant) : null,
      templateId: row.templateId != null ? String(row.templateId) : null,
      rowIndex: row.rowIndex,
    }));

  const pick = (predicate) => candidates.find((c) => predicate(c))?.row ?? null;

  if (templateId) {
    const byTpl = pick((c) => c.templateId === templateId);
    if (byTpl) return byTpl;
  }

  if (templateAccountId && templateFormulaVariant) {
    const matches = candidates.filter(
      (c) => c.accountId === templateAccountId && c.formulaVariant === templateFormulaVariant
    );
    if (matches.length === 1) return matches[0].row;
    if (matches.length > 1 && templateRowIndex != null) {
      const exact = matches.find((c) => c.rowIndex === templateRowIndex);
      if (exact) return exact.row;
    }
  }

  if (templateAccountId) {
    const matches = candidates.filter((c) => c.accountId === templateAccountId);
    if (matches.length === 1) return matches[0].row;
    if (matches.length > 1 && templateRowIndex != null) {
      const exact = matches.find((c) => c.rowIndex === templateRowIndex);
      if (exact) return exact.row;
    }
  }

  if (templateRowIndex != null) {
    const byIdx = pick((c) => c.rowIndex === templateRowIndex);
    if (byIdx) return byIdx;
  }

  const empty = pick((c) => !c.accountId && !c.accountDisplay);
  if (empty) return empty;

  return candidates[0]?.row ?? null;
}

/** @param {import('./summaryRowData.js').SummaryRowData[]} rows @param {object} subTemplate */
export function findMainRowForSubTemplatePure(rows, parentIdProduct, subTemplate) {
  const parentExact = (subTemplate?.parent_id_product || parentIdProduct || "").trim();
  if (!parentExact) return null;

  let mains = rows.filter(
    (r) => r.productType === "main" && normalizeSummaryIdProductText(r.idProduct) === normalizeSummaryIdProductText(parentExact)
  );
  if (mains.length === 0) {
    mains = rows.filter((r) => r.productType === "main" && rowIdMatches(r, parentExact));
  }
  if (mains.length === 0) return null;
  if (mains.length === 1) return mains[0];

  const subRowIndex =
    subTemplate?.row_index != null && !Number.isNaN(Number(subTemplate.row_index))
      ? Number(subTemplate.row_index)
      : null;
  if (subRowIndex != null) {
    const sorted = [...mains].sort((a, b) => a.rowIndex - b.rowIndex);
    for (let i = 0; i < sorted.length; i += 1) {
      const mainRowIndex = sorted[i].rowIndex;
      const nextMainRowIndex =
        i < sorted.length - 1 ? sorted[i + 1].rowIndex : Number.POSITIVE_INFINITY;
      if (subRowIndex >= mainRowIndex && subRowIndex < nextMainRowIndex) {
        return sorted[i];
      }
    }
    const exact = sorted.find((m) => m.rowIndex === subRowIndex);
    if (exact) return exact;
  }
  return mains[0];
}
