import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { appendDataCaptureScopeParams } from "../../datacapture/lib/dataCaptureApi.js";
import { resolveDataCaptureEffectiveTenantId } from "../../datacapture/lib/dataCaptureTenant.js";
import {
  calculateBaseProcessedAmount,
  roundProcessedAmountTo2Decimals,
} from "../table/summaryRowAmount.js";

function isApiSuccess(json) {
  return json?.success === true || json?.status === "success";
}

function buildTemplateUrl(captureScope) {
  const params = new URLSearchParams({ action: "save_template" });
  appendDataCaptureScopeParams(params, captureScope);
  return buildApiUrl(`api/datacapture_summary/summary_templates_api.php?${params.toString()}`);
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

/**
 * POST /api/datacapture-summary/formula/save — Add Formula (Spring).
 * Server picks MAIN (empty main) or SUB (main already has data).
 */
export async function saveAddFormulaSpring(
  row,
  { captureScope, companyId, processId, processCode } = {},
) {
  const hasAccount = row.accountId != null && String(row.accountId).trim() !== "";
  const hasCurrency = row.currencyId != null && String(row.currencyId).trim() !== "";
  const formula =
    String(row.formulaOperators || row.formula || "").trim() ||
    String(row.formulaDisplay || "").trim();

  if (!hasAccount) {
    return { success: false, message: "Account Id is required" };
  }
  if (!hasCurrency) {
    return { success: false, message: "Currency Id is required" };
  }
  if (!formula || formula === "Formula") {
    return { success: false, message: "Formula is required" };
  }

  const tenantId = resolveDataCaptureEffectiveTenantId(captureScope, companyId);
  const pid = Number(processId);
  const code = String(processCode || "").trim().toUpperCase();
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return { success: false, message: "Tenant Id is required" };
  }
  // Bank Summary often has processCode (SALARY) without numeric processId.
  if ((!Number.isFinite(pid) || pid <= 0) && !code) {
    return { success: false, message: "Process Id is required" };
  }

  const idProduct = String(row.idProduct || "").trim();
  if (!idProduct) {
    return { success: false, message: "Product Id is required" };
  }

  const body = {
    tenantId: Number(tenantId),
    ...(Number.isFinite(pid) && pid > 0 ? { processId: pid } : {}),
    ...(code ? { processCode: code } : {}),
    idProduct,
    accountId: Number(row.accountId),
    accountDisplay: row.account || "",
    currencyId: Number(row.currencyId),
    currencyDisplay: row.currency || "",
    description: row.originalDescription || "",
    sourceColumns: row.sourceColumns || "",
    columnsDisplay: row.columnsDisplay || null,
    formula,
    formulaOperators: row.formulaOperators || formula,
    inputMethod: row.inputMethod || null,
    sourcePercent: String(row.sourcePercent || "1").trim() || "1",
    enableSourcePercent: row.enableSourcePercent !== false,
    enableInputMethod: Boolean(row.enableInputMethod),
    rowIndex: row.rowIndex ?? null,
  };

  const response = await fetch(buildApiUrl("api/datacapture-summary/formula/save"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || !isApiSuccess(result)) {
    return { success: false, message: result?.message || result?.error || "Formula save failed" };
  }

  const data = result.data || {};
  const productType = String(data.productType || "").toUpperCase() === "SUB" ? "sub" : "main";
  return {
    success: true,
    templateId: data.id ?? null,
    templateKey: data.id != null ? `tid_${data.id}` : null,
    formulaVariant: data.formulaVariant ?? null,
    productType,
    parentIdProduct: data.parentIdProduct ?? null,
    subOrder: data.subOrder ?? null,
  };
}

/**
 * POST /api/datacapture-summary/formula/update — Edit Formula / Source inline (Spring).
 * Prefer templateId; Bank rows may lack it — server resolves via processCode + product + account (+ subOrder).
 */
export async function saveUpdateFormulaSpring(
  row,
  { captureScope, companyId, processId, processCode } = {},
) {
  const hasAccount = row.accountId != null && String(row.accountId).trim() !== "";
  const hasCurrency = row.currencyId != null && String(row.currencyId).trim() !== "";
  const formula =
    String(row.formulaOperators || row.formula || "").trim() ||
    String(row.formulaDisplay || "").trim();

  if (!hasAccount) {
    return { success: false, message: "Account Id is required" };
  }
  if (!hasCurrency) {
    return { success: false, message: "Currency Id is required" };
  }
  if (!formula || formula === "Formula") {
    return { success: false, message: "Formula is required" };
  }

  const tenantId = resolveDataCaptureEffectiveTenantId(captureScope, companyId);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return { success: false, message: "Tenant Id is required" };
  }

  // Summary row has no numeric formula pk besides templateId (do not use row.id / row.key).
  const formulaId = Number(row.templateId);
  const hasFormulaId = Number.isFinite(formulaId) && formulaId > 0;
  const pid = Number(processId);
  const code = String(processCode || "").trim().toUpperCase();
  if ((!Number.isFinite(pid) || pid <= 0) && !code) {
    return { success: false, message: "Process Id is required" };
  }

  const productType = row.productType === "sub" ? "SUB" : "MAIN";
  const idProduct = String(row.idProduct || "").trim();
  const parentIdProduct =
    productType === "SUB"
      ? String(row.parentIdProduct || row.idProduct || "").trim() || null
      : null;

  const body = {
    tenantId: Number(tenantId),
    ...(hasFormulaId ? { id: formulaId } : {}),
    ...(Number.isFinite(pid) && pid > 0 ? { processId: pid } : {}),
    ...(code ? { processCode: code } : {}),
    productType,
    idProduct,
    parentIdProduct,
    subOrder: productType === "SUB" && row.subOrder != null ? Number(row.subOrder) : null,
    accountId: Number(row.accountId),
    accountDisplay: row.account || "",
    currencyId: Number(row.currencyId),
    currencyDisplay: row.currency || "",
    description: row.originalDescription || "",
    sourceColumns: row.sourceColumns || "",
    columnsDisplay: row.columnsDisplay || null,
    formula,
    formulaOperators: row.formulaOperators || formula,
    inputMethod: row.inputMethod || null,
    sourcePercent: String(row.sourcePercent || "1").trim() || "1",
    enableSourcePercent: row.enableSourcePercent !== false,
    enableInputMethod: Boolean(row.enableInputMethod),
    rowIndex: row.rowIndex ?? null,
  };

  const response = await fetch(buildApiUrl("api/datacapture-summary/formula/update"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || !isApiSuccess(result)) {
    return { success: false, message: result?.message || result?.error || "Formula update failed" };
  }

  const data = result.data || {};
  const resolvedType = String(data.productType || "").toUpperCase() === "SUB" ? "sub" : "main";
  return {
    success: true,
    templateId: data.id ?? (hasFormulaId ? formulaId : null),
    templateKey: data.id != null ? `tid_${data.id}` : row.templateKey || null,
    formulaVariant: data.formulaVariant ?? row.formulaVariant ?? null,
    productType: resolvedType,
    parentIdProduct: data.parentIdProduct ?? row.parentIdProduct ?? null,
    subOrder: data.subOrder ?? row.subOrder ?? null,
  };
}

/**
 * Build one delete item for DataCaptureSummaryDTO.items (camelCase).
 * Prefer templateId; else business key for Bank rows without id.
 */
export function buildDeleteItemFromRow(row) {
  if (!row) return null;
  const formulaId = Number(row.templateId);
  const hasFormulaId = Number.isFinite(formulaId) && formulaId > 0;
  const productType = row.productType === "sub" ? "SUB" : "MAIN";
  const idProduct = String(row.idProduct || "").trim();
  const accountRaw = row.accountId;
  const accountId =
    accountRaw != null && String(accountRaw).trim() !== "" ? Number(accountRaw) : null;
  const hasAccount = Number.isFinite(accountId) && accountId > 0;

  if (!hasFormulaId && (!idProduct || !hasAccount)) {
    return null;
  }

  const item = {
    ...(hasFormulaId ? { id: formulaId } : {}),
    productType,
    idProduct: idProduct || null,
    ...(hasAccount ? { accountId } : {}),
  };
  if (productType === "SUB") {
    item.parentIdProduct = String(row.parentIdProduct || row.idProduct || "").trim() || null;
    if (row.subOrder != null && row.subOrder !== "") {
      item.subOrder = Number(row.subOrder);
    }
  }
  return item;
}

/**
 * POST /api/datacapture-summary/formula/delete — batch hard delete (Spring).
 * Body: DataCaptureSummaryDTO { tenantId, processId|processCode, items[] }.
 * No subOrder resequence.
 */
export async function deleteFormulasSpring(
  rowsOrItems,
  { captureScope, companyId, processId, processCode } = {},
) {
  const tenantId = resolveDataCaptureEffectiveTenantId(captureScope, companyId);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return { success: false, message: "Tenant Id is required" };
  }

  const pid = Number(processId);
  const code = String(processCode || "").trim().toUpperCase();
  if ((!Number.isFinite(pid) || pid <= 0) && !code) {
    return { success: false, message: "Process Id is required" };
  }

  const items = (Array.isArray(rowsOrItems) ? rowsOrItems : [])
    .map((entry) => buildDeleteItemFromRow(entry))
    .filter(Boolean);

  if (!items.length) {
    return { success: true, deletedCount: 0, deletedIds: [] };
  }

  const body = {
    tenantId: Number(tenantId),
    ...(Number.isFinite(pid) && pid > 0 ? { processId: pid } : {}),
    ...(code ? { processCode: code } : {}),
    items,
  };

  const response = await fetch(buildApiUrl("api/datacapture-summary/formula/delete"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || !isApiSuccess(result)) {
    return { success: false, message: result?.message || result?.error || "Formula delete failed" };
  }

  const data = result.data || {};
  return {
    success: true,
    deletedCount: data.deletedCount ?? 0,
    deletedIds: Array.isArray(data.deletedIds) ? data.deletedIds : [],
  };
}

/** POST save_template — returns API json. Legacy PHP path (non-formula callers). */
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
