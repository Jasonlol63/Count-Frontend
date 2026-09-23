/**
 * Admin/Owner user list (sidebar "Admin" page — distinct from the member Account page) —
 * Spring Boot `/api/userlist/*`. Copied from Count-frontend/src/pages/userlist/userListApi.js
 * (desktop), field names kept snake_case to match what mobile's `AdminUsersPage.jsx` /
 * `AdminUserSheets.jsx` already read (`login_id`, `is_owner_shadow`, `read_only`, …).
 *
 * Like Account (accountApi.js), a GROUP is just another tenant — the Spring list response
 * itself already flags owner-shadow rows (`isOwnerShadow` on `AdminListDTO`), so the old
 * PHP flow's extra "fetch my own shadow row separately" second call is gone.
 */
import { buildApiUrl } from "../utils/apiUrl.js";

export function resolveAdminListTenantId(companyId) {
  const tid = companyId != null ? Number(companyId) : Number.NaN;
  return Number.isFinite(tid) && tid > 0 ? tid : null;
}

/** Spring AdminListDTO row → mobile UI row (snake_case). */
export function normalizeAdminListItem(item) {
  const admin = item?.admin ?? item ?? {};
  const access = item?.adminTenantAccess ?? null;
  const role = admin.role != null ? String(admin.role) : "";
  const isOwner = role.toLowerCase() === "owner";
  const hasAccess = access != null;
  return {
    id: admin.id,
    login_id: admin.loginId ?? admin.login_id ?? "",
    name: admin.name ?? "",
    email: admin.email ?? "",
    role,
    permissions: admin.permissions ?? null,
    status: admin.status != null ? String(admin.status) : "",
    created_by: admin.createdBy ?? admin.created_by ?? "",
    created_at: admin.createdAt ?? admin.created_at ?? null,
    last_login: admin.lastLogin ?? admin.last_login ?? null,
    last_logout: admin.lastLogout ?? admin.last_logout ?? null,
    read_only: admin.readOnly ?? admin.read_only ?? false,
    is_owner_shadow: item?.isOwnerShadow === true || item?.is_owner_shadow === true || (isOwner && !hasAccess),
    tenant_access_id: access?.id ?? null,
    scope_tenant_id: access?.tenantId ?? access?.tenant_id ?? null,
    account_permissions: access?.accountPermissions ?? access?.account_permissions ?? null,
    process_permissions: access?.processPermissions ?? access?.process_permissions ?? null,
  };
}

/** POST /api/userlist/list?tenant_id= */
export async function fetchAdminListByTenantId(tenantId, signal) {
  const tid = resolveAdminListTenantId(tenantId);
  if (!tid) throw new Error("tenantIdRequired");
  const res = await fetch(buildApiUrl(`api/userlist/list?tenant_id=${encodeURIComponent(tid)}`), {
    method: "POST",
    credentials: "include",
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json?.message || "failedToLoadUsers");
  return Array.isArray(json.data) ? json.data.map(normalizeAdminListItem) : [];
}

/** Merge admin lists across tenant ids (dedupe by id — same pattern as accountApi.js). */
export async function fetchMergedAdminLists(tenantIds = [], signal) {
  const ids = [
    ...new Set(
      (Array.isArray(tenantIds) ? tenantIds : [])
        .map((raw) => Number(raw))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ];
  if (!ids.length) return [];
  const slices = await Promise.all(ids.map((tid) => fetchAdminListByTenantId(tid, signal).catch(() => [])));
  const byId = new Map();
  for (const rows of slices) {
    for (const row of rows) {
      const id = Number(row?.id);
      // Two rows can share an id across tenants (e.g. the shadow row) — prefer the
      // non-shadow (real tenant-access) copy if both appear.
      if (!Number.isFinite(id) || id <= 0) continue;
      const existing = byId.get(id);
      if (!existing || (existing.is_owner_shadow && !row.is_owner_shadow)) byId.set(id, row);
    }
  }
  return [...byId.values()];
}

/** Spring edit-modal detail JSON → mobile UI form seed (snake_case). */
export function normalizeAdminDetail(data, { isOwnerShadow = false } = {}) {
  if (!data || typeof data !== "object") return null;
  const tenantIds = Array.isArray(data.tenantIds ?? data.tenant_ids)
    ? (data.tenantIds ?? data.tenant_ids).map(Number).filter((id) => Number.isFinite(id) && id > 0)
    : [];
  const readOnlyRaw = data.readOnly ?? data.read_only;
  return {
    id: data.id,
    login_id: data.loginId ?? data.login_id ?? "",
    name: data.name ?? "",
    email: data.email ?? "",
    role: data.role ?? "",
    permissions: data.permissions ?? null,
    status: data.status ?? "",
    read_only: readOnlyRaw != null ? (readOnlyRaw ? 1 : 0) : 1,
    tenant_access_id: data.tenantAccessId ?? data.tenant_access_id ?? null,
    scope_tenant_id: data.scopeTenantId ?? data.scope_tenant_id ?? null,
    account_permissions: data.accountPermissions ?? data.account_permissions ?? null,
    process_permissions: data.processPermissions ?? data.process_permissions ?? null,
    tenant_ids: tenantIds,
    is_owner_shadow: isOwnerShadow,
  };
}

/** POST /api/userlist/get?user_id=&scope_tenant_id= */
export async function fetchAdminDetailByUserId(userId, scopeTenantId, { isOwnerShadow, signal } = {}) {
  const uid = Number(userId);
  const tid = Number(scopeTenantId);
  if (!Number.isFinite(uid) || uid <= 0 || !Number.isFinite(tid) || tid <= 0) {
    throw new Error("invalidRequest");
  }
  const res = await fetch(
    buildApiUrl(`api/userlist/get?user_id=${encodeURIComponent(uid)}&scope_tenant_id=${encodeURIComponent(tid)}`),
    { method: "POST", credentials: "include", signal },
  );
  const json = await res.json();
  if (!res.ok || !json.success || !json.data) throw new Error(json?.message || "failedToLoadUser");
  return normalizeAdminDetail(json.data, { isOwnerShadow });
}

/**
 * Spring `AdminDTO` body for POST /api/userlist/add — camelCase, NOT the legacy PHP snake_case
 * (`login_id` / `company_id` / `read_only`). Jackson binds this straight onto the DTO.
 * Copied from Count-frontend/src/pages/userlist/userListApi.js (desktop).
 */
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
    readOnly: readOnly != null ? !!readOnly : false,
    permissions,
    tenantIds,
    accountPermissions,
    processPermissions,
  };
}

/**
 * Spring `AdminDTO` body for POST /api/userlist/update.
 * Only changed fields are sent — the backend treats a `null` permission list as "leave the
 * ACL mode alone" (`AdminServiceImpl.replaceAccountAcl` returns early on `items == null`).
 */
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

/** Spring body for POST /api/userlist/update-owner-profile (owner-shadow: no role/ACL fields). */
export function buildAdminOwnerProfileUpdateRequest({ id, name, email, password, secondaryPassword }) {
  const body = { id: Number(id) };
  if (name) body.name = name;
  if (email) body.email = email;
  if (password) body.password = password;
  if (secondaryPassword) body.secondaryPassword = secondaryPassword;
  return body;
}

/** POST /api/userlist/add */
export async function createAdminUser(request, signal) {
  const res = await fetch(buildApiUrl("api/userlist/add"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(request),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json?.message || "saveFailed");
  return normalizeAdminListItem(json.data);
}

/** POST /api/userlist/update */
export async function updateAdminUser(request, signal) {
  const res = await fetch(buildApiUrl("api/userlist/update"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(request),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json?.message || "saveFailed");
  return normalizeAdminListItem(json.data);
}

/** POST /api/userlist/update-owner-profile (owner-shadow row: name/email/password only). */
export async function updateAdminOwnerProfile(request, signal) {
  const res = await fetch(buildApiUrl("api/userlist/update-owner-profile"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(request),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json?.message || "saveFailed");
  return normalizeAdminListItem(json.data);
}

/** POST /api/userlist/updateStatus */
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
  if (!res.ok || !json.success) throw new Error(json?.message || "toggleFailed");
  return normalizeAdminListItem(json.data);
}

/** POST /api/userlist/delete */
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
  if (!res.ok || !json.success) throw new Error(json?.message || "deleteFailed");
}
