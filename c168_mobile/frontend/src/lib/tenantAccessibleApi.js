/**
 * Accessible tenants — Spring Boot `GET /auth/tenant-accessible`.
 * Copied from Count-frontend/src/utils/company/tenantAccessibleApi.js (desktop).
 *
 * The `tenantAccessibleRowToUiTenant()` output intentionally keeps the same field
 * names mobile's existing scope helpers (`lib/dashboardScope.js`, `lib/loginScope.js`,
 * `lib/c168DomainAccess.js`, …) already read from the old `get_owner_companies_api.php`
 * / `api/transactions/get_owner_companies_api.php` rows — `id`, `company_id` (= code),
 * `group_id`, `native_group_id` — so this module is a drop-in transport swap and those
 * consumers do not need to change shape in this pass.
 */
import { buildApiUrl } from "../utils/apiUrl.js";

function normalizeTenantCode(value) {
  if (value == null || String(value).trim() === "") return null;
  return String(value).trim().toUpperCase();
}

function inferTenantType(tenantCode, parentTenantCode) {
  const code = String(tenantCode || "").trim().toUpperCase();
  const parent = String(parentTenantCode || "").trim().toUpperCase();
  if (!code && parent) return "GROUP";
  if (code && parent && code === parent) return "GROUP";
  return "COMPANY";
}

/** Map Spring tenant-accessible row JSON → internal tenant model. */
export function normalizeTenantAccessibleItem(row) {
  if (!row || typeof row !== "object") return null;

  const tenantId = Number(row.tenant_id ?? row.tenantId ?? row.id);
  if (!Number.isFinite(tenantId) || tenantId <= 0) return null;

  const tenantCode = String(row.tenant_code ?? row.tenantCode ?? row.code ?? "").trim();
  const parentTenantCode = normalizeTenantCode(
    row.parent_tenant_code ?? row.parentTenantCode ?? row.parentGroupCode,
  );
  const nativeParentTenantCode = normalizeTenantCode(
    row.native_parent_tenant_code ?? row.nativeParentTenantCode ?? parentTenantCode,
  );
  const rawType = row.tenant_type != null ? String(row.tenant_type).trim().toUpperCase() : "";
  const tenantType =
    rawType === "GROUP" || rawType === "COMPANY"
      ? rawType
      : inferTenantType(tenantCode, parentTenantCode);

  return {
    tenantId,
    tenantCode,
    parentTenantCode,
    nativeParentTenantCode,
    expirationDate: row.expiration_date ?? row.expirationDate ?? null,
    tenantType,
    grantedAt: row.granted_at ?? row.grantedAt ?? null,
  };
}

/** Map tenant model → the "company row" shape mobile's scope helpers already expect. */
export function tenantAccessibleRowToUiTenant(tenant) {
  if (!tenant) return null;
  const code = tenant.tenantCode;
  const isGroup = tenant.tenantType === "GROUP";
  const parent = tenant.parentTenantCode;
  const native = tenant.nativeParentTenantCode;

  return {
    id: tenant.tenantId,
    tenant_id: tenant.tenantId,
    tenant_code: code,
    company_id: code,
    company_code: code,
    parent_tenant_code: isGroup ? code.toUpperCase() : parent,
    native_parent_tenant_code: isGroup ? (native || code).toUpperCase() : native ?? parent,
    group_id: isGroup ? code.toUpperCase() : parent,
    native_group_id: isGroup ? (native || code).toUpperCase() : native ?? parent,
    expiration_date: tenant.expirationDate,
    tenant_type: tenant.tenantType,
    granted_at: tenant.grantedAt,
  };
}

/**
 * GET /auth/tenant-accessible
 * @returns {Promise<{ tenants: object[], raw: object }>}
 */
export async function fetchAccessibleTenants({ signal, all = true } = {}) {
  const res = await fetch(buildApiUrl(`auth/tenant-accessible?all=${all ? 1 : 0}`), {
    credentials: "include",
    cache: "no-store",
    signal,
  });
  const json = await res.json().catch(() => ({}));
  const tenants = Array.isArray(json?.data)
    ? json.data.map(normalizeTenantAccessibleItem).filter(Boolean)
    : [];
  return { ok: res.ok, tenants, raw: json };
}

/**
 * Drop-in replacement for the old `fetchOwnerCompanies` / `fetchOwnerCompaniesForDomain`
 * (`api/transactions/get_owner_companies_api.php`) — returns the same row shape those
 * callers already consume.
 * @returns {Promise<object[]>}
 */
export async function fetchOwnerCompaniesForMobile(signal) {
  const { ok, tenants, raw } = await fetchAccessibleTenants({ signal, all: true });
  if (!ok || raw?.success === false) {
    throw new Error(raw?.message || raw?.error || "Failed to load companies");
  }
  return tenants.map(tenantAccessibleRowToUiTenant).filter(Boolean);
}

// Session-lifetime positive cache — once a code resolves, don't re-hit the backend for it.
const tenantIdByCodeCache = new Map();

export function clearTenantIdByCodeCache() {
  tenantIdByCodeCache.clear();
}

/**
 * GET /auth/tenant-by-code — resolve a group/company CODE to its numeric tenant id
 * (used wherever a scope only carries a code, e.g. a "group" report/list scope).
 * @returns {Promise<number|null>}
 */
export async function fetchTenantIdByCode(code, { signal } = {}) {
  const normalized = code == null ? "" : String(code).trim().toUpperCase();
  if (!normalized) return null;
  if (tenantIdByCodeCache.has(normalized)) return tenantIdByCodeCache.get(normalized);
  try {
    const res = await fetch(buildApiUrl(`auth/tenant-by-code?code=${encodeURIComponent(normalized)}`), {
      credentials: "include",
      signal,
    });
    const json = await res.json();
    const id = Number(json?.data?.tenant_id);
    const resolved = res.ok && json?.success && Number.isFinite(id) && id > 0 ? id : null;
    if (resolved != null) tenantIdByCodeCache.set(normalized, resolved);
    return resolved;
  } catch {
    return null;
  }
}
