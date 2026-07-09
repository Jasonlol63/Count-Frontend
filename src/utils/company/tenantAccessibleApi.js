/** Accessible tenants — Spring Boot `GET /auth/tenant-accessible`. */

import { buildApiUrl } from "../core/apiUrl.js";

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
  };
}

/** Map tenant model → sidebar / filter picker row. */
export function tenantAccessibleRowToUiTenant(tenant) {
  if (!tenant) return null;
  const code = tenant.tenantCode;
  const isGroup = tenant.tenantType === "GROUP";
  const parent = tenant.parentTenantCode;
  const native = tenant.nativeParentTenantCode;

  return {
    tenant_id: tenant.tenantId,
    tenant_code: code,
    company_id: code,
    parent_tenant_code: isGroup ? code.toUpperCase() : parent,
    native_parent_tenant_code: isGroup ? (native || code).toUpperCase() : native ?? parent,
    expiration_date: tenant.expirationDate,
    tenant_type: tenant.tenantType,
  };
}

/** @deprecated Use {@link tenantAccessibleRowToUiTenant}. */
export function tenantAccessibleRowToUiCompany(tenant) {
  return tenantAccessibleRowToUiTenant(tenant);
}

export function readAccessibleParentTenantCodes(json) {
  if (Array.isArray(json?.accessible_parent_tenant_codes)) {
    return json.accessible_parent_tenant_codes.map(normalizeTenantCode).filter(Boolean);
  }
  if (Array.isArray(json?.accessibleParentTenantCodes)) {
    return json.accessibleParentTenantCodes.map(normalizeTenantCode).filter(Boolean);
  }
  return [];
}

/**
 * GET /auth/tenant-accessible
 * @returns {Promise<{ tenants: object[], accessibleParentTenantCodes: string[], raw: object }>}
 */
export async function fetchAccessibleTenants(options = {}) {
  const { signal, all = true, throwOnError = false } = options;
  const res = await fetch(buildApiUrl(`auth/tenant-accessible?all=${all ? 1 : 0}`), {
    credentials: "include",
    signal,
  });
  const json = await res.json();

  if (throwOnError && (!res.ok || !json?.success || !Array.isArray(json?.data))) {
    throw new Error(json?.message || json?.error || "Failed to load accessible tenants");
  }

  const tenants = Array.isArray(json?.data)
    ? json.data.map(normalizeTenantAccessibleItem).filter(Boolean)
    : [];
  const accessibleParentTenantCodes = readAccessibleParentTenantCodes(json);

  return { tenants, accessibleParentTenantCodes, raw: json };
}
