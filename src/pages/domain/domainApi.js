import { buildApiUrl } from "../../utils/core/apiUrl.js";
import { getSessionTenantCode, getSessionTenantId, isCurrentTenantC168 } from "../../utils/auth/sessionTenant.js";
import { getCachedOwnerCompanies } from "../../utils/company/sharedCompanyFilter.js";
import { fetchAccountListByTenantId, normalizeAccountListItem } from "../account/accountListApi.js";
import {
  featureModulesToPermissionNames,
  feeShareSpringToUi,
  feeShareUiToSpring,
  groupToTenantSaveEntry,
  companyToTenantSaveEntry,
  permissionNamesToFeatureModules,
  periodPricesUiToFeeDto,
} from "./domainHelpers.js";

async function postJson(path, body) {
  const res = await fetch(buildApiUrl(path), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function putJson(path, body) {
  const res = await fetch(buildApiUrl(path), {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

function normalizeTenantSaveEntry(entry) {
  if (!entry || typeof entry !== "object") return entry;
  const type = String(entry.tenantType ?? entry.tenant_type ?? "").toUpperCase();
  if (type === "GROUP") return groupToTenantSaveEntry(entry);
  if (type === "COMPANY") return companyToTenantSaveEntry(entry);
  if (entry.group_code != null) return groupToTenantSaveEntry(entry);
  return companyToTenantSaveEntry(entry);
}

function tenantRowFromAggregate(type, t, parentCode = null) {
  const code = String(t.code ?? "").trim().toUpperCase();
  const permissions = featureModulesToPermissionNames(t.featureModules ?? t.feature_modules);
  // feeShareSpringToUi is idempotent: Spring rows[] or already-UI {profit,sales,...}.
  const feeShareAllocations = feeShareSpringToUi(
    t.feeShareAllocations ?? t.fee_share_allocations
  );
  const expirationDate = t.expirationDate ?? t.expiration_date ?? null;
  if (type === "GROUP") {
    return {
      id: t.id,
      code,
      group_code: code,
      expiration_date: expirationDate,
      permissions: [],
      fee_share_allocations: feeShareAllocations,
      feature_modules: t.featureModules ?? t.feature_modules ?? [],
    };
  }
  return {
    id: t.id,
    code,
    company_id: code,
    expiration_date: expirationDate,
    parent_code: parentCode,
    group_id: parentCode,
    permissions,
    fee_share_allocations: feeShareAllocations,
    feature_modules: t.featureModules ?? t.feature_modules ?? [],
  };
}

/**
 * Flat List<OwnerTenantDTO> → one UI row per owner (list table + edit form).
 */
export function aggregateOwnerTenantRows(rows) {
  const ownerMap = new Map();

  for (const row of rows) {
    const o = row?.owner;
    const t = row?.tenant;
    if (!o?.id) continue;

    if (!ownerMap.has(o.id)) {
      ownerMap.set(o.id, {
        id: o.id,
        owner_code: o.ownerCode ?? o.owner_code ?? "",
        name: o.name ?? "",
        email: o.email ?? "",
        created_by: o.createdBy ?? o.created_by ?? "",
        created_at: o.createdAt ?? o.created_at ?? null,
        groups: [],
        companies: [],
      });
    }

    if (!t?.id) continue;

    const type = String(t.tenantType ?? t.tenant_type ?? "").toUpperCase();
    const entry = ownerMap.get(o.id);
    const permissions = featureModulesToPermissionNames(t.featureModules ?? t.feature_modules);
    const feeShareAllocations = feeShareSpringToUi(
      t.feeShareAllocations ?? t.fee_share_allocations
    );
    const base = {
      id: t.id,
      code: String(t.code ?? "").trim().toUpperCase(),
      expiration_date: t.expirationDate ?? t.expiration_date ?? null,
      feature_modules: t.featureModules ?? t.feature_modules ?? [],
      fee_share_allocations: feeShareAllocations,
      category_code: permissions,
      _parentId: t.parentId ?? t.parent_id ?? null,
    };

    if (type === "GROUP") {
      entry.groups.push({ ...base, permissions: [] });
    } else if (type === "COMPANY") {
      entry.companies.push({ ...base, permissions });
    }
  }

  const tenantIdToCode = new Map();
  for (const row of rows) {
    const t = row?.tenant;
    if (t?.id && t?.code) {
      tenantIdToCode.set(t.id, String(t.code).trim().toUpperCase());
    }
  }

  const listRows = [];
  for (const entry of ownerMap.values()) {
    entry.companies = entry.companies.map((c) => ({
      ...c,
      parent_code: c._parentId ? tenantIdToCode.get(c._parentId) ?? null : null,
    }));
    entry.groups.sort((a, b) => a.code.localeCompare(b.code));
    entry.companies.sort((a, b) => a.code.localeCompare(b.code));

    const groupsFull = entry.groups.map((g) =>
      tenantRowFromAggregate("GROUP", {
        id: g.id,
        code: g.code,
        expirationDate: g.expiration_date,
        featureModules: g.feature_modules,
        feeShareAllocations: g.fee_share_allocations,
      })
    );
    const companiesFull = entry.companies.map((c) =>
      tenantRowFromAggregate(
        "COMPANY",
        {
          id: c.id,
          code: c.code,
          expirationDate: c.expiration_date,
          featureModules: c.feature_modules,
          feeShareAllocations: c.fee_share_allocations,
        },
        c.parent_code
      )
    );

    listRows.push({
      id: entry.id,
      owner_code: entry.owner_code,
      name: entry.name,
      email: entry.email,
      created_by: entry.created_by,
      created_at: entry.created_at,
      group_ids: groupsFull.map((g) => g.group_code).join(","),
      groups_full: groupsFull,
      companies_full: companiesFull,
    });
  }

  listRows.sort((a, b) => String(a.owner_code).localeCompare(String(b.owner_code)));
  return listRows;
}

/**
 * Global tenant code uniqueness (aligns with DomainServiceImpl duplicate checks).
 * excludeOwnerId: when editing, skip codes belonging to this owner.
 */
export function validateTenantCodeGlobally(code, { excludeOwnerId, domains = [] } = {}) {
  const want = String(code ?? "").trim().toUpperCase();
  if (!want) {
    return { ok: false, message: "codeRequired" };
  }
  if (want === "C168") {
    return { ok: false, message: "cannotRenameToC168" };
  }

  for (const owner of domains) {
    if (excludeOwnerId != null && Number(owner.id) === Number(excludeOwnerId)) {
      continue;
    }
    const groups = Array.isArray(owner.groups_full) ? owner.groups_full : [];
    const companies = Array.isArray(owner.companies_full) ? owner.companies_full : [];
    for (const g of groups) {
      if (String(g.group_code ?? "").trim().toUpperCase() === want) {
        return { ok: false, message: "tenantCodeAlreadyExists" };
      }
    }
    for (const c of companies) {
      if (String(c.company_id ?? "").trim().toUpperCase() === want) {
        return { ok: false, message: "tenantCodeAlreadyExists" };
      }
    }
  }
  return { ok: true };
}

/**
 * @param {number|string|null|undefined} ownerId — optional filter (`?ownerId=`); omit for all owners
 */
export async function fetchDomainList(ownerId) {
  const id = Number(ownerId);
  const qs = Number.isFinite(id) && id > 0 ? `?ownerId=${encodeURIComponent(id)}` : "";
  const { res, json } = await postJson(`api/domain/list${qs}`);
  if (!res.ok || !json?.success) {
    throw new Error(json?.message || "Failed to load domains");
  }
  const rawRows = Array.isArray(json?.data) ? json.data : [];
  return aggregateOwnerTenantRows(rawRows);
}

export async function fetchDomainFeeSettings() {
  const { res, json } = await postJson("api/domain/list-fee");
  if (!res.ok || !json?.success) {
    throw new Error(json?.message || "Failed to load domain fee settings");
  }
  const row = Array.isArray(json?.data) ? json.data[0] : json?.data;
  return row ?? null;
}

export async function saveDomainFeeSettings({ companyPeriodPrices, groupPeriodPrices }) {
  const body = {
    company_period_prices: periodPricesUiToFeeDto(companyPeriodPrices),
    group_period_prices: periodPricesUiToFeeDto(groupPeriodPrices),
  };
  const { res, json } = await postJson("api/domain/add-fee", body);
  if (!res.ok || !json?.success) {
    throw new Error(json?.message || "Failed to save domain fee settings");
  }
  return json.data ?? null;
}

export async function createDomain({
  ownerCode,
  name,
  email,
  password,
  secondaryPassword,
  groups,
  companies,
}) {
  const { res, json } = await postJson("api/domain/add", {
    owner_code: ownerCode,
    name,
    email,
    password,
    secondary_password: secondaryPassword,
    groups: (groups || []).map(normalizeTenantSaveEntry),
    companies: (companies || []).map(normalizeTenantSaveEntry),
  });
  return { res, json };
}

export async function updateDomain({
  id,
  ownerCode,
  name,
  email,
  password,
  secondaryPassword,
  groups,
  companies,
}) {
  const body = {
    id,
    owner_code: ownerCode,
    name,
    email,
    groups: (groups || []).map(normalizeTenantSaveEntry),
    companies: (companies || []).map(normalizeTenantSaveEntry),
  };
  if (password) body.password = password;
  if (secondaryPassword) body.secondary_password = secondaryPassword;
  const { res, json } = await putJson("api/domain/update", body);
  return { res, json };
}

export async function deleteOwner(ownerId) {
  const { res, json } = await postJson("api/domain/delete", { id: ownerId });
  return { res, json };
}

export async function updateTenantSetting({
  id,
  code,
  ownerId,
  expirationDate,
  permissions,
  feeShareAllocations,
  chargeDomainFeeOnConfirm,
  domainFeePeriod,
}) {
  const body = {
    id,
    code,
    ownerId,
    expirationDate: expirationDate || null,
  };

  if (permissions != null) {
    body.featureModules = permissionNamesToFeatureModules(permissions);
  }
  if (feeShareAllocations != null) {
    body.feeShareAllocations = feeShareUiToSpring(feeShareAllocations, id);
  }
  // Domain Confirm "Charge on Save": only charge when explicitly on for this tenant.
  if (chargeDomainFeeOnConfirm) {
    body.chargeDomainFeeOnConfirm = true;
    body.domainFeePeriod = domainFeePeriod || null;
  }

  const { res, json } = await putJson("api/domain/update-setting", body);
  return { res, json };
}

/** Merge tenant ids from Spring DomainDTO response (camelCase Tenant list). */
export function mergeTenantIdsFromDomainResponse(tempGroups, tempCompanies, data) {
  const groupByCode = new Map();
  const companyByCode = new Map();
  for (const g of data?.groups || []) {
    const code = String(g.code ?? "").trim().toUpperCase();
    if (code && g.id) groupByCode.set(code, g.id);
  }
  for (const c of data?.companies || []) {
    const code = String(c.code ?? "").trim().toUpperCase();
    if (code && c.id) companyByCode.set(code, c.id);
  }

  const groups = (tempGroups || []).map((g) => {
    const code = String(g.group_code ?? g.code ?? "").trim().toUpperCase();
    const id = groupByCode.get(code) ?? g.id ?? null;
    return id ? { ...g, id, group_code: code } : { ...g, group_code: code };
  });
  const companies = (tempCompanies || []).map((c) => {
    const code = String(c.company_id ?? c.code ?? "").trim().toUpperCase();
    const id = companyByCode.get(code) ?? c.id ?? null;
    return id ? { ...c, id, company_id: code } : { ...c, company_id: code };
  });
  return { groups, companies };
}

/** Persist feature modules + fee share for all tenants (post create/update skeleton). */
export async function syncAllTenantSettings(ownerId, tempGroups, tempCompanies) {
  const errors = [];
  for (const g of tempGroups || []) {
    const tenantId = g.id;
    const code = String(g.group_code ?? g.code ?? "").trim().toUpperCase();
    if (!tenantId || !code) continue;
    const { json } = await updateTenantSetting({
      id: tenantId,
      code,
      ownerId,
      expirationDate: g.expiration_date ?? null,
      permissions: [],
      feeShareAllocations: g.fee_share_allocations,
      chargeDomainFeeOnConfirm: !!g.apply_commission_payments_on_domain_save,
      domainFeePeriod: g.selectedPeriod ?? null,
    });
    if (!json?.success) errors.push(json?.message || `Failed to save group ${code}`);
  }
  for (const c of tempCompanies || []) {
    const tenantId = c.id;
    const code = String(c.company_id ?? c.code ?? "").trim().toUpperCase();
    if (!tenantId || !code) continue;
    const { json } = await updateTenantSetting({
      id: tenantId,
      code,
      ownerId,
      expirationDate: c.expiration_date ?? null,
      permissions: Array.isArray(c.permissions) ? c.permissions : [],
      feeShareAllocations: c.fee_share_allocations,
      chargeDomainFeeOnConfirm: !!c.apply_commission_payments_on_domain_save,
      domainFeePeriod: c.selectedPeriod ?? null,
    });
    if (!json?.success) errors.push(json?.message || `Failed to save company ${code}`);
  }
  if (errors.length) {
    throw new Error(errors[0]);
  }
}

const SHARE_PICKER_ROLES = {
  profit: new Set(["PROFIT"]),
  sales: new Set(["STAFF", "AGENT"]),
  cs: new Set(["STAFF", "AGENT"]),
  it: new Set(["STAFF", "AGENT"]),
};

function findC168OwnerCompanyRow(companies = null) {
  const rows = companies || getCachedOwnerCompanies() || [];
  return rows.find(
    (c) =>
      String(c.tenant_code ?? c.company_id ?? c.code ?? "")
        .trim()
        .toUpperCase() === "C168",
  );
}

/** C168 ledger tenant.id for Domain Share % account list / Add Account modal. */
export function resolveShareLedgerTenantId(me, companies = null) {
  const sessionId = getSessionTenantId(me);
  const sessionCode = getSessionTenantCode(me);
  if (sessionId && (isCurrentTenantC168(me) || sessionCode === "C168")) {
    return sessionId;
  }
  const c168Row = findC168OwnerCompanyRow(companies);
  const fromList = Number(c168Row?.id ?? c168Row?.tenant_id);
  if (Number.isFinite(fromList) && fromList > 0) return fromList;
  return sessionId;
}

/** C168 ledger tenant code for Share % Add Account picker label. */
export function resolveShareLedgerTenantCode(me, companies = null) {
  const sessionCode = getSessionTenantCode(me);
  if (sessionCode === "C168") return "C168";
  const c168Row = findC168OwnerCompanyRow(companies);
  const fromList = String(c168Row?.tenant_code ?? c168Row?.company_id ?? c168Row?.code ?? "")
    .trim()
    .toUpperCase();
  if (fromList === "C168") return "C168";
  return sessionCode || "C168";
}

/** C168 ledger accounts for Domain Share % pickers (Spring account list). */
export async function fetchShareAccountsForTenant(tenantId, { signal } = {}) {
  const rows = await fetchAccountListByTenantId(tenantId, signal);
  const active = rows
    .map(normalizeAccountListItem)
    .filter((a) => a && String(a.status || "").toLowerCase() === "active");

  const accounts = [];
  const accountsProfit = [];
  for (const a of active) {
    const role = String(a.role || "").trim().toUpperCase();
    const entry = { id: a.id, account_id: a.account_id, name: a.name, role };
    if (role === "PROFIT" || String(a.account_id || "").toUpperCase() === "PROFIT") {
      accountsProfit.push(entry);
    }
    if (SHARE_PICKER_ROLES.sales.has(role)) {
      accounts.push(entry);
    }
  }

  return {
    accounts,
    accounts_profit: accountsProfit,
  };
}
