/**
 * Ownership — Spring Boot `/api/ownership/*`.
 * Copied from Count-frontend/src/pages/ownership/company/useCompanyOwnership.js +
 * ownershipRoutePrefetch.js (desktop).
 *
 * The company/group list (`fetchOwnershipCompanies`/`fetchGroupEarnings`) is no longer a
 * dedicated ownership endpoint — desktop reuses `GET /auth/tenant-accessible` (the same
 * one `tenantAccessibleApi.js` already wraps for the sidebar), filtered by tenant_type.
 * Note allocated_percentage is NOT returned by this list at all any more (desktop doesn't
 * fetch it either) — it only gets patched into local state after a save, so a company you
 * haven't opened yet won't show its allocation until you view/save it. This matches
 * desktop's current (possibly still-a-known-gap) behavior exactly, not a mobile regression.
 *
 * `tenant_id` accepts either a numeric tenant id or a company/group CODE string directly
 * (TenantOwnershipController.resolveTenantId resolves both) — call sites here still pass
 * numeric ids since the tenant row is already loaded with one.
 */
import { fetchAccessibleTenants, tenantAccessibleRowToUiTenant } from "./tenantAccessibleApi.js";
import { buildApiUrl } from "../utils/apiUrl.js";

let tenantListCache = null;
let tenantListInflight = null;

function fetchAllOwnershipTenants({ force = false } = {}) {
  if (force) {
    tenantListCache = null;
    tenantListInflight = null;
  } else if (tenantListCache) {
    return Promise.resolve(tenantListCache);
  }
  if (tenantListInflight) return tenantListInflight;

  tenantListInflight = fetchAccessibleTenants({ all: true })
    .then(({ ok, tenants, raw }) => {
      if (!ok || raw?.success === false) {
        throw new Error(raw?.message || raw?.error || "Failed to load companies");
      }
      // Ownership UI displays `name` — Spring tenants only carry a `code` (no separate
      // business name), matching the original PHP `get_companies_api.php` which set
      // `name` = company code too.
      const rows = tenants
        .map(tenantAccessibleRowToUiTenant)
        .filter(Boolean)
        .map((row) => ({ ...row, name: row.company_id }));
      tenantListCache = rows;
      return rows;
    })
    .finally(() => {
      tenantListInflight = null;
    });
  return tenantListInflight;
}

/** Drop the tenant list cache (after join/ungroup/save). */
export function invalidateOwnershipCompaniesCache() {
  tenantListCache = null;
  tenantListInflight = null;
}

export async function fetchOwnershipCompanies(_monthKey, { force = false } = {}) {
  // Month is accepted for call-site compatibility and ignored — the tenant list itself
  // does not vary by month, only per-tenant ownership rows do (see file header).
  const rows = await fetchAllOwnershipTenants({ force });
  return { success: true, data: rows.filter((t) => t.tenant_type === "COMPANY") };
}

export async function fetchGroupEarnings(_monthKey, _historical, { force = false } = {}) {
  const rows = await fetchAllOwnershipTenants({ force });
  return { success: true, data: rows.filter((t) => t.tenant_type === "GROUP") };
}

async function getOwnershipJson(path) {
  const res = await fetch(buildApiUrl(path), { credentials: "include" });
  return res.json();
}

/** GET /api/ownership/list?tenant_id=&month= */
export async function fetchOwnershipList(tenantId, monthKey, historical) {
  const qs = historical ? `?tenant_id=${tenantId}&month=${encodeURIComponent(monthKey)}` : `?tenant_id=${tenantId}`;
  return getOwnershipJson(`api/ownership/list${qs}`);
}

export async function fetchCompanyOwners(companyId, monthKey, historical) {
  return fetchOwnershipList(companyId, monthKey, historical);
}

export async function fetchGroupOwners(groupTenantId, monthKey, historical) {
  return fetchOwnershipList(groupTenantId, monthKey, historical);
}

/** GET /api/ownership/available-accounts?tenant_id=&month= */
export async function fetchAvailableAccounts(tenantId, monthKey, historical) {
  const qs = historical ? `?tenant_id=${tenantId}&month=${encodeURIComponent(monthKey)}` : `?tenant_id=${tenantId}`;
  return getOwnershipJson(`api/ownership/available-accounts${qs}`);
}

export async function fetchCompanyAvailableAccounts(companyId, monthKey, historical) {
  return fetchAvailableAccounts(companyId, monthKey, historical);
}

export async function fetchGroupAvailableAccounts(groupTenantId, monthKey, historical) {
  return fetchAvailableAccounts(groupTenantId, monthKey, historical);
}

async function postOwnershipEndpoint(path, body) {
  const res = await fetch(buildApiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  return res.json();
}

/** POST /api/ownership/link-partner */
export async function linkPartner({ tenantId, loginId, forceType = "" }) {
  return postOwnershipEndpoint("api/ownership/link-partner", {
    tenant_id: tenantId,
    login_id: loginId,
    force_type: forceType,
  });
}

/** POST /api/ownership/batch-save-ownership */
export async function batchSaveOwnership({ tenantId, owners, month }) {
  const payload = { tenant_id: tenantId, owners };
  if (month) payload.month = month;
  return postOwnershipEndpoint("api/ownership/batch-save-ownership", payload);
}

/** POST /api/ownership/update-parent-tenant (parentCode = null clears the group). */
export async function updateParentTenant({ tenantId, parentCode }) {
  return postOwnershipEndpoint("api/ownership/update-parent-tenant", {
    tenant_id: tenantId,
    parent_code: parentCode,
  });
}

// isApiSuccess / isApiConflict / getApiMessage live in ./ownershipLogic.js — import from
// there, not here (this file only covers the network calls).
