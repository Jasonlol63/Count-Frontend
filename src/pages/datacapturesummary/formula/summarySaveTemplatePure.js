import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { resolveDataCaptureEffectiveTenantId } from "../../datacapture/lib/dataCaptureTenant.js";

/** Client-side dedupe key for a row (unrelated to the Spring `id`). */
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

function resolveFormulaTenantId(captureScope, companyId) {
  return resolveDataCaptureEffectiveTenantId(captureScope, companyId);
}

function resolveFormulaProcessCode(processId, processCode) {
  return processId ? null : (processCode ? String(processCode).trim().toUpperCase() : null);
}

function validateFormulaRow(row) {
  const hasAccount = row.accountId != null && String(row.accountId).trim() !== "";
  const hasCurrency = row.currencyId != null && String(row.currencyId).trim() !== "";
  const hasFormula =
    (row.formula != null && String(row.formula).trim() !== "") ||
    (row.formulaDisplay != null && String(row.formulaDisplay).trim() !== "");

  if (!hasAccount) return { success: false, message: "Account is required." };
  if (!hasCurrency) return { success: false, message: "Currency is required." };
  if (row.productType === "sub" && !hasFormula) {
    return { success: false, message: "Formula is required for sub rows." };
  }
  return null;
}

async function postFormulaEndpoint(path, body) {
  const res = await fetch(buildApiUrl(path), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    return { success: false, message: json?.message || `HTTP ${res.status}` };
  }
  return { success: true, data: json.data };
}

/**
 * POST /api/datacapture-summary/formula/save — MAIN if the id product has no
 * account_id'd MAIN yet, else inserts a SUB.
 */
export async function saveAddFormulaSpring(row, { captureScope, companyId, processId, processCode } = {}) {
  const invalid = validateFormulaRow(row);
  if (invalid) return invalid;

  const tenantId = resolveFormulaTenantId(captureScope, companyId);
  if (!tenantId) return { success: false, message: "tenantId is required" };

  const formulaDisplay = row.formulaDisplay || "";
  const isFormulaEmpty = !formulaDisplay.trim() || formulaDisplay === "Formula";
  const isSub = row.productType === "sub";
  const formula = row.formula || "";

  const body = {
    tenantId,
    processId: processId ?? null,
    processCode: resolveFormulaProcessCode(processId, processCode),
    idProduct: isSub ? row.subIdProduct || row.idProduct : row.idProduct,
    accountId: row.accountId,
    currencyId: row.currencyId,
    description: row.originalDescription || "",
    sourceColumns: isFormulaEmpty ? "" : row.sourceColumns || "",
    formula,
    sourcePercent: String(row.sourcePercent || "1").trim() || "1",
    enableSourcePercent: !!row.enableSourcePercent,
    enableInputMethod: !!row.enableInputMethod,
    rowIndex: row.rowIndex ?? null,
  };

  const result = await postFormulaEndpoint("api/datacapture-summary/formula/save", body);
  if (!result.success) return { success: false, message: result.message };
  const data = result.data || {};
  return {
    success: true,
    templateId: data.id ?? null,
    productType: data.productType ? String(data.productType).toLowerCase() : null,
    subOrder: data.subOrder ?? null,
    formulaVariant: data.formulaVariant ?? null,
  };
}

/**
 * POST /api/datacapture-summary/formula/update — located by `id` when known,
 * else (Bank rows with no numeric process/template id) by business key.
 */
export async function saveUpdateFormulaSpring(row, { captureScope, companyId, processId, processCode } = {}) {
  const invalid = validateFormulaRow(row);
  if (invalid) return invalid;

  const tenantId = resolveFormulaTenantId(captureScope, companyId);
  if (!tenantId) return { success: false, message: "tenantId is required" };

  const isSub = row.productType === "sub";
  const formula = row.formula || "";

  const body = {
    tenantId,
    accountId: row.accountId,
    currencyId: row.currencyId,
    formula,
    sourcePercent: String(row.sourcePercent || "1").trim() || "1",
    enableSourcePercent: !!row.enableSourcePercent,
    description: row.originalDescription || "",
  };

  // Backend always resolves `process` first (even when `id` is given — see
  // DataCaptureSummaryServiceImpl.updateFormula), so processId/processCode must go on every
  // request, not only the id-less (Bank business-key) branch below.
  body.processId = processId ?? null;
  body.processCode = resolveFormulaProcessCode(processId, processCode);

  if (row.templateId != null) {
    body.id = row.templateId;
  } else {
    body.productType = isSub ? "SUB" : "MAIN";
    body.idProduct = isSub ? row.subIdProduct || row.idProduct : row.idProduct;
    if (isSub) {
      body.parentIdProduct = row.parentIdProduct || row.idProduct;
      body.subOrder = row.subOrder ?? null;
    }
  }

  const result = await postFormulaEndpoint("api/datacapture-summary/formula/update", body);
  if (!result.success) return { success: false, message: result.message };
  return { success: true };
}

/**
 * POST /api/datacapture-summary/formula/delete — hard delete, no sub_order
 * resequencing. `items` are `{templateId, productType, idProduct, parentIdProduct, accountId, subOrder}`.
 */
export async function deleteFormulasSpring(items, { captureScope, companyId, processId, processCode } = {}) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return { success: true, deletedCount: 0, deletedIds: [] };

  const tenantId = resolveFormulaTenantId(captureScope, companyId);
  if (!tenantId) return { success: false, message: "tenantId is required" };

  const body = {
    tenantId,
    processId: processId ?? null,
    processCode: resolveFormulaProcessCode(processId, processCode),
    items: list.map((tpl) => {
      if (tpl.templateId != null) return { id: tpl.templateId };
      const isSub = tpl.productType === "sub";
      const entry = {
        productType: isSub ? "SUB" : "MAIN",
        idProduct: tpl.idProduct,
        accountId: tpl.accountId,
      };
      if (isSub) {
        entry.parentIdProduct = tpl.parentIdProduct || tpl.idProduct;
        entry.subOrder = tpl.subOrder ?? null;
      }
      return entry;
    }),
  };

  const result = await postFormulaEndpoint("api/datacapture-summary/formula/delete", body);
  if (!result.success) return { success: false, message: result.message };
  const data = result.data || {};
  return {
    success: true,
    deletedCount: data.deletedCount ?? 0,
    deletedIds: Array.isArray(data.deletedIds) ? data.deletedIds : [],
  };
}
