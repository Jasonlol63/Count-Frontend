import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { resolveCustomerReportScope } from "./reportScope.js";

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

export async function fetchCompanyPermissions(companyCode) {
  if (!companyCode) return [];
  try {
    const response = await fetch(buildApiUrl("api/domain/domain_api.php"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_company_permissions", company_id: companyCode }),
    });
    const result = await response.json();
    if (result.success && result.data && Array.isArray(result.data.permissions)) {
      return result.data.permissions;
    }
  } catch (err) {
    console.error("Error fetching company permissions:", err);
  }
  return [];
}

export function isBankOnlyCategoryCompany(permissions) {
  if (!Array.isArray(permissions) || permissions.length === 0) return false;
  const hasBank = permissions.includes("Bank");
  const hasGames = permissions.includes("Games") || permissions.includes("Gambling");
  return hasBank && !hasGames;
}

export async function fetchCurrencies(companyId, options = {}) {
  const { signal, viewGroup } = options;
  const q = new URLSearchParams();
  if (companyId) q.set("company_id", String(companyId));
  const vg = viewGroup ? String(viewGroup).trim().toUpperCase() : "";
  if (vg) q.set("view_group", vg);
  const qs = q.toString();
  const url = buildApiUrl(
    `api/transactions/get_company_currencies_api.php${qs ? `?${qs}` : ""}`,
  );
  const res = await fetch(url, { credentials: "include", signal });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || json.error || "Failed to load currencies");
  }
  return json.data || [];
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
    const res = await fetch(buildApiUrl(`api/currency/list?tenant_id=${tenantId}`), {
      method: "POST",
      credentials: "include",
      signal,
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || json.error || "Failed to load currencies");
    }
    const rows = Array.isArray(json.data) ? json.data : [];
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
