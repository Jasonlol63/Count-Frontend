/** Account list — Spring Boot `/api/account/*` (tenant-scoped member rows). */

import { buildApiUrl } from "../../utils/core/apiUrl.js";

/** company.id in the picker === tenant.id in the backend. */
export function resolveAccountListTenantId(companyId) {
  const tid = companyId != null ? Number(companyId) : Number.NaN;
  return Number.isFinite(tid) && tid > 0 ? tid : null;
}

/** Spring UserListDTO → page row (snake_case). */
export function normalizeAccountListItem(item) {
  if (!item || typeof item !== "object") return null;
  const status = item.status != null ? String(item.status).toLowerCase() : "active";
  return {
    id: item.id,
    account_id: item.accountId ?? item.account_id ?? "",
    name: item.name ?? "",
    role: item.role ?? "",
    password: item.password ?? "",
    status,
    payment_alert: item.paymentAlert ?? item.payment_alert ?? 0,
    alert_type: item.alertDay ?? item.alert_type ?? item.alert_day ?? "",
    alert_day: item.alertDay ?? item.alert_day ?? "",
    alert_start_date: item.alertSpecificDate ?? item.alert_start_date ?? item.alert_specific_date ?? "",
    alert_specific_date: item.alertSpecificDate ?? item.alert_specific_date ?? "",
    alert_amount: item.alertAmount ?? item.alert_amount ?? "",
    remark: item.remark ?? "",
    last_login: item.lastLogin ?? item.last_login ?? null,
    tenant_access_id: item.tenantAccessId ?? item.tenant_access_id ?? null,
    scope_tenant_id: item.scopeTenantId ?? item.scope_tenant_id ?? null,
  };
}

/** Client-side filters (Spring list has no search/status query params yet). */
export function filterAccountListRows(
  rows,
  { searchTerm = "", showInactive = false, showAll = false, applyStatusFilter = true } = {},
) {
  let out = Array.isArray(rows) ? [...rows] : [];
  const term = String(searchTerm || "").trim().toLowerCase();
  if (term) {
    out = out.filter((a) => {
      const parts = [a.account_id, a.name, a.role, a.status, a.remark].map((v) =>
        String(v || "").toLowerCase(),
      );
      return parts.some((p) => p.includes(term));
    });
  }
  if (!applyStatusFilter) return out;
  if (showAll && showInactive) {
    out = out.filter((a) => String(a.status || "").toLowerCase() === "inactive");
  } else if (showAll) {
    out = out.filter((a) => String(a.status || "").toLowerCase() === "active");
  } else if (showInactive) {
    out = out.filter((a) => String(a.status || "").toLowerCase() === "inactive");
  } else {
    out = out.filter((a) => String(a.status || "").toLowerCase() === "active");
  }
  return out;
}

/**
 * POST /api/account/list?tenant_id=
 * @returns {Promise<object[]>} normalized rows (unfiltered)
 */
export async function fetchAccountListByTenantId(tenantId, signal) {
  const tid = resolveAccountListTenantId(tenantId);
  if (!tid) throw new Error("tenantIdRequired");

  const res = await fetch(buildApiUrl(`api/account/list?tenant_id=${encodeURIComponent(tid)}`), {
    method: "POST",
    credentials: "include",
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json?.message || "failedToLoadAccounts");
  }
  const rows = Array.isArray(json.data) ? json.data : [];
  return rows.map(normalizeAccountListItem).filter(Boolean);
}

function normalizeAccountCurrencyIds(currencyIds) {
  if (!Array.isArray(currencyIds)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of currencyIds) {
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function buildAccountCreateRequest(form, scopeTenantId, currencyIds = []) {
  return {
    accountId: String(form.account_id || "").trim(),
    name: String(form.name || "").trim(),
    role: String(form.role || "").trim(),
    password: String(form.password || ""),
    remark: form.remark ?? "",
    paymentAlert: Number(form.payment_alert) === 1 ? 1 : 0,
    alertDay: form.alert_type || form.alert_day || null,
    alertSpecificDate: form.alert_start_date || form.alert_specific_date || null,
    alertAmount:
      form.alert_amount !== "" && form.alert_amount != null ? form.alert_amount : null,
    scopeTenantId: Number(scopeTenantId),
    currencyIds: normalizeAccountCurrencyIds(currencyIds),
  };
}

export function buildAccountUpdateRequest(form, scopeTenantId, currencyIds = []) {
  const body = buildAccountCreateRequest(form, scopeTenantId, currencyIds);
  body.id = Number(form.id);
  if (!String(form.password ?? "").trim()) delete body.password;
  return body;
}

/** Map list row → edit modal form (password left blank — update keeps existing when omitted). */
export function accountRowToEditForm(row) {
  if (!row || typeof row !== "object") return null;
  return {
    id: row.id,
    scope_tenant_id: row.scope_tenant_id ?? null,
    account_id: String(row.account_id || ""),
    name: String(row.name || ""),
    role: row.role || "",
    password: "",
    remark: row.remark ?? "",
    payment_alert: String(Number(row.payment_alert) === 1 ? "1" : "0"),
    alert_type: row.alert_type || row.alert_day || "",
    alert_start_date: row.alert_start_date || row.alert_specific_date || "",
    alert_amount: row.alert_amount ?? "",
  };
}

/**
 * Active tenant for Spring `/api/account/*`.
 * Picker `company.id` === `tenant.id` (account_tenant_access.tenant_id).
 */
export function resolveActiveScopeTenantId({
  companyId = null,
  scopeTenantId = null,
  form = null,
} = {}) {
  const fromExplicit = resolveAccountListTenantId(scopeTenantId);
  if (fromExplicit) return fromExplicit;
  const fromForm =
    form?.scope_tenant_id != null ? resolveAccountListTenantId(form.scope_tenant_id) : null;
  if (fromForm) return fromForm;
  return resolveAccountListTenantId(companyId);
}

/** Modal company summary — tenant id(s) as picker row ids (UI labels unchanged). */
export function tenantIdToPickerCompanyIds(tenantId) {
  const tid = resolveAccountListTenantId(tenantId);
  return tid ? [String(tid)] : [];
}

/** POST /api/account/add */
export async function createAccountUser(request, signal) {
  const res = await fetch(buildApiUrl("api/account/add"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(request),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json?.message || "saveFailed");
  return normalizeAccountListItem(json.data);
}

/** POST /api/account/update */
export async function updateAccountUser(request, signal) {
  const res = await fetch(buildApiUrl("api/account/update"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(request),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json?.message || "saveFailed");
  return normalizeAccountListItem(json.data);
}

/** POST /api/account/updateStatus */
export async function toggleAccountUserStatus({ id, scopeTenantId }, signal) {
  const userId = Number(id);
  const tenantId = Number(scopeTenantId);
  if (!Number.isFinite(userId) || userId <= 0 || !Number.isFinite(tenantId) || tenantId <= 0) {
    throw new Error("invalidRequest");
  }

  const res = await fetch(buildApiUrl("api/account/updateStatus"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ id: userId, scopeTenantId: tenantId }),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json?.message || "toggleFailed");
  return normalizeAccountListItem(json.data);
}

/** POST /api/account/delete */
export async function deleteAccountUser({ id, scopeTenantId }, signal) {
  const userId = Number(id);
  const tenantId = Number(scopeTenantId);
  if (!Number.isFinite(userId) || userId <= 0 || !Number.isFinite(tenantId) || tenantId <= 0) {
    throw new Error("invalidRequest");
  }

  const res = await fetch(buildApiUrl("api/account/delete"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ id: userId, scopeTenantId: tenantId }),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json?.message || "deleteFailed");
}

/** scope_tenant_id on row, else active company pill id. */
export function resolveRowScopeTenantId(row, fallbackCompanyId = null) {
  const fromRow = resolveAccountListTenantId(row?.scope_tenant_id);
  if (fromRow) return fromRow;
  return resolveAccountListTenantId(fallbackCompanyId);
}

/**
 * POST /api/account/list + client filters.
 * @returns {Promise<object[]>}
 */
export async function fetchFilteredAccountListByTenantId(
  tenantId,
  { searchTerm = "", showInactive = false, showAll = false } = {},
  signal,
) {
  const rows = await fetchAccountListByTenantId(tenantId, signal);
  return filterAccountListRows(rows, { searchTerm, showInactive, showAll });
}

/**
 * Merge account lists across tenant ids (dedupe by account id), then filter.
 * @returns {Promise<object[]>}
 */
export async function fetchMergedAccountLists(
  { tenantIds = [], searchTerm = "", showInactive = false, showAll = false } = {},
  signal,
) {
  const ids = [
    ...new Set(
      (Array.isArray(tenantIds) ? tenantIds : [])
        .map((raw) => Number(raw))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ];
  if (!ids.length) return [];

  const slices = await Promise.all(
    ids.map((tid) =>
      fetchAccountListByTenantId(tid, signal).catch(() => []),
    ),
  );
  const byId = new Map();
  for (const rows of slices) {
    for (const row of rows) {
      const id = Number(row?.id);
      if (Number.isFinite(id) && id > 0) byId.set(id, row);
    }
  }
  return filterAccountListRows([...byId.values()], { searchTerm, showInactive, showAll });
}

function springLinkTypeToUi(value) {
  return String(value || "bidirectional").trim().toLowerCase();
}

function uiLinkTypeToSpring(value) {
  const key = String(value || "bidirectional").trim().toUpperCase();
  return key === "UNIDIRECTIONAL" ? "UNIDIRECTIONAL" : "BIDIRECTIONAL";
}

function normalizeLinkedAccountRow(raw) {
  const item = normalizeAccountListItem(raw);
  if (!item) return null;
  return item;
}

/** GET /api/account/link/list?account_id=&tenant_id= */
export async function fetchAccountLinkedAccounts(accountId, tenantId, signal) {
  const aid = Number(accountId);
  const tid = Number(tenantId);
  if (!Number.isFinite(aid) || aid <= 0 || !Number.isFinite(tid) || tid <= 0) {
    throw new Error("invalidRequest");
  }

  const params = new URLSearchParams({
    account_id: String(aid),
    tenant_id: String(tid),
  });
  const res = await fetch(buildApiUrl(`api/account/link/list?${params}`), {
    credentials: "include",
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json?.message || "failedToLoadAccountLinks");
  }

  const data = json.data && typeof json.data === "object" ? json.data : {};
  const accounts = (Array.isArray(data.accounts) ? data.accounts : [])
    .map(normalizeLinkedAccountRow)
    .filter(Boolean);
  const linkTypesMap = {};
  const rawMap = data.link_types_map || data.linkTypesMap || {};
  for (const [key, value] of Object.entries(rawMap)) {
    linkTypesMap[Number(key)] = springLinkTypeToUi(value);
  }

  return {
    accounts,
    linkTypesMap,
    tenantId: Number(data.tenant_id ?? data.tenantId ?? tid),
  };
}

/** POST /api/account/link */
export async function linkAccountPair(
  { accountId1, accountId2, linkType = "bidirectional", sourceAccountId = null },
  signal,
) {
  const a1 = Number(accountId1);
  const a2 = Number(accountId2);
  if (!Number.isFinite(a1) || a1 <= 0 || !Number.isFinite(a2) || a2 <= 0) {
    throw new Error("invalidRequest");
  }

  const body = {
    accountId1: a1,
    accountId2: a2,
    linkType: uiLinkTypeToSpring(linkType),
  };
  const source = Number(sourceAccountId);
  if (uiLinkTypeToSpring(linkType) === "UNIDIRECTIONAL" && Number.isFinite(source) && source > 0) {
    body.sourceAccountId = source;
  }

  const res = await fetch(buildApiUrl("api/account/link"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json?.message || "failedSaveAccountLinks");
  return json;
}

/** DELETE /api/account/link/pair */
export async function unlinkAccountPair({ accountId1, accountId2, tenantId }, signal) {
  const a1 = Number(accountId1);
  const a2 = Number(accountId2);
  const tid = Number(tenantId);
  if (!Number.isFinite(a1) || a1 <= 0 || !Number.isFinite(a2) || a2 <= 0 || !Number.isFinite(tid) || tid <= 0) {
    throw new Error("invalidRequest");
  }

  const params = new URLSearchParams({
    account_id_1: String(a1),
    account_id_2: String(a2),
    tenant_id: String(tid),
  });
  const res = await fetch(buildApiUrl(`api/account/link/pair?${params}`), {
    method: "DELETE",
    credentials: "include",
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json?.message || "failedSaveAccountLinks");
  return json;
}

/** PUT /api/account/link — delete pair then re-insert with new link type. */
export async function updateAccountLinkPair(
  { accountId1, accountId2, linkType = "bidirectional", sourceAccountId = null },
  signal,
) {
  const a1 = Number(accountId1);
  const a2 = Number(accountId2);
  if (!Number.isFinite(a1) || a1 <= 0 || !Number.isFinite(a2) || a2 <= 0) {
    throw new Error("invalidRequest");
  }

  const body = {
    accountId1: a1,
    accountId2: a2,
    linkType: uiLinkTypeToSpring(linkType),
  };
  const source = Number(sourceAccountId);
  if (uiLinkTypeToSpring(linkType) === "UNIDIRECTIONAL" && Number.isFinite(source) && source > 0) {
    body.sourceAccountId = source;
  }

  const res = await fetch(buildApiUrl("api/account/link"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json?.message || "failedSaveAccountLinks");
  return json;
}

/** Flip payment_alert via POST /api/account/update (preserves currencyIds). */
export async function toggleAccountUserPaymentAlert(row, scopeTenantId, currencyIds, signal) {
  const form = accountRowToEditForm(row);
  if (!form) throw new Error("invalidRequest");
  form.payment_alert = Number(row.payment_alert) === 1 ? "0" : "1";
  const request = buildAccountUpdateRequest(form, scopeTenantId, currencyIds);
  return updateAccountUser(request, signal);
}
