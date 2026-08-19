import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { fetchFormulaCompanyPermissionsRaw } from "../shared/maintenanceCompanyApi.js";
import { fetchProcessListByTenantId } from "../../processlist/processListApi.js";
import { fetchProcesses as fetchDomainReportProcesses } from "../../report/domain/domainReportApi.js";
import { resolveGroupEntityRowFromSnap } from "../../report/shared/reportScope.js";
import { fetchAccountListByTenantId, filterAccountListRows } from "../../account/accountListApi.js";
import { formatSourcePercent, normalizeMaintenanceFormulaInput } from "../../../shared/formula/index.js";
import {
  GROUP_PAYROLL_PROCESS_CODES,
  mapGroupPayrollProcesses,
} from "../../datacapture/lib/dataCaptureGroupOnlyProcesses.js";
import { syncCompanySessionApi } from "../../../utils/company/companySessionSync.js";
import {
  formulaMaintenanceEffectiveCompanyId,
  formulaMaintenanceUsesGroupProcesses,
} from "./formulaMaintenanceScope.js";

const FORMULA_PAYROLL_PROCESS_CODES = new Set(GROUP_PAYROLL_PROCESS_CODES);

/** ProcessSelect expects process_name; domain report / Spring process-list rows both normalize to this shape. */
export function mapProcessesForMaintenanceSelect(apiList, { groupPayrollShort = false } = {}) {
  return (Array.isArray(apiList) ? apiList : []).map((row) => {
    const processName = String(
      row.process_name ?? row.process ?? row.process_id ?? "",
    ).trim();
    const upper = processName.toUpperCase();
    let description = row.description ?? null;
    if (FORMULA_PAYROLL_PROCESS_CODES.has(upper)) {
      description = groupPayrollShort ? null : upper;
    }
    return {
      id: row.id,
      process_name: processName,
      description,
    };
  });
}

export async function fetchCompanyPermissionsRaw(companyCode) {
  return fetchFormulaCompanyPermissionsRaw(companyCode);
}

export { isBankOnlyCategoryCompany } from "../shared/maintenanceCompanyApi.js";

export async function fetchProcesses(companyId, scope = null) {
  const payrollChannel = Boolean(scope?.c168Channel || scope?.companyPayrollChannel);
  if (payrollChannel) {
    return GROUP_PAYROLL_PROCESS_CODES.map((code) => ({
      id: code,
      process_name: code,
      description: null,
    }));
  }
  if (scope && formulaMaintenanceUsesGroupProcesses(scope) && !payrollChannel) {
    const apiList = await fetchDomainReportProcesses(scope, { credentials: "include" });
    return mapProcessesForMaintenanceSelect(mapGroupPayrollProcesses(apiList), {
      groupPayrollShort: true,
    });
  }
  const effectiveId = scope?.scopeCompanyId ?? companyId;
  const tid = Number(effectiveId);
  if (!Number.isFinite(tid) || tid <= 0) return [];
  const rows = await fetchProcessListByTenantId(tid);
  let mapped = mapProcessesForMaintenanceSelect(rows, { groupPayrollShort: false });
  if (scope?.c168Channel) {
    mapped = mapped.filter((p) =>
      FORMULA_PAYROLL_PROCESS_CODES.has(String(p.process_name ?? "").trim().toUpperCase()),
    );
  }
  return mapped;
}

/** `CODE (Name)` display, matching `transactionAccountHelpers.js`'s account-picker text convention. */
function normalizeFormulaAccountOption(row) {
  const code = String(row?.account_id ?? "").trim();
  const name = String(row?.name ?? "").trim();
  if (!code && row?.id == null) return null;
  return {
    id: row?.id,
    account_id: code,
    display_text: name ? `${code} (${name})` : code,
  };
}

export async function fetchAccounts(companyId, scope = null) {
  const tenantId = formulaMaintenanceEffectiveCompanyId(scope, companyId);
  if (!tenantId) return [];
  const rows = await fetchAccountListByTenantId(tenantId);
  const active = filterAccountListRows(rows);
  return active.map(normalizeFormulaAccountOption).filter(Boolean);
}

/** "Bank" for C168 / bank-only payroll companies; "Games" otherwise — category is a required hard filter server-side. */
function resolveFormulaMaintenanceCategory(scope) {
  const payrollChannel = Boolean(scope?.c168Channel || scope?.companyPayrollChannel);
  return payrollChannel ? "Bank" : "Games";
}

/**
 * Numeric tenant id(s) for formula maintenance list.
 * Group entity + subsidiary company share one Spring tenant row; "aggregate" (Groups All / Group All) spans several;
 * pure Group ledger (no subsidiary drill-down) resolves `scope.scopeCompanyId` to 0 and must be looked up by group id.
 */
function resolveFormulaMaintenanceTenantIds({ scope, companies } = {}) {
  if (scope?.mode === "aggregate") {
    const ids = Array.isArray(scope.mergeCompanyIds) ? scope.mergeCompanyIds : [];
    return ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
  }
  const tid = Number(scope?.scopeCompanyId);
  if (Number.isFinite(tid) && tid > 0) return [tid];
  if (scope?.mode === "group" && scope.groupId && Array.isArray(companies)) {
    const row = resolveGroupEntityRowFromSnap(companies, scope.groupId);
    const id = Number(row?.id);
    if (Number.isFinite(id) && id > 0) return [id];
  }
  return [];
}

/** MAIN row shows its own idProduct; SUB row shows the parent's (not a "parent / child" concatenation). */
function resolveFormulaProductDisplay(row) {
  const productType = String(row?.productType ?? "").trim().toUpperCase();
  if (productType === "SUB") {
    return row?.parentIdProduct ?? row?.idProduct ?? "";
  }
  return row?.idProduct ?? "";
}

/** Spring `MaintenanceFormulaDTO` row → legacy grid row shape used by the table components. */
function normalizeSpringFormulaMaintenanceRow(row) {
  return {
    id: row?.id,
    process: row?.process ?? "",
    account: row?.account ?? "",
    account_id: row?.accountId ?? null,
    currency: row?.currency ?? "",
    source: formatSourcePercent(row?.sourcePercent),
    product: resolveFormulaProductDisplay(row),
    id_product: row?.idProduct ?? "",
    parent_id_product: row?.parentIdProduct ?? "",
    product_type: row?.productType ?? "",
    input_method: row?.inputMethod ?? "",
    formula: row?.formula ?? "",
    description: row?.description ?? "",
    _sub_order: Number(row?.subOrder ?? 0),
    _formula_variant: Number(row?.formulaVariant ?? 0),
  };
}

/** Mirrors backend SQL `ORDER BY id_product, product_type, sub_order, formula_variant, id`. */
function compareFormulaMaintenanceRows(a, b) {
  const ip = String(a.id_product ?? "").localeCompare(String(b.id_product ?? ""));
  if (ip !== 0) return ip;
  const pt = String(a.product_type ?? "").localeCompare(String(b.product_type ?? ""));
  if (pt !== 0) return pt;
  const so = Number(a._sub_order ?? 0) - Number(b._sub_order ?? 0);
  if (so !== 0) return so;
  const fv = Number(a._formula_variant ?? 0) - Number(b._formula_variant ?? 0);
  if (fv !== 0) return fv;
  return Number(a.id ?? 0) - Number(b.id ?? 0);
}

async function fetchFormulaMaintenancePage({ tenantId, process, category, signal }) {
  const request = { tenantId, process: process || null, category, q: null };
  const response = await fetch(buildApiUrl("api/maintenance/formula-maintenance/list"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.message || data.error || "Search failed");
  }
  return Array.isArray(data.data) ? data.data : [];
}

/**
 * List formula maintenance templates — one Spring call per resolved tenant (aggregate scope loops + merges).
 * `search` is filtered purely client-side (`filterFormulaRowsBySearch`), matching the page's existing behavior.
 */
export async function listFormulaTemplates({ process, scope, companies, signal }) {
  const category = resolveFormulaMaintenanceCategory(scope);
  const tenantIds = resolveFormulaMaintenanceTenantIds({ scope, companies });
  if (tenantIds.length === 0) return [];

  const processFilter = process != null && String(process).trim() !== "" ? String(process).trim() : null;

  let merged = [];
  for (const tenantId of tenantIds) {
    const rows = await fetchFormulaMaintenancePage({ tenantId, process: processFilter, category, signal });
    const normalizedPart = rows.map(normalizeSpringFormulaMaintenanceRow);
    if (!normalizedPart.length) continue;
    merged = merged.concat(normalizedPart).sort(compareFormulaMaintenanceRows);
  }
  return merged;
}

/**
 * Update one formula maintenance row — only account/source%/input method/formula/description are editable server-side.
 * @param {{tenantId:number, id:number, accountId?:number|string|null, sourcePercent?:string, inputMethod?:string, formula?:string, description?:string}} payload
 */
export async function updateFormulaTemplate(payload) {
  const tenantId = Number(payload?.tenantId);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    throw new Error("tenantIdRequired");
  }
  const id = Number(payload?.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Invalid formula id");
  }
  const rawAccountId = payload?.accountId;
  const accountId =
    rawAccountId != null && String(rawAccountId).trim() !== "" ? Number(rawAccountId) : null;

  const body = {
    tenantId,
    id,
    accountId: Number.isFinite(accountId) ? accountId : null,
    sourcePercent: payload?.sourcePercent != null ? String(payload.sourcePercent) : null,
    inputMethod: payload?.inputMethod || null,
    formula: normalizeMaintenanceFormulaInput(payload?.formula),
    description: payload?.description || null,
  };

  const response = await fetch(buildApiUrl("api/maintenance/formula-maintenance/update"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.message || data.error || "Update failed");
  return data.data;
}

/**
 * Hard-delete formula maintenance rows (batch, tenant-scoped — no archive table).
 * @param {{tenantId:number, formulaIds:number[]}} payload
 */
export async function deleteFormulaTemplates({ tenantId, formulaIds }) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) {
    throw new Error("tenantIdRequired");
  }
  const ids = Array.isArray(formulaIds)
    ? formulaIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
    : [];
  if (ids.length === 0) {
    throw new Error("Please select at least one record");
  }

  const response = await fetch(buildApiUrl("api/maintenance/formula-maintenance/delete"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ tenantId: tid, formulaIds: ids }),
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.message || data.error || "Delete failed");
  return data;
}

export async function updateSessionCompany(companyId) {
  const json = await syncCompanySessionApi(companyId);
  if (!json?.success) throw new Error(json?.message || "Failed to update session company");
  return json.data;
}

export const INPUT_METHOD_OPTIONS = [
  { value: "", text: "Select Input Method (Optional)" },
  { value: "positive_to_negative_negative_to_positive", text: "Positive to negative, negative to positive" },
  { value: "positive_to_negative_negative_to_zero", text: "Positive to negative, negative to zero" },
  { value: "negative_to_positive_positive_to_zero", text: "Negative to positive, positive to zero" },
  { value: "positive_unchanged_negative_to_zero", text: "Positive unchanged, negative to zero" },
  { value: "negative_unchanged_positive_to_zero", text: "Negative unchanged, positive to zero" },
  { value: "change_to_positive", text: "Change to positive" },
  { value: "change_to_negative", text: "Change to negative" },
  { value: "change_to_zero", text: "Change to zero" },
];

export const toUpperDisplay = (val) => {
  if (val === null || val === undefined) return "-";
  const str = String(val).trim();
  return str ? str.toUpperCase() : "-";
};

export function formulaRowIdsMatch(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

export function createFormulaEditFormFromRow(row) {
  return {
    account_id: row?.account_id || "",
    source_percent: formatSourcePercent(row?.source ?? "1"),
    input_method: row?.input_method || "",
    formula: row?.formula || "",
    description: row?.description || "",
  };
}

/** Source % edit only touches `source_percent` — Formula and Source are independent columns, stored and shown separately. */
export function syncEditFormSourcePercent(form, newSourcePercent) {
  // Keep the user's edit buffer intact. Values such as "", "0.", and "0.60"
  // are valid intermediate states and must not be normalized on every keypress.
  const sourceInput = newSourcePercent == null ? "" : String(newSourcePercent);
  // Source accepts non-negative decimal numbers only. Reject invalid typing or
  // pasted content while allowing intermediate states such as "." and "0.".
  if (!/^(?:\d+(?:\.\d*)?|\.\d*)?$/.test(sourceInput)) {
    return form;
  }
  return { ...form, source_percent: sourceInput };
}

function formulaLetters(value) {
  return String(value ?? "").match(/[A-Za-z]/g) ?? [];
}

function isLetterSequenceSubset(candidateLetters, previousLetters) {
  let previousIndex = 0;
  for (const letter of candidateLetters) {
    while (previousIndex < previousLetters.length && previousLetters[previousIndex] !== letter) {
      previousIndex += 1;
    }
    if (previousIndex >= previousLetters.length) return false;
    previousIndex += 1;
  }
  return true;
}

/** Formula edit: permit numeric/operators/reference syntax, but no newly typed letters. */
export function syncEditFormFormulaInput(form, newFormula) {
  const formulaInput = newFormula == null ? "" : String(newFormula);
  if (!/^[0-9A-Za-z.$+\-*/()[\],\s]*$/.test(formulaInput)) {
    return form;
  }

  const previousLetters = formulaLetters(form.formula);
  const candidateLetters = formulaLetters(formulaInput);
  if (!isLetterSequenceSubset(candidateLetters, previousLetters)) {
    return form;
  }

  return { ...form, formula: formulaInput };
}

/** Description edit: alphabetic input is stored in uppercase. */
export function syncEditFormDescriptionInput(form, newDescription) {
  return {
    ...form,
    description: String(newDescription ?? "").toUpperCase(),
  };
}

/** Update response `data` is always null — patch the local row optimistically from the saved edit form. */
export function patchFormulaRowAfterSave(row, { id, editForm, accountLabel }) {
  if (!formulaRowIdsMatch(row.id, id)) return row;
  const next = {
    ...row,
    account_id: editForm.account_id,
    account: accountLabel || row.account,
    source: formatSourcePercent(editForm.source_percent ?? row.source ?? "1"),
    input_method: editForm.input_method ?? "",
    formula: editForm.formula ?? row.formula ?? "",
    description: editForm.description ?? "",
  };
  return prepareFormulaRowsForDisplay([next])[0];
}

export function prepareFormulaRowsForDisplay(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    ...row,
    _process: toUpperDisplay(row.process),
    _account: toUpperDisplay(row.account),
    _currency: toUpperDisplay(row.currency),
    _source: toUpperDisplay(row.source),
    _product: toUpperDisplay(row.product),
    _inputMethod: toUpperDisplay(row.input_method),
    _formula: toUpperDisplay(row.formula),
    _description: toUpperDisplay(row.description),
  }));
}

/** Client-side search across all visible columns (aligned with server-side search). */
export function filterFormulaRowsBySearch(rows, searchTerm) {
  const q = String(searchTerm || "").trim().toUpperCase();
  if (!q || !Array.isArray(rows)) return rows || [];
  return rows.filter((row) => {
    const hay = [
      row?.process,
      row?._process,
      row?.account,
      row?._account,
      row?.product,
      row?._product,
      row?.formula,
      row?._formula,
      row?.currency,
      row?.description,
      row?._description,
      row?.source,
      row?._source,
      row?.input_method,
      row?._inputMethod,
    ]
      .map((x) => String(x || "").toUpperCase())
      .join(" ");
    return hay.includes(q);
  });
}
