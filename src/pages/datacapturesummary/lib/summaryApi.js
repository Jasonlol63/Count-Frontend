import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { fetchAccountListByTenantId, filterAccountListRows } from "../../account/accountListApi.js";
import {
  resolveDataCaptureEffectiveTenantId,
  resolveDataCaptureTenantId,
} from "../../datacapture/lib/dataCaptureTenant.js";
import { isGroupPayrollProcessId } from "../../datacapture/lib/dataCaptureGroupOnlyProcesses.js";

/**
 * `data_capture_summary_state` was deliberately never built (see backend
 * docs/frontend-springboot-migration.md 第32节) — unsubmitted draft state lives in front-end session/localStorage instead
 * (`summaryRefreshStatePure.js` / `summaryStorage.js`). No Spring or PHP endpoint backs this.
 */
export async function fetchSummaryServerState() {
  return null;
}

/**
 * POST /api/datacapture-summary/submit — Games/Bank company-scope final submit.
 * One atomic transaction, no batching. Body: {@link DataCaptureSummarySubmitDTO}.
 */
export async function submitSummaryToSpring(payload) {
  const res = await fetch(buildApiUrl("api/datacapture-summary/submit"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.message || `HTTP ${res.status}`);
  }
  return json;
}

/** POST /api/account/list?tenant_id= (active accounts only) — Summary table populate. */
export async function fetchSummaryAccountList(captureScope) {
  const tenantId = resolveDataCaptureTenantId(captureScope);
  if (!tenantId) return [];
  const rows = await fetchAccountListByTenantId(tenantId);
  return filterAccountListRows(rows);
}

/** GAME → process.category = GAME; BONUS/COMMISSION/PROFIT/SALARY → BANK (same set as submit). */
function resolveFormulaMaintenanceCategory(processCode) {
  const code = String(processCode || "").trim().toUpperCase();
  return code && isGroupPayrollProcessId(code) ? "bank" : "games";
}

/** Spring `MaintenanceFormulaDTO` row -> legacy-shaped template object read by summaryRowData.js / summaryTemplateMatching.js. */
function toTemplateShape(row) {
  return {
    id: row.id,
    id_product: row.idProduct,
    parent_id_product: row.parentIdProduct,
    formula_variant: row.formulaVariant,
    sub_order: row.subOrder,
    account_id: row.accountId,
    account_display: row.account,
    currency_display: row.currency,
    currency_code: row.currency,
    description: row.description,
    source_columns: row.sourceColumns,
    formula: row.formula,
    input_method: row.inputMethod,
    source_percent: row.sourcePercent,
    enable_source_percent: row.enableSourcePercent,
  };
}

/** Group flat formula rows into { templates: {idProduct: MAIN}, subsByParent: {idProduct: [SUB, ...]} }. */
function buildTemplatesFromFormulaRows(rows) {
  const templates = {};
  const subsByParent = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const idProduct = String(row?.idProduct || "").trim();
    if (!idProduct) continue;
    const shaped = toTemplateShape(row);
    if (String(row.productType || "").toUpperCase() === "SUB") {
      const parentId = String(row.parentIdProduct || idProduct).trim();
      if (!subsByParent[parentId]) subsByParent[parentId] = [];
      subsByParent[parentId].push(shaped);
    } else {
      templates[idProduct] = shaped;
    }
  }
  return { templates, subsByParent, diagnostics: null };
}

/**
 * POST /api/maintenance/formula-maintenance/list — reused read-only for Summary populate
 * (same `data_capture_formula` rows the Maintenance > Formula page lists, already joined to
 * account/currency display text server-side).
 */
export async function fetchSummaryTemplates({ captureScope, companyId, processId, processCode = "" }) {
  const tenantId = resolveDataCaptureEffectiveTenantId(captureScope, companyId);
  const code = String(processCode || "").trim().toUpperCase();
  const numericId = processId != null && Number(processId) > 0 ? Number(processId) : null;
  const process = numericId != null ? String(numericId) : code;
  if (!tenantId || !process) {
    return { templates: {}, subsByParent: null, diagnostics: null };
  }

  const res = await fetch(buildApiUrl("api/maintenance/formula-maintenance/list"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, process, category: resolveFormulaMaintenanceCategory(code) }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.message || `HTTP ${res.status}`);
  }
  return buildTemplatesFromFormulaRows(json.data);
}
