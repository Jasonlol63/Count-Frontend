import { buildApiUrl } from "../../utils/core/apiUrl.js";
import {
  featureModulesToPermissionNames,
  feeShareSpringToUi,
  feeShareUiToSpring,
  groupToTenantSaveEntry,
  companyToTenantSaveEntry,
  permissionNamesToFeatureModules,
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

/**
 * Aggregate a flat List<OwnerTenantDTO> from Spring Boot
 * (each row = { owner:{...}, tenant:{...} }) into the shape the UI expects:
 * one entry per owner with groups[] and companies[].
 */
function aggregateOwnerTenantRows(rows) {
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

    const entry = ownerMap.get(o.id);

    if (t?.id) {
      const type = String(t.tenantType ?? t.tenant_type ?? "").toUpperCase();
      const code = String(t.code ?? "").trim().toUpperCase();
      const expDate = t.expirationDate ?? t.expiration_date ?? null;
      const permissions = featureModulesToPermissionNames(
        t.featureModules ?? t.feature_modules
      );
      const legacyCategory = t.categoryCode ?? t.category_code;
      const categoryCode = permissions.length
        ? permissions
        : Array.isArray(legacyCategory)
          ? legacyCategory
          : [];
      const feeShareAllocations = feeShareSpringToUi(
        t.feeShareAllocations ?? t.fee_share_allocations
      );

      if (type === "GROUP") {
        entry.groups.push({
          id: t.id,
          code,
          expiration_date: expDate,
          category_code: categoryCode,
          feature_modules: t.featureModules ?? t.feature_modules ?? [],
          fee_share_allocations: feeShareAllocations,
        });
      } else if (type === "COMPANY") {
        entry.companies.push({
          id: t.id,
          code,
          expiration_date: expDate,
          category_code: categoryCode,
          feature_modules: t.featureModules ?? t.feature_modules ?? [],
          fee_share_allocations: feeShareAllocations,
          _parentId: t.parentId ?? t.parent_id ?? null,
        });
      }
    }
  }

  const tenantIdToCode = new Map();
  for (const row of rows) {
    const t = row?.tenant;
    if (t?.id && t?.code) {
      tenantIdToCode.set(t.id, String(t.code).trim().toUpperCase());
    }
  }

  for (const entry of ownerMap.values()) {
    entry.companies = entry.companies.map((c) => {
      const parentCode = c._parentId ? (tenantIdToCode.get(c._parentId) ?? null) : null;
      return {
        id: c.id,
        code: c.code,
        expiration_date: c.expiration_date,
        parent_code: parentCode,
        category_code: c.category_code || [],
        feature_modules: c.feature_modules || [],
        fee_share_allocations: c.fee_share_allocations,
      };
    });
    entry.groups.sort((a, b) => a.code.localeCompare(b.code));
    entry.companies.sort((a, b) => a.code.localeCompare(b.code));
  }

  return Array.from(ownerMap.values());
}

export async function fetchDomainList() {
  const { res, json } = await postJson("api/domain/list");
  if (!res.ok || !json?.success) {
    throw new Error(json?.message || "Failed to load domains");
  }
  const rawRows = Array.isArray(json?.data) ? json.data : [];
  return aggregateOwnerTenantRows(rawRows);
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
  const { json } = await postJson("api/domain/add", {
    owner_code: ownerCode,
    name,
    email,
    password,
    secondary_password: secondaryPassword,
    groups: (groups || []).map(normalizeTenantSaveEntry),
    companies: (companies || []).map(normalizeTenantSaveEntry),
  });
  return json;
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
  const { json } = await putJson("api/domain/update", body);
  return json;
}

export async function updateTenantSetting({
  id,
  code,
  ownerId,
  expirationDate,
  permissions,
  feeShareAllocations,
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

  const { json } = await putJson("api/domain/update-setting", body);
  return json;
}
