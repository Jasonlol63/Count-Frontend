import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { customerReportScopeApiParams, resolveCustomerReportScope } from "./reportScope.js";

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

/** Currencies for the active report scope (group ledger vs subsidiary company). */
export async function fetchReportScopeCurrencies(scopeOrLegacy, options = {}) {
  const reportScope = normalizeReportScopeInput(scopeOrLegacy);
  if (!reportScope) return [];
  const { signal } = options;
  const q = new URLSearchParams();
  const api = customerReportScopeApiParams(reportScope);
  const cid = api.companyId != null && api.companyId !== "" ? Number(api.companyId) : 0;
  if (Number.isFinite(cid) && cid > 0) q.set("company_id", String(cid));
  const vg = api.viewGroup ? String(api.viewGroup).trim().toUpperCase() : "";
  if (vg) q.set("view_group", vg);
  const gid = api.groupId ? String(api.groupId).trim().toUpperCase() : "";
  if (gid) q.set("group_id", gid);
  if (api.groupAggregate) q.set("group_aggregate", "1");
  if (api.subsidiaryAccountsOnly) q.set("subsidiary_accounts_only", "1");
  if (reportScope.mode) q.set("report_scope", reportScope.mode);
  const qs = q.toString();
  const url = buildApiUrl(
    `api/transactions/get_scope_account_currencies_api.php${qs ? `?${qs}` : ""}`,
  );
  const res = await fetch(url, { credentials: "include", signal });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || json.error || "Failed to load currencies");
  }
  return json.data || [];
}
