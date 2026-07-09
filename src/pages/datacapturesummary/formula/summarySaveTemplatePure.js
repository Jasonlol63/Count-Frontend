import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { appendDataCaptureScopeParams } from "../../datacapture/lib/dataCaptureApi.js";
import {
  calculateBaseProcessedAmount,
  roundProcessedAmountTo2Decimals,
} from "../table/summaryRowAmount.js";

function buildTemplateUrl(captureScope) {
  const params = new URLSearchParams({ action: "save_template" });
  appendDataCaptureScopeParams(params, captureScope);
  return buildApiUrl(`api/datacapture_summary/summary_api.php?${params.toString()}`);
}

export function buildTemplateKey(row) {
  if (row.templateKey) return row.templateKey;
  if (row.templateId != null) return `tid_${row.templateId}`;
  if (row.productType === "main") {
    const acc = row.accountId ? String(row.accountId) : "";
    const fv = row.formulaVariant != null ? String(row.formulaVariant) : "0";
    const ri = row.rowIndex != null ? String(row.rowIndex) : "";
    const key = [row.idProduct, acc, fv, ri].filter(Boolean).join("_");
    return key ? key.slice(0, 250) : String(row.idProduct || "").slice(0, 250);
  }
  return null;
}

export function buildTemplatePayloadFromRow(row, { processId, companyId } = {}) {
  const productType = row.productType === "sub" ? "sub" : "main";
  const formulaDisplay = row.formulaDisplay || "";
  const isFormulaEmpty = !formulaDisplay.trim() || formulaDisplay === "Formula";
  const sourceColumns = isFormulaEmpty ? "" : row.sourceColumns || "";

  return {
    product_type: productType,
    id_product: productType === "sub" ? row.subIdProduct || row.idProduct : row.idProduct,
    parent_id_product: productType === "sub" ? row.parentIdProduct || row.idProduct : null,
    id_product_main: row.idProduct || null,
    id_product_sub: productType === "sub" ? row.subIdProduct || null : null,
    description: row.originalDescription || "",
    account_id: row.accountId,
    account_display: row.account || "",
    currency_id: row.currencyId,
    currency_display: row.currency || "",
    source_columns: sourceColumns,
    formula_operators: row.formulaOperators || row.formula || "",
    source_percent: String(row.sourcePercent || "1").trim() || "1",
    enable_source_percent: row.enableSourcePercent ? 1 : 0,
    input_method: row.inputMethod || null,
    enable_input_method: row.enableInputMethod ? 1 : 0,
    batch_selection: row.selectChecked ? 1 : 0,
    formula_display: formulaDisplay,
    last_source_value: formulaDisplay,
    last_processed_amount: roundProcessedAmountTo2Decimals(calculateBaseProcessedAmount(row)),
    template_key: buildTemplateKey(row),
    template_id: row.templateId ?? null,
    formula_variant: row.formulaVariant ?? null,
    process_id: processId ?? null,
    row_index: row.rowIndex ?? null,
    sub_order: productType === "sub" ? row.subOrder ?? null : null,
    ...(companyId != null && Number(companyId) > 0 ? { company_id: Number(companyId) } : {}),
  };
}

/** POST save_template — returns API json. */
export async function saveSummaryTemplatePure(row, { captureScope, companyId, processId } = {}) {
  const hasAccount = row.accountId != null && String(row.accountId).trim() !== "";
  const hasCurrency = row.currencyId != null && String(row.currencyId).trim() !== "";
  const hasFormula =
    (row.formulaOperators != null && String(row.formulaOperators).trim() !== "") ||
    (row.formulaDisplay != null && String(row.formulaDisplay).trim() !== "");

  if (hasAccount && !hasCurrency) {
    return { success: false, message: "Currency is required." };
  }
  if (hasAccount && row.productType === "sub" && !hasFormula) {
    return { success: false, message: "Formula is required for sub rows." };
  }
  if (!hasAccount) {
    return { success: false, message: "Account is required." };
  }

  const payload = buildTemplatePayloadFromRow(row, { processId, companyId });
  const url = buildTemplateUrl(captureScope);
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!result?.success) {
    return { success: false, message: result?.message || result?.error || "Template save failed" };
  }

  return {
    success: true,
    templateId: result.template_id ?? result.data?.template_id ?? null,
    templateKey: result.template_key ?? result.data?.template_key ?? null,
    formulaVariant: result.formula_variant ?? result.data?.formula_variant ?? null,
  };
}
