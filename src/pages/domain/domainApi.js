import { buildApiUrl } from "../../utils/core/apiUrl.js";

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
      const catCode = t.categoryCode ?? t.category_code ?? [];

      if (type === "GROUP") {
        entry.groups.push({
          id: t.id,
          code,
          expiration_date: expDate,
          category_code: catCode,
        });
      } else if (type === "COMPANY") {
        // resolve parent code: look up parentId among the groups already known
        // parent_code will be patched in a second pass below
        entry.companies.push({
          id: t.id,
          code,
          expiration_date: expDate,
          category_code: catCode,
          _parentId: t.parentId ?? t.parent_id ?? null,
        });
      }
    }
  }

  // Build a tenantId → code lookup from all groups for parent resolution
  const tenantIdToCode = new Map();
  for (const row of rows) {
    const t = row?.tenant;
    if (t?.id && t?.code) {
      tenantIdToCode.set(t.id, String(t.code).trim().toUpperCase());
    }
  }

  // Patch parent_code on companies and clean up internal field
  for (const entry of ownerMap.values()) {
    entry.companies = entry.companies.map((c) => {
      const parentCode = c._parentId ? (tenantIdToCode.get(c._parentId) ?? null) : null;
      return {
        id: c.id,
        code: c.code,
        expiration_date: c.expiration_date,
        parent_code: parentCode,
        category_code: c.category_code || [],
      };
    });
    // Sort for stable display
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

export async function validateDomainCode(code, excludeOwnerId) {
  const { json } = await postJson("api/domain/validate-code", {
    code: String(code ?? "").trim(),
    exclude_owner_id: excludeOwnerId ?? null,
  });
  return json;
}

function toGroupSaveDto(entry) {
  return {
    code: String(entry?.group_code ?? entry?.code ?? "").trim().toUpperCase(),
    expiration_date: entry?.expiration_date ?? null,
  };
}

function toCompanySaveDto(entry) {
  const parent = entry?.group_id ?? entry?.parent_code ?? entry?.parentCode ?? null;
  return {
    code: String(entry?.company_id ?? entry?.code ?? "").trim().toUpperCase(),
    expiration_date: entry?.expiration_date ?? null,
    parent_code: parent ? String(parent).trim().toUpperCase() : null,
  };
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
    groups: (groups || []).map(toGroupSaveDto),
    companies: (companies || []).map(toCompanySaveDto),
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
    groups: (groups || []).map(toGroupSaveDto),
    companies: (companies || []).map(toCompanySaveDto),
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
  categoryCode,
}) {
  const { json } = await putJson("api/domain/update-setting", {
    id,
    code,
    owner_id: ownerId,
    expiration_date: expirationDate,
    category_code: categoryCode,
  });
  return json;
}
