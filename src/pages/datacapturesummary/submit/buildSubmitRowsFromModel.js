import { removeTrailingSourcePercentExpression } from "../../../shared/formula/index.js";
import { evaluateExpression } from "../formula/summaryFormulaEvaluate.js";
import { removeThousandsSeparators } from "../formula/summaryFormulaParseUtils.js";
import {
  resolveFormulaTextForCalculation,
  resolveSubmitProcessedAmount,
} from "../table/summaryRowAmount.js";

function resolveAccountId(row, accounts) {
  if (row.accountId) return String(row.accountId);
  const text = String(row.account || "").trim();
  if (!text || !Array.isArray(accounts)) return null;
  const found = accounts.find((a) => {
    const display = String(a.account_display || a.account || a.name || "").trim();
    const code = String(a.account_code || a.code || "").trim();
    return display === text || code === text || text.includes(`[${a.id}]`);
  });
  return found?.id != null ? String(found.id) : null;
}

function resolveCurrencyId(row, parsedProcessData) {
  if (row.currencyId) return String(row.currencyId);
  const code = String(row.currency || "")
    .replace(/[()]/g, "")
    .trim();
  if (!code) return parsedProcessData?.currency ? String(parsedProcessData.currency) : null;
  return parsedProcessData?.currency ? String(parsedProcessData.currency) : null;
}

function resolveGlobalRateForSubmit(row, globalRateInput) {
  if (row.rateValue?.trim()) return null;
  if (!row.rateChecked || !globalRateInput?.trim()) return null;
  const rv = globalRateInput.trim();
  return rv.startsWith("*") || rv.startsWith("/") ? rv.substring(1) : rv;
}

/** Build API submit row objects from React row models. */
export function buildSubmitRowsFromModel(rows, parsedProcessData, accounts = [], globalRateInput = "") {
  const summaryRows = [];

  for (const row of rows) {
    if (row.selectChecked) continue;
    if (!row.account?.trim()) continue;

    const idProductMain = row.productType === "main" ? row.idProduct : row.parentIdProduct || "";
    const idProductSub = row.productType === "sub" ? row.subIdProduct || row.idProduct : "";
    const productType = row.productType === "sub" && !idProductMain ? "sub" : row.productType;
    const idProduct =
      productType === "sub" && idProductSub ? idProductSub : idProductMain || row.idProduct;

    const accountId = resolveAccountId(row, accounts);
    if (!accountId) continue;

    const currencyText = String(row.currency || "")
      .replace(/[()]/g, "")
      .trim();
    const sourcePercent = String(row.sourcePercent || "1").trim() || "1";
    const formulaDisplay = String(row.formulaDisplay || row.formula || "").trim();
    const formulaOperators = String(
      row.formulaOperators || resolveFormulaTextForCalculation(row) || ""
    ).trim();
    const isSourceOne = Math.abs(parseFloat(sourcePercent) - 1) < 0.0001;
    const formulaToSend =
      isSourceOne && formulaDisplay
        ? removeTrailingSourcePercentExpression(formulaDisplay) || formulaDisplay
        : formulaDisplay;

    const finalProcessedAmount = resolveSubmitProcessedAmount(row, globalRateInput);

    let rateValue = null;
    if (row.rateValue?.trim()) {
      rateValue = row.rateValue.trim();
    } else {
      rateValue = resolveGlobalRateForSubmit(row, globalRateInput);
    }

    summaryRows.push({
      idProductMain: idProductMain || null,
      descriptionMain: row.originalDescription || null,
      idProductSub: idProductSub || null,
      descriptionSub: null,
      productType,
      parentIdProduct: row.parentIdProduct || idProductMain || null,
      idProduct,
      accountId,
      account: row.account,
      accountDisplay: row.account,
      currencyId: resolveCurrencyId(row, parsedProcessData),
      currency: currencyText || parsedProcessData?.currencyName,
      currencyDisplay: currencyText || parsedProcessData?.currencyName,
      columns: row.sourceColumns || "",
      sourceColumns: row.sourceColumns || "",
      source: "",
      sourcePercent,
      enableSourcePercent: row.enableSourcePercent ? 1 : 0,
      formulaOperators,
      formula: formulaToSend,
      processedAmount: Number.isFinite(finalProcessedAmount) ? finalProcessedAmount : 0,
      inputMethod: row.inputMethod || "",
      enableInputMethod: row.enableInputMethod ? 1 : 0,
      batchSelection: 0,
      templateKey: row.templateKey || null,
      templateId: row.templateId,
      subOrder: row.subOrder,
      formulaVariant: row.formulaVariant,
      rateChecked: row.rateChecked,
      rateValue,
      displayOrder: row.rowIndex,
    });
  }

  return summaryRows;
}

export function validateRowsForSubmit(rows) {
  for (const row of rows) {
    if (row.selectChecked || !row.account?.trim()) continue;
    const hasFormula = Boolean(
      (row.formulaDisplay || row.formula || row.formulaOperators || "").trim()
    );
    const hasCurrency = Boolean((row.currency || row.currencyId || "").toString().trim());
    if (hasFormula && !hasCurrency) {
      return {
        ok: false,
        message: `Row "${row.idProduct}" has formula but no currency selected.`,
      };
    }
  }
  return { ok: true };
}
