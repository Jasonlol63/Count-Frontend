/** C168 Domain page gate + session sync (desktop loginScope / companySessionSync parity). */

import { isGroupLogin } from "./loginScope.js";
import { switchSessionTenant } from "./authApi.js";
import { fetchOwnerCompaniesForMobile } from "./tenantAccessibleApi.js";

const C168_DOMAIN_PAGE_ROLES = new Set([
  "owner",
  "partnership",
  "admin",
  "manager",
  "supervisor",
  "accountant",
  "audit",
  "customer service",
  "company",
]);

const C168_AUTO_RENEW_ROLES = new Set(["owner", "admin", "partnership"]);

export function userRoleAllowsC168Domain(role) {
  return C168_DOMAIN_PAGE_ROLES.has(String(role || "").trim().toLowerCase());
}

export function userRoleAllowsC168AutoRenew(role, userType) {
  if (String(userType || "").trim().toLowerCase() === "member") return false;
  return C168_AUTO_RENEW_ROLES.has(String(role || "").trim().toLowerCase());
}

export function isActiveCompanyContextC168(me) {
  if (!me) return false;
  if (isGroupLogin(me)) return false;
  if (me.is_current_company_c168) return true;
  return String(me.company_code || "").trim().toUpperCase() === "C168";
}

/** More entry + Domain page gate (mobile: no desktop GC cache). */
export function canAccessC168DomainPages(me) {
  if (!me) return false;
  if (String(me.user_type || "").toLowerCase() === "member") return false;
  if (!isActiveCompanyContextC168(me)) return false;
  return userRoleAllowsC168Domain(me.role) || Boolean(me.has_c168_domain_page_access);
}

/** Auto Renew — owner/admin/partnership (or session flag), C168 context. */
export function canAccessC168AutoRenew(me) {
  if (!me) return false;
  if (!isActiveCompanyContextC168(me)) return false;
  return userRoleAllowsC168AutoRenew(me.role, me.user_type) || Boolean(me.has_c168_auto_renew_access);
}

/**
 * Find C168 company numeric id from owner-companies list, else me.company_id when code is C168.
 */
export function resolveC168CompanyId(me, companies = []) {
  const list = Array.isArray(companies) ? companies : [];
  const hit = list.find((c) => String(c?.company_id || "").trim().toUpperCase() === "C168");
  if (hit && Number(hit.id) > 0) return Number(hit.id);
  const code = String(me?.company_code || "").trim().toUpperCase();
  const id = Number(me?.company_id);
  if (code === "C168" && Number.isFinite(id) && id > 0) return id;
  return null;
}

/** Align backend session tenant to C168 before domain_api calls. */
export async function ensureC168DomainApiSession(me, companies = []) {
  const targetId = resolveC168CompanyId(me, companies);
  if (targetId == null) return false;
  try {
    const { ok, json } = await switchSessionTenant(targetId);
    return Boolean(ok && json?.success);
  } catch {
    return false;
  }
}

export async function fetchOwnerCompaniesForDomain(signal) {
  try {
    return await fetchOwnerCompaniesForMobile(signal);
  } catch {
    return [];
  }
}
