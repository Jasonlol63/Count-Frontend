/** Tenant currency master — Spring Boot `/api/currency/*`. */

import { buildApiUrl } from "../core/apiUrl.js";
import { applyTenantLedgerToParams, LEDGER_GROUP } from "../company/tenantLedgerParams.js";
import { resolveListTenantId } from "../../pages/userlist/userListApi.js";

export const resolveCurrencyTenantId = resolveListTenantId;

/** Resolve tenant.id from ledger scope + page context (company pill id === tenant.id). */
export function resolveCurrencyTenantIdFromScope({
  ledgerScope = null,
  companyId = null,
  anchorCompanyId = null,
  selectedCompanyIds = [],
} = {}) {
  const groupOnly = ledgerScope?.ledger === LEDGER_GROUP;
  const scopeCompanyId =
    ledgerScope?.ledger === LEDGER_GROUP ? null : ledgerScope?.companyId ?? companyId;

  const fromSelected = (selectedCompanyIds || [])
    .map((id) => Number(id))
    .find((id) => Number.isFinite(id) && id > 0);

  return resolveCurrencyTenantId({
    companyId: scopeCompanyId ?? fromSelected ?? companyId,
    groupOnly,
    anchorCompanyId,
    scopeCompanyId: companyId,
  });
}

function normalizeSyncSource(raw) {
  const value = String(raw?.syncSource ?? raw?.sync_source ?? "MANUAL").trim().toUpperCase();
  return value === "SUBSIDIARY" ? "subsidiary" : "manual";
}

/** Map Spring currency JSON → UI row shape used across account modals. */
export function normalizeCurrencyRow(raw, { isLinked = false } = {}) {
  const syncSource = normalizeSyncSource(raw);
  const linked =
    raw?.is_linked != null
      ? !!raw.is_linked
      : raw?.isLinked != null
        ? !!raw.isLinked
        : raw?.linked != null
          ? !!raw.linked
          : !!isLinked;
  const deletable =
    raw?.deletable != null ? !!raw.deletable : syncSource !== "subsidiary";
  return {
    id: Number(raw?.id),
    code: String(raw?.code ?? ""),
    is_linked: linked,
    sync_source: syncSource,
    deletable,
  };
}

async function parseJsonResponse(res) {
  const json = await res.json();
  return { res, json };
}

/**
 * POST /api/currency/list?tenant_id=
 * @returns {Promise<object[]>} raw Spring currency rows
 */
export async function fetchCurrencyListByTenantId(tenantId, signal) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) {
    throw new Error("tenantIdRequired");
  }

  const { res, json } = await parseJsonResponse(
    await fetch(buildApiUrl(`api/currency/list?tenant_id=${encodeURIComponent(tid)}`), {
      method: "POST",
      credentials: "include",
      signal,
    }),
  );

  if (!res.ok || !json.success) {
    throw new Error(json?.message || "failedToLoadCurrencies");
  }

  return Array.isArray(json.data) ? json.data : [];
}

/**
 * POST /api/currency/available?tenant_id=&account_id=
 * @returns {Promise<object[]>} raw Spring rows with is_linked
 */
async function fetchAvailableCurrenciesFromSpring(tenantId, accountId, signal) {
  const params = new URLSearchParams({ tenant_id: String(tenantId) });
  const aid = Number(accountId);
  if (Number.isFinite(aid) && aid > 0) {
    params.set("account_id", String(aid));
  }

  const { res, json } = await parseJsonResponse(
    await fetch(buildApiUrl(`api/currency/available?${params}`), {
      method: "POST",
      credentials: "include",
      signal,
    }),
  );

  if (!res.ok || !json.success) {
    throw new Error(json?.message || "failedToLoadCurrencies");
  }

  return Array.isArray(json.data) ? json.data : [];
}

/**
 * Tenant currencies for account modals (Spring `/api/currency/available`).
 * @returns {Promise<object[]>}
 */
export async function fetchAvailableCurrencies(
  {
    tenantId = null,
    ledgerScope = null,
    companyId = null,
    anchorCompanyId = null,
    selectedCompanyIds = [],
    accountId = null,
  } = {},
  signal,
) {
  const tid =
    tenantId != null
      ? Number(tenantId)
      : resolveCurrencyTenantIdFromScope({
          ledgerScope,
          companyId,
          anchorCompanyId,
          selectedCompanyIds,
        });

  if (!Number.isFinite(tid) || tid <= 0) {
    throw new Error("tenantIdRequired");
  }

  const rows = await fetchAvailableCurrenciesFromSpring(tid, accountId, signal);

  return rows
    .map((row) => normalizeCurrencyRow(row))
    .filter((row) => Number.isFinite(row.id) && row.id > 0);
}

function normalizeLinkedAccountRow(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = Number(raw.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    id,
    name: String(raw.name ?? ""),
    account_id: String(raw.account_id ?? raw.accountId ?? ""),
  };
}

/**
 * POST /api/currency/account/linked-accounts?currency_id=&tenant_id=
 * @returns {Promise<{ linkedAccountIds: number[], linkedAccounts: object[] }>}
 */
export async function fetchLinkedAccountsByCurrency(
  { currencyId, tenantId },
  signal,
) {
  const cid = Number(currencyId);
  const tid = Number(tenantId);
  if (!Number.isFinite(cid) || cid <= 0 || !Number.isFinite(tid) || tid <= 0) {
    throw new Error("invalidRequest");
  }

  const params = new URLSearchParams({
    currency_id: String(cid),
    tenant_id: String(tid),
  });

  const { res, json } = await parseJsonResponse(
    await fetch(buildApiUrl(`api/currency/account/linked-accounts?${params}`), {
      method: "POST",
      credentials: "include",
      signal,
    }),
  );

  if (!res.ok || !json.success) {
    throw new Error(json?.message || "failedToLoadLinkedAccounts");
  }

  const linkedAccountIds = (json.data?.linked_account_ids || [])
    .map(Number)
    .filter((id) => Number.isFinite(id) && id > 0);

  const linkedAccounts = (Array.isArray(json.data?.linked_accounts) ? json.data.linked_accounts : [])
    .map(normalizeLinkedAccountRow)
    .filter(Boolean);

  return { linkedAccountIds, linkedAccounts };
}

/**
 * POST /api/currency/account/linked-accounts-update
 * Currency Setting bulk link / unlink accounts for one currency.
 */
export async function bulkUpdateAccountCurrency(
  {
    tenantId,
    currencyId,
    linkedAccountIds = [],
    unlinkedAccountIds = [],
  },
  signal,
) {
  const tid = Number(tenantId);
  const cid = Number(currencyId);
  if (!Number.isFinite(tid) || tid <= 0 || !Number.isFinite(cid) || cid <= 0) {
    throw new Error("invalidRequest");
  }

  const linked = (Array.isArray(linkedAccountIds) ? linkedAccountIds : [])
    .map(Number)
    .filter((id) => Number.isFinite(id) && id > 0);
  const unlinked = (Array.isArray(unlinkedAccountIds) ? unlinkedAccountIds : [])
    .map(Number)
    .filter((id) => Number.isFinite(id) && id > 0);

  const { res, json } = await parseJsonResponse(
    await fetch(buildApiUrl("api/currency/account/linked-accounts-update"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        tenantId: tid,
        currencyId: cid,
        linked_account_ids: linked,
        unlinked_account_ids: unlinked,
      }),
      signal,
    }),
  );

  if (!res.ok || !json.success) {
    throw new Error(json?.message || "saveFailed");
  }

  return json;
}

/**
 * POST /api/currency/add
 * @returns {Promise<{ id: number, code: string }>}
 */
export async function createCurrency(
  {
    code,
    tenantId = null,
    ledgerScope = null,
    companyId = null,
    anchorCompanyId = null,
    selectedCompanyIds = [],
  },
  signal,
) {
  const normalizedCode = String(code || "")
    .trim()
    .toUpperCase();
  if (!normalizedCode) {
    throw new Error("currencyCodeRequired");
  }

  const tid =
    tenantId != null
      ? Number(tenantId)
      : resolveCurrencyTenantIdFromScope({
          ledgerScope,
          companyId,
          anchorCompanyId,
          selectedCompanyIds,
        });

  if (!Number.isFinite(tid) || tid <= 0) {
    throw new Error("tenantIdRequired");
  }

  const { res, json } = await parseJsonResponse(
    await fetch(buildApiUrl("api/currency/add"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ tenantId: String(tid), code: normalizedCode }),
      signal,
    }),
  );

  if (!res.ok || !json.success || !json.data) {
    const err = new Error(json?.message || "createFailed");
    err.response = json;
    throw err;
  }

  return {
    id: Number(json.data.id),
    code: String(json.data.code ?? normalizedCode),
  };
}

/**
 * POST /api/currency/delete?id=&tenantId=
 * When `force` is true, falls back to legacy PHP (usage checks / cascade).
 */
export async function deleteCurrency(
  {
    id,
    tenantId = null,
    ledgerScope = null,
    companyId = null,
    anchorCompanyId = null,
    force = false,
  },
  signal,
) {
  const currencyId = Number(id);
  if (!Number.isFinite(currencyId) || currencyId <= 0) {
    throw new Error("invalidRequest");
  }

  const tid =
    tenantId != null
      ? Number(tenantId)
      : resolveCurrencyTenantIdFromScope({ ledgerScope, companyId });

  if (!Number.isFinite(tid) || tid <= 0) {
    throw new Error("tenantIdRequired");
  }

  if (force) {
    const deleteUrl = new URL(buildApiUrl("api/accounts/delete_currency_api.php"));
    if (ledgerScope) applyTenantLedgerToParams(deleteUrl.searchParams, ledgerScope);
    const payload = { id: currencyId, force: true };
    if (ledgerScope?.ledger === LEDGER_GROUP) {
      payload.group_only = true;
      if (ledgerScope.groupId) payload.group_id = ledgerScope.groupId;
    } else {
      if (ledgerScope?.companyId) payload.company_id = ledgerScope.companyId;
      if (ledgerScope?.groupId) payload.group_id = ledgerScope.groupId;
    }

    const { res, json } = await parseJsonResponse(
      await fetch(deleteUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
        signal,
      }),
    );

    return {
      success: Boolean(json.success),
      message: String(json.message || json.error || ""),
      data: json.data ?? null,
      status: res.status,
    };
  }

  const { res, json } = await parseJsonResponse(
    await fetch(
      buildApiUrl(
        `api/currency/delete?id=${encodeURIComponent(currencyId)}&tenantId=${encodeURIComponent(tid)}`,
      ),
      {
        method: "POST",
        credentials: "include",
        signal,
      },
    ),
  );

  return {
    success: Boolean(json.success),
    message: String(json.message || json.error || ""),
    data: json.data ?? null,
    status: res.status,
  };
}
