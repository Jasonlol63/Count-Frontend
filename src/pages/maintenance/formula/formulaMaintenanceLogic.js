import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { isC168CompanyCode } from "../../../utils/company/c168CaptureChannel.js";
import { companiesNativeInGroupList } from "../../../utils/company/sharedCompanyFilter.js";
import { fetchFormulaCompanyPermissionsRaw } from "../shared/maintenanceCompanyApi.js";
import { fetchProcesses as fetchDomainReportProcesses } from "../../report/domain/domainReportApi.js";
import { mapDomainGroupProcesses } from "../../report/domain/domainReportGroupProcesses.js";
import { fetchProcessListByTenantId } from "../../processlist/processListApi.js";
import { fetchAccountListByTenantId, filterAccountListRows } from "../../account/accountListApi.js";
import {
  formatSourcePercent,
  normalizeMaintenanceFormulaInput,
} from "../../../shared/formula/index.js";
import {
  formulaMaintenanceEffectiveCompanyId,
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

export async function fetchCompanyPermissionsRaw(companyCode) {
  return fetchFormulaCompanyPermissionsRaw(companyCode);
}

export async function fetchCompanyPermissions(companyCode) {
  const code = String(companyCode ?? "").trim().toUpperCase();
  if (isC168CompanyCode(code)) {
    return ["Games", "Gambling"];
  }
  const permissions = await fetchCompanyPermissionsRaw(companyCode);
  return permissions.length > 0 ? permissions : ["Games", "Gambling", "Bank", "Loan", "Rate", "Money"];
}

export { isBankOnlyCategoryCompany } from "../shared/maintenanceCompanyApi.js";

export async function fetchProcesses(companyId, scope = null, permission = "") {
  const payrollChannel = Boolean(scope?.c168Channel || scope?.companyPayrollChannel);
  if (String(permission).toLowerCase() === "bank" || payrollChannel) {
    return [
      { id: "PROFIT", process_name: "PROFIT", description: null },
      { id: "SALARY", process_name: "SALARY", description: null },
      { id: "COMMISSION", process_name: "COMMISSION", description: null },
      { id: "BONUS", process_name: "BONUS", description: null },
    ];
  }
  if (scope && formulaMaintenanceUsesGroupProcesses(scope) && !payrollChannel) {
    const apiList = await fetchDomainReportProcesses(scope, { credentials: "include" });
    return mapProcessesForMaintenanceSelect(mapDomainGroupProcesses(apiList), {
      groupPayrollShort: true,
    });
  }
  // Company mode: every GAME-category process under the current tenant (Spring `/api/process/process-list`,
  // same source as the Process List page — BANK rows are already filtered out by normalizeProcessListRows).
  const effectiveId = scope?.scopeCompanyId ?? companyId;
  const rows = await fetchProcessListByTenantId(effectiveId);
  let mapped = mapProcessesForMaintenanceSelect(rows, { groupPayrollShort: false });
  if (scope?.c168Channel) {
    mapped = mapped.filter((p) =>
      FORMULA_PAYROLL_PROCESS_CODES.has(String(p.process_name ?? "").trim().toUpperCase()),
    );
  }
  return mapped;
}

/** Pick Category for formula maintenance (saved localStorage perm when still valid). */
export function pickFormulaMaintenancePermission(permissions, saved) {
  const perms = Array.isArray(permissions) ? permissions : [];
  if (saved && perms.includes(saved)) return saved;
  return perms.length > 0 ? perms[0] : "";
}

/**
 * Active-permission pick, forcing "Bank" for payroll-channel companies (C168 / bank-only).
 *
 * `fetchCompanyPermissions`/`fetchCompanyPermissionsRaw` → `fetchDomainCompanyPermissions` calls the
 * legacy `api/domain/domain_api.php` endpoint, which the Spring backend never implemented (the reverse
 * proxy sends every `/api/*` path straight to Spring now, so it 500s). Its catch-all fallback returns
 * `DEFAULT_PERMISSIONS_FORMULA` (`["Games","Bank",...]`, Games first), and `pickFormulaMaintenancePermission`
 * always prefers `perms[0]` when nothing is saved yet — so a bank-only company silently gets defaulted to
 * GAME category even though its real rows are BANK. `fetchProcesses` already works around this same broken
 * call for the Process dropdown via `scope.companyPayrollChannel`/`scope.c168Channel`; mirror that override
 * here so category resolution agrees with what the dropdown actually shows (SALARY/BONUS/PROFIT/COMMISSION
 * are BANK-category processes). Mirrors `transactionMaintenanceLogic.js`'s
 * `resolveTransactionMaintenanceActivePermission`.
 */
export function resolveFormulaMaintenanceActivePermission(permissions, saved, scope = null) {
  if (scope?.c168Channel || scope?.companyPayrollChannel) return "Bank";
  return pickFormulaMaintenancePermission(permissions, saved);
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
  const companyPerms = rawPerms;
  const savedPerm = code ? localStorage.getItem(`selectedPermission_${code}`) : null;
  const initialActive = pickFormulaMaintenancePermission(companyPerms, savedPerm);
  return { permissions: companyPerms, activePermission: initialActive, rawPerms };
}

/** Spring account row → dropdown option ("CODE (Name)"), same convention as transactionAccountHelpers.js. */
function normalizeFormulaAccountOption(row) {
  const code = String(row?.account_id || "").trim();
  const name = String(row?.name || "").trim();
  return {
    id: row?.id,
    account_id: code,
    display_text: name ? `${code} (${name})` : code,
  };
}

/** Account dropdown (Edit row): Spring POST /api/account/list, tenant-only, active accounts only. */
export async function fetchAccounts(companyId, scope = null) {
  const tenantId = formulaMaintenanceEffectiveCompanyId(scope, companyId);
  if (!tenantId) return [];
  const rows = await fetchAccountListByTenantId(tenantId);
  return filterAccountListRows(rows).map(normalizeFormulaAccountOption);
}

/** Loan/Rate/Money share the GAME data_capture_formula rows; Gambling also maps to Games. */
const FORMULA_MAINTENANCE_EMPTY_CATEGORIES = new Set(["loan", "rate", "money"]);

/**
 * Resolve the `category` sent to the Spring endpoint (Loan/Rate/Money/Gambling → Games).
 * Required by the backend — it hard-filters `process.category` so GAME/BANK rows never mix.
 * Mirrors transactionMaintenanceLogic.js's resolveTransactionMaintenanceCategory.
 */
export function resolveFormulaMaintenanceCategory(permission) {
  const raw = String(permission ?? "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (FORMULA_MAINTENANCE_EMPTY_CATEGORIES.has(lower)) return "Games";
  if (lower === "gambling") return "Games";
  return raw;
}

/** Spring POST /api/maintenance/formula-maintenance/list body (tenant-only, no date range). */
export function buildSpringFormulaMaintenanceRequest({ tenantId, process, category, q } = {}) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) {
    throw new Error("tenantIdRequired");
  }
  const cat = String(category || "").trim();
  if (!cat) {
    throw new Error("categoryRequired");
  }
  return {
    tenantId: tid,
    process: String(process || "").trim() || null,
    category: cat,
    q: String(q || "").trim() || null,
  };
}

/** MAIN row shows its own idProduct; SUB row shows the parent's idProduct instead. */
function resolveFormulaProductDisplay(row) {
  const parent = String(row?.parentIdProduct ?? "").trim();
  if (row?.productType === "SUB" && parent) return parent;
  return String(row?.idProduct ?? "").trim();
}

/** Spring MaintenanceFormulaDTO row → table row fields (aligned to backend camelCase). */
export function normalizeSpringFormulaMaintenanceRow(row) {
  if (!row || typeof row !== "object") return null;
  return {
    id: row.id ?? null,
    process: row.process ?? "",
    account_id: row.accountId ?? null,
    account: row.account ?? "",
    currency: String(row.currency || "").trim().toUpperCase(),
    source: row.sourcePercent ?? "",
    product: resolveFormulaProductDisplay(row),
    input_method: row.inputMethod ?? "",
    formula: row.formula ?? "",
    description: row.description ?? "",
  };
}

/** Formula Maintenance list (view-only): Spring POST /api/maintenance/formula-maintenance/list, tenant-only. */
export async function listFormulaTemplates({ companyId, category, process, search, scope }) {
  const tenantId = formulaMaintenanceEffectiveCompanyId(scope, companyId);
  const body = buildSpringFormulaMaintenanceRequest({
    tenantId,
    process,
    category: resolveFormulaMaintenanceCategory(category),
    q: search,
  });

  const response = await fetch(buildApiUrl("api/maintenance/formula-maintenance/list"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify(body),
  });
  const data = await response.json();

  if (!data.success) throw new Error(data.message || data.error || "Search failed");
  const rows = Array.isArray(data.data) ? data.data : [];
  return rows.map(normalizeSpringFormulaMaintenanceRow).filter(Boolean);
}

/**
 * Spring POST /api/maintenance/formula-maintenance/update body (tenant-only).
 * Only account_id/source_percent/input_method/formula/description are editable —
 * everything else on data_capture_formula (process, product, source_columns, formula_operators,
 * enable_source_percent, enable_input_method, ...) is read-only from this page.
 */
export function buildSpringFormulaMaintenanceUpdateRequest({
  tenantId,
  id,
  accountId,
  sourcePercent,
  inputMethod,
  formula,
  description,
} = {}) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) {
    throw new Error("tenantIdRequired");
  }
  const rid = Number(id);
  if (!Number.isFinite(rid) || rid <= 0) {
    throw new Error("formulaIdRequired");
  }
  const accId = Number(accountId);
  return {
    tenantId: tid,
    id: rid,
    accountId: Number.isFinite(accId) && accId > 0 ? accId : null,
    sourcePercent: String(sourcePercent ?? "").trim() || null,
    inputMethod: String(inputMethod ?? "").trim() || null,
    formula: normalizeMaintenanceFormulaInput(formula ?? "") || null,
    description: String(description ?? "").trim() || null,
  };
}

/** Formula Maintenance Edit: Spring POST /api/maintenance/formula-maintenance/update, tenant-only. */
export async function updateFormulaTemplate({ tenantId, id, accountId, sourcePercent, inputMethod, formula, description }) {
  const body = buildSpringFormulaMaintenanceUpdateRequest({
    tenantId,
    id,
    accountId,
    sourcePercent,
    inputMethod,
    formula,
    description,
  });

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

/** Formula Maintenance Delete: hard delete, Spring POST /api/maintenance/formula-maintenance/delete, tenant-only. */
export async function deleteFormulaTemplates({ tenantId, formulaIds }) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) {
    throw new Error("tenantIdRequired");
  }
  const ids = (Array.isArray(formulaIds) ? formulaIds : [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (ids.length === 0) {
    throw new Error("formulaIdsRequired");
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
  const response = await fetch(buildApiUrl(`auth/switch-tenant?tenant_id=${companyId}`), {
    method: "POST",
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
}

/**
 * Edit form seeded straight from the Spring-normalized row: `formula` is the raw
 * `data_capture_formula.formula` value — no base/tail split, no "*(source)" paren decoration
 * (that legacy display convention doesn't apply here; the list already shows the raw field).
 */
export function createFormulaEditFormFromRow(row) {
  return {
    account_id: row?.account_id ?? "",
    source_percent:
      row?.source != null && String(row.source).trim() !== "" ? String(row.source).trim() : "0",
    input_method: row?.input_method || "",
    formula: row?.formula || "",
    description: row?.description || "",
  };
}

/** Source % edit only updates source_percent — it no longer rewrites the Formula box (independent columns). */
export function syncEditFormSourcePercent(form, newSourcePercent) {
  return { ...form, source_percent: formatSourcePercent(newSourcePercent) };
}

/** Optimistic local patch after a successful save — backend returns no row data, so reflect editForm directly. */
export function patchFormulaRowAfterSave(row, { id, editForm, accountLabel }) {
  if (!formulaRowIdsMatch(row.id, id)) return row;
  const accountId = editForm.account_id !== "" && editForm.account_id != null ? Number(editForm.account_id) : null;
  const next = {
    ...row,
    account_id: Number.isFinite(accountId) ? accountId : null,
    account: accountLabel || row.account,
    source: formatSourcePercent(editForm.source_percent ?? row.source ?? "0"),
    input_method: editForm.input_method ?? "",
    formula: normalizeMaintenanceFormulaInput(editForm.formula ?? row.formula ?? ""),
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
