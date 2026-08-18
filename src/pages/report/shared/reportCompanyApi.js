import { resolveCustomerReportScope } from "./reportScope.js";
import { fetchCurrencyListByTenantId } from "../../../utils/api/currencyApi.js";

function normalizeReportScopeInput(scopeOrLegacy) {
  if (!scopeOrLegacy || typeof scopeOrLegacy !== "object") return null;
  if (scopeOrLegacy.mode != null || scopeOrLegacy.resolveCompanyViaGroupId != null) {
    return scopeOrLegacy;
  }
  const { companies, selectedGroup, companyId, scopeCompanyId, viewGroup } = scopeOrLegacy;
  const resolved = resolveCustomerReportScope({
    companies: companies ?? [],
    selectedGroup: selectedGroup || viewGroup || null,
    companyId: companyId ?? scopeCompanyId ?? null,
  });
  if (resolved) return resolved;
  const cid = Number(scopeCompanyId ?? companyId);
  if (Number.isFinite(cid) && cid > 0) {
    const g = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
    return {
      mode: "company",
      scopeCompanyId: cid,
      groupId: g || null,
      viewGroup: viewGroup || g || null,
      uiCompanyId: Number(companyId) > 0 ? Number(companyId) : null,
    };
  }
  return null;
}

function resolveReportScopeTenantIds(reportScope) {
  const mergeCompanyIds =
    reportScope?.mode === "aggregate" && Array.isArray(reportScope.mergeCompanyIds)
      ? reportScope.mergeCompanyIds.filter((id) => Number(id) > 0)
      : [];
  if (mergeCompanyIds.length > 0) return mergeCompanyIds.map((id) => Number(id));
  const id = Number(reportScope?.scopeCompanyId ?? reportScope?.uiCompanyId);
  return Number.isFinite(id) && id > 0 ? [id] : [];
}

/**
 * Currencies for the active report scope (group ledger vs subsidiary company) — Spring
 * `POST /api/currency/list?tenant_id=` (tenant-only, no group/scope aggregation on the backend).
 * Replaces legacy `api/transactions/get_scope_account_currencies_api.php`, which 500s now that the
 * reverse proxy sends every unrewritten `/api/*` path to Spring. Aggregate scope loops per tenant and
 * unions by currency code, same pattern used for the report list itself.
 */
export async function fetchReportScopeCurrencies(scopeOrLegacy, options = {}) {
  const reportScope = normalizeReportScopeInput(scopeOrLegacy);
  if (!reportScope) return [];
  const { signal } = options;
  const tenantIds = resolveReportScopeTenantIds(reportScope);
  if (!tenantIds.length) return [];

  const seen = new Set();
  const merged = [];
  for (const tenantId of tenantIds) {
    const rows = await fetchCurrencyListByTenantId(tenantId, signal);
    for (const row of rows) {
      const code = String(row?.code || "").trim().toUpperCase();
      if (!code || seen.has(code)) continue;
      seen.add(code);
      merged.push({ id: row.id, code });
    }
  }
  merged.sort((a, b) => a.code.localeCompare(b.code));
  return merged;
}
