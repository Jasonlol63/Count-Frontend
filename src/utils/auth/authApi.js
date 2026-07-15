/**
 * Spring Boot auth APIs only — no PHP paths.
 * Backend: AuthController under `/auth/*`.
 */
import { buildApiUrl } from "../core/apiUrl.js";

async function parseJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function formBody(fields) {
  const fd = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value == null) return;
    fd.append(key, String(value));
  });
  return fd;
}

/** GET /auth/current-user -> SessionUser */
export async function fetchCurrentUser({ signal, cache = "no-store" } = {}) {
  const res = await fetch(buildApiUrl("auth/current-user"), {
    method: "GET",
    credentials: "include",
    cache,
    signal,
  });
  const json = await parseJsonSafe(res);
  return { ok: res.ok, status: res.status, json };
}

/**
 * POST /auth/login
 * @param {{ tenantCode: string, password: string, loginRole?: string, loginId?: string, accountId?: string, rememberMe?: boolean }}
 */
export async function loginWithTenant(params) {
  const {
    tenantCode,
    password,
    loginRole = "admin",
    loginId,
    accountId,
    rememberMe = false,
  } = params;

  const fields = {
    tenant_code: String(tenantCode || "").toUpperCase().trim(),
    password,
    login_role: loginRole,
  };
  if (loginRole === "member") {
    fields.account_id = String(accountId || "").toUpperCase().trim();
  } else {
    fields.login_id = String(loginId || "").toUpperCase().trim();
    if (rememberMe) fields.remember_me = "1";
  }

  const res = await fetch(buildApiUrl("auth/login"), {
    method: "POST",
    body: formBody(fields),
    credentials: "include",
    cache: "no-store",
  });
  const raw = await res.text();
  let json = {};
  let parsed = false;
  try {
    json = raw ? JSON.parse(raw) : {};
    parsed = true;
  } catch {
    json = {};
    parsed = false;
  }
  return { ok: res.ok, status: res.status, raw, json, parsed };
}

/** POST /auth/logout */
export async function logoutSession() {
  const res = await fetch(buildApiUrl("auth/logout"), {
    method: "POST",
    credentials: "include",
    cache: "no-store",
  });
  const json = await parseJsonSafe(res);
  return { ok: res.ok, status: res.status, json };
}

/** POST /auth/verify-owner-secondary-password */
export async function verifyOwnerSecondaryPassword(secondaryPassword) {
  const res = await fetch(buildApiUrl("auth/verify-owner-secondary-password"), {
    method: "POST",
    body: formBody({ secondary_password: secondaryPassword }),
    credentials: "include",
    cache: "no-store",
  });
  const json = await parseJsonSafe(res);
  return { ok: res.ok, status: res.status, json };
}

/** POST /auth/verify-user-secondary-password */
export async function verifyUserSecondaryPassword(secondaryPassword) {
  const res = await fetch(buildApiUrl("auth/verify-user-secondary-password"), {
    method: "POST",
    body: formBody({ secondary_password: secondaryPassword }),
    credentials: "include",
    cache: "no-store",
  });
  const json = await parseJsonSafe(res);
  return { ok: res.ok, status: res.status, json };
}

/** POST /auth/switch-tenant?tenant_id= */
export async function switchSessionTenant(tenantId, { signal } = {}) {
  const id = Number(tenantId);
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, status: 0, json: { success: false, message: "Invalid tenant" } };
  }
  const res = await fetch(buildApiUrl(`auth/switch-tenant?tenant_id=${id}`), {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    signal,
  });
  const json = await parseJsonSafe(res);
  return { ok: res.ok, status: res.status, json };
}

/** GET /auth/tenant-accessible */
export async function fetchTenantAccessible({ all = true, signal } = {}) {
  const q = all ? "?all=1" : "?all=0";
  const res = await fetch(buildApiUrl(`auth/tenant-accessible${q}`), {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    signal,
  });
  const json = await parseJsonSafe(res);
  return { ok: res.ok, status: res.status, json };
}

/** POST /auth/send-reset-tac */
export async function sendResetTacRequest({ tenantCode, email }) {
  const res = await fetch(buildApiUrl("auth/send-reset-tac"), {
    method: "POST",
    body: formBody({
      tenant_code: String(tenantCode || "").toUpperCase().trim(),
      email,
    }),
    credentials: "include",
    cache: "no-store",
  });
  return parseJsonSafe(res);
}

/** POST /auth/reset-password */
export async function resetPasswordRequest({ tenantCode, email, tac, newPassword }) {
  const res = await fetch(buildApiUrl("auth/reset-password"), {
    method: "POST",
    body: formBody({
      tenant_code: String(tenantCode || "").toUpperCase().trim(),
      email,
      tac,
      new_password: newPassword,
    }),
    credentials: "include",
    cache: "no-store",
  });
  return parseJsonSafe(res);
}
