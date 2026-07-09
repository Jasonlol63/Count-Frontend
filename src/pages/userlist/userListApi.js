/** User list — Spring Boot `/api/userlist/list` (tenant-scoped admin rows). */

import { buildApiUrl } from "../../utils/core/apiUrl.js";

/**
 * Map UI company scope (company_id pill) → Spring tenant_id for list API.
 * company.id in the picker === tenant.id in the backend.
 */
export function resolveListTenantId({
  companyId = null,
  groupOnly = false,
  anchorCompanyId = null,
  scopeCompanyId = null,
} = {}) {
  const direct = companyId != null ? Number(companyId) : Number.NaN;
  if (Number.isFinite(direct) && direct > 0) return direct;

  if (groupOnly) {
    const anchor = anchorCompanyId != null ? Number(anchorCompanyId) : Number.NaN;
    if (Number.isFinite(anchor) && anchor > 0) return anchor;
  }

  const scope = scopeCompanyId != null ? Number(scopeCompanyId) : Number.NaN;
  if (Number.isFinite(scope) && scope > 0) return scope;

  return null;
}

/** Map Spring {@link AdminListDTO} JSON to camelCase list row. */
export function normalizeAdminListItem(item) {
  const admin = item?.admin ?? {};
  const access = item?.adminTenantAccess ?? null;
  const role = admin.role != null ? String(admin.role) : "";
  const status = admin.status != null ? String(admin.status) : "";
  const isOwner = role.toLowerCase() === "owner";
  const hasAccess = access != null;

  return {
    id: admin.id,
    loginId: admin.loginId ?? "",
    name: admin.name ?? "",
    email: admin.email ?? "",
    role,
    permissions: admin.permissions ?? null,
    status,
    createdBy: admin.createdBy ?? "",
    createdAt: admin.createdAt ?? null,
    lastLogin: admin.lastLogin ?? null,
    readOnly: admin.readOnly ?? false,
    isOwnerShadow: isOwner && !hasAccess, // 如果是 owner 且没有 tenant access，则标记为 shadow
    tenantAccess: hasAccess ? {
      id: access.id ?? null,
      userId: access.userId ?? null,
      tenantId: access.tenantId ?? null,
      capabilities: access.capabilities ?? null,
      accountPermissions: access.accountPermissions ?? null,
      processPermissions: access.processPermissions ?? null,
      createdAt: access.createdAt ?? null,
      updatedAt: access.updatedAt ?? null,
    } : null,
  };
}

/** Owner shadow row from legacy PHP detail — normalized to the same list shape. */
export function normalizeOwnerShadowRow(detail) {
  if (!detail) return null;
  return {
    id: detail.id,
    loginId: detail.login_id ?? detail.loginId ?? "",
    name: detail.name ?? "",
    email: detail.email ?? "",
    role: detail.role ?? "owner",
    permissions: detail.permissions ?? null,
    status: detail.status ?? "",
    createdBy: detail.created_by ?? detail.createdBy ?? "",
    createdAt: detail.created_at ?? detail.createdAt ?? null,
    lastLogin: detail.last_login ?? detail.lastLogin ?? null,
    readOnly: false,
    isOwnerShadow: true,
    tenantAccess: null,
  };
}

/**
 * POST /api/userlist/list?tenant_id=
 * @returns {Promise<object[]>}
 */
export async function fetchAdminListByTenantId(tenantId, signal) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) {
    throw new Error("tenantIdRequired");
  }

  const res = await fetch(buildApiUrl(`api/userlist/list?tenant_id=${encodeURIComponent(tid)}`), {
    method: "POST",
    credentials: "include",
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json?.message || "failedToLoadUsers");
  }

  return Array.isArray(json.data) ? json.data.map(normalizeAdminListItem) : [];
}

/** Map Spring edit-modal detail JSON. */
export function normalizeAdminDetail(data) {
  if (!data || typeof data !== "object") return null;
  const tenantIds = Array.isArray(data.tenantIds ?? data.tenant_ids)
    ? (data.tenantIds ?? data.tenant_ids).map(Number).filter((id) => Number.isFinite(id) && id > 0)
    : [];
  const readOnlyRaw = data.readOnly ?? data.read_only;
  return {
    id: data.id,
    loginId: data.loginId ?? data.login_id ?? "",
    name: data.name ?? "",
    email: data.email ?? "",
    role: data.role ?? "",
    permissions: data.permissions ?? null,
    status: data.status ?? "",
    readOnly: readOnlyRaw != null ? !!readOnlyRaw : true,
    read_only: readOnlyRaw != null ? (readOnlyRaw ? 1 : 0) : 1,
    tenantAccessId: data.tenantAccessId ?? data.tenant_access_id ?? null,
    scopeTenantId: data.scopeTenantId ?? data.scope_tenant_id ?? null,
    accountPermissions: data.accountPermissions ?? data.account_permissions ?? null,
    processPermissions: data.processPermissions ?? data.process_permissions ?? null,
    account_permissions: data.accountPermissions ?? data.account_permissions ?? null,
    process_permissions: data.processPermissions ?? data.process_permissions ?? null,
    tenantIds,
  };
}

/**
 * POST /api/userlist/get?user_id=&scope_tenant_id=
 * @returns {Promise<object|null>}
 */
export async function fetchAdminDetailByUserId(userId, scopeTenantId, signal) {
  const uid = Number(userId);
  const tid = Number(scopeTenantId);
  if (!Number.isFinite(uid) || uid <= 0 || !Number.isFinite(tid) || tid <= 0) {
    throw new Error("tenantIdRequired");
  }

  const res = await fetch(
    buildApiUrl(
      `api/userlist/get?user_id=${encodeURIComponent(uid)}&scope_tenant_id=${encodeURIComponent(tid)}`,
    ),
    {
      method: "POST",
      credentials: "include",
      signal,
    },
  );
  const json = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json?.message || "failedToLoadUser");
  }
  return normalizeAdminDetail(json.data);
}

/** Resolve tenant.id list for Spring create/update — picker row id === tenant.id. */
export function resolveAdminTenantIds({
  useDualTenantUserPicker = false,
  selectedGroupIds = [],
  selectedCompanyIds = [],
  saveCompanyIds = [],
  shouldForceGroupScope = false,
  currentUserRole = "",
  companyId = null,
  mutationScopeCompanyId = null,
} = {}) {
  if (useDualTenantUserPicker) {
    const ids = [...selectedGroupIds, ...selectedCompanyIds]
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0);
    return [...new Set(ids)];
  }

  if (shouldForceGroupScope) {
    const source = saveCompanyIds.length ? saveCompanyIds : selectedCompanyIds;
    const ids = source.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
    if (ids.length) return [...new Set(ids)];
  }

  const fromPicker = saveCompanyIds.length ? saveCompanyIds : selectedCompanyIds;
  const pickerIds = fromPicker.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
  if (pickerIds.length) return [...new Set(pickerIds)];

  if (currentUserRole !== "admin" && currentUserRole !== "owner") {
    const scope =
      mutationScopeCompanyId != null ? Number(mutationScopeCompanyId) : Number(companyId);
    if (Number.isFinite(scope) && scope > 0) return [scope];
  }

  const fallback = companyId != null ? Number(companyId) : Number.NaN;
  return Number.isFinite(fallback) && fallback > 0 ? [fallback] : [];
}

/** @deprecated Use {@link resolveAdminTenantIds}. */
export function resolveAdminCreateTenantIds(params) {
  return resolveAdminTenantIds(params);
}

/** Build Spring {@link AdminRequest} body for POST /api/userlist/add. */
export function buildAdminCreateRequest({
  loginId,
  name,
  email,
  password,
  secondaryPassword,
  role,
  status,
  readOnly,
  permissions,
  tenantIds,
  accountPermissions,
  processPermissions,
}) {
  return {
    loginId,
    name,
    email,
    password,
    secondaryPassword: secondaryPassword || undefined,
    role,
    status: status || "active",
    readOnly: readOnly != null ? !!readOnly : true,
    permissions,
    tenantIds,
    accountPermissions,
    processPermissions,
  };
}

/**
 * POST /api/userlist/add
 * @returns {Promise<object>} normalized list row
 */
export async function createAdminUser(request, signal) {
  const res = await fetch(buildApiUrl("api/userlist/add"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(request),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json?.message || "saveFailed");
  }
  return normalizeAdminListItem(json.data);
}

/** Build Spring {@link AdminRequest} body for POST /api/userlist/update. */
export function buildAdminUpdateRequest({
  id,
  tenantAccessId,
  scopeTenantId,
  name,
  email,
  password,
  secondaryPassword,
  role,
  status,
  readOnly,
  permissions,
  tenantIds,
  accountPermissions,
  processPermissions,
}) {
  const body = {
    id: Number(id),
    scopeTenantId: Number(scopeTenantId),
  };

  if (tenantAccessId != null) body.tenantAccessId = Number(tenantAccessId);
  if (name) body.name = name;
  if (email) body.email = email;
  if (password) body.password = password;
  if (secondaryPassword) body.secondaryPassword = secondaryPassword;
  if (role) body.role = role;
  if (status) body.status = status;
  if (readOnly != null) body.readOnly = !!readOnly;
  if (permissions != null) body.permissions = permissions;
  if (Array.isArray(tenantIds) && tenantIds.length) body.tenantIds = tenantIds;
  if (accountPermissions != null) body.accountPermissions = accountPermissions;
  if (processPermissions != null) body.processPermissions = processPermissions;

  return body;
}

/**
 * POST /api/userlist/update
 * @returns {Promise<object>} normalized list row
 */
export async function updateAdminUser(request, signal) {
  const res = await fetch(buildApiUrl("api/userlist/update"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(request),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json?.message || "saveFailed");
  }
  return normalizeAdminListItem(json.data);
}

/**
 * POST /api/userlist/updateStatus
 * @returns {Promise<object>} normalized list row
 */
export async function toggleAdminUserStatus({ id, scopeTenantId }, signal) {
  const userId = Number(id);
  const tenantId = Number(scopeTenantId);
  if (!Number.isFinite(userId) || userId <= 0 || !Number.isFinite(tenantId) || tenantId <= 0) {
    throw new Error("invalidRequest");
  }

  const res = await fetch(buildApiUrl("api/userlist/updateStatus"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ id: userId, scopeTenantId: tenantId }),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json?.message || "toggleFailed");
  }
  return normalizeAdminListItem(json.data);
}

/**
 * POST /api/userlist/delete
 */
export async function deleteAdminUser({ id, scopeTenantId }, signal) {
  const userId = Number(id);
  const tenantId = Number(scopeTenantId);
  if (!Number.isFinite(userId) || userId <= 0 || !Number.isFinite(tenantId) || tenantId <= 0) {
    throw new Error("invalidRequest");
  }

  const res = await fetch(buildApiUrl("api/userlist/delete"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ id: userId, scopeTenantId: tenantId }),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json?.message || "apiDeleteUserFailed");
  }
}
