import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { isC168CompanyCode } from "../../../utils/company/c168CaptureChannel.js";
import { companiesNativeInGroupList } from "../../../utils/company/sharedCompanyFilter.js";
import {
  fetchFormulaCompanyPermissionsRaw,
  fetchMaintenanceProcesses,
} from "../shared/maintenanceCompanyApi.js";
import { fetchProcesses as fetchDomainReportProcesses } from "../../report/domain/domainReportApi.js";
import { mapDomainGroupProcesses } from "../../report/domain/domainReportGroupProcesses.js";
import {
  buildFormulaDisplayParenFromParts,
  formatSourcePercent,
  normalizeMaintenanceFormulaInput,
} from "../../../shared/formula/index.js";
import {
  formulaMaintenanceScopeApiParams,
  formulaMaintenanceUsesGroupProcesses,
} from "./formulaMaintenanceScope.js";

const FORMULA_PAYROLL_PROCESS_CODES = new Set(["SALARY", "COMMISSION", "BONUS"]);

/** ProcessSelect expects process_name; domain report rows use process / display_text. */
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

function appendFormulaScopeToParams(params, scope) {
  const { companyId, viewGroup, groupId, reportScope, groupOnly, groupAggregate } =
    formulaMaintenanceScopeApiParams(scope);
  if (companyId) params.append("company_id", String(companyId));
  const vg = viewGroup ? String(viewGroup).trim().toUpperCase() : "";
  if (vg) params.append("view_group", vg);
  const gid = groupId ? String(groupId).trim().toUpperCase() : "";
  if (gid) params.append("group_id", gid);
  if (reportScope) params.append("report_scope", reportScope);
  if (groupOnly) params.append("group_only", "1");
  if (groupAggregate) params.append("group_aggregate", "1");
}

function appendFormulaScopeToPayload(payload, scope, fallbackCompanyId = null) {
  // Never send company_id: 0 — backend rejects it; group scope resolves from group_id (same as list GET).
  if (payload.company_id != null && Number(payload.company_id) <= 0) {
    delete payload.company_id;
  }
  const { companyId, viewGroup, groupId, reportScope, groupOnly, groupAggregate } =
    formulaMaintenanceScopeApiParams(scope);
  if (companyId) payload.company_id = companyId;
  else if (reportScope === "group") delete payload.company_id;
  else {
    const resolved =
      fallbackCompanyId != null && Number(fallbackCompanyId) > 0 ? Number(fallbackCompanyId) : null;
    if (resolved) payload.company_id = resolved;
  }
  if (viewGroup) payload.view_group = viewGroup;
  if (groupId) payload.group_id = groupId;
  if (reportScope) payload.report_scope = reportScope;
  if (groupOnly) payload.group_only = "1";
  if (groupAggregate) payload.group_aggregate = "1";
}

export async function fetchCompanyPermissionsRaw(companyCode) {
  return fetchFormulaCompanyPermissionsRaw(companyCode);
}

export async function fetchCompanyPermissions(companyCode) {
  const code = String(companyCode ?? "").trim().toUpperCase();
  if (isC168CompanyCode(code)) {
    return ["Games", "Gambling"];
  }
  const permissions = await fetchCompanyPermissionsRaw(companyCode);
  const filtered = permissions.filter((p) => p !== "Bank");
  return filtered.length > 0 ? filtered : ["Games", "Gambling", "Loan", "Rate", "Money"];
}

export { isBankOnlyCategoryCompany } from "../shared/maintenanceCompanyApi.js";

export async function fetchProcesses(companyId, scope = null) {
  const c168Channel = Boolean(scope?.c168Channel);
  if (scope && formulaMaintenanceUsesGroupProcesses(scope) && !c168Channel) {
    const apiList = await fetchDomainReportProcesses(scope, { credentials: "include" });
    return mapProcessesForMaintenanceSelect(mapDomainGroupProcesses(apiList), {
      groupPayrollShort: true,
    });
  }
  const effectiveId = scope?.scopeCompanyId ?? companyId;
  const rows = await fetchMaintenanceProcesses(effectiveId, { credentials: "include" });
  let mapped = mapProcessesForMaintenanceSelect(rows, { groupPayrollShort: false });
  if (c168Channel) {
    mapped = mapped.filter((p) =>
      FORMULA_PAYROLL_PROCESS_CODES.has(String(p.process_name ?? "").trim().toUpperCase()),
    );
  }
  return mapped;
}

export async function bootstrapFormulaMaintenanceMeta({ companies, groupId = null }) {
  const anchor =
    (groupId ? companiesNativeInGroupList(companies, groupId)[0] : null) ??
    (Array.isArray(companies) ? companies[0] : null) ??
    null;
  const code = anchor?.company_id ? String(anchor.company_id) : "";
  const rawPerms = code
    ? await fetchCompanyPermissionsRaw(code)
    : ["Games", "Gambling", "Bank", "Loan", "Rate", "Money"];
  const companyPerms = rawPerms.filter((p) => p !== "Bank");
  const savedPerm = code ? localStorage.getItem(`selectedPermission_${code}`) : null;
  const initialActive =
    savedPerm && companyPerms.includes(savedPerm) ? savedPerm : companyPerms.length > 0 ? companyPerms[0] : "";
  return { permissions: companyPerms, activePermission: initialActive, rawPerms };
}

export async function fetchAccounts(companyId, scope = null) {
  const effectiveId = scope?.scopeCompanyId ?? companyId;
  const params = new URLSearchParams();
  if (effectiveId) params.append("company_id", String(effectiveId));
  appendFormulaScopeToParams(params, scope);
  params.append("status", "active");
  const url = buildApiUrl(`api/transactions/get_accounts_api.php?${params.toString()}`);

  const response = await fetch(url, { credentials: "include" });
  const data = await response.json();
  if (!data.success) throw new Error(data.error || "Failed to load accounts");
  return data.data || [];
}

export async function listFormulaTemplates({ companyId, category, process, search, scope }) {
  const params = new URLSearchParams();
  // Scope params include company_id for group/company; avoid duplicating query keys.
  appendFormulaScopeToParams(params, scope);
  if (!scope && companyId) params.append("company_id", String(companyId));
  if (category) params.append("category", category);
  if (process != null && String(process).trim() !== "") {
    params.append("process", String(process).trim());
  }
  if (search) params.append("search", String(search).toUpperCase());
  params.append("_t", Date.now());
  const url = buildApiUrl(`api/formula_maintenance/list_api.php?${params.toString()}`);
  const response = await fetch(url, { cache: "no-cache", credentials: "include" });
  const data = await response.json();

  if (!data.success) throw new Error(data.message || data.error || "Search failed");
  const list = data.data && data.data.list ? data.data.list : data.data || [];
  return list;
}

export async function updateFormulaTemplate(payload, scope = null) {
  const normalizedFormula = normalizeMaintenanceFormulaInput(payload.formula);
  const body = { ...payload, formula: normalizedFormula };
  appendFormulaScopeToPayload(body, scope);

  const response = await fetch(buildApiUrl("api/formula_maintenance/update_api.php"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.message || data.error || "Update failed");
  return data.data;
}

export async function deleteFormulaTemplates(companyId, templateIds, scope = null) {
  const payload = { template_ids: templateIds };
  appendFormulaScopeToPayload(payload, scope, companyId);

  const response = await fetch(buildApiUrl("api/formula_maintenance/delete_api.php"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.message || data.error || "Delete failed");
  return data;
}

export async function updateSessionCompany(companyId) {
  const response = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${companyId}`), {
    credentials: "include",
  });
  const result = await response.json();
  if (!result.success) throw new Error(result.error || "Failed to update session company");
  return result.data;
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
};

/** Edit form: formula field is base-only; strip accidental *(source) suffix. */
export function parseFormulaEditTail(raw) {
  const base = normalizeMaintenanceFormulaInput(raw);
  return { base, tail: null };
}

export function buildFormulaEditString(base) {
  return String(base ?? "").trim();
}

/** Formula 编辑框展示 = base +（Source≠1 时）* (source)，与列表 Formula 列一致。 */
export function buildEditFormFormulaDisplay(base, sourcePercent) {
  const b = normalizeMaintenanceFormulaInput(base);
  const source = formatSourcePercent(sourcePercent ?? "1");
  const enable = source !== "1" && source !== "" ? 1 : 0;
  return buildFormulaDisplayParenFromParts(b, source, enable);
}

export function resolveFormulaBaseFromRow(row) {
  const fromEdit = String(row?.formula_edit ?? "").trim();
  if (fromEdit) return normalizeMaintenanceFormulaInput(fromEdit);
  return normalizeMaintenanceFormulaInput(row?.formula ?? "");
}

export function createFormulaEditFormFromRow(row) {
  const sourcePercent =
    row?.source != null && String(row.source).trim() !== "" && String(row.source).trim() !== "-"
      ? String(row.source).trim()
      : "1";
  const base = resolveFormulaBaseFromRow(row);
  return {
    account_id: row?.account_id || "",
    source_ref: row?.source_ref != null ? String(row.source_ref) : "",
    source_percent: formatSourcePercent(sourcePercent),
    input_method: row?.input_method || "",
    formula: buildEditFormFormulaDisplay(base, sourcePercent),
    description: row?.description || "",
  };
}

/** Source 列变更：同步更新 Formula 编辑框里的 * (source) 后缀。 */
export function syncEditFormSourcePercent(form, newSourcePercent) {
  const base = normalizeMaintenanceFormulaInput(form.formula);
  const source = formatSourcePercent(newSourcePercent);
  return {
    ...form,
    source_percent: source,
    formula: buildEditFormFormulaDisplay(base, source),
  };
}

export function patchFormulaRowAfterSave(row, { id, editForm, accountLabel, serverData }) {
  if (!formulaRowIdsMatch(row.id, id)) return row;
  const source = formatSourcePercent(editForm.source_percent ?? row.source ?? "1");
  const formulaBase = normalizeMaintenanceFormulaInput(editForm.formula ?? row.formula_edit ?? "");
  const enable = source !== "1" ? 1 : 0;
  const next = {
    ...row,
    account_id: editForm.account_id,
    account: accountLabel || row.account,
    source_ref: serverData?.source_ref ?? editForm.source_ref ?? row.source_ref,
    source: serverData?.source_summary_display ?? source,
    input_method: editForm.input_method ?? "",
    formula: serverData?.formula_display_paren ?? buildFormulaDisplayParenFromParts(formulaBase, source, enable),
    formula_edit: serverData?.formula_edit ?? formulaBase,
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
