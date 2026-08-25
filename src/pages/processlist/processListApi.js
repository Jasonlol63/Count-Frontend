/** Games Process — Spring Boot `/api/process/*` (tenantId in RequestBody only). */

import { buildApiUrl } from "../../utils/core/apiUrl.js";
import {
  normalizeProcessListRows,
  normalizeProcessStatusKey,
  PROCESS_WEEKDAY_OPTIONS,
  resolveProcessListActiveTenantId,
} from "./processListHelpers.js";
import {
  fetchCurrencyListByTenantId,
  normalizeCurrencyRow,
} from "../../utils/api/currencyApi.js";

export function resolveProcessListTenantId(tenantId) {
  const tid = tenantId != null ? Number(tenantId) : Number.NaN;
  return Number.isFinite(tid) && tid > 0 ? tid : null;
}

/** @deprecated Use {@link resolveProcessListTenantId}. */
export function resolveProcessListActiveCompanyId(tenantId, tenants, opts) {
  return resolveProcessListActiveTenantId(tenantId, tenants, opts);
}

function isApiSuccess(json) {
  return json?.success === true || json?.status === "success";
}

/**
 * POST /api/process/process-list
 * Body: JSON number tenant id.
 */
export async function fetchProcessListByTenantId(tenantId, signal) {
  const tid = resolveProcessListTenantId(tenantId);
  if (!tid) throw new Error("tenantIdRequired");

  const res = await fetch(buildApiUrl("api/process/process-list"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tid),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !isApiSuccess(json)) {
    throw new Error(json?.message || "failedToLoadProcesses");
  }
  const data = Array.isArray(json.data) ? json.data : [];
  return normalizeProcessListRows(data);
}

/**
 * POST /api/process/process-list — all categories (Games + Bank), unlike
 * {@link fetchProcessListByTenantId} which drops Bank for the Games List page.
 * For permission pickers (User Access) that need every process regardless of category.
 */
export async function fetchAllProcessListByTenantId(tenantId, signal) {
  const tid = resolveProcessListTenantId(tenantId);
  if (!tid) throw new Error("tenantIdRequired");

  const res = await fetch(buildApiUrl("api/process/process-list"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tid),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !isApiSuccess(json)) {
    throw new Error(json?.message || "failedToLoadProcesses");
  }
  const data = Array.isArray(json.data) ? json.data : [];
  return data
    .map((dto) => {
      const process = dto?.process || {};
      const descriptions = Array.isArray(dto?.processDescriptions) ? dto.processDescriptions : [];
      const id = dto?.id ?? process.id;
      if (id == null) return null;
      return {
        id,
        process_name: String(process.code || ""),
        description: descriptions.map((d) => d?.name).filter(Boolean).join(", "),
        category: String(process.category || "").trim().toUpperCase(),
      };
    })
    .filter(Boolean);
}

/** Spring ProcessDescription → picker row. */
export function normalizeProcessDescriptionItem(item) {
  if (!item || typeof item !== "object") return null;
  const id = item.id ?? item.descriptionId;
  if (id == null) return null;
  return {
    id,
    name: String(item.name ?? "").trim(),
    tenantId: item.tenantId ?? item.tenant_id ?? null,
    createdAt: item.createdAt ?? item.created_at ?? null,
  };
}

/**
 * POST /api/process/list-description
 * Body: JSON number tenant id.
 */
export async function fetchProcessDescriptionsByTenantId(tenantId, signal) {
  const tid = resolveProcessListTenantId(tenantId);
  if (!tid) throw new Error("tenantIdRequired");

  const res = await fetch(buildApiUrl("api/process/list-description"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tid),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !isApiSuccess(json)) {
    throw new Error(json?.message || "failedToLoadDescriptions");
  }
  const rows = Array.isArray(json.data) ? json.data : [];
  return rows.map(normalizeProcessDescriptionItem).filter(Boolean);
}

/**
 * POST /api/process/add-description
 * Body: `{ tenantId, name }`.
 * @returns {Promise<{ id, name }>}
 */
export async function addProcessDescription(tenantId, name, signal) {
  const tid = resolveProcessListTenantId(tenantId);
  const normalizedName = String(name || "").trim().toUpperCase();
  if (!tid) throw new Error("tenantIdRequired");
  if (!normalizedName) throw new Error("descriptionNameRequired");

  const res = await fetch(buildApiUrl("api/process/add-description"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId: tid, name: normalizedName }),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !isApiSuccess(json)) {
    const err = new Error(json?.message || "failedToAddDescription");
    err.duplicate = String(json?.message || "").toLowerCase().includes("already exists");
    throw err;
  }
  const created = normalizeProcessDescriptionItem(json.data) || {};
  return {
    id: created.id,
    name: created.name || normalizedName,
  };
}

/**
 * POST /api/process/delete-description
 * Body: `{ id, tenantId }`.
 */
export async function deleteProcessDescription(tenantId, descriptionId, signal) {
  const tid = resolveProcessListTenantId(tenantId);
  const id = descriptionId != null ? Number(descriptionId) : Number.NaN;
  if (!tid) throw new Error("tenantIdRequired");
  if (!Number.isFinite(id) || id <= 0) throw new Error("descriptionIdRequired");

  const res = await fetch(buildApiUrl("api/process/delete-description"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, tenantId: tid }),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !isApiSuccess(json)) {
    throw new Error(json?.message || "failedToDeleteDescription");
  }
}

/**
 * POST /api/process/add-process
 * Body aligned with Spring ProcessDTO flat add fields.
 * @returns {Promise<object>} created process data (includes id)
 */
export async function addProcess(tenantId, fields, signal) {
  const tid = resolveProcessListTenantId(tenantId);
  if (!tid) throw new Error("tenantIdRequired");

  const code = String(fields?.code || "").trim().toUpperCase();
  const currencyId = Number(fields?.currencyId);
  if (!code) throw new Error("processCodeRequired");
  if (!Number.isFinite(currencyId) || currencyId <= 0) throw new Error("currencyIdRequired");

  const descriptionIds = (Array.isArray(fields?.descriptionIds) ? fields.descriptionIds : [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0);

  const dayOfWeeks = (Array.isArray(fields?.dayOfWeeks) ? fields.dayOfWeeks : [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 7);

  const body = {
    tenantId: tid,
    code,
    currencyId,
    descriptionIds,
    dayOfWeeks,
    removeWord: fields?.removeWord != null ? String(fields.removeWord) : "",
    replaceWordFrom: fields?.replaceWordFrom != null ? String(fields.replaceWordFrom) : "",
    replaceWordTo: fields?.replaceWordTo != null ? String(fields.replaceWordTo) : "",
    remark: fields?.remark != null ? String(fields.remark) : "",
    category: "GAME",
  };

  const res = await fetch(buildApiUrl("api/process/add-process"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !isApiSuccess(json)) {
    const err = new Error(json?.message || "failedToAddProcess");
    err.duplicate = String(json?.message || "").toLowerCase().includes("already exists");
    throw err;
  }
  return json.data ?? null;
}

/**
 * POST /api/process/update-process
 * Same flat fields as add-process, plus id. code is ignored by backend update.
 * @returns {Promise<object>} updated process data
 */
export async function updateProcess(tenantId, fields, signal) {
  const tid = resolveProcessListTenantId(tenantId);
  if (!tid) throw new Error("tenantIdRequired");

  const id = Number(fields?.id);
  const currencyId = Number(fields?.currencyId);
  if (!Number.isFinite(id) || id <= 0) throw new Error("processIdRequired");
  if (!Number.isFinite(currencyId) || currencyId <= 0) throw new Error("currencyIdRequired");

  const descriptionIds = (Array.isArray(fields?.descriptionIds) ? fields.descriptionIds : [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0);

  const dayOfWeeks = (Array.isArray(fields?.dayOfWeeks) ? fields.dayOfWeeks : [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 7);

  const body = {
    id,
    tenantId: tid,
    currencyId,
    descriptionIds,
    dayOfWeeks,
    removeWord: fields?.removeWord != null ? String(fields.removeWord) : "",
    replaceWordFrom: fields?.replaceWordFrom != null ? String(fields.replaceWordFrom) : "",
    replaceWordTo: fields?.replaceWordTo != null ? String(fields.replaceWordTo) : "",
    remark: fields?.remark != null ? String(fields.remark) : "",
  };

  const res = await fetch(buildApiUrl("api/process/update-process"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !isApiSuccess(json)) {
    throw new Error(json?.message || "failedToUpdateProcess");
  }
  return json.data ?? null;
}

/**
 * POST /api/process/update-status
 * Body aligned with Spring Process entity fields used by the endpoint: { id, tenantId }.
 * Server toggles ACTIVE ↔ INACTIVE; response data is the updated Process (use data.status).
 * @returns {Promise<{ status: string }>} normalized ACTIVE | INACTIVE
 */
export async function updateProcessStatus(tenantId, processId, signal) {
  const tid = resolveProcessListTenantId(tenantId);
  const id = Number(processId);
  if (!tid) throw new Error("tenantIdRequired");
  if (!Number.isFinite(id) || id <= 0) throw new Error("processIdRequired");

  const res = await fetch(buildApiUrl("api/process/update-status"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, tenantId: tid }),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !isApiSuccess(json)) {
    throw new Error(json?.message || "failedToUpdateProcessStatus");
  }
  const status = normalizeProcessStatusKey(json?.data?.status);
  if (status !== "ACTIVE" && status !== "INACTIVE") {
    throw new Error(json?.message || "failedToUpdateProcessStatus");
  }
  return { status, process: json.data };
}

/**
 * POST /api/process/delete-process
 * Same pattern as account delete: one id per call; UI loops for multi-select.
 * Body: { id, tenantId }
 */
export async function deleteProcess(tenantId, processId, signal) {
  const tid = resolveProcessListTenantId(tenantId);
  const id = Number(processId);
  if (!tid) throw new Error("tenantIdRequired");
  if (!Number.isFinite(id) || id <= 0) throw new Error("processIdRequired");

  const res = await fetch(buildApiUrl("api/process/delete-process"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, tenantId: tid }),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !isApiSuccess(json)) {
    throw new Error(json?.message || "failedToDeleteProcess");
  }
  return json.data ?? null;
}

export { resolveProcessListActiveTenantId, normalizeProcessListRows as normalizeRows } from "./processListHelpers.js";

/**
 * Form meta for Add/Edit modal — Spring currency + description + weekday options.
 */
export async function fetchProcessFormMeta(tenantId, signal) {
  const tid = resolveProcessListTenantId(tenantId);
  if (!tid) throw new Error("tenantIdRequired");

  const [currencyRows, descriptions] = await Promise.all([
    fetchCurrencyListByTenantId(tid, signal),
    fetchProcessDescriptionsByTenantId(tid, signal),
  ]);

  const currencies = currencyRows
    .map((raw) => normalizeCurrencyRow(raw))
    .filter((c) => Number.isFinite(c.id) && c.id > 0)
    .map((c) => ({
      id: String(c.id),
      code: String(c.code || "").trim().toUpperCase(),
      name: String(c.code || "").trim().toUpperCase(),
    }));

  return {
    currencies,
    descriptions: descriptions.map((d) => ({ id: d.id, name: d.name })),
    days: PROCESS_WEEKDAY_OPTIONS,
    existingProcesses: [],
  };
}
