/** Bank country / bank option catalog — Spring `/api/bank-country-option/*` (tenantId in body). */

import { buildApiUrl } from "../../utils/core/apiUrl.js";
import { resolveBankProcessListTenantId } from "./lib/bankProcessHelpers.js";

function isApiSuccess(json) {
  return json?.success === true || json?.status === "success";
}

async function parseJsonResponse(res) {
  const json = await res.json().catch(() => ({}));
  return json;
}

/** Spring BankCountry → `{ id, code, tenantId }`. */
export function normalizeBankCountryItem(item) {
  if (!item || typeof item !== "object") return null;
  const id = item.id != null ? Number(item.id) : NaN;
  const code = String(item.code ?? "").trim().toUpperCase();
  if (!Number.isFinite(id) || id <= 0 || !code) return null;
  return {
    id,
    code,
    tenantId: item.tenantId ?? item.tenant_id ?? null,
  };
}

/** Spring BankOption → `{ id, name, countryId, tenantId }`. */
export function normalizeBankOptionItem(item) {
  if (!item || typeof item !== "object") return null;
  const id = item.id != null ? Number(item.id) : NaN;
  const name = String(item.name ?? "").trim().toUpperCase();
  const countryId = item.countryId ?? item.country_id;
  if (!Number.isFinite(id) || id <= 0 || !name) return null;
  return {
    id,
    name,
    countryId: countryId != null ? Number(countryId) : null,
    tenantId: item.tenantId ?? item.tenant_id ?? null,
  };
}

/**
 * POST /api/bank-country-option/list-country
 * Body: JSON number tenantId
 */
export async function fetchBankCountriesByTenantId(tenantId, signal) {
  const tid = resolveBankProcessListTenantId(tenantId);
  if (!tid) throw new Error("tenantIdRequired");

  const res = await fetch(buildApiUrl("api/bank-country-option/list-country"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tid),
    signal,
  });
  const json = await parseJsonResponse(res);
  if (!res.ok || !isApiSuccess(json)) {
    throw new Error(json?.message || "failedToLoadCountries");
  }
  const rows = Array.isArray(json.data) ? json.data : [];
  return rows.map(normalizeBankCountryItem).filter(Boolean);
}

/**
 * POST /api/bank-country-option/list-bank-option
 * Body: `{ tenantId, countryId }`
 */
export async function fetchBankOptionsByCountryId(tenantId, countryId, signal) {
  const tid = resolveBankProcessListTenantId(tenantId);
  const cid = countryId != null ? Number(countryId) : NaN;
  if (!tid) throw new Error("tenantIdRequired");
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("countryIdRequired");

  const res = await fetch(buildApiUrl("api/bank-country-option/list-bank-option"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId: tid, countryId: cid }),
    signal,
  });
  const json = await parseJsonResponse(res);
  if (!res.ok || !isApiSuccess(json)) {
    throw new Error(json?.message || "failedToLoadBanks");
  }
  const rows = Array.isArray(json.data) ? json.data : [];
  return rows.map(normalizeBankOptionItem).filter(Boolean);
}

/**
 * POST /api/bank-country-option/insert-country
 * Body: `{ tenantId, code }`
 */
export async function insertBankCountry(tenantId, code, signal) {
  const tid = resolveBankProcessListTenantId(tenantId);
  const normalized = String(code ?? "").trim().toUpperCase();
  if (!tid) throw new Error("tenantIdRequired");
  if (!normalized) throw new Error("countryCodeRequired");

  const res = await fetch(buildApiUrl("api/bank-country-option/insert-country"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId: tid, code: normalized }),
    signal,
  });
  const json = await parseJsonResponse(res);
  if (!res.ok || !isApiSuccess(json)) {
    throw new Error(json?.message || "addCountryFailed");
  }
  const created = normalizeBankCountryItem(json.data);
  if (!created) throw new Error(json?.message || "addCountryFailed");
  return created;
}

/**
 * POST /api/bank-country-option/insert-bank-option
 * Body: `{ tenantId, countryId, name }`
 */
export async function insertBankOption(tenantId, countryId, name, signal) {
  const tid = resolveBankProcessListTenantId(tenantId);
  const cid = countryId != null ? Number(countryId) : NaN;
  const normalized = String(name ?? "").trim().toUpperCase();
  if (!tid) throw new Error("tenantIdRequired");
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("countryIdRequired");
  if (!normalized) throw new Error("bankNameRequired");

  const res = await fetch(buildApiUrl("api/bank-country-option/insert-bank-option"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId: tid, countryId: cid, name: normalized }),
    signal,
  });
  const json = await parseJsonResponse(res);
  if (!res.ok || !isApiSuccess(json)) {
    throw new Error(json?.message || "addBankFailed");
  }
  const created = normalizeBankOptionItem(json.data) || {
    id: json.data?.id != null ? Number(json.data.id) : null,
    name: normalized,
    countryId: cid,
    tenantId: tid,
  };
  if (!created?.id) throw new Error(json?.message || "addBankFailed");
  return created;
}

/**
 * POST /api/bank-country-option/delete-country
 * Body: `{ id, tenantId }`
 */
export async function deleteBankCountry(tenantId, countryId, signal) {
  const tid = resolveBankProcessListTenantId(tenantId);
  const id = countryId != null ? Number(countryId) : NaN;
  if (!tid) throw new Error("tenantIdRequired");
  if (!Number.isFinite(id) || id <= 0) throw new Error("countryIdRequired");

  const res = await fetch(buildApiUrl("api/bank-country-option/delete-country"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, tenantId: tid }),
    signal,
  });
  const json = await parseJsonResponse(res);
  if (!res.ok || !isApiSuccess(json)) {
    throw new Error(json?.message || "removeCountryFailed");
  }
  return true;
}

/**
 * POST /api/bank-country-option/delete-bank-option
 * Body: `{ id, tenantId, countryId }`
 */
export async function deleteBankOption(tenantId, bankOptionId, countryId, signal) {
  const tid = resolveBankProcessListTenantId(tenantId);
  const id = bankOptionId != null ? Number(bankOptionId) : NaN;
  const cid = countryId != null ? Number(countryId) : NaN;
  if (!tid) throw new Error("tenantIdRequired");
  if (!Number.isFinite(id) || id <= 0) throw new Error("bankOptionIdRequired");
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("countryIdRequired");

  const res = await fetch(buildApiUrl("api/bank-country-option/delete-bank-option"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, tenantId: tid, countryId: cid }),
    signal,
  });
  const json = await parseJsonResponse(res);
  if (!res.ok || !isApiSuccess(json)) {
    throw new Error(json?.message || "removeBankFailed");
  }
  return true;
}
